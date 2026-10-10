import { api } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

/**
 * Validates and formats user identifier:
 * 1. Empty check
 * 2. Phone detection: pure numbers (+91, 10-digit, etc.) -> valid phone
 * 3. Email check: if contains '@':
 *    - MUST end with @APP_DOMAIN (e.g. @gothwadtech.com)
 *    - If third-party email like @gmail.com -> return isThirdParty: true with custom red note
 * 4. Pure username (letters or letters+numbers like "pawan", "user123"):
 *    - Auto-append @APP_DOMAIN -> "pawan@gothwadtech.com"
 */
export function validateIdentifier(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter your username, email or phone number.', isThirdParty: false };
  }

  const appDomain = (GOTHWAD_CONFIG.APP_DOMAIN || 'gothwadtech.com').toLowerCase();

  // Phone number detection: e.g. +91 9876543210, 9876543210, etc. (digits, +, -, spaces only, 7-15 digits)
  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  const isPhone = /^(\+)?[0-9]{7,15}$/.test(digitsOnly);
  if (isPhone) {
    return { ok: true, type: 'phone', identifier: trimmed, display: trimmed };
  }

  // If user typed an email (contains @)
  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    const parts = lower.split('@');
    const domainPart = parts[1] || '';
    if (domainPart !== appDomain) {
      return {
        ok: false,
        error: `Sirf @${appDomain} suffix ke saath hi email daal sakte hain, koi third-party email nahi.`,
        isThirdParty: true,
      };
    }
    return { ok: true, type: 'email', identifier: lower, display: lower };
  }

  // Pure username (letters, or letters + numbers): auto-append @APP_DOMAIN
  const cleanUsername = trimmed.toLowerCase();
  const fullEmail = `${cleanUsername}@${appDomain}`;
  return {
    ok: true,
    type: 'username',
    identifier: fullEmail,
    display: fullEmail,
  };
}

export function formatDisplayIdentifier(raw) {
  const res = validateIdentifier(raw);
  return res.display || String(raw || '').trim();
}

export function initSigninForm(showAlert, hideAlert) {
  const form = document.getElementById('signin-form');
  if (!form) return;

  const identifierStep = document.getElementById('step-identifier');
  const passwordStep = document.getElementById('step-password');
  const userChip = document.getElementById('btn-back-to-identifier');
  const chipUserText = document.getElementById('chip-user-text');
  const identifierInput = document.getElementById('identifier');
  const identifierBox = document.getElementById('identifier-box');
  const identifierNote = document.getElementById('identifier-error-note');
  const passwordInput = document.getElementById('password');
  const btn = document.getElementById('signin-btn');
  const btnText = btn?.querySelector('span') || btn;

  let currentStep = 'identifier';
  let verifiedIdentifier = '';

  function setFieldError(msg) {
    if (identifierNote) {
      if (msg) {
        identifierNote.textContent = msg;
        identifierNote.classList.remove('hidden');
      } else {
        identifierNote.textContent = '';
        identifierNote.classList.add('hidden');
      }
    }
    if (identifierBox) {
      identifierBox.classList.toggle('box-error', !!msg);
    }
  }

  function goToIdentifierStep() {
    currentStep = 'identifier';
    hideAlert('alert-signin');
    setFieldError(null);
    if (identifierStep) identifierStep.classList.remove('hidden');
    if (passwordStep) passwordStep.classList.add('hidden');
    if (btnText) btnText.textContent = 'Next';
    if (identifierInput) identifierInput.focus();
  }

  function goToPasswordStep() {
    const rawIdentifier = identifierInput?.value.trim();
    const val = validateIdentifier(rawIdentifier);

    if (!val.ok) {
      if (val.isThirdParty) {
        setFieldError(val.error);
        hideAlert('alert-signin');
      } else {
        setFieldError(null);
        showAlert('alert-signin', val.error);
      }
      identifierInput?.focus();
      return;
    }

    setFieldError(null);
    hideAlert('alert-signin');
    currentStep = 'password';
    verifiedIdentifier = val.identifier;

    // Display formatted identifier (e.g. pawan@gothwadtech.com or phone)
    if (chipUserText) chipUserText.textContent = val.display;

    if (identifierStep) identifierStep.classList.add('hidden');
    if (passwordStep) passwordStep.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Sign In';
    if (passwordInput) {
      passwordInput.focus();
    }
  }

  // Live input error check when user types
  if (identifierInput) {
    identifierInput.addEventListener('input', () => {
      const val = identifierInput.value.trim().toLowerCase();
      const appDomain = (GOTHWAD_CONFIG.APP_DOMAIN || 'gothwadtech.com').toLowerCase();

      if (val.includes('@')) {
        const parts = val.split('@');
        const domain = parts[1] || '';
        // If domain has a dot and is not appDomain, or clearly non-matching
        if (domain && domain.includes('.') && domain !== appDomain) {
          setFieldError(`Sirf @${appDomain} suffix ke saath hi email daal sakte hain, koi third-party email nahi.`);
          return;
        } else if (domain && !appDomain.startsWith(domain)) {
          setFieldError(`Sirf @${appDomain} suffix ke saath hi email daal sakte hain, koi third-party email nahi.`);
          return;
        }
      }
      // If typing normally or username or matching domain, clear red error
      setFieldError(null);
      hideAlert('alert-signin');
    });
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

    const identifier = verifiedIdentifier || identifierInput?.value.trim();
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
