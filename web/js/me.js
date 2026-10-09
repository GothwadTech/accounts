/**
 * /me page logic — Gothwad Account dashboard
 * - Session check (login nahi → /signin)
 * - Profile view + edit
 * - Change password + device sessions (remote sign-out)
 * - Connected apps (OAuth grants + disconnect)
 */

import { api } from './api.js';
import {
  renderTopbar, requireAuth, signOut, setBusy, toast,
  escapeHtml, formatBytes, formatDate,
} from './common.js';
import { GOTHWAD_CONFIG, gothwadEmail } from './config.js';

renderTopbar();

let currentUser = null;

/* ------------------------------------------------------------ load user */
async function loadUser() {
  currentUser = await requireAuth(); // login nahi hai to /signin par bhej dega
  if (!currentUser) return;

  // Auth confirmed → loading hatao, dashboard dikhao
  document.getElementById('auth-loading').classList.add('hidden');
  document.getElementById('dash-content').classList.remove('hidden');

  const u = currentUser;
  const initials = ((u.first_name || '?')[0] || '?') + ((u.last_name || '')[0] || '');

  document.getElementById('user-avatar').textContent = initials.toUpperCase();
  document.getElementById('user-name').textContent = `Welcome, ${u.first_name || u.username}`;
  document.getElementById('user-email').textContent = gothwadEmail(u.username);

  // Overview stats
  document.getElementById('stat-email').textContent = gothwadEmail(u.username);
  document.getElementById('stat-username').textContent = `@${u.username}`;
  document.getElementById('stat-created').textContent = formatDate(u.created_at);

  // Storage bar
  const used = Number(u.storage_used_bytes || 0);
  const limit = Number(u.storage_limit_bytes || 1);
  const pct = Math.max(1, Math.min(100, Math.round((used / limit) * 100)));
  document.getElementById('storage-fill').style.width = `${pct}%`;
  document.getElementById('storage-used').textContent = `${formatBytes(used)} used`;
  document.getElementById('storage-limit').textContent = `${formatBytes(limit)} total`;

  document.getElementById('tag-2fa').textContent = u.two_factor_enabled ? '2FA: enabled' : '2FA: not enabled';

  // Profile form pre-fill
  document.getElementById('first_name').value = u.first_name || '';
  document.getElementById('last_name').value = u.last_name || '';
  document.getElementById('profile-username').value = u.username || '';
  document.getElementById('recovery_email').value = u.recovery_email || '';
  document.getElementById('phone_number').value = u.phone_number || '';
}

loadUser();
document.getElementById('domain-suffix-profile').textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;

/* ---------------------------------------------------------------- tabs */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'security') loadSessions();
    if (tab.dataset.tab === 'apps') loadConnectedApps();
  });
});

/* ------------------------------------------------------------- sign out */
document.getElementById('btn-signout').addEventListener('click', () => signOut());

/* -------------------------------------------------------- profile save */
document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const profileAlert = document.getElementById('alert-profile');
  profileAlert.classList.add('hidden');

  const btn = document.getElementById('profile-save-btn');
  setBusy(btn, true, 'Saving...');

  const res = await api.post('/auth/update-profile', {
    first_name: document.getElementById('first_name').value.trim(),
    last_name: document.getElementById('last_name').value.trim(),
    recovery_email: document.getElementById('recovery_email').value.trim(),
    phone_number: document.getElementById('phone_number').value.trim(),
  });

  setBusy(btn, false);

  if (!res.ok) {
    profileAlert.textContent = res.error || 'Could not save profile.';
    profileAlert.classList.remove('hidden');
    return;
  }

  toast('Profile updated successfully');
  currentUser = res.data.user;
  loadUser();
});

/* ----------------------------------------------------- change password */
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const passwordAlert = document.getElementById('alert-password');
  passwordAlert.classList.add('hidden');

  const current = document.getElementById('current_password').value;
  const newPw = document.getElementById('new_password').value;
  const confirm = document.getElementById('confirm_new_password').value;

  if (newPw.length < 8) {
    passwordAlert.textContent = 'New password must be at least 8 characters.';
    passwordAlert.classList.remove('hidden');
    return;
  }
  if (newPw !== confirm) {
    passwordAlert.textContent = 'New passwords do not match.';
    passwordAlert.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('password-save-btn');
  setBusy(btn, true, 'Updating...');

  const res = await api.post('/auth/change-password', {
    current_password: current,
    new_password: newPw,
  });

  setBusy(btn, false);

  if (!res.ok) {
    passwordAlert.textContent = res.error || 'Could not change password.';
    passwordAlert.classList.remove('hidden');
    return;
  }

  document.getElementById('password-form').reset();
  toast('Password changed successfully 🔒');
});

/* ---------------------------------------------------- device sessions */
async function loadSessions() {
  const list = document.getElementById('device-list');
  list.innerHTML = '<div class="text-muted text-sm">Loading sessions…</div>';

  const res = await api.get('/auth/sessions');
  if (!res.ok) {
    list.innerHTML = `<div class="text-sm text-danger">${escapeHtml(res.error || 'Could not load sessions.')}</div>`;
    return;
  }

  const sessions = res.data.sessions || [];
  if (sessions.length === 0) {
    list.innerHTML = '<div class="text-sm text-muted">No active sessions found.</div>';
    return;
  }

  list.innerHTML = sessions.map((s) => {
    const icon = s.device_name?.includes('Mobile') || s.os === 'Android' || s.os === 'iOS' ? '📱' : '💻';
    return `
      <div class="device">
        <div class="device-info">
          <div class="device-icon">${icon}</div>
          <div>
            <div class="device-name">
              ${escapeHtml(s.device_name || 'Unknown device')}
              ${s.is_current ? '<span class="tag tag-success" style="margin-left:6px;">This device</span>' : ''}
            </div>
            <div class="device-meta">
              ${escapeHtml(s.browser || '')} · ${escapeHtml(s.os || '')} · Last active ${escapeHtml(formatDate(s.last_active))}
            </div>
          </div>
        </div>
        ${s.is_current ? '' : `
          <button class="btn btn-danger btn-revoke" data-id="${escapeHtml(s.id)}" style="padding:8px 14px;">
            Sign out
          </button>`}
      </div>`;
  }).join('');

  list.querySelectorAll('.btn-revoke').forEach((btn) => {
    btn.addEventListener('click', async () => {
      setBusy(btn, true, '...');
      const r = await api.post('/auth/sessions/revoke', { session_id: btn.dataset.id });
      if (r.ok) {
        toast('Device signed out');
        loadSessions();
      } else {
        setBusy(btn, false);
        toast(r.error || 'Could not sign out device', 'error');
      }
    });
  });
}

document.getElementById('btn-revoke-others').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setBusy(btn, true, 'Signing out...');
  const res = await api.post('/auth/sessions/revoke-others', {});
  setBusy(btn, false);
  if (res.ok) {
    toast('All other devices signed out');
    loadSessions();
  } else {
    toast(res.error || 'Could not sign out devices', 'error');
  }
});

/* ------------------------------------------------- connected apps (OAuth) */
const APP_ICONS = { mail: '📧', 'hard-drive': '☁️', 'message-circle': '💬', 'file-text': '📝', calendar: '📅', compass: '🌐' };

async function loadConnectedApps() {
  const connectedList = document.getElementById('connected-list');
  const appsGrid = document.getElementById('apps-grid');

  const res = await api.get('/oauth/authorizations');
  if (!res.ok) {
    connectedList.innerHTML = `<div class="text-sm text-danger">${escapeHtml(res.error || 'Could not load apps.')}</div>`;
    return;
  }

  const { connected = [], apps = [] } = res.data;

  if (connected.length === 0) {
    connectedList.innerHTML = `
      <div class="text-sm text-muted" style="padding:8px 2px;">
        Abhi koi app connected nahi hai. Jab aap kisi app mein
        "Sign in with Gothwad" se login karoge, wo yahan dikhegi.
      </div>`;
  } else {
    connectedList.innerHTML = connected.map((c) => `
      <div class="device">
        <div class="device-info">
          <div class="device-icon">${APP_ICONS[c.icon] || '🔐'}</div>
          <div>
            <div class="device-name">${escapeHtml(c.name)}</div>
            <div class="device-meta">Scopes: ${escapeHtml((c.scopes || []).join(', '))} · Last used ${escapeHtml(formatDate(c.last_used_at))}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-disconnect" data-app="${escapeHtml(c.app_id)}" style="padding:8px 14px;">
          Disconnect
        </button>
      </div>`).join('');

    connectedList.querySelectorAll('.btn-disconnect').forEach((btn) => {
      btn.addEventListener('click', async () => {
        setBusy(btn, true, '...');
        const r = await api.post('/oauth/revoke', { app_id: btn.dataset.app });
        if (r.ok) {
          toast('App disconnected');
          loadConnectedApps();
        } else {
          setBusy(btn, false);
          toast(r.error || 'Could not disconnect', 'error');
        }
      });
    });
  }

  appsGrid.innerHTML = apps.map((a) => {
    const isConnected = connected.some((c) => c.app_id === a.id);
    return `
      <div class="app-tile">
        <div class="app-icon">${APP_ICONS[a.icon] || '🔐'}</div>
        <div style="flex:1;">
          <div class="app-name">${escapeHtml(a.name)}</div>
          <div class="app-desc">${escapeHtml(a.description || '')}</div>
        </div>
        ${isConnected ? '<span class="tag tag-success">Connected</span>' : ''}
      </div>`;
  }).join('');
}

loadConnectedApps();
