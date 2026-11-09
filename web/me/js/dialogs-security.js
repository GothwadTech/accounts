/** Security mutations keep existing password/Google/MFA proof and server-side protections. */
import { credentialField, securityPost } from './security-credential.js';
import { clearTokens } from '../../js/api.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { toast, escapeHtml } from '../../js/common.js';
import { gothwadEmail } from '../../js/config.js';
import { el, modal, field, closeDialog, getDialogUser } from './dialogs.js';
import { bindDialogForm } from './dialog-form.js';
export { dialogPhoto } from './photo-editor.js';

export function dialogPassword() {
  const owner = getDialogUser(), adding = owner?.has_password === false;
  modal({ title: adding ? 'Add password' : 'Change password',
    sub: 'Use 8–128 characters of your choice. Other sessions will be signed out. Keep a recovery method available.',
    body: credentialField(owner, 'dlg-current-pw') +
      field('dlg-new-pw', 'New password', { type: 'password', autocomplete: 'new-password', eye: true, maxlength: 128, hint: '8–128 characters. No required character combinations.' }) +
      field('dlg-confirm-pw', 'Confirm new password', { type: 'password', autocomplete: 'new-password', eye: true, maxlength: 128 }) + mfaActionField(owner, 'dlg-password-mfa'),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Update password</button>' });
  bindDialogForm({ unchanged: false, read: () => ({ current_password: el('dlg-current-pw').value, new_password: el('dlg-new-pw').value, confirm: el('dlg-confirm-pw').value, mfa_code: mfaActionCode('dlg-password-mfa') }),
    validate: body => body.new_password.length < 8 || body.new_password.length > 128 ? { message: 'Use a password between 8 and 128 characters.', fields: ['dlg-new-pw'] } : body.new_password !== body.confirm ? { message: 'The new passwords do not match.', fields: ['dlg-confirm-pw'] } : null,
    submit: ({ confirm, ...body }) => securityPost(adding ? '/auth/add-password' : '/auth/change-password', body, owner),
    success: adding ? 'Password added. Other sessions were signed out.' : 'Password changed. Other sessions were signed out.' });
}

export function dialogDelete() {
  const owner = getDialogUser();
  if (!owner) return;
  modal({ title: 'Delete your Gothwad Account', danger: true,
    sub: 'Permanent deletion of this Accounts identity cannot be undone. Export your Accounts data first.',
    body: `<div class="alert alert-error"><strong>${escapeHtml(gothwadEmail(owner.username))}</strong> is the account being deleted.</div>
      <p>This removes the Accounts profile, sign-in methods, sessions, app grants and retained Accounts activity. It does not guarantee deletion of Mail, Drive or other services’ separate databases, backups or legal records. Manage those with each service first. Other signed-in accounts are not deleted.</p>
      ${field('dlg-delete-username', 'Type your username to confirm', { autocomplete: 'off' })}
      <label class="confirmation-check"><input type="checkbox" id="dlg-delete-ack" /> I understand this is permanent and service data is separate.</label>
      ${credentialField(owner, 'dlg-delete-pw')}${mfaActionField(owner, 'dlg-delete-mfa')}`,
    actions: '<button type="button" class="btn btn-danger" id="dlg-confirm-delete">Delete this account permanently</button>' });
  bindDialogForm({ buttonId: 'dlg-confirm-delete', unchanged: false,
    read: () => ({ username: el('dlg-delete-username').value, acknowledge: el('dlg-delete-ack').checked, password: el('dlg-delete-pw').value, mfa_code: mfaActionCode('dlg-delete-mfa') }),
    validate: body => body.username !== owner.username ? { message: 'Enter the selected account’s exact username.', fields: ['dlg-delete-username'] } : !body.acknowledge ? { message: 'Confirm that you understand the deletion scope.', fields: ['dlg-delete-ack'] } : !body.password && owner.has_password !== false ? { message: 'Enter your current password.', fields: ['dlg-delete-pw'] } : null,
    submit: ({ password, mfa_code }) => securityPost('/auth/delete-account', { password, mfa_code }, owner),
    onSuccess: () => { clearTokens(); closeDialog(); toast('The selected Accounts identity was deleted.'); location.assign('/me'); } });
}
