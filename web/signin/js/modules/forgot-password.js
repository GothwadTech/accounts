import { api } from '../../../js/api.js';
import { setBusy } from '../../../js/common.js';

export function initForgotPassword(showAlert, hideAlert) {
  const form = document.getElementById('forgot-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alert-forgot');
    document.getElementById('done-forgot').classList.add('hidden');

    const username = document.getElementById('forgot-username').value.trim().toLowerCase();
    if (!username) return showAlert('alert-forgot', 'Please enter your username.');

    const btn = document.getElementById('forgot-btn');
    setBusy(btn, true, 'Sending...');

    const res = await api.post('/auth/forgot-password', { username });
    setBusy(btn, false);

    if (!res.ok) {
      return showAlert('alert-forgot', res.error || 'Something went wrong. Please try again.');
    }

    const done = document.getElementById('done-forgot');
    done.innerHTML = `
      ✅ If an account exists for <b>${username.replace(/[<>&]/g, '')}</b>, a reset link has been
      sent to its recovery email. Inbox + spam folder check karo.`;
    done.classList.remove('hidden');

    if (res.data && res.data.dev_reset_link) {
      done.innerHTML += `
        <div class="mt-2 text-xs">
          <b>DEV_MODE:</b> <a href="${res.data.dev_reset_link.replace(/"/g, '&quot;')}">Click here for the reset link</a>
        </div>`;
    }
  });
}
