import { api } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

/**
 * Format user identifier for chip display and submit:
 * - Pure digits / phone (+91..., 9876543210, etc.) -> format clean phone
 * - Contains @ (user typed full email or custom email) -> preserve full email
 * - Username only (letters, letters + numbers like "pawan", "user123") -> auto-append @APP_DOMAIN
 */
export function formatDisplayIdentifier(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  // Phone number detection: e.g. +91 9876543210, 9876543210, etc. (digits, +, -, spaces only, at least 7 digits)
  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  const isPhone = /^(\+)?[0-9]{7,15}$/.test(digitsOnly);
  if (isPhone) {
    return trimmed;
  }

  // If user already typed an email (contains @)
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // Pure username (or username with letters + numbers): auto append @APP_DOMAIN
  const appDomain = GOTHWAD_CONFIG.APP_DOMAIN || 'gothwadtech.com';
  return `${trimmed.toLowerCase()}@${appDomain}`;
}

export function initSigninForm(showAlert, hideAlert) {
  const form = document.getElementById('signin-form');
  if (!form) return;

  const identifierStep = document.getElementById('step-identifier');
  const passwordStep = document.getElementById('step-password');
  const userChip = document.getElementById('btn-back-to-identifier');
  const chipUserText = document.getElementById('chip-user-text');
  const identifierInput = document.getElementById('identifier');
  const passwordInput = document.getElementById('password');
  const btn = document.getElementById('signin-btn');
  const btnText = btn?.querySelector('span') || btn;

  let currentStep = 'identifier';

  function goToIdentifierStep() {
    currentStep = 'identifier';
    hideAlert('alert-signin');
    if (identifierStep) identifierStep.classList.remove('hidden');
    if (passwordStep) passwordStep.classList.add('hidden');
    if (btnText) btnText.textContent = 'Next';
    if (identifierInput) identifierInput.focus();
  }

  function goToPasswordStep() {
    const rawIdentifier = identifierInput?.value.trim();
    if (!rawIdentifier) {
      return showAlert('alert-signin', 'Please enter your username, email or phone number.');
    }
    hideAlert('alert-signin');
    currentStep = 'password';

    // Auto-detect & format display identifier
    const displayIdentifier = formatDisplayIdentifier(rawIdentifier);
    if (chipUserText) chipUserText.textContent = displayIdentifier;

    if (identifierStep) identifierStep.classList.add('hidden');
    if (passwordStep) passwordStep.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Sign In';
    if (passwordInput) {
      passwordInput.focus();
    }
  }

  if (userChip) {
    userChip.addEventListener('click', () => {
      goToIdentifierStep();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alert-signin');

    if (currentStep === 'identifier') {
      goToPasswordStep();
      return;
    }

    const identifier = identifierInput?.value.trim();
    const password = passwordInput?.value;
    const remember = true; // Always remember session

    if (!identifier) {
      goToIdentifierStep();
      return showAlert('alert-signin', 'Please enter your username or email.');
    }
    if (!password) {
      return showAlert('alert-signin', 'Please enter your password.');
    }

    setBusy(btn, true, 'Signing in...');

    const res = await api.post('/auth/signin', { identifier, password, remember });
    setBusy(btn, false);

    if (!res.ok) {
      return showAlert('alert-signin', res.error || 'Invalid username or password.');
    }

    toast(`Welcome back, ${res.data.user.first_name || res.data.user.username}!`);

    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    const safeNext = next && (next.startsWith('/') || next.startsWith(location.origin)) ? next : '/me';
    location.href = safeNext;
  });
}
