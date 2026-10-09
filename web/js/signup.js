/**
 * SIGNUP PAGE logic
 * - Username live availability check (/api/auth/check-username)
 * - Password strength meter
 * - Real account creation (/api/auth/signup) → auto login → dashboard
 */

import { api } from './api.js';
import { renderTopbar, redirectIfAuthed, setBusy, toast, passwordStrength } from './common.js';
import { GOTHWAD_CONFIG } from './config.js';

renderTopbar();
redirectIfAuthed();

document.getElementById('domain-suffix').textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;

const form = document.getElementById('signup-form');
const alertBox = document.getElementById('alert');
const usernameInput = document.getElementById('username');
const usernameHint = document.getElementById('username-hint');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm_password');
const strengthFill = document.getElementById('strength-fill');
const strengthText = document.getElementById('strength-text');
const submitBtn = document.getElementById('submit-btn');

document.getElementById('toggle-password').addEventListener('click', (e) => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  confirmInput.type = isPassword ? 'text' : 'password';
  e.currentTarget.textContent = isPassword ? '🙈' : '👁️';
});

function showError(message) {
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}
function clearError() {
  alertBox.classList.add('hidden');
}

/* ---------------------------------------------------- username live check */
// Har input par debounce (ruk kar) ke saath availability check karte hain,
// taaki har keystroke par API call na jaye.
let usernameTimer = null;
usernameInput.addEventListener('input', () => {
  // Allowed characters only
  usernameInput.value = usernameInput.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');

  clearTimeout(usernameTimer);
  const username = usernameInput.value.trim();

  if (username.length < 3) {
    usernameHint.className = 'hint';
    usernameHint.textContent = '3–24 characters: a-z, 0-9, dot (.), dash (-), underscore (_)';
    return;
  }

  usernameHint.className = 'hint';
  usernameHint.textContent = 'Checking availability...';

  usernameTimer = setTimeout(async () => {
    const res = await api.get(`/auth/check-username?username=${encodeURIComponent(username)}`);
    if (res.ok && res.data) {
      if (res.data.available) {
        usernameHint.className = 'hint ok';
        usernameHint.textContent = `✓ ${username}@${GOTHWAD_CONFIG.APP_DOMAIN} is available!`;
      } else {
        usernameHint.className = 'hint bad';
        usernameHint.textContent = res.data.error
          ? `✗ ${res.data.error}`
          : `✗ "${username}" is already taken.`;
      }
    }
  }, 450); // 450ms debounce
});

/* --------------------------------------------------- password strength UI */
passwordInput.addEventListener('input', () => {
  const score = passwordStrength(passwordInput.value);
  const labels = ['Very weak', 'Weak', 'Okay', 'Good', 'Strong! 💪'];
  const colors = ['#f04747', '#f04747', '#d4a72c', '#2ea86e', '#2ea86e'];
  strengthFill.style.width = `${score * 25}%`;
  strengthFill.style.background = colors[score];
  strengthText.textContent = passwordInput.value
    ? labels[score]
    : 'Use 8+ characters with mixed case, numbers & symbols.';
});

/* ------------------------------------------------------------ submit */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const firstName = document.getElementById('first_name').value.trim();
  const lastName = document.getElementById('last_name').value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;
  const recoveryEmail = document.getElementById('recovery_email').value.trim();
  const phoneNumber = document.getElementById('phone_number').value.trim();

  // Client-side validation (Worker bhi dubara check karta hai — dono zaroori!)
  if (!firstName || !lastName) return showError('First and last name are required.');
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username)) {
    return showError('Username must be 3–24 characters: a-z, 0-9, dot, dash, underscore.');
  }
  if (password.length < 8) return showError('Password must be at least 8 characters.');
  if (password !== confirmPassword) return showError('Passwords do not match.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
    return showError('Please enter a valid recovery email (e.g. your Gmail).');
  }

  setBusy(submitBtn, true, 'Creating your account...');

  // REAL API CALL → Worker → Supabase (profile auto-banta hai trigger se)
  const res = await api.post('/auth/signup', {
    first_name: firstName,
    last_name: lastName,
    username,
    password,
    recovery_email: recoveryEmail,
    phone_number: phoneNumber || null,
    remember: true,
  });

  setBusy(submitBtn, false);

  if (!res.ok) {
    return showError(res.error || 'Could not create account. Please try again.');
  }

  toast(`Account created! Welcome to Gothwad, ${firstName}! 🔥`);

  // Signup ke saath hi session mil jaata hai → seedha dashboard
  setTimeout(() => {
    location.href = 'dashboard.html';
  }, 600);
});
