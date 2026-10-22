/**
 * `/me` — Activity row renderer shared by Security, Data & privacy, and Home tabs.
 * Activity event types correspond to Worker `logActivity()` (`sql/02_account_activity.sql`).
 */

import { escapeHtml, formatDate } from '../../../js/common.js';

const ACTIVITY_META = {
  signup: { icon: 'person_add', label: 'Account created' },
  signin: { icon: 'login', label: 'Signed in' },
  signout: { icon: 'logout', label: 'Signed out' },
  password_change: { icon: 'password', label: 'Password changed' },
  password_reset: { icon: 'lock_reset', label: 'Password reset' },
  profile_update: { icon: 'edit', label: 'Personal info updated' },
  avatar_update: { icon: 'photo_camera', label: 'Profile photo changed' },
  session_revoked: { icon: 'devices', label: 'Device signed out' },
  app_authorized: { icon: 'apps', label: 'App connected' },
  app_revoked: { icon: 'link_off', label: 'App disconnected' },
};

/** Renders a single activity entry row. */
export function activityRow(a) {
  const meta = ACTIVITY_META[a.type] || { icon: 'history', label: 'Account activity' };
  const title = a.title || meta.label;
  return `
    <div class="activity-item">
      <span class="activity-icon"><span class="msym" style="font-size:18px;">${meta.icon}</span></span>
      <div>
        <div class="activity-title">${escapeHtml(title)}</div>
        ${a.detail ? `<div class="activity-detail">${escapeHtml(a.detail)}</div>` : ''}
        <div class="activity-time">${a.created_at ? escapeHtml(formatDate(a.created_at)) : ''}</div>
      </div>
    </div>`;
}

/** Populates a target activity list container with formatted rows. */
export function renderActivity(boxId, rows) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML =
    !rows || rows.length === 0
      ? '<div class="text-muted text-sm">No recent activity yet.</div>'
      : rows.map(activityRow).join('');
}
