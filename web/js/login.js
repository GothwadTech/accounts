/**
 * LOGIN PAGE logic — real Worker API (/api/auth/signin) se login karta hai.
 */

import { api } from './api.js';
import { renderTopbar, redirectIfAuthed, setBusy, escapeHtml, toast } from './common.js';
import { GOTHWAD_CONFIG } from './config.js';

// Header + agar already logged-in hai to dashboard bhej do
renderTopbar();
redirectIfAuthed();

// Domain suffix input ke saath dikhao (example: @gothwadtech.com)
document.getElementById('domain-suffix').textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;

const form = document.getElementById('login-form');
const alertBox = document.getElementById('alert');
const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');
const rememberInput = document.getElementById('remember');
const submitBtn = document.getElementById('submit-btn');

// Password show/hide toggle
document.getElementById('toggle-password').addEventListener('click', (e) => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  e.currentTarget.textContent = isPassword ? '🙈' : '👁️';
});

function showError(message) {
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}

function clearError() {
  alertBox.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!identifier) return showError('Please enter your username or email.');
  if (!password) return showError('Please enter your password.');

  setBusy(submitBtn, true, 'Signing in...');

  // REAL API CALL → Cloudflare Worker → Supabase Auth
  const res = await api.post('/auth/signin', {
    identifier,
    password,
    remember: rememberInput.checked,
  });

  setBusy(submitBtn, false);

  if (!res.ok) {
    return showError(res.error || 'Invalid username or password.');
  }

  toast(`Welcome back, ${res.data.user.first_name || res.data.user.username}! 🔥`);

  // ?next=... redirect support (protected page se aaya ho to wapas bhejo)
  const params = new URLSearchParams(location.search);
  location.href = params.get('next') || 'dashboard.html';
});
