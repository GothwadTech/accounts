/**
 * /me — SECURITY section (password, activity, devices, apps summary).
 */

import { api } from '../../../js/api.js';
import { setBusy, toast, escapeHtml, formatDate } from '../../../js/common.js';
import { getActivity, getAuthorizations } from '../store.js';
import { renderActivity } from './activity.js';
import { setDialogUser, dialogPassword } from '../dialogs.js';

let user = null;
let onUserUpdated = () => {};
let bound = false;

export function syncSecurityUser(nextUser) {
  user = nextUser;
  setDialogUser(user, (updated) => {
    user = updated;
    onUserUpdated(updated);
    refreshRows();
  });
  refreshRows();
  loadSessions();
  loadActivity();
  loadAppsSummary();
}

export function initSecurity(currentUser, cb) {
  if (cb) onUserUpdated = cb;

  if (!bound) {
    bound = true;

    document
      .querySelectorAll('#section-security [data-dialog="password"]')
      .forEach((row) => row.addEventListener('click', dialogPassword));

    document
      .querySelectorAll('#section-security [data-dialog="recovery"]')
      .forEach((row) =>
        row.addEventListener('click', () => import('../dialogs.js').then((m) => m.openDialog('recovery'))),
      );

    const revokeOthersBtn = document.getElementById('btn-revoke-others');
    revokeOthersBtn?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      setBusy(btn, true, 'Signing out...');
      const res = await api.post('/auth/sessions/revoke-others', {});
      setBusy(btn, false);
      if (res.ok) {
        toast('All other devices signed out');
        loadSessions();
        loadActivity();
      } else {
        toast(res.error || 'Could not sign out devices', 'error');
      }
    });
  }

  syncSecurityUser(currentUser);
}

function refreshRows() {
  if (!user) return;
  const el = document.getElementById('sec-recovery');
  if (el) el.textContent = user.recovery_email || 'Not set';
}

export function markPasswordChanged() {
  const el = document.getElementById('sec-pw-last');
  if (el) el.textContent = 'just now';
}

export async function loadActivity() {
  const rows = await getActivity();
  const securityTypes = [
    'signin',
    'signout',
    'password_change',
    'password_reset',
    'session_revoked',
    'app_authorized',
    'app_revoked',
    'signup',
  ];
  renderActivity('sec-activity', rows.filter((r) => securityTypes.includes(r.type)).slice(0, 10));
}

export async function loadSessions() {
  const list = document.getElementById('device-list');
  if (!list) return;

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

  list.innerHTML = sessions
    .map((s) => {
      const isMobile = s.device_name?.includes('Mobile') || s.os === 'Android' || s.os === 'iOS';
      return `
      <div class="device">
        <div class="device-info">
          <div class="device-icon"><span class="msym">${isMobile ? 'smartphone' : 'laptop'}</span></div>
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
        ${s.is_current
          ? ''
          : `<button class="btn btn-ghost btn-sm btn-revoke" data-id="${escapeHtml(s.id)}">Sign out</button>`}
      </div>`;
    })
    .join('');

  list.querySelectorAll('.btn-revoke').forEach((btn) => {
    btn.addEventListener('click', async () => {
      setBusy(btn, true, '...');
      const r = await api.post('/auth/sessions/revoke', { session_id: btn.dataset.id });
      if (r.ok) {
        toast('Device signed out');
        loadSessions();
        loadActivity();
      } else {
        setBusy(btn, false);
        toast(r.error || 'Could not sign out device', 'error');
      }
    });
  });
}

async function loadAppsSummary() {
  const box = document.getElementById('sec-apps-summary');
  if (!box) return;

  const data = await getAuthorizations();
  const connected = data.connected || [];
  const extra = connected.filter((c) => !c.core && c.app_id && !c.app_id.startsWith('gothwad-'));
  const total = extra.length;
  box.innerHTML =
    total === 0
      ? 'No third-party apps are connected to your account.'
      : `${total} app${total > 1 ? 's' : ''} connected: ${extra
          .map((c) => escapeHtml(c.name || c.app_id))
          .join(', ')}`;
}
