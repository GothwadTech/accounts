/**
 * =============================================================================
 * /me — DIALOGS (Core Modal Shell + Personal & Contact Info Modals)
 * =============================================================================
 * Security/account-lifecycle modals (photo upload, password change, delete
 * account) live in `./dialogs-security.js` and are re-exported seamlessly here.
 */

import { api } from '../../js/api.js';
import { toast, escapeHtml, setBusy } from '../../js/common.js';
import { dialogPhoto, dialogPassword, dialogDelete } from './dialogs-security.js';

let currentUser = null;
const listeners = new Set();

export function getDialogUser() {
  return currentUser;
}

export function setDialogUser(user, cb) {
  currentUser = user;
  if (cb) listeners.add(cb);
}

/** Notify all registered `/me` sections when user profile changes. */
export function notifyUpdated(updated) {
  currentUser = updated;
  for (const cb of listeners) {
    try {
      cb(updated);
    } catch { /* isolate individual tab listener errors */ }
  }
}

export function el(id) {
  return document.getElementById(id);
}

export function closeDialog() {
  const root = el('dialog-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', escListener);
}

function escListener(e) {
  if (e.key === 'Escape') closeDialog();
}

/** Shared modal shell renderer. */
export function modal({ title, sub, body, actions, danger = false }) {
  const root = el('dialog-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-title" ${danger ? 'style="color:var(--danger)"' : ''}>${escapeHtml(title)}</div>
        ${sub ? `<div class="modal-sub">${escapeHtml(sub)}</div>` : ''}
        <div id="modal-body">${body}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-text" data-close-modal>Cancel</button>
          ${actions || ''}
        </div>
      </div>
    </div>`;
  root.querySelector('[data-close-modal]').addEventListener('click', closeDialog);
  root.querySelector('#modal-backdrop').addEventListener('mousedown', (e) => {
    if (e.target.id === 'modal-backdrop') closeDialog();
  });
  document.addEventListener('keydown', escListener);
  return root;
}

/** Shared floating-label field markup. */
export function field(id, label, opts = {}) {
  return `
    <div class="auth-field-group">
      <div class="btn-field-box ${opts.error ? 'box-error' : ''}">
        <input class="input" id="${id}" type="${opts.type || 'text'}" value="${escapeHtml(opts.value ?? '')}"
               placeholder="${escapeHtml(opts.placeholder || ' ')}" ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ''} />
        <label class="floating" for="${id}">${escapeHtml(label)}</label>
        ${opts.eye ? `<button type="button" class="input-eye" data-eye="${id}" aria-label="Show password"><span class="msym">visibility</span></button>` : ''}
      </div>
      ${opts.hint ? `<div class="auth-helper">${escapeHtml(opts.hint)}</div>` : ''}
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
  el('dlg-save').addEventListener('click', async () => {
    const first = el('dlg-first-name').value.trim();
    const last = el('dlg-last-name').value.trim();
    if (!first || !last) return toast('Please enter both first and last name.', 'error');
    const btn = el('dlg-save');
    setBusy(btn, true, 'Saving...');
    const res = await api.post('/auth/update-profile', { first_name: first, last_name: last });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not save.', 'error');
    toast('Name updated');
    notifyUpdated(res.data.user);
    closeDialog();
  });
}

function dialogDob() {
  modal({
    title: 'Date of birth',
    sub: 'Your date of birth may be used for account security and personalisation. It is kept private.',
    body: field('dlg-dob', 'Date of birth', { type: 'date', value: currentUser.date_of_birth || '' }),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-save').addEventListener('click', async () => {
    const dob = el('dlg-dob').value;
    if (!dob) return toast('Please pick a date.', 'error');
    if (new Date(dob) >= new Date()) return toast('Date of birth must be in the past.', 'error');
    const btn = el('dlg-save');
    setBusy(btn, true, 'Saving...');
    const res = await api.post('/auth/update-profile', { date_of_birth: dob });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not save.', 'error');
    toast('Date of birth updated');
    notifyUpdated(res.data.user);
    closeDialog();
  });
}

function dialogGender() {
  const cur = currentUser.gender || '';
  modal({
    title: 'Gender',
    sub: 'Select your gender.',
    body: `
      <div class="auth-field-group">
        <div class="btn-field-box">
          <select class="input" id="dlg-gender" style="padding:20px 16px 8px;">
            <option value="">Select gender</option>
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
  el('dlg-save').addEventListener('click', async () => {
    const g = el('dlg-gender').value;
    if (!g) return toast('Please select a gender.', 'error');
    const btn = el('dlg-save');
    setBusy(btn, true, 'Saving...');
    const res = await api.post('/auth/update-profile', { gender: g });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not save.', 'error');
    toast('Gender updated');
    notifyUpdated(res.data.user);
    closeDialog();
  });
}

function dialogPhone() {
  modal({
    title: 'Phone number',
    sub: 'Add a phone number to sign in easily and help keep your account secure.',
    body: field('dlg-phone', 'Phone number', { type: 'tel', value: currentUser.phone_number || '', placeholder: '+91 98765 43210' }),
    actions:
      '<button type="button" class="btn btn-text" id="dlg-clear" style="margin-right:auto;color:var(--danger);">Remove</button>' +
      '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-phone').focus();
  el('dlg-clear').addEventListener('click', async () => {
    const res = await api.post('/auth/update-profile', { phone_number: '' });
    if (!res.ok) return toast(res.error || 'Could not remove.', 'error');
    toast('Phone number removed');
    notifyUpdated(res.data.user);
    closeDialog();
  });
  el('dlg-save').addEventListener('click', async () => {
    const btn = el('dlg-save');
    setBusy(btn, true, 'Saving...');
    const res = await api.post('/auth/update-profile', { phone_number: el('dlg-phone').value.trim() });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not save.', 'error');
    toast('Phone number updated');
    notifyUpdated(res.data.user);
    closeDialog();
  });
}

function dialogRecovery() {
  modal({
    title: 'Recovery email',
    sub: 'Password reset links are sent to this address. Use a personal email address you check regularly.',
    body: field('dlg-recovery', 'Recovery email', { type: 'email', value: currentUser.recovery_email || '', placeholder: 'yourname@gmail.com' }),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-recovery').focus();
  el('dlg-save').addEventListener('click', async () => {
    const rec = el('dlg-recovery').value.trim();
    if (rec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec)) {
      return toast('Please enter a valid email address.', 'error');
    }
    const btn = el('dlg-save');
    setBusy(btn, true, 'Saving...');
    const res = await api.post('/auth/update-profile', { recovery_email: rec });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not save.', 'error');
    toast('Recovery email updated');
    notifyUpdated(res.data.user);
    closeDialog();
  });
}

export { dialogPassword };
