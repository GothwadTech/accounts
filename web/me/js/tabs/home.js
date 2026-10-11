/**
 * /me — HOME section (welcome, security checkup, quick links, storage, activity).
 */

import { formatBytes, formatDate, escapeHtml } from '../../../js/common.js';
import { getActivity } from '../store.js';
import { gothwadEmail } from '../../../js/config.js';
import { renderAvatar } from '../avatar.js';
import { activityRow } from './activity.js';

/** User data ko saari jagah render karo (avatars, naam, email). */
export function renderUserEverywhere(user) {
  if (!user) return;

  // Home hero
  renderAvatar(document.getElementById('home-avatar'), user);
  document.getElementById('home-name').textContent =
    `Welcome, ${user.first_name || user.username}`;
  document.getElementById('home-email').textContent = gothwadEmail(user.username);

  // Stats
  document.getElementById('home-stat-email').textContent = gothwadEmail(user.username);
  document.getElementById('home-stat-username').textContent = `@${user.username}`;
  document.getElementById('home-stat-created').textContent = user.created_at
    ? formatDate(user.created_at)
    : '—';

  // Storage (home + data & privacy dono)
  const used = Number(user.storage_used_bytes || 0);
  const limit = Number(user.storage_limit_bytes || 1);
  const pct = Math.max(1, Math.min(100, Math.round((used / limit) * 100)));
  const setStorage = (fillId, usedId, limitId) => {
    const fill = document.getElementById(fillId);
    if (fill) fill.style.width = `${pct}%`;
    const u = document.getElementById(usedId);
    if (u) u.textContent = `${formatBytes(used)} used`;
    const l = document.getElementById(limitId);
    if (l) l.textContent = `${formatBytes(limit)} total`;
  };
  setStorage('home-storage-fill', 'home-storage-used', 'home-storage-limit');
  setStorage('dp-storage-fill', 'dp-storage-used', 'dp-storage-limit');

  // Security checkup status (recovery email set hai ya nahi)
  const issues = [];
  if (!user.recovery_email) issues.push('Recovery email is not set');
  if (!user.date_of_birth) issues.push('Date of birth is not set');
  const sub = document.getElementById('home-security-sub');
  const list = document.getElementById('home-security-issues');
  if (sub) {
    sub.textContent =
      issues.length === 0
        ? 'Your account looks secure. No action needed.'
        : `${issues.length} recommendation${issues.length > 1 ? 's' : ''} for your account.`;
  }
  if (list) {
    list.innerHTML =
      issues.length === 0
        ? ''
        : `<ul style="margin:6px 0 0 18px;display:flex;flex-direction:column;gap:4px;">${issues
            .map((i) => `<li>${escapeHtml(i)}</li>`)
            .join('')}</ul>`;
  }
}

/** Home section ka dynamic data (recent activity snippet). */
export async function loadHome(user) {
  if (!user) return;
  renderUserEverywhere(user);
  const box = document.getElementById('home-activity');
  if (!box) return;

  const rows = await getActivity();
  box.innerHTML =
    rows.length === 0
      ? '<div class="text-muted text-sm">No recent activity yet.</div>'
      : rows.slice(0, 3).map(activityRow).join('');
}
