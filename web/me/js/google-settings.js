/** Explicit many-to-many Google methods; never link or merge by matching email. */
import { stageConfirmation } from './modal-shell.js';
import { modal, el, getDialogUser, notifyUpdated } from './dialogs.js';
import { credentialField, securityPost } from './security-credential.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { googleApi } from '../../js/google-auth.js';
import { escapeHtml, toast, formatDate } from '../../js/common.js';
import { bindFormSubmit } from '../../js/form-submit.js';
import { parsePageAuthuser } from '../../js/authuser.js';

export async function openGoogleSettings() {
  const owner = getDialogUser(), selector = parsePageAuthuser();
  if (!owner) return;
  modal({ title: 'Google accounts', body: '<p role="status">Loading connected methods and provider availability…</p>' });
  const initialGeneration = el('dialog-root')?.dataset.dialogGeneration;
  const [loaded, provider] = await Promise.all([googleApi('links'), googleApi('status')]);
  if (owner.id !== getDialogUser()?.id || selector !== parsePageAuthuser() ||
    initialGeneration !== el('dialog-root')?.dataset.dialogGeneration) return;
  if (!loaded.ok || !Array.isArray(loaded.data?.links)) {
    modal({ title: 'Google accounts', body: '<p role="alert">Could not load Google methods. Existing sign-in methods are unchanged.</p><button type="button" class="btn btn-tonal" id="retry-google">Retry</button>' });
    el('retry-google').addEventListener('click', openGoogleSettings); return;
  }
  if (loaded.data.user_id !== owner.id) return toast('The selected account changed. Please reopen Google settings.', 'error');
  const { links, limit, has_password: passwordSet } = loaded.data;
  const account = { ...owner, has_password: passwordSet };
  const available = provider.ok && provider.data?.enabled === true;
  const rows = links.map((link, index) => `<div class="device"><div class="device-info"><div>
    <div class="device-name">${escapeHtml(link.email)}</div>
    <div class="device-meta">Connected ${escapeHtml(formatDate(link.created_at))}${link.is_recovery ? ' · Also your recovery email' : ''}</div></div></div>
    <button type="button" class="btn btn-ghost btn-sm" data-google-remove="${index}"
      ${!passwordSet && links.length === 1 ? 'disabled aria-disabled="true"' : ''}>Remove</button></div>`).join('');
  const root = modal({ title: 'Google accounts',
    sub: 'Each connected Google account can sign in to this same Gothwad Account. Connect only accounts you control.',
    body: `<form id="google-method-form"><p>Review methods → Verify this account → Choose a Google account → Return here to confirm the connection.</p>${!available ? '<p role="status">Google linking is not available on this site right now. Existing methods are unchanged; try again later or use another registered method.</p>' : ''}${rows || '<p>No Google accounts connected.</p>'}
      <p>${links.length} of ${limit} Google accounts connected. Your Gothwad MFA still applies.</p>
      ${!passwordSet && links.length === 1 ? '<p>Add a password before removing the last Google account. A passkey can sign in, but cannot yet verify security-setting changes on its own.</p>' : ''}
      <p>Removing a method signs out other devices and invalidates pending security proofs. It does not change your recovery email. A removed Google email can still receive password-reset messages if it remains your recovery address. Change that address separately if it is compromised.</p>
      ${credentialField(account, 'google-method-password')}${mfaActionField(owner, 'google-method-mfa')}
      <p id="google-method-error" class="text-danger" role="alert"></p>
      <button type="submit" class="btn btn-primary" id="google-method-add" ${links.length >= limit || !available ? 'disabled' : ''}>Add Google account</button>
      </form>`,
  });
  const generation = root.dataset.dialogGeneration;
  const current = () => owner.id === getDialogUser()?.id && selector === parsePageAuthuser() &&
    root.dataset.dialogGeneration === generation;
  const fail = message => { if (current()) el('google-method-error').textContent = message; };
  const proof = () => ({ expected_user_id: owner.id, current_password: el('google-method-password').value,
    mfa_code: mfaActionCode('google-method-mfa') });
  const run = bindFormSubmit(el('google-method-form'), async () => {
    if (!current() || links.length >= limit || !available) return;
    fail('');
    const result = await securityPost('/auth/google/start', { purpose: 'link', ...proof() }, account);
    if (!current()) return;
    if (!result.ok) return fail(result.error || 'Could not add Google account.');
    location.assign(result.data.url);
    return true;
  });
  root.querySelectorAll('[data-google-remove]').forEach(button => button.addEventListener('click', () => {
    if (!current()) return;
    const link = links[Number(button.dataset.googleRemove)];
    if (!link || (!passwordSet && links.length === 1)) return;
    stageConfirmation(`Remove ${link.email}? Other sessions will be signed out and pending security proofs invalidated. Recovery email access is separate and is not removed by this action. Keep another usable sign-in and security-verification method.`, () => run(async () => {
      if (!current()) return;
      fail('');
      const result = await securityPost('/auth/google/unlink', { id: link.id, ...proof() }, account);
      if (!current()) return;
      if (!result.ok) return fail(result.error || 'Could not remove Google account.');
      notifyUpdated(result.data.user);
      const { changedAccountData } = await import('./dialog-form.js'); changedAccountData();
      toast(result.data.notification_sent ? 'Google account removed. Other sessions signed out.' : 'Google account removed. Other sessions signed out, but the email alert could not be delivered.');
      await openGoogleSettings();
    }));
  }));
}
