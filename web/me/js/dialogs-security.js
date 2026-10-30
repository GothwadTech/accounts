/**
 * =============================================================================
 * /me — PHOTO UPLOAD, PASSWORD CHANGE & DELETE ACCOUNT DIALOGS
 * =============================================================================
 */

import { api, clearTokens } from '../../js/api.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { toast, escapeHtml, setBusy } from '../../js/common.js';
import { gothwadEmail } from '../../js/config.js';
import { initialsFor, clearAllAccounts } from '../../js/accounts.js';
import { el, modal, field, closeDialog, notifyUpdated, getDialogUser } from './dialogs.js';

export function dialogPhoto() {
  const currentUser = getDialogUser();
  if (!currentUser) return;
  const avatarHtml = currentUser.avatar_url
    ? `<img src="${escapeHtml(currentUser.avatar_url)}" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;" />`
    : `<span class="avatar xl">${escapeHtml(initialsFor(currentUser))}</span>`;
  modal({
    title: 'Profile photo',
    sub: 'PNG, JPEG, or WebP up to 2 MB. Automatically cropped and resized to 256×256 in your browser.',
    body: `
      <div class="photo-preview-wrap" id="photo-preview">${avatarHtml}</div>
      <input type="file" id="photo-file" accept="image/png,image/jpeg,image/webp" class="photo-input-hidden" />
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button type="button" class="btn btn-tonal" id="btn-pick-photo">
          <span class="msym" style="font-size:18px;">upload</span> Select photo
        </button>
        ${currentUser.avatar_url ? '<button type="button" class="btn btn-danger-text" id="btn-remove-photo">Remove photo</button>' : ''}
      </div>
      <div class="photo-drop-note">Your selected photo saves automatically.</div>`,
    actions: '<button type="button" class="btn btn-text" data-close-modal>Done</button>',
  });

  el('btn-pick-photo').addEventListener('click', () => el('photo-file').click());
  el('photo-file').addEventListener('change', () => {
    const file = el('photo-file').files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      return toast('Photo is too large. Please pick one under 8 MB.', 'error');
    }
    resizeAndUpload(file);
  });

  el('btn-remove-photo')?.addEventListener('click', async () => {
    const res = await api.post('/auth/update-profile', { avatar_url: '' });
    if (!res.ok) return toast(res.error || 'Could not remove photo.', 'error');
    toast('Photo removed');
    notifyUpdated(res.data.user);
    closeDialog();
  });

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

      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 256, 256);
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
      el('photo-preview').innerHTML = `<img src="${jpegUrl}" alt="" style="width:96px;height:96px;border-fit:cover;border-radius:50%;object-fit:cover;" />`;

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
    } catch {
      toast('Could not process that image. Try a different one.', 'error');
    }
  }
}

export function dialogPassword() {
  modal({
    title: 'Change password',
    sub: 'Choose a strong password with at least 8 characters. Other devices will be signed out.',
    body:
      field('dlg-current-pw', 'Current password', { type: 'password', autocomplete: 'current-password', eye: true }) +
      field('dlg-new-pw', 'New password (min. 8 chars)', { type: 'password', autocomplete: 'new-password', eye: true }) +
      field('dlg-confirm-pw', 'Confirm new password', { type: 'password', autocomplete: 'new-password', eye: true }) +
      mfaActionField(getDialogUser(), 'dlg-password-mfa'),
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Update password</button>',
  });
  el('dlg-current-pw').focus();

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
    const res = await api.post('/auth/change-password', { current_password: current, new_password: next, mfa_code: mfaActionCode('dlg-password-mfa') });
    setBusy(btn, false);
    if (!res.ok) return toast(res.error || 'Could not change password.', 'error');
    toast('Password changed. Other devices were signed out.');
    closeDialog();
    import('./tabs/security.js').then((m) => m.markPasswordChanged());
  });
}

export function dialogDelete() {
  const currentUser = getDialogUser();
  if (!currentUser) return;
  const email = gothwadEmail(currentUser.username);
  modal({
    title: 'Delete your Gothwad Account',
    sub: 'This action is permanent and cannot be undone. Your username, email address, profile, and all account data will be permanently deleted.',
    danger: true,
    body: `
      <div class="alert alert-error" style="margin-bottom:16px;">
        <b>${escapeHtml(email)}</b> will be permanently deleted.
      </div>
      ${field('dlg-delete-pw', 'Confirm your password', { type: 'password', autocomplete: 'current-password', eye: true })}
      ${mfaActionField(currentUser, 'dlg-delete-mfa')}`,
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

    const res = await api.post('/auth/delete-account', { password: pw, mfa_code: mfaActionCode('dlg-delete-mfa') });
    if (!res.ok) {
      setBusy(btn, false);
      return toast(res.error || 'Could not delete account.', 'error');
    }

    try {
      clearAllAccounts();
      clearTokens();
    } catch { /* ignore */ }
    toast('Your Gothwad Account has been deleted.');
    setTimeout(() => {
      location.href = '/';
    }, 900);
  });
}
