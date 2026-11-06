/** Optional authenticator setup: local QR/manual key, guarded actions and offline-code acknowledgement. */
import { credentialField, securityPost } from './security-credential.js';
import { api } from '../../js/api.js';
import { escapeHtml, toast } from '../../js/common.js';
import { modal, field, el, getDialogUser, notifyUpdated, closeDialog, dialogError } from './dialogs.js';
import { stageConfirmation, markDialogDirty } from './modal-shell.js';
import { captureView } from './view-context.js';
import { changedAccountData } from './dialog-form.js';
export async function openMfaSettings() {
  const owner = getDialogUser(), valid = captureView(); if (!owner) return;
  let generation, busy = false;
  const render = options => { generation = modal(options).dataset.dialogGeneration; };
  const current = () => valid() && getDialogUser()?.id === owner.id && el('dialog-root')?.dataset.dialogGeneration === generation;
  const post = (path, body) => securityPost(path, body, owner);
  async function act(action) {
    if (busy || !current()) return;
    busy = true; dialogError('');
    const root = el('dialog-root'), controls = [...root.querySelectorAll('button,input')].map(node => [node, node.disabled]);
    root.setAttribute('aria-busy', 'true'); controls.forEach(([node]) => { node.disabled = true; });
    try { await action(); } catch { if (current()) dialogError('Could not complete the request. Your changes are not confirmed. Try again.'); }
    finally { busy = false; if (current()) { root.removeAttribute('aria-busy'); controls.forEach(([node, disabled]) => { node.disabled = disabled; }); } }
  }
  render({ title: 'Authenticator verification', body: '<p role="status">Loading security settings…</p>' });
  const response = await api.get('/auth/mfa/status'); if (!current()) return;
  if (!response.ok || typeof response.data?.enabled !== 'boolean') {
    render({ title: 'Authenticator verification', body: '<p role="alert">Could not load authenticator status. No settings changed.</p><button type="button" class="btn btn-tonal" id="mfa-retry">Retry</button>' });
    el('mfa-retry').addEventListener('click', openMfaSettings); return;
  }
  const status = response.data;
  if (!status.enabled && !status.enrollment_available) {
    render({ title: 'Authenticator verification', body: '<p>Setup is unavailable on this site right now. Existing sign-in methods are unchanged. Use another registered method or try again later.</p>' }); return;
  }
  render({ title: 'Authenticator verification', sub: status.enabled ? `On. ${status.recovery_codes_remaining} unused recovery codes remain.` : 'Off. Optional time-based authenticator codes work without SMS or email delivery.',
    body: credentialField(owner, 'mfa-password') + (status.enabled ? field('mfa-code', 'Authenticator or unused recovery code', { autocomplete: 'one-time-code', maxlength: 128 }) : ''),
    actions: status.enabled ? '<button type="button" class="btn btn-tonal" id="mfa-regenerate">Replace recovery codes</button><button type="button" class="btn btn-danger-text" id="mfa-disable">Disable authenticator</button>' : '<button type="button" class="btn btn-primary" id="mfa-start">Start setup</button>' });
  function showCodes(data) {
    if (!current()) return;
    notifyUpdated(data.user); changedAccountData();
    render({ title: 'Save your recovery codes', sub: 'Shown once. Keep these private and offline. Each code can be used once. Do not send them in chat.',
      body: '<pre id="mfa-recovery-list" tabindex="0"></pre><label class="confirmation-check"><input type="checkbox" id="mfa-codes-saved" /> I have saved these codes somewhere safe.</label>',
      actions: '<button type="button" class="btn btn-tonal" id="mfa-download">Download codes</button><button type="button" class="btn btn-primary" id="mfa-done" disabled>Done</button>' });
    el('mfa-recovery-list').textContent = data.recovery_codes.join('\n'); markDialogDirty();
    el('mfa-codes-saved').addEventListener('change', () => { el('mfa-done').disabled = !el('mfa-codes-saved').checked; });
    el('mfa-download').addEventListener('click', () => {
      if (!current()) return;
      const url = URL.createObjectURL(new Blob(['Gothwad Accounts recovery codes\nKeep offline. Each code works once.\n\n' + data.recovery_codes.join('\n')], { type: 'text/plain' }));
      const link = document.createElement('a'); link.href = url; link.download = 'gothwad-recovery-codes.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    el('mfa-done').addEventListener('click', () => { if (el('mfa-codes-saved').checked) { closeDialog(); toast('Authenticator recovery codes acknowledged. Keep the saved copy private.'); } });
  }
  if (status.enabled) {
    for (const [id, route, warning] of [['mfa-regenerate', 'recovery-codes', 'Replace recovery codes? All old unused codes will stop working. Save the new set offline.'], ['mfa-disable', 'disable', 'Disable authenticator verification? Its recovery codes will stop working. Keep another usable sign-in method.']]) {
      el(id).addEventListener('click', () => stageConfirmation(warning, () => act(async () => {
        const result = await post(`/auth/mfa/${route}`, { current_password: el('mfa-password').value, code: el('mfa-code').value.trim() }); if (!current()) return;
        if (!result.ok) return dialogError(result.error || 'Verification failed.', ['mfa-code']);
        if (result.data.recovery_codes) showCodes(result.data);
        else { notifyUpdated(result.data.user); changedAccountData(); closeDialog(); toast('Authenticator verification disabled.'); }
      })));
    }
    return;
  }
  el('mfa-start').addEventListener('click', () => act(async () => {
    const currentPassword = el('mfa-password').value;
    const result = await post('/auth/mfa/enroll', { current_password: currentPassword }); if (!current()) return;
    if (!result.ok) return dialogError(result.error || 'Could not start setup.', ['mfa-password']);
    const enrollment = result.data;
    render({ title: 'Connect your authenticator', sub: 'Scan the code or enter the manual key in an authenticator app. Use time-based, six-digit codes. Setup expires in 15 minutes.',
      body: '<div id="mfa-qr" class="mfa-qr" role="img" aria-label="Private authenticator setup QR code"></div><p class="text-sm">This QR code is generated locally. No QR service receives the setup key.</p><label for="mfa-secret">Manual setup key</label><input class="input" id="mfa-secret" readonly autocomplete="off" /><p class="text-sm">Keep this key private. Closing this screen does not enable verification; unconfirmed setup expires.</p>' + field('mfa-code', 'Six-digit authenticator code', { autocomplete: 'one-time-code', maxlength: 6 }),
      actions: '<button type="button" class="btn btn-primary" id="mfa-confirm">Verify and enable</button>' });
    el('mfa-secret').value = enrollment.secret;
    try {
      const { qrcode } = await import('../../vendor/qrcode.js'); if (!current()) return;
      const qr = qrcode(0, 'M'); qr.addData(enrollment.otpauth_uri); qr.make();
      el('mfa-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
      el('mfa-qr').querySelector('svg').setAttribute('aria-hidden', 'true');
    } catch { if (current()) el('mfa-qr').textContent = 'QR unavailable. Use the manual setup key below.'; }
    if (!current()) return;
    el('mfa-confirm').addEventListener('click', () => act(async () => {
      const code = el('mfa-code').value.trim(); if (!/^\d{6}$/.test(code)) return dialogError('Enter the six-digit code from your authenticator.', ['mfa-code']);
      const verified = await post('/auth/mfa/confirm', { current_password: currentPassword, enrollment_id: enrollment.enrollment_id, code }); if (!current()) return;
      if (!verified.ok) return dialogError(verified.error || 'Verification failed.', ['mfa-code']);
      showCodes(verified.data);
    }));
  }));
}
