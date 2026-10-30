/** Optional passkey enrollment and removal. Password fallback remains available. */
import { api } from '../../js/api.js';
import { performPasskey, passkeysSupported } from '../../js/passkeys.js';
import { parsePageAuthuser } from '../../js/authuser.js';
import { escapeHtml, setBusy } from '../../js/common.js';
import { modal, field, el, getDialogUser } from './dialogs.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';

export async function openPasskeySettings() {
  const owner = getDialogUser();
  const selector = parsePageAuthuser();
  if (!owner) return;
  let generation;
  const render = options => { generation = modal(options).dataset.dialogGeneration; };
  const current = () => owner.id === getDialogUser()?.id && selector === parsePageAuthuser() &&
    el('dialog-root')?.dataset.dialogGeneration === generation;
  render({ title: 'Passkeys', body: '<p>Loading your passkeys…</p>' });
  const list = await api.get('/auth/passkeys/list');
  if (!current()) return;
  if (!list.ok) {
    render({ title: 'Passkeys', body: `<p role="alert">${escapeHtml(list.error || 'Could not load passkeys.')}</p>` });
    return;
  }
  const keys = list.data.passkeys;
  render({ title: 'Passkeys', sub: 'Use a fingerprint, face, device PIN, or security key. Keep a password and offline recovery method available.',
    body: `<p>Account site: ${escapeHtml(list.data.rp_id)}</p>` +
      (keys.length ? '<ul>' + keys.map((key, index) => `<li>${escapeHtml(key.name)} <button type="button" class="btn btn-tonal" data-passkey-remove="${index}">Remove</button></li>`).join('') + '</ul>' : '<p>No passkeys registered.</p>') +
      field('passkey-name', 'Passkey name', { value: 'My passkey' }) +
      field('passkey-password', 'Current password', { type: 'password', autocomplete: 'current-password' }) +
      mfaActionField(owner, 'passkey-mfa') + '<p id="passkey-error" role="alert"></p>',
    actions: '<button type="button" class="btn btn-primary" id="passkey-add">Add a passkey</button>',
  });
  const fail = error => { if (current()) el('passkey-error').textContent = error; };
  const proof = () => ({ current_password: el('passkey-password').value, mfa_code: mfaActionCode('passkey-mfa') });
  el('passkey-add').disabled = !passkeysSupported() || keys.length >= 10;
  el('passkey-add').addEventListener('click', async () => {
    if (!current()) return;
    const button = el('passkey-add');
    const name = el('passkey-name').value;
    setBusy(button, true, 'Preparing...');
    try {
      const options = await api.post('/auth/passkeys/register/options', proof());
      if (!current()) return;
      if (!options.ok) return fail(options.error || 'Could not prepare a passkey.');
      // Erase the password before opening the platform authenticator.
      el('passkey-password').value = '';
      const response = await performPasskey(options.data.options, true);
      if (!current()) return;
      const registered = await api.post('/auth/passkeys/register/verify', { challenge: options.data.challenge, response, name });
      if (!current()) return;
      if (!registered.ok) return fail(registered.error || 'Passkey registration failed.');
      await openPasskeySettings();
    } catch (error) { fail(error.name === 'NotAllowedError' ? 'Passkey setup was cancelled or timed out.' : error.message); }
    finally { if (current()) setBusy(button, false); }
  });
  document.querySelectorAll('[data-passkey-remove]').forEach(button => button.addEventListener('click', async () => {
    if (!current()) return;
    const key = keys[Number(button.dataset.passkeyRemove)];
    if (!key || !confirm(`Remove ${key.name}? You will need another sign-in method.`)) return;
    setBusy(button, true, 'Removing...');
    const result = await api.post('/auth/passkeys/delete', { id: key.id, ...proof() });
    if (!current()) return;
    if (result.ok) await openPasskeySettings();
    else { fail(result.error || 'Could not remove passkey.'); setBusy(button, false); }
  }));
}
