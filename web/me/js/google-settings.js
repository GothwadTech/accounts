/** Explicit linking never merges an existing account by matching its email. */
import { modal, field, el, getDialogUser } from './dialogs.js';
import { mfaActionField, mfaActionCode } from '../../js/mfa-ui.js';
import { startGoogle } from '../../js/google-auth.js';
import { toast, setBusy } from '../../js/common.js';

export function openGoogleSettings() {
  const owner = getDialogUser();
  if (!owner) return;
  if (owner.google_linked) {
    modal({ title: 'Google sign-in', body: '<p>Google is connected to this Gothwad Account. Your Gothwad username, identity and data stay the same. Local authenticator verification still applies when enabled.</p>' });
    return;
  }
  modal({ title: 'Connect Google', sub: 'Confirm your password, then select your Google account. Matching email addresses never merge accounts.',
    body: field('google-link-password', 'Current password', { type: 'password', autocomplete: 'current-password' }) + mfaActionField(owner, 'google-link-mfa'),
    actions: '<button type="button" class="btn btn-primary" id="google-link">Continue with Google</button>',
  });
  el('google-link').addEventListener('click', async () => {
    const button = el('google-link');
    setBusy(button, true, 'Verifying...');
    const result = await startGoogle({ purpose: 'link', expected_user_id: owner.id, current_password: el('google-link-password').value,
      mfa_code: mfaActionCode('google-link-mfa') });
    if (!result.ok) { setBusy(button, false); toast(result.error || 'Could not connect Google.', 'error'); }
  });
}
