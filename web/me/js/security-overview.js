/** Load only available backend metadata; distinguish unsupported, off and failed requests. */
import { api } from '../../js/api.js';
import { escapeHtml } from '../../js/common.js';
import { beginView } from './view-context.js';
import { factorState } from './display-data.js';
import { passkeysSupported } from '../../js/passkeys.js';
import { openMfaSettings } from './mfa-settings.js';
export async function loadSecurityOverview(user) {
  const current = beginView('security-overview');
  const [mfa, keys, google, provider] = await Promise.all([api.get('/auth/mfa/status'), api.get('/auth/passkeys/list'), api.get('/auth/google/links'), api.get('/auth/google/status')]);
  if (!current()) return;
  const state = factorState(mfa);
  const status = document.getElementById('sec-mfa-status'), badge = document.getElementById('sec-mfa-badge');
  if (status) status.textContent = state.detail;
  if (badge) badge.textContent = state.label;
  const keyText = keys.ok && Array.isArray(keys.data?.passkeys) ? `${keys.data.passkeys.length} registered${passkeysSupported() ? '' : ' · This browser cannot add passkeys'}` : 'Count unavailable · Open to retry';
  const googleOwned = google.ok && google.data?.user_id === user?.id;
  const googleText = googleOwned && Array.isArray(google.data?.links) ? `${google.data.links.length} of ${google.data.limit} connected${provider.ok && provider.data?.enabled === false ? ' · Linking unavailable on this site' : !provider.ok ? ' · Provider availability unknown' : ''}` : 'Count unavailable · Open to retry';
  const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
  set('sec-passkey-count', keyText); set('sec-google-count', googleText);
  const box = document.getElementById('security-readiness');
  if (!box) return;
  const recovery = user?.recovery_email_verified === true ? 'Current recovery address verified' : user?.recovery_email ? 'Current recovery address verification not confirmed' : 'No recovery email added';
  box.innerHTML = `<p>${escapeHtml(recovery)}. Review the methods you can actually access; registered methods alone do not prove recovery readiness.</p>
    <p>${mfa.ok && mfa.data?.enabled ? escapeHtml(state.detail) + '. Keep a saved copy offline.' : 'Offline authenticator recovery codes are available after enabling 2-Step Verification.'}</p>
    <button type="button" class="btn btn-text" id="btn-review-backup">Review authenticator and recovery codes</button>
    ${!mfa.ok || !keys.ok || !googleOwned || !provider.ok ? '<p role="alert">Some security information could not be loaded.</p><button type="button" class="btn btn-tonal" id="btn-retry-security">Retry security summary</button>' : ''}`;
  document.getElementById('btn-review-backup').addEventListener('click', openMfaSettings);
  document.getElementById('btn-retry-security')?.addEventListener('click', () => loadSecurityOverview(user));
}
