/** Optional passkeys: explicit platform stages, cancellation, counts and guarded removal. */
import { credentialField, securityPost } from './security-credential.js';
import { api } from '../../js/api.js';
import { performPasskey, passkeysSupported } from '../../js/passkeys.js';
import { escapeHtml, toast } from '../../js/common.js';
import { modal, field, el, getDialogUser } from './dialogs.js';
import { stageConfirmation } from './modal-shell.js';
import { captureView } from './view-context.js';
import { bindFormSubmit } from '../../js/form-submit.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { fullDate } from './display-data.js';
import { changedAccountData } from './dialog-form.js';
export async function openPasskeySettings() {
  const owner = getDialogUser(), valid = captureView(); if (!owner) return;
  let generation;
  const render = options => { generation = modal(options).dataset.dialogGeneration; };
  const current = () => valid() && owner.id === getDialogUser()?.id && el('dialog-root')?.dataset.dialogGeneration === generation;
  render({ title: 'Passkeys', body: '<p role="status">Loading your passkeys…</p>' });
  const list = await api.get('/auth/passkeys/list'); if (!current()) return;
  if (!list.ok || !Array.isArray(list.data?.passkeys)) {
    render({ title: 'Passkeys', body: '<p role="alert">Could not load passkeys. Existing methods are unchanged.</p><button type="button" class="btn btn-tonal" id="retry-passkeys">Retry</button>' });
    el('retry-passkeys').addEventListener('click', openPasskeySettings); return;
  }
  const keys = list.data.passkeys || [], supported = passkeysSupported();
  render({ title: 'Passkeys', sub: 'Use a fingerprint, face, device PIN or security key. Keep another usable sign-in method and offline recovery available.',
    body: `<form id="passkey-form"><p>${keys.length} of 10 passkeys registered. Account site: ${escapeHtml(list.data.rp_id)}.</p>
      ${!supported ? '<p role="status">This browser or embedded view cannot add passkeys. Use a supported browser over HTTPS; existing passkeys are not removed.</p>' : '<p>Verify this account → Complete your device’s prompt → Wait for Accounts to confirm registration. Cancelling a device prompt does not register a key.</p>'}
      ${keys.map((key, index) => `<div class="device"><div><strong>${escapeHtml(key.name)}</strong><p class="device-meta">Created: ${escapeHtml(fullDate(key.created_at))}<br />Last used: ${escapeHtml(fullDate(key.last_used_at))}</p></div><button type="button" class="btn btn-text" data-passkey-remove="${index}">Remove passkey</button></div>`).join('') || '<p>No passkeys registered.</p>'}
      ${field('passkey-name', 'Passkey name', { value: 'My passkey', maxlength: 80 })}${credentialField(owner, 'passkey-password')}${mfaActionField(owner, 'passkey-mfa')}
      <p id="passkey-stage" role="status"></p><p id="passkey-error" role="alert"></p></form>`,
    actions: `<button type="submit" form="passkey-form" class="btn btn-primary" id="passkey-add" ${!supported || keys.length >= 10 ? 'disabled' : ''}>Add a passkey</button>` });
  const fail = message => { if (current()) el('passkey-error').textContent = message; };
  const stage = message => { if (current()) el('passkey-stage').textContent = message; };
  const proof = () => ({ current_password: el('passkey-password').value, mfa_code: mfaActionCode('passkey-mfa') });
  const run = bindFormSubmit(el('passkey-form'), async () => {
    if (!current() || !supported || keys.length >= 10) return;
    const button = el('passkey-add'); button.disabled = true; button.setAttribute('aria-busy', 'true'); fail('');
    const name = el('passkey-name').value.trim() || 'My passkey';
    try {
      stage('Verifying this account and preparing the device prompt…');
      const options = await securityPost('/auth/passkeys/register/options', proof(), owner); if (!current()) return;
      if (!options.ok) return fail(options.error || 'Could not prepare a passkey.');
      el('passkey-password').value = '';
      stage('Waiting for your device. You may cancel its prompt without registering a passkey.');
      const response = await performPasskey(options.data.options, true); if (!current()) return;
      stage('Confirming registration with Accounts…');
      const registered = await api.post('/auth/passkeys/register/verify', { challenge: options.data.challenge, response, name }); if (!current()) return;
      if (!registered.ok) return fail(registered.error || 'Passkey registration was not confirmed.');
      changedAccountData(); toast('Passkey registration confirmed.'); await openPasskeySettings();
    } catch (error) { fail(error.name === 'NotAllowedError' ? 'Passkey setup was cancelled or timed out. No registration was confirmed.' : 'Passkey setup could not be completed. Try again in a supported browser.'); }
    finally { if (current()) { stage(''); button.disabled = false; button.removeAttribute('aria-busy'); } }
  });
  el('dialog-root').querySelectorAll('[data-passkey-remove]').forEach(button => button.addEventListener('click', () => {
    const key = keys[Number(button.dataset.passkeyRemove)]; if (!key || !current()) return;
    stageConfirmation(`Remove ${key.name}? Ensure another usable sign-in and security-verification method is available. Removing it here does not remove a copy saved in your device’s password manager.`, () => run(async () => {
      if (!current()) return; fail('');
      const result = await securityPost('/auth/passkeys/delete', { id: key.id, ...proof() }, owner); if (!current()) return;
      if (!result.ok) return fail(result.error || 'Could not remove passkey.');
      changedAccountData(); toast('Passkey removed from this account.'); await openPasskeySettings();
    }));
  }));
}
