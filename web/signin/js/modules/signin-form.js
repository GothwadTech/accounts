/**
 * Sign-In Form Module — Google-style Two-Step Flow (`Identifier -> Password`)
 * Zero tokens in `localStorage` / `sessionStorage`.
 * Preserves `?add=1` when appending a new account slot via `POST /api/auth/signin?add=1`.
 */

import { api, clearTokens } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';
import { safeNextUrl } from '../../../js/accounts.js';
import { isInternalAccountHubPath, mePathForAuthuser } from '../../../js/authuser.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

export function validateIdentifier(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter your username, email or phone number.', isThirdParty: false };
  }

  const appDomain = (GOTHWAD_CONFIG.APP_DOMAIN || 'gothwadtech.com').toLowerCase();

  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  const isPhone = /^(\+)?[0-9]{7,15}$/.test(digitsOnly);
  if (isPhone) {
    return { ok: true, type: 'phone', identifier: trimmed, display: trimmed };
  }

  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    const parts = lower.split('@');
    const domainPart = parts[1] || '';
    if (domainPart !== appDomain) {
      return {
        ok: false,
        error: `Only @${appDomain} suffix is allowed.`,
        isThirdParty: true,
      };
    }
    return { ok: true, type: 'email', identifier: lower, display: lower };
  }

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

  async function goToPasswordStep() {
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

    setBusy(btn, true, 'Checking...');
    const lookup = await api.post('/auth/check-identifier', { identifier: val.identifier });
    setBusy(btn, false);

    if (!lookup.ok || (lookup.data && lookup.data.exists === false)) {
      const msg =
        (lookup.data && lookup.data.error) ||
        lookup.error ||
        "This username doesn't exist. Check the spelling, or create a new account.";
      setFieldError(msg);
      hideAlert('alert-signin');
      identifierInput?.focus();
      return;
    }

    setFieldError(null);
    hideAlert('alert-signin');
    currentStep = 'password';
    verifiedIdentifier = val.identifier;

    if (chipUserText) chipUserText.textContent = val.display;

    if (identifierStep) identifierStep.classList.add('hidden');
    if (passwordStep) passwordStep.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Sign In';
    if (passwordInput) passwordInput.focus();
  }

  if (identifierInput) {
    identifierInput.addEventListener('input', () => {
      const val = identifierInput.value.trim().toLowerCase();
      const appDomain = (GOTHWAD_CONFIG.APP_DOMAIN || 'gothwadtech.com').toLowerCase();

      if (val.includes('@')) {
        const parts = val.split('@');
        const domain = parts[1] || '';
        if (domain && domain.includes('.') && domain !== appDomain) {
          setFieldError(`Only @${appDomain} suffix is allowed.`);
          return;
        } else if (domain && !appDomain.startsWith(domain)) {
          setFieldError(`Only @${appDomain} suffix is allowed.`);
          return;
        }
      }
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
      await goToPasswordStep();
      return;
    }

    const identifier = verifiedIdentifier || identifierInput?.value.trim();
    const password = passwordInput?.value;
    const remember = true;

    if (!identifier) {
      goToIdentifierStep();
      return showAlert('alert-signin', 'Please enter your username or email.');
    }
    if (!password) {
      return showAlert('alert-signin', 'Please enter your password.');
    }

    const params = new URLSearchParams(location.search);
    const addMode = params.get('add') === '1';
    const path = addMode ? '/auth/signin?add=1' : '/auth/signin';

    setBusy(btn, true, 'Signing in...');
    clearTokens();
    const res = await api.post(path, { identifier, password, remember, add: addMode });
    setBusy(btn, false);

    if (!res.ok) {
      const msg = res.error || 'Incorrect password. Try again or use Forgot password.';
      if (/username doesn't exist|isn't registered|doesn't exist/i.test(msg)) {
        goToIdentifierStep();
        setFieldError(msg);
        return;
      }
      return showAlert('alert-signin', msg);
    }

    toast(`Welcome back, ${res.data.user.first_name || res.data.user.username}!`);

    const authuser = Number.isInteger(res.data?.authuser) ? res.data.authuser : 0;
    const defaultMe = mePathForAuthuser(authuser);
    const next = params.get('next');
    location.href = !next || isInternalAccountHubPath(next) ? defaultMe : safeNextUrl(next, defaultMe);
  });
}
