/** Google onboarding has no password field; all provider proofs stay in HttpOnly cookies. */
import { googleApi } from '../../js/google-auth.js';
import { api } from '../../js/api.js';
import { gothwadEmail } from '../../js/config.js';
import { setBusy } from '../../js/common.js';

const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let challenge = null, next = '';
function fail(message) { el('google-error').textContent = message; }
function complete(data) {
  if (data.mfa_required) {
    challenge = data.challenge;
    el('google-onboarding').hidden = true;
    el('google-mfa').hidden = false;
    el('google-message').textContent = 'Enter your local authenticator or unused recovery code to finish signing in.';
    el('google-mfa-code').focus();
    return;
  }
  location.replace(next || `/u/${Number.isInteger(data.authuser) ? data.authuser : 0}/me`);
}
async function finish(body = {}) {
  const button = el('google-create');
  setBusy(button, true, 'Creating account...');
  const result = await googleApi('finish', body);
  setBusy(button, false);
  if (!result.ok) return fail(result.error || 'Could not finish signing in.');
  complete(result.data);
}
async function init() {
  if (params.has('error')) {
    el('google-message').textContent = 'Google verification was cancelled or failed. No accounts were merged.';
    return;
  }
  if (params.get('reauth') === '1') {
    el('google-message').textContent = 'Google verification completed. You can return to your Security settings.';
    // A script-opened window can close even after its opener has been removed.
    setTimeout(() => window.close(), 1200);
    return;
  }
  const result = await googleApi('status');
  if (!result.ok) return fail(result.error || 'Google verification expired. Please sign in again.');
  const data = result.data;
  next = data.next_url || '';
  if (!data.new_user) {
    el('google-message').textContent = `Signing in as ${data.username}…`;
    return finish();
  }
  el('google-title').textContent = 'Create your Gothwad Account';
  el('google-message').textContent = 'Choose your Gothwad username and confirm your details.';
  el('google-first').value = data.first_name;
  el('google-last').value = data.last_name;
  el('google-recovery-address').textContent = `Google email: ${data.google_email}`;
  el('google-onboarding').hidden = false;
  el('google-dob').max = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}
el('google-username').addEventListener('input', () => {
  el('google-address').textContent = gothwadEmail(el('google-username').value.trim().toLowerCase());
});
el('google-onboarding').addEventListener('submit', async event => {
  event.preventDefault(); fail('');
  await finish({ username: el('google-username').value, first_name: el('google-first').value,
    last_name: el('google-last').value, date_of_birth: el('google-dob').value, gender: el('google-gender').value,
    confirm_recovery_email: el('google-confirm-recovery').checked, accept_terms: el('google-terms').checked });
});
el('google-mfa').addEventListener('submit', async event => {
  event.preventDefault(); fail('');
  const button = el('google-verify');
  setBusy(button, true, 'Verifying...');
  const result = await api.post('/auth/mfa/verify', { challenge, code: el('google-mfa-code').value.trim() });
  setBusy(button, false);
  if (!result.ok) return fail(result.error || 'Verification failed.');
  complete(result.data);
});
init().catch(() => fail('Could not finish Google sign-in. Please try again.'));
