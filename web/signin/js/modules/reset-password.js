import { api } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';

export function extractResetToken() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  return hash.get('access_token') || query.get('code') || query.get('token') || null;
}

export function initResetPassword(resetToken, showAlert, hideAlert) {
  const form = document.getElementById('reset-form');
  if (!form || !resetToken) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alert-reset');

    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;

    if (password.length < 8) return showAlert('alert-reset', 'Password must be at least 8 characters.');
    if (password !== confirm) return showAlert('alert-reset', 'Passwords do not match.');

    const btn = document.getElementById('reset-btn');
    setBusy(btn, true, 'Updating...');

    const res = await api.post('/auth/reset-password', { password }, { token: resetToken });
    setBusy(btn, false);

    if (!res.ok) {
      return showAlert('alert-reset', res.error || 'Reset link is invalid or expired. Please request a new one.');
    }

    toast('Password updated! You can now sign in.');
    setTimeout(() => {
      location.href = '/signin';
    }, 900);
  });
}
