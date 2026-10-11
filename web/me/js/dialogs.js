/**
 * =============================================================================
 * /me — DIALOGS (Google-style modals)
 * =============================================================================
 * Har setting row se dialog khulta hai: name, dob, gender, phone, recovery,
 * photo, password, delete. Yeh module dialogs render karta hai (dialog-root
 * mein) aur save logic chalata hai (/auth/update-profile waghera).
 */

import { api, clearTokens } from '../../js/api.js';
import { toast, escapeHtml, setBusy } from '../../js/common.js';
import { gothwadEmail } from '../../js/config.js';
import { initialsFor, clearAllAccounts } from '../../js/accounts.js';

let currentUser = null;

/* Har section apna refresh callback register karta hai — profile update par
   SAB chalte hain (last-one-wins problem fix). */
const listeners = new Set();

export function setDialogUser(user, cb) {
  currentUser = user;
  if (cb) listeners.add(cb);
}

/** Save ke baad: saare listeners ko naya user do. */
function notifyUpdated(updated) {
  currentUser = updated;
  for (const cb of listeners) {
    try {
      cb(updated);
    } catch { /* ek section fail ho to baaki chalney do */ }
  }
}

/* ------------------------------------------------------------ helpers */
function el(id) {
  return document.getElementById(id);
}

function closeDialog() {
  document.getElementById('dialog-root').innerHTML = '';
  document.removeEventListener('keydown', escListener);
}

function escListener(e) {
  if (e.key === 'Escape') closeDialog();
}

/** Modal shell banado — content ke saath. */
function modal({ title, sub, body, actions, danger = false }) {
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

/** Floating-label field (auth pages jaisa hi). */
function field(id, label, opts = {}) {
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

/* ---------------------------------------------------------- openDialog */
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

/* ------------------------------------------------------------ dialog: name */
function dialogName() {
  modal({
    title: 'Name',
    sub: 'Yeh naam aapki emails aur Gothwad services mein dikhta hai.',
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

/* ------------------------------------------------------------- dialog: dob */
function dialogDob() {
  modal({
    title: 'Date of birth',
    sub: 'Aapki DOB account security ke liye use hoti hai. Yeh publically nahi dikhti.',
    body: field('dlg-dob', 'Date of birth', {
      type: 'date', value: currentUser.date_of_birth || '',
    }),
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

/* ---------------------------------------------------------- dialog: gender */
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

/* ---------------------------------------------------------- dialog: phone */
function dialogPhone() {
  modal({
    title: 'Phone number',
    sub: 'Phone number se bhi sign-in kar sakte ho (agar registered hai).',
    body: field('dlg-phone', 'Phone number', { type: 'tel', value: currentUser.phone_number || '', placeholder: '+91 98765 43210' }),
    actions:
      '<button type="button" class="btn btn-text" id="dlg-clear" style="margin-right:auto;color:var(--danger);">Remove</button>' +
      '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  el('dlg-first-name')?.focus();
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

/* ------------------------------------------------------- dialog: recovery */
function dialogRecovery() {
  modal({
    title: 'Recovery email',
    sub: 'Password reset links isi email par jaate hain. Apni regular email (Gmail waghera) use karo.',
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

/* --------------------------------------------------------- dialog: photo */
function dialogPhoto() {
  const avatarHtml = currentUser.avatar_url
    ? `<img src="${escapeHtml(currentUser.avatar_url)}" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;" />`
    : `<span class="avatar xl">${escapeHtml(initialsFor(currentUser))}</span>`;
  modal({
    title: 'Profile photo',
    sub: 'PNG, JPEG ya WebP — 2 MB tak. Photo browser mein 256×256 par resize ho jaati hai.',
    body: `
      <div class="photo-preview-wrap" id="photo-preview">${avatarHtml}</div>
      <input type="file" id="photo-file" accept="image/png,image/jpeg,image/webp" class="photo-input-hidden" />
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button type="button" class="btn btn-tonal" id="btn-pick-photo">
          <span class="msym" style="font-size:18px;">upload</span> Select photo
        </button>
        ${currentUser.avatar_url ? '<button type="button" class="btn btn-danger-text" id="btn-remove-photo">Remove photo</button>' : ''}
      </div>
      <div class="photo-drop-note">Selected photo khud save ho jaayegi.</div>`,
    actions: '<button type="button" class="btn btn-text" data-close-modal>Done</button>',
  });

  let pickedFile = null;

  el('btn-pick-photo').addEventListener('click', () => el('photo-file').click());
  el('photo-file').addEventListener('change', () => {
    const file = el('photo-file').files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      return toast('Photo is too large. Please pick one under 8 MB.', 'error');
    }
    pickedFile = file;
    // Preview turant dikhao (canvas resize ke baad upload)
    resizeAndUpload(file);
  });

  el('btn-remove-photo')?.addEventListener('click', async () => {
    const res = await api.post('/auth/update-profile', { avatar_url: '' });
    if (!res.ok) return toast(res.error || 'Could not remove photo.', 'error');
    toast('Photo removed');
    notifyUpdated(res.data.user);
    closeDialog();
  });

  /** Canvas se 256×256 JPEG banao → base64 → /auth/avatar upload. */
  async function resizeAndUpload(file) {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });

      // Square crop (center) + 256×256 resize
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
      el('photo-preview').innerHTML = `<img src="${jpegUrl}" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;" />`;

      const btn = el('btn-pick-photo');
      setBusy(btn, true, 'Uploading...');
      const res = await api.post('/auth/avatar', { image_base64: jpegUrl });
      setBusy(btn, false);
      if (!res.ok) {
        el('photo-preview').innerHTML = avatarHtml;
        return toast(res.error || 'Could not upload photo.', 'error');
      }
      toast('Profile photo updated');
      notifyUpdated(res.data.user);
      // dialog open rakho (Done se band hoga) — preview naya hai
    } catch {
      toast('Could not process that image. Try a different one.', 'error');
    }
  }
}

/* ------------------------------------------------------- dialog: password */
export function dialogPassword() {
  modal({
    title: 'Change password',
    sub: 'Strong password rakho — kam se kam 8 characters.',
    body:
      field('dlg-current-pw', 'Current password', { type: 'password', autocomplete: 'current-password', eye: true }) +
      field('dlg-new-pw', 'New password (min. 8 chars)', { type: 'password', autocomplete: 'new-password', eye: true }) +
      field('dlg-confirm-pw', 'Confirm new password', { type: 'password', autocomplete: 'new-password', eye: true }),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Update password</button>',
  });
  el('dlg-current-pw').focus();

  // Eye toggles
  document.querySelectorAll('#modal-body .input-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = el(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      const icon = btn.querySelector('.msym');
      if (icon) icon.textContent = show ? 'visibility_off' : 'visibility';
    });
  });

  el('dlg-save').addEventListener('click', async () => {
    const current = el('dlg-current-pw').value;
    const next = el('dlg-new-pw').value;
    const confirm = el('dlg-confirm-pw').value;
    if (next.length < 8) return toast('New password must be at least 8 characters.', 'error');
    if (next !== confirm) return toast('New passwords do not match.', 'error');
    const btn = el('dlg-save');
    setBusy(btn, true, 'Updating...');
    const res = await api.post('/auth/change-password', { current_password: current, new_password: next });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not change password.', 'error');
    toast('Password changed successfully');
    closeDialog();
    // Security section ka "last changed" refresh
    import('./tabs/security.js').then((m) => m.markPasswordChanged());
  });
}

/* -------------------------------------------------------- dialog: delete */
function dialogDelete() {
  const email = gothwadEmail(currentUser.username);
  modal({
    title: 'Delete your Gothwad Account',
    sub: 'Yeh action permanent hai aur undo NAHI ho sakta. Aapka username, email, profile aur saara data delete ho jayega.',
    danger: true,
    body: `
      <div class="alert alert-error" style="margin-bottom:16px;">
        <b>${escapeHtml(email)}</b> ka account permanently delete ho jayega.
      </div>
      ${field('dlg-delete-pw', 'Confirm your password', { type: 'password', autocomplete: 'current-password', eye: true })}`,
    actions: '<button type="button" class="btn btn-danger" id="dlg-confirm-delete">Delete my account</button>',
  });
  el('dlg-delete-pw').focus();

  const eye = document.querySelector('#modal-body .input-eye');
  eye?.addEventListener('click', () => {
    const input = el('dlg-delete-pw');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const icon = eye.querySelector('.msym');
    if (icon) icon.textContent = show ? 'visibility_off' : 'visibility';
  });

  el('dlg-confirm-delete').addEventListener('click', async () => {
    const pw = el('dlg-delete-pw').value;
    if (!pw) return toast('Please enter your password to confirm.', 'error');
    const btn = el('dlg-confirm-delete');
    setBusy(btn, true, 'Deleting...');

    const res = await api.post('/auth/delete-account', { password: pw });
    if (!res.ok) {
      setBusy(btn, false);
      return toast(res.error || 'Could not delete account.', 'error');
    }

    // Local data saaf karke goodbye
    try {
      clearAllAccounts();   // saved accounts list + active id
      clearTokens();        // sessionStorage tokens
    } catch { /* ignore */ }
    toast('Your Gothwad Account has been deleted.');
    setTimeout(() => {
      location.href = '/';
    }, 900);
  });
}

export { closeDialog };
