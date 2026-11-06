/** Google account choice and passwordless onboarding; proofs stay in HttpOnly cookies. */
import { bindFormSubmit, isActiveForm } from '../../js/form-submit.js';
import { googleApi } from '../../js/google-auth.js';
import { api } from '../../js/api.js';
import { gothwadEmail } from '../../js/config.js';
import { escapeHtml, setBusy } from '../../js/common.js';

// Old HTML may still reference this stable source URL. Never run new controls on old markup.
if (!document.getElementById('google-chooser')) {
  const target = new URL(location.href);
  if (!target.searchParams.has('refresh')) {
    target.searchParams.set('refresh', '1');
    location.replace(target.href);
  } else {
    document.getElementById('google-message').textContent = 'Accounts is updating. Please try signing in again shortly.';
  }
} else {
  const el = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let challenge = null, next = '', accounts = [];
  function fail(message) {
    el('google-error').textContent = message;
    if (message) el('google-message').textContent = 'Sign-in could not continue.';
  }
  function complete(data) {
    if (data.mfa_required) {
      challenge = data.challenge;
      el('google-chooser').hidden = true;
      el('google-onboarding').hidden = true;
      el('google-mfa').hidden = false;
      el('google-message').textContent = 'Enter your local authenticator or unused recovery code to finish signing in.';
      el('google-mfa-code').focus();
      return;
    }
    location.replace(next || `/u/${Number.isInteger(data.authuser) ? data.authuser : 0}/me`);
    return true;
  }
  async function finish(body, button) {
    setBusy(button, true, body.action === 'create' ? 'Creating account...' : 'Signing in...');
    const result = await googleApi('finish', body);
    setBusy(button, false);
    if (!result.ok) return fail(result.error || 'Could not finish signing in.');
    return complete(result.data);
  }
  function showChooser() {
    fail('');
    el('google-onboarding').hidden = true;
    el('google-chooser').hidden = false;
    el('google-title').textContent = 'Choose a Gothwad Account';
    el('google-message').textContent = 'Continue with an existing account, or add a new account using this Google account.';
  }
  function showOnboarding() {
    fail('');
    el('google-chooser').hidden = true;
    el('google-onboarding').hidden = false;
    el('google-title').textContent = 'Create your Gothwad Account';
    el('google-message').textContent = 'Choose a new Gothwad username and confirm your details.';
    el('google-choose-back').hidden = accounts.length === 0;
  }
  async function init() {
    if (params.has('error')) {
      el('google-message').textContent = 'Google verification was cancelled or failed. No accounts were merged.';
      return;
    }
    if (params.get('reauth') === '1') {
      el('google-message').textContent = 'Google verification completed. You can return to your Security settings.';
      setTimeout(() => window.close(), 1200);
      return;
    }
    const result = await googleApi('status');
    if (!result.ok) return fail(result.error || 'Google verification expired. Please sign in again.');
    const data = result.data;
    next = data.next_url || '';
    if (!Array.isArray(data.accounts)) return fail('Accounts needs an update. Please refresh or try again later.');
    accounts = data.accounts;
    el('google-first').value = data.first_name;
    el('google-last').value = data.last_name;
    el('google-recovery-address').textContent = `Google email: ${data.google_email}`;
    for (const account of accounts) {
      const button = document.createElement('button');
      const name = `${account.first_name || ''} ${account.last_name || ''}`.trim() || account.username;
      button.type = 'submit'; button.name = 'account_id'; button.value = account.id;
      button.className = 'chooser-row';
      button.innerHTML = `<span class="acct-plus" aria-hidden="true">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>
        <span class="chooser-meta"><span class="chooser-name">${escapeHtml(name)}</span>
        <span class="chooser-email">${escapeHtml(gothwadEmail(account.username))}</span></span>`;
      el('google-account-list').appendChild(button);
    }
    if (accounts.length) showChooser();
    else showOnboarding();
  }
  function changeForm(source, show, target) {
    const form = el(source);
    if (!isActiveForm(form) || form.getAttribute('aria-busy') === 'true') return;
    show();
    target()?.focus({ preventScroll: true });
  }
  el('google-add-new').addEventListener('click', () =>
    changeForm('google-chooser', showOnboarding, () => el('google-first')));
  el('google-choose-back').addEventListener('click', () =>
    changeForm('google-onboarding', showChooser, () => el('google-account-list').querySelector('button')));
  el('google-username').addEventListener('input', () => {
    el('google-address').textContent = gothwadEmail(el('google-username').value.trim().toLowerCase());
  });
  bindFormSubmit(el('google-chooser'), event => {
    if (!event.submitter?.value) return fail('Choose an account to continue.');
    fail('');
    return finish({ action: 'select', account_id: event.submitter.value }, event.submitter);
  });
  bindFormSubmit(el('google-onboarding'), () => {
    fail('');
    return finish({ action: 'create', username: el('google-username').value, first_name: el('google-first').value,
      last_name: el('google-last').value, gender: el('google-gender').value,
      confirm_recovery_email: el('google-confirm-recovery').checked, accept_terms: el('google-terms').checked }, el('google-create'));
  });
  bindFormSubmit(el('google-mfa'), async () => {
    fail('');
    const button = el('google-verify');
    setBusy(button, true, 'Verifying...');
    const result = await api.post('/auth/mfa/verify', { challenge, code: el('google-mfa-code').value.trim() });
    setBusy(button, false);
    if (!result.ok) return fail(result.error || 'Verification failed.');
    return complete(result.data);
  });
  init().catch(() => fail('Could not finish Google sign-in. Please try again.'));
}
