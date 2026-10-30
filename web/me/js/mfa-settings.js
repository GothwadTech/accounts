/** Authenticator setup and code management. Secrets remain in the current modal only. */
import { api } from '../../js/api.js';
import { parsePageAuthuser } from '../../js/authuser.js';
import { escapeHtml, setBusy } from '../../js/common.js';
import { modal, field, el, getDialogUser, notifyUpdated, closeDialog } from './dialogs.js';

export async function openMfaSettings() {
  const owner = getDialogUser();
  const selector = parsePageAuthuser();
  if (!owner) return;
  let generation;
  const render = (options) => { const root = modal(options); generation = root.dataset.dialogGeneration; };
  const current = () => getDialogUser()?.id === owner.id && parsePageAuthuser() === selector &&
    el('dialog-root')?.dataset.dialogGeneration === generation;
  render({ title: 'Authenticator verification', body: '<p>Loading security settings…</p>' });
  const response = await api.get('/auth/mfa/status');
  if (!current()) return;
  if (!response.ok) {
    render({ title: 'Authenticator verification', body: `<p role="alert">${escapeHtml(response.error || 'Could not load security settings.')}</p>` });
    return;
  }
  const status = response.data;
  if (!status.enabled && !status.enrollment_available) {
    render({ title: 'Authenticator verification', body: '<p>Authenticator setup is unavailable until server encryption is configured. Your existing sign-in settings have not changed.</p>' });
    return;
  }
  const error = '<p id="mfa-error" role="alert"></p>';
  const password = field('mfa-password', 'Current password', { type: 'password', autocomplete: 'current-password' });
  const codeField = field('mfa-code', 'Authenticator or unused recovery code', { autocomplete: 'one-time-code' });
  render({ title: 'Authenticator verification',
    sub: status.enabled ? `Enabled. ${status.recovery_codes_remaining} unused recovery codes remain.`
      : 'Add the setup key to an authenticator app. No SMS or email delivery is required.',
    body: password + (status.enabled ? codeField : '') + error,
    actions: status.enabled
      ? '<button type="button" class="btn btn-tonal" id="mfa-regenerate">Replace recovery codes</button><button type="button" class="btn btn-primary" id="mfa-disable">Disable authenticator</button>'
      : '<button type="button" class="btn btn-primary" id="mfa-start">Start setup</button>',
  });
  function fail(message) { if (current() && el('mfa-error')) el('mfa-error').textContent = message; }
  function showCodes(data) {
    if (!current()) return;
    notifyUpdated(data.user);
    render({ title: 'Save your recovery codes',
      sub: 'Shown once. Keep these offline in a safe place. Each code works once. Never send them in chat.',
      body: '<pre id="mfa-recovery-list" tabindex="0" style="white-space:pre-wrap;overflow-wrap:anywhere;"></pre>',
      actions: '<button type="button" class="btn btn-tonal" id="mfa-download">Download codes</button><button type="button" class="btn btn-primary" id="mfa-done">Done</button>',
    });
    el('mfa-recovery-list').textContent = data.recovery_codes.join('\n');
    el('mfa-download').addEventListener('click', () => {
      if (!current()) return;
      const url = URL.createObjectURL(new Blob(['Gothwad Accounts recovery codes\nKeep offline. Each code works once.\n\n' + data.recovery_codes.join('\n')], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'gothwad-recovery-codes.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    el('mfa-done').addEventListener('click', closeDialog);
  }
  if (status.enabled) {
    for (const [id, route] of [['mfa-regenerate', 'recovery-codes'], ['mfa-disable', 'disable']]) {
      el(id).addEventListener('click', async () => {
        if (!current()) return;
        const button = el(id);
        setBusy(button, true, 'Verifying...');
        const result = await api.post(`/auth/mfa/${route}`, { current_password: el('mfa-password').value, code: el('mfa-code').value.trim() });
        if (!current()) return;
        setBusy(button, false);
        if (!result.ok) return fail(result.error || 'Verification failed.');
        if (result.data.recovery_codes) showCodes(result.data);
        else { notifyUpdated(result.data.user); closeDialog(); }
      });
    }
    return;
  }
  el('mfa-start').addEventListener('click', async () => {
    if (!current()) return;
    const currentPassword = el('mfa-password').value;
    const button = el('mfa-start');
    setBusy(button, true, 'Preparing...');
    const result = await api.post('/auth/mfa/enroll', { current_password: currentPassword });
    if (!current()) return;
    setBusy(button, false);
    if (!result.ok) return fail(result.error || 'Could not start setup.');
    const enrollment = result.data;
    render({ title: 'Connect your authenticator',
      sub: 'In your authenticator app, add a setup key using time-based codes. Keep this key private. Setup expires in 15 minutes.',
      body: '<label for="mfa-secret">Setup key</label><input class="input" id="mfa-secret" readonly autocomplete="off" />' +
        field('mfa-code', 'Six-digit authenticator code', { autocomplete: 'one-time-code' }) + error,
      actions: '<button type="button" class="btn btn-primary" id="mfa-confirm">Verify and enable</button>',
    });
    el('mfa-secret').value = enrollment.secret;
    el('mfa-confirm').addEventListener('click', async () => {
      if (!current()) return;
      const confirm = el('mfa-confirm');
      setBusy(confirm, true, 'Verifying...');
      const verified = await api.post('/auth/mfa/confirm', { current_password: currentPassword,
        enrollment_id: enrollment.enrollment_id, code: el('mfa-code').value.trim() });
      if (!current()) return;
      setBusy(confirm, false);
      if (!verified.ok) return fail(verified.error || 'Verification failed.');
      showCodes(verified.data);
    });
  });
}
