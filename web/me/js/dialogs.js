/**
 * =============================================================================
 * /me — DIALOGS (Core Modal Shell + Personal & Contact Info Modals)
 * =============================================================================
 * Security/account-lifecycle modals (photo upload, password change, delete
 * account) live in `./dialogs-security.js` and are re-exported seamlessly here.
 */
import { credentialField, securityPost } from './security-credential.js';
import { api } from '../../js/api.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { toast, escapeHtml, setBusy } from '../../js/common.js';
import { modal, closeDialog, configureModalOwner } from './modal-shell.js';
import { bindDialogForm } from './dialog-form.js';
import { dialogDob } from './profile-birthday.js';
import { dialogPhoto, dialogPassword, dialogDelete } from './dialogs-security.js';

let currentUser = null;
configureModalOwner(() => currentUser);
const listeners = new Map();

export function getDialogUser() {
  return currentUser;
}

export function setDialogUser(user, cb, key = cb) {
  currentUser = user;
  if (cb) listeners.set(key, cb);
}

/** Notify all registered `/me` sections when user profile changes. */
export function notifyUpdated(updated) {
  if (!updated || (currentUser?.id && updated.id !== currentUser.id)) return;
  currentUser = updated;
  for (const cb of listeners.values()) {
    try {
      cb(updated);
    } catch { /* isolate individual tab listener errors */ }
  }
}

export function el(id) {
  return document.getElementById(id);
}

export { modal, closeDialog, dialogError } from './modal-shell.js';

/** Shared floating-label field markup. */
export function field(id, label, opts = {}) {
  return `
    <div class="auth-field-group">
      <div class="btn-field-box ${opts.error ? 'box-error' : ''}">
        <input class="input" id="${id}" type="${opts.type || 'text'}" value="${escapeHtml(opts.value ?? '')}"
               aria-describedby="${id}-hint" ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} placeholder="${escapeHtml(opts.placeholder || ' ')}" ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ''} />
        <label class="floating" for="${id}">${escapeHtml(label)}</label>
        ${opts.eye ? `<button type="button" class="input-eye" data-eye="${id}" aria-label="Show password"><span class="msym">visibility</span></button>` : ''}
      </div>
      <div class="auth-helper" id="${id}-hint">${escapeHtml(opts.hint || '')}</div>
    </div>`;
}

export function openDialog(name) {
  if (!currentUser) return;
  switch (name) {
    case 'name': dialogName(); break;
    case 'dob': dialogDob(); break;
    case 'gender': dialogGender(); break;
    case 'phone': dialogPhone(); break;
    case 'recovery': dialogRecovery(); break;
    case 'photo': dialogPhoto(); break;
    case 'password': dialogPassword(); break;
    case 'delete': dialogDelete(); break;
    default: break;
  }
}

function dialogName() {
  modal({
    title: 'Name',
    sub: 'Changes to your name will be reflected across your emails and Gothwad services.',
    body:
      field('dlg-first-name', 'First name', { value: currentUser.first_name }) +
      field('dlg-last-name', 'Last name', { value: currentUser.last_name }),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-first-name').focus();
  bindDialogForm({ read: () => ({ first_name: el('dlg-first-name').value.trim(), last_name: el('dlg-last-name').value.trim() }),
    validate: body => !body.first_name || !body.last_name ? { message: 'Enter both first and last name.', fields: [!body.first_name ? 'dlg-first-name' : 'dlg-last-name'] } : null,
    submit: body => api.post('/auth/update-profile', body), success: 'Name updated' });
}

function dialogGender() {
  const cur = currentUser.gender || '';
  modal({
    title: 'Gender',
    sub: 'Optional profile detail. Choose Not set to remove it. Saving does not change sharing permissions.',
    body: `
      <div class="auth-field-group">
        <div class="btn-field-box">
          <select class="input" id="dlg-gender" style="padding:20px 16px 8px;">
            <option value="">Not set</option>
            <option value="Male" ${cur === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${cur === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Other" ${cur === 'Other' ? 'selected' : ''}>Other</option>
            <option value="Rather not say" ${cur === 'Rather not say' ? 'selected' : ''}>Rather not say</option>
          </select>
          <label class="floating" for="dlg-gender">Gender</label>
          <span class="msym" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-muted);">expand_more</span>
        </div>
      </div>`,
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  bindDialogForm({ read: () => ({ gender: el('dlg-gender').value }), submit: body => api.post('/auth/update-profile', body),
    success: body => body.gender ? 'Gender updated' : 'Gender removed' });
}

function dialogPhone() {
  const owner = currentUser;
  const post = (path, body) => securityPost(path, body, owner);
  modal({
    title: 'Phone number',
    sub: 'Verify your identity to change this sign-in identifier. Phone ownership is not verified.',
    body: field('dlg-phone', 'Phone number', { type: 'tel', value: currentUser.phone_number || '', placeholder: '+91 98765 43210' }) +
      credentialField(currentUser, 'dlg-phone-password') + mfaActionField(currentUser, 'dlg-phone-mfa'),
    actions:
      '<button type="button" class="btn btn-text" id="dlg-clear" style="margin-right:auto;color:var(--danger);">Remove</button>' +
      '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-phone').focus();
  const proof = () => ({ current_password: el('dlg-phone-password').value, mfa_code: mfaActionCode('dlg-phone-mfa') });
  bindDialogForm({ read: () => ({ phone_number: el('dlg-phone').value.trim() }), submit: body => post('/auth/update-profile', { ...body, ...proof() }), success: 'Phone number updated' });
  bindDialogForm({ buttonId: 'dlg-clear', read: () => ({ phone_number: '' }), unchanged: false,
    submit: body => post('/auth/update-profile', { ...body, ...proof() }), success: 'Phone number removed' });
  el('dlg-clear').disabled = !owner.phone_number;
}

function dialogRecovery() {
  const owner = currentUser;
  const post = (path, body) => securityPost(path, body, owner);
  modal({
    title: 'Recovery email',
    sub: 'Verify your identity and the replacement address. Your current recovery email stays active until verification.',
    body: field('dlg-recovery', 'Replacement recovery email', { type: 'email', value: '', placeholder: 'yourname@example.com' }) +
      credentialField(currentUser, 'dlg-recovery-password') + mfaActionField(currentUser, 'dlg-recovery-mfa'),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Send verification</button>',
  });
  el('dlg-recovery').focus();
  bindDialogForm({ read: () => ({ recovery_email: el('dlg-recovery').value.trim() }), unchanged: false,
    validate: body => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recovery_email) ? { message: 'Enter a valid recovery email address.', fields: ['dlg-recovery'] } : null,
    submit: body => post('/auth/recovery-email/request', { ...body, current_password: el('dlg-recovery-password').value, mfa_code: mfaActionCode('dlg-recovery-mfa') }),
    success: 'Verification sent. Your current recovery address changes only after confirmation.' });
}

export { dialogPassword };
