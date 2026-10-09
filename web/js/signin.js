/**
 * /signin page logic — 3 modes (ek hi page par):
 *   1. Sign in           (username + password + remember me)
 *   2. Forgot password   (username → recovery email par reset link)
 *   3. Set new password  (email link se aane par — #access_token in URL)
 */

import { api } from './api.js';
import {
  renderTopbar, redirectIfAuthed, setBusy, toast, setupPasswordEyes,
} from './common.js';
import { GOTHWAD_CONFIG } from './config.js';

renderTopbar();
setupPasswordEyes();
redirectIfAuthed();

// Domain suffix inputs ke saath dikhao (example: @gothwadtech.com)
const suffixText = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;
document.getElementById('domain-suffix').textContent = suffixText;
document.querySelectorAll('.suffix-copy').forEach((el) => { el.textContent = suffixText; });

/* ------------------------------------------------------------ mode switch */
const modes = {
  signin: document.getElementById('mode-signin'),
  forgot: document.getElementById('mode-forgot'),
  reset: document.getElementById('mode-reset'),
};

function showMode(name) {
  Object.entries(modes).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
  document.querySelectorAll('.input-eye').forEach((b) => { /* state reset */ });
}

document.getElementById('link-forgot').addEventListener('click', () => showMode('forgot'));
document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => showMode(btn.dataset.goto));
});

function showAlert(id, message) {
  const box = document.getElementById(id);
  box.textContent = message;
  box.classList.remove('hidden');
}
function hideAlert(id) {
  document.getElementById(id).classList.add('hidden');
}

/* ═══════════════════════ MODE 1: SIGN IN ═══════════════════════ */

document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('alert-signin');

  const identifier = document.getElementById('identifier').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  if (!identifier) return showAlert('alert-signin', 'Please enter your username or email.');
  if (!password) return showAlert('alert-signin', 'Please enter your password.');

  const btn = document.getElementById('signin-btn');
  setBusy(btn, true, 'Signing in...');

  // REAL API → Worker → Supabase Auth
  const res = await api.post('/auth/signin', { identifier, password, remember });

  setBusy(btn, false);

  if (!res.ok) {
    return showAlert('alert-signin', res.error || 'Invalid username or password.');
  }

  toast(`Welcome back, ${res.data.user.first_name || res.data.user.username}!`);

  // ?next=... redirect (protected page se aaya ho to wapas bhejo)
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const safeNext = next && (next.startsWith('/') || next.startsWith(location.origin)) ? next : '/me';
  location.href = safeNext;
});

/* ═══════════════════════ MODE 2: FORGOT PASSWORD ═══════════════════════ */

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
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

  // Hamesha generic success (security: username exist karta hai ya nahi — nahi batate)
  const done = document.getElementById('done-forgot');
  done.innerHTML = `
    ✅ If an account exists for <b>${username.replace(/[<>&]/g, '')}</b>, a reset link has been
    sent to its recovery email. Inbox + spam folder check karo.`;
  done.classList.remove('hidden');

  // DEV_MODE: Worker reset link response mein de sakta hai (jab Resend configured nahi)
  if (res.data && res.data.dev_reset_link) {
    done.innerHTML += `
      <div class="mt-2 text-xs">
        <b>DEV_MODE:</b> <a href="${res.data.dev_reset_link.replace(/"/g, '&quot;')}">Click here for the reset link</a>
      </div>`;
  }
});

/* ═══════════════ MODE 3: SET NEW PASSWORD (email link se) ═══════════════ */

// URL mein reset token detect karo:
//   hash:  /signin#access_token=abc&type=recovery   (Supabase recovery link)
//   query: /signin?code=abc                          (naya flow)
function extractResetToken() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  return hash.get('access_token') || query.get('code') || query.get('token') || null;
}

const resetToken = extractResetToken();

if (resetToken) {
  showMode('reset');
  // URL se token hata do (taaki refresh/copy par na dikhe)
  history.replaceState(null, '', location.pathname);
}

document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('alert-reset');

  const password = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (password.length < 8) return showAlert('alert-reset', 'Password must be at least 8 characters.');
  if (password !== confirm) return showAlert('alert-reset', 'Passwords do not match.');

  const btn = document.getElementById('reset-btn');
  setBusy(btn, true, 'Updating...');

  // Recovery token ke saath naya password set karo
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
