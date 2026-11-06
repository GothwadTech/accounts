/** Local framing before an explicit upload. Originals never leave the browser. */
import { captureView } from './view-context.js';
import { changedAccountData } from './dialog-form.js';
import { api } from '../../js/api.js';
import { toast, escapeHtml, setBusy } from '../../js/common.js';
import { initialsFor } from '../../js/accounts.js';
import { el, modal, closeDialog, notifyUpdated, getDialogUser } from './dialogs.js';

import { cropRectangle } from './photo-crop.js';

export function dialogPhoto() {
  const owner = getDialogUser(), valid = captureView();
  if (!owner) return;
  const avatar = owner.avatar_url ? `<img src="${escapeHtml(owner.avatar_url)}" alt="Current profile photo" style="width:96px;height:96px;border-radius:50%;object-fit:cover;" />` : `<span class="avatar xl">${escapeHtml(initialsFor(owner))}</span>`;
  modal({
    title: 'Profile photo',
    sub: 'Choose PNG, JPEG or WebP up to 8 MB. Adjust the framing, then save.',
    body: `<div class="photo-preview-wrap" id="photo-current">${avatar}</div>
      <canvas id="photo-canvas" class="photo-crop-canvas hidden" width="256" height="256" role="img" aria-label="Preview of the circular profile photo"></canvas>
      <input type="file" id="photo-file" accept="image/png,image/jpeg,image/webp" class="photo-input-hidden" />
      <div class="flex gap-12"><button type="button" class="btn btn-tonal" id="btn-pick-photo">Select photo</button>
      ${owner.avatar_url ? '<button type="button" class="btn btn-danger-text" id="btn-remove-photo">Remove photo</button>' : ''}</div>
      <div class="photo-crop-controls hidden" id="photo-controls">
        <label for="photo-zoom">Zoom <output id="photo-zoom-value">100%</output></label><input id="photo-zoom" type="range" min="1" max="3" step="0.05" value="1" />
        <label for="photo-horizontal">Horizontal position</label><input id="photo-horizontal" type="range" min="-100" max="100" value="0" />
        <label for="photo-vertical">Vertical position</label><input id="photo-vertical" type="range" min="-100" max="100" value="0" />
      </div><p class="photo-editor-note">Processed in your browser into a 256 × 256 JPEG under 2 MB. Only the framed image is uploaded when you choose Save photo.</p>
      <p id="photo-stage" role="status">Select a photo to prepare a local preview.</p><p class="photo-editor-error hidden" id="photo-error" role="alert"></p>`,
    actions: '<button type="button" class="btn btn-primary" id="btn-save-photo" disabled>Save photo</button>',
  });
  el('btn-pick-photo').focus();
  const generation = el('dialog-root').dataset.dialogGeneration;
  const alive = () => valid() && el('dialog-root')?.dataset.dialogGeneration === generation && getDialogUser()?.id === owner.id && !!el('photo-file');
  let image = null, selection = 0, busy = false;
  function error(message) { el('photo-file').setAttribute('aria-describedby', 'photo-error'); el('photo-file').setAttribute('aria-invalid', String(!!message)); el('photo-error').textContent = message; el('photo-error').classList.toggle('hidden', !message); }
  function draw() {
    if (!image || !alive()) return;
    const { x, y, side } = cropRectangle(image.naturalWidth, image.naturalHeight, Number(el('photo-zoom').value), Number(el('photo-horizontal').value), Number(el('photo-vertical').value));
    const ctx = el('photo-canvas').getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(image, x, y, side, side, 0, 0, 256, 256);
    el('photo-zoom-value').textContent = `${Math.round(Number(el('photo-zoom').value) * 100)}%`;
  }
  function pending(value) {
    busy = value;
    el('dialog-root').setAttribute('aria-busy', String(value));
    el('photo-stage').textContent = value ? 'Uploading the framed image. Wait for confirmation…' : 'Save was not confirmed. You can try again.';
    for (const id of ['btn-pick-photo', 'btn-remove-photo', 'photo-file', 'photo-zoom', 'photo-horizontal', 'photo-vertical']) if (el(id)) el(id).disabled = value;
    setBusy(el('btn-save-photo'), value, 'Saving...');
  }
  el('btn-pick-photo').addEventListener('click', () => el('photo-file').click());
  el('photo-file').addEventListener('change', async () => {
    const file = el('photo-file').files?.[0];
    if (!file || busy) return;
    const selected = ++selection;
    el('btn-save-photo').disabled = true;
    image = null;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return error('Choose a PNG, JPEG or WebP image.');
    if (file.size > 8 * 1024 * 1024) return error('Choose an image no larger than 8 MB.');
    el('photo-stage').textContent = 'Reading and preparing the image locally. Nothing has been uploaded…';
    const url = URL.createObjectURL(file);
    try {
      const candidate = new Image(); candidate.src = url; await candidate.decode();
      if (!alive() || selected !== selection) return;
      if (!candidate.naturalWidth || !candidate.naturalHeight) throw new Error('Empty image');
      image = candidate;
      for (const id of ['photo-zoom', 'photo-horizontal', 'photo-vertical']) el(id).value = id === 'photo-zoom' ? '1' : '0';
      el('photo-current').classList.add('hidden'); el('photo-canvas').classList.remove('hidden'); el('photo-controls').classList.remove('hidden');
      draw(); error(''); el('btn-save-photo').disabled = false; el('photo-stage').textContent = 'Preview ready. Adjust the framing, then Save photo to upload.';
    } catch { if (alive() && selected === selection) error('Could not process that image. Choose a different file.'); }
    finally { URL.revokeObjectURL(url); }
  });
  for (const id of ['photo-zoom', 'photo-horizontal', 'photo-vertical']) el(id).addEventListener('input', draw);
  el('btn-save-photo').addEventListener('click', async () => {
    if (!image || busy || !alive()) return;
    const jpeg = el('photo-canvas').toDataURL('image/jpeg', 0.88);
    if (!jpeg.startsWith('data:image/jpeg;base64,') || jpeg.length * 0.75 > 2 * 1024 * 1024) return error('Could not prepare a photo under 2 MB. Choose another image.');
    pending(true); error('');
    try {
      const res = await api.post('/auth/avatar', { image_base64: jpeg });
      if (!alive()) return;
      if (!res.ok) return error(res.error || 'Could not save photo. Try again.');
      notifyUpdated(res.data.user); changedAccountData(); closeDialog(); toast('Profile photo updated');
    } catch { if (alive()) error('Could not save photo. Try again.'); }
    finally { if (alive()) pending(false); }
  });
  el('btn-remove-photo')?.addEventListener('click', async () => {
    if (busy || !alive()) return;
    pending(true);
    try {
      const res = await api.post('/auth/update-profile', { avatar_url: '' });
      if (!alive()) return;
      if (!res.ok) return error(res.error || 'Could not remove photo.');
      notifyUpdated(res.data.user); changedAccountData(); closeDialog(); toast('Photo removed');
    } catch { if (alive()) error('Could not remove photo. Try again.'); }
    finally { if (alive()) { pending(false); el('btn-save-photo').disabled = !image; } }
  });
}
