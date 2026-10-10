import { api } from '../../../js/api.js';
import { setBusy, toast, escapeHtml, formatDate } from '../../../js/common.js';

export function initSecurityForm() {
  const form = document.getElementById('password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passwordAlert = document.getElementById('alert-password');
    if (passwordAlert) passwordAlert.classList.add('hidden');

    const current = document.getElementById('current_password').value;
    const newPw = document.getElementById('new_password').value;
    const confirm = document.getElementById('confirm_new_password').value;

    if (newPw.length < 8) {
      if (passwordAlert) {
        passwordAlert.textContent = 'New password must be at least 8 characters.';
        passwordAlert.classList.remove('hidden');
      }
      return;
    }
    if (newPw !== confirm) {
      if (passwordAlert) {
        passwordAlert.textContent = 'New passwords do not match.';
        passwordAlert.classList.remove('hidden');
      }
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
      if (passwordAlert) {
        passwordAlert.textContent = res.error || 'Could not change password.';
        passwordAlert.classList.remove('hidden');
      }
      return;
    }

    form.reset();
    toast('Password changed successfully 🔒');
  });

  const revokeOthersBtn = document.getElementById('btn-revoke-others');
  if (revokeOthersBtn) {
    revokeOthersBtn.addEventListener('click', async (e) => {
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
  }
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
