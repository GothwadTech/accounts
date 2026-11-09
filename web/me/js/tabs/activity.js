/** Shared retained-history presentation, with local dates, filters and honest client-side paging. */
import { escapeHtml } from '../../../js/common.js';
import { fullDate, localDay } from '../display-data.js';
export const SECURITY_TYPES = ['signin', 'signout', 'signup', 'password_change', 'password_reset', 'session_revoked', 'google_method_added', 'google_method_removed', 'mfa_enabled', 'mfa_disabled', 'mfa_codes_regenerated', 'recovery_email_verified', 'passkey_added', 'passkey_removed'];
const META = {
  signup: ['person_add', 'Account created'], signin: ['login', 'Signed in'], signout: ['logout', 'Signed out'],
  password_change: ['password', 'Password changed'], password_reset: ['lock_reset', 'Password reset'],
  profile_update: ['edit', 'Profile updated'], avatar_update: ['photo_camera', 'Photo updated'],
  session_revoked: ['devices', 'Session signed out'], app_authorized: ['apps', 'App connected'], app_revoked: ['link_off', 'App disconnected'],
  google_method_added: ['account_circle', 'Google method added'], google_method_removed: ['link_off', 'Google method removed'],
  mfa_enabled: ['shield_lock', 'Authenticator enabled'], mfa_disabled: ['shield_lock', 'Authenticator disabled'],
  mfa_codes_regenerated: ['key', 'Recovery codes replaced'], recovery_email_verified: ['mark_email_read', 'Recovery email verified'],
  passkey_added: ['key', 'Passkey added'], passkey_removed: ['key', 'Passkey removed'],
};
export function activityCategory(type) {
  return ['signin', 'signout', 'session_revoked'].includes(type) ? 'sessions' : ['app_authorized', 'app_revoked'].includes(type) ? 'apps' : ['profile_update', 'avatar_update'].includes(type) ? 'profile' : 'security';
}
export function activityRow(row) {
  const [icon, label] = META[row.type] || ['history', 'Account activity'];
  return `<div class="activity-item"><span class="activity-icon"><span class="msym">${icon}</span></span><div>
    <div class="activity-title">${escapeHtml(row.title || label)}</div>${row.detail ? `<div class="activity-detail">${escapeHtml(row.detail)}</div>` : ''}
    <time class="activity-time" ${row.created_at && !Number.isNaN(Date.parse(row.created_at)) ? `datetime="${escapeHtml(row.created_at)}"` : ''}>${escapeHtml(fullDate(row.created_at))}</time></div></div>`;
}
export function renderActivity(boxId, rows) {
  const box = document.getElementById(boxId); if (!box) return;
  rows = [...(rows || [])].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const category = box.dataset.activityFilter || 'all';
  box.innerHTML = `<div class="activity-controls"><label for="${boxId}-filter">Filter activity</label><select class="input" id="${boxId}-filter"><option value="all">All returned events</option><option value="sessions">Sign-ins and sessions</option><option value="security">Security methods</option><option value="profile">Profile updates</option><option value="apps">Connected apps</option></select><button type="button" class="btn btn-text" id="${boxId}-refresh">Refresh</button></div>
    <p class="text-sm text-muted">Dates use your browser timezone. Up to 30 recent retained events are returned; this is not a complete lifetime history.</p>
    <p class="text-sm" id="${boxId}-count" role="status"></p><div id="${boxId}-rows"></div><button type="button" class="btn btn-tonal" id="${boxId}-more">Show more retained events</button>`;
  const filter = document.getElementById(boxId + '-filter'), more = document.getElementById(boxId + '-more');
  filter.value = category; let limit = 10;
  function paint() {
    const filtered = rows.filter(row => filter.value === 'all' || activityCategory(row.type) === filter.value);
    const page = filtered.slice(0, limit);
    let previous = '';
    document.getElementById(boxId + '-rows').innerHTML = page.length ? page.map(row => {
      const day = localDay(row.created_at), heading = day !== previous ? `<h2 class="activity-day">${escapeHtml(day)}</h2>` : '';
      previous = day; return heading + activityRow(row);
    }).join('') : `<p class="text-muted">${rows.length ? 'No retained events match this filter.' : 'No recent activity yet.'}</p>`;
    document.getElementById(boxId + '-count').textContent = `Showing ${page.length} of ${filtered.length} matching retained events.`;
    more.hidden = limit >= filtered.length;
  }
  filter.addEventListener('change', () => { box.dataset.activityFilter = filter.value; limit = 10; paint(); });
  more.addEventListener('click', () => { limit += 10; paint(); if (more.hidden) filter.focus(); });
  document.getElementById(boxId + '-refresh').addEventListener('click', () => window.dispatchEvent(new Event('account-data-refresh')));
  paint();
}
