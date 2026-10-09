/**
 * RESET PASSWORD PAGE logic
 *
 * Flow:
 *  1) User username submit karta hai → Worker recovery email par link bhejta hai.
 *  2) User email ke link par click karta hai → wapas is page par aata hai with
 *     a special #access_token=... (Supabase recovery token URL fragment mein).
 *  3) Hum token detect karke "set new password" form dikhate hain.
 */

import { api } from './api.js';
import { renderTopbar, setBusy, toast, escapeHtml } from './common.js';
import { GOTHWAD_CONFIG } from './config.js';

renderTopbar();
document.getElementById('domain-suffix').textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;

const stepRequest = document.getElementById('step-request');
const stepReset = document.getElementById('step-reset');
const alertRequest = document.getElementById('alert-request');
const doneRequest = document.getElementById('done-request');
const alertReset = document.getElementById('alert-reset');

/* --------------------------------------------------------------
 * Token detect karo — do jagah aa sakta hai:
 *   URL hash:   reset-password.html#access_token=abc&type=recovery
 *   URL query:  reset-password.html?code=abc   (naye Supabase flow)
 * -------------------------------------------------------------- */
function extractToken() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);

  const fromHash = hash.get('access_token');
  if (fromHash) return fromHash;

  // ?code=... flow — code ko exchange ke liye token ki tarah use karenge
  const fromQuery = query.get('code') || query.get('token');
  return fromQuery;
}

const resetToken = extractToken();

if (resetToken) {
  // STEP 2 mode: naya password form dikhao
  stepRequest.classList.add('hidden');
  stepReset.classList.remove('hidden');
  // URL se token hata do (taaki refresh/copy mein na dikhe)
  history.replaceState(null, '', location.pathname);
}

/* ------------------------------------------------- STEP 1: request link */
document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  alertRequest.classList.add('hidden');
  doneRequest.classList.add('hidden');

  const username = document.getElementById('username').value.trim().toLowerCase();
  if (!username) return;

  const btn = document.getElementById('request-btn');
  setBusy(btn, true, 'Sending...');

  const res = await api.post('/auth/forgot-password', { username });
  setBusy(btn, false);

  if (!res.ok) {
    alertRequest.textContent = res.error || 'Something went wrong. Please try again.';
    alertRequest.classList.remove('hidden');
    return;
  }

  // Hamesha generic success (security: username exist karta hai ya nahi — nahi batate)
  doneRequest.innerHTML = `
    ✅ If an account exists for <b>${escapeHtml(username)}</b>, a reset link has been sent
    to its recovery email. Inbox + spam folder check karo.`;
  doneRequest.classList.remove('hidden');

  // DEV_MODE convenience: Worker reset link response mein de sakta hai
  if (res.data && res.data.dev_reset_link) {
    doneRequest.innerHTML += `
      <div class="mt-2 text-xs">
        <b>DEV_MODE:</b> <a href="${escapeHtml(res.data.dev_reset_link)}">Click here for the reset link</a>
        (Resend configured nahi hai abhi)
      </div>`;
  }
});

/* --------------------------------------------- STEP 2: set new password */
document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  alertReset.classList.add('hidden');

  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm_password').value;

  if (password.length < 8) {
    alertReset.textContent = 'Password must be at least 8 characters.';
    alertReset.classList.remove('hidden');
    return;
  }
  if (password !== confirm) {
    alertReset.textContent = 'Passwords do not match.';
    alertReset.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('reset-btn');
  setBusy(btn, true, 'Updating...');

  // Recovery token ke saath naya password set karo
  const res = await api.post('/auth/reset-password', { password }, { token: resetToken });
  setBusy(btn, false);

  if (!res.ok) {
    alertReset.textContent = res.error || 'Reset link is invalid or expired.';
    alertReset.classList.remove('hidden');
    return;
  }

  toast('Password updated! You can now sign in. 🔥');
  setTimeout(() => {
    location.href = 'login.html';
  }, 900);
});

// Password show/hide (dono steps ke inputs par)
const toggleBtn = document.getElementById('toggle-password');
if (toggleBtn) {
  toggleBtn.addEventListener('click', (e) => {
    const pw = document.getElementById('password');
    const isPassword = pw.type === 'password';
    pw.type = isPassword ? 'text' : 'password';
    const confirm = document.getElementById('confirm_password');
    if (confirm) confirm.type = isPassword ? 'text' : 'password';
    e.currentTarget.textContent = isPassword ? '🙈' : '👁️';
  });
}
