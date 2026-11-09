/** Security priorities and truthful metadata; network work starts when this section is visible. */
import { renderDataFailure } from '../data-failure.js';
import { getActivity, getAuthorizations } from '../store.js';
import { beginView } from '../view-context.js';
import { renderActivity, SECURITY_TYPES } from './activity.js';
import { setDialogUser, dialogPassword } from '../dialogs.js';
import { openPasskeySettings } from '../passkey-settings.js';
import { openMfaSettings } from '../mfa-settings.js';
import { initSessionActions } from './sessions.js';
import { loadSecurityOverview } from '../security-overview.js';
import { fullDate } from '../display-data.js';
import { gothwadEmail } from '../../../js/config.js';
import { toast } from '../../../js/common.js';
export { loadSessions } from './sessions.js';
let user = null, onUserUpdated = () => {}, bound = false;
export function syncSecurityUser(nextUser) {
  user = nextUser;
  setDialogUser(user, updated => { user = updated; onUserUpdated(updated); refreshRows(); }, 'security');
  refreshRows();
}
export function initSecurity(currentUser, cb) {
  if (cb) onUserUpdated = cb;
  if (!bound) {
    bound = true;
    document.querySelectorAll('#section-security [data-dialog="password"]').forEach(row => row.addEventListener('click', dialogPassword));
    document.querySelectorAll('#section-security [data-dialog="recovery"]').forEach(row => row.addEventListener('click', () => import('../dialogs.js').then(m => m.openDialog('recovery'))));
    document.getElementById('btn-google-settings')?.addEventListener('click', () => import('../google-settings.js').then(m => m.openGoogleSettings()));
    document.getElementById('btn-passkey-settings')?.addEventListener('click', openPasskeySettings);
    document.getElementById('btn-mfa-settings')?.addEventListener('click', openMfaSettings);
    initSessionActions();
  }
  syncSecurityUser(currentUser);
  const params = new URLSearchParams(location.search);
  if (params.get('google') === 'linked') {
    toast(params.get('notification') === 'failed' ? 'Google account connected, but the email alert could not be delivered.' : 'Google account connected.');
    const clean = new URL(location.href); clean.searchParams.delete('google'); clean.searchParams.delete('notification');
    history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
  }
}
export function refreshRows() {
  if (!user) return;
  const password = document.querySelector('#section-security [data-dialog="password"]');
  const label = password?.querySelector('.setting-label'), value = password?.querySelector('.setting-value');
  if (label) label.textContent = user.has_password === false ? 'Add password' : 'Change password';
  if (value && user.has_password === false) value.textContent = 'No password added. Use your registered Google account or passkey.';
  else if (value && !value.querySelector('#sec-pw-last')) value.innerHTML = 'Last recorded change: <span id="sec-pw-last"></span>';
  const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
  set('security-account-context', `Settings for ${gothwadEmail(user.username)}. Changes affect this account, not other signed-in accounts.`);
  set('sec-pw-last', fullDate(user.password_changed_at));
  set('sec-recovery', user.recovery_email || 'Not set');
  set('sec-recovery-status', !user.recovery_email ? '' : user.recovery_email_verified === true ? 'Verified' : user.recovery_email_verified === false ? 'Not verified' : 'Verification status unavailable');
  set('sec-mfa-status', user.two_factor_enabled === true ? 'Authenticator enabled · Checking recovery codes…' : 'Checking authenticator availability…');
  set('sec-mfa-badge', user.two_factor_enabled === true ? 'On' : 'Checking');
}
export function loadMethodSummary() { return loadSecurityOverview(user); }
export function markPasswordChanged() { refreshRows(); }
export async function loadActivity() {
  const current = beginView('security-activity');
  try { const rows = await getActivity(); if (current()) renderActivity('sec-activity', rows.filter(row => SECURITY_TYPES.includes(row.type))); }
  catch { if (current()) renderDataFailure('sec-activity', loadActivity); }
}
export async function loadAppsSummary() {
  const current = beginView('security-apps-summary');
  try {
    const data = await getAuthorizations(); if (!current()) return;
    const box = document.getElementById('sec-apps-summary');
    const count = (data.connected || []).filter(row => !row.core).length;
    if (box) box.textContent = `${count} optional app grant${count === 1 ? '' : 's'}. Review permissions and disconnect effects in Connected apps.`;
  } catch { if (current()) renderDataFailure('sec-apps-summary', loadAppsSummary); }
}
