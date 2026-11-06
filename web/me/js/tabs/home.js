import { beginView } from '../view-context.js';
import { renderDataFailure } from '../data-failure.js';
/**
 * /me — HOME section (welcome, security checkup, quick links, storage, activity).
 */

import { formatBytes, formatDate, escapeHtml, toast } from '../../../js/common.js';
import { getActivity } from '../store.js';
import { gothwadEmail } from '../../../js/config.js';
import { renderAvatar } from '../avatar.js';
import { activityRow } from './activity.js';
import { homeRecommendations, storageSummary } from '../home-summary.js';
import { showSection } from '../nav.js';

let bound = false;
function bindActions() {
  if (bound) return;
  bound = true;
  document.getElementById('home-security-issues')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-home-action]');
    if (!button) return;
    showSection('security', { focus: true, target: button.dataset.target });
    if (button.dataset.dialog) (await import('../dialogs.js')).openDialog(button.dataset.dialog);
    else if (button.dataset.target === 'btn-mfa-settings') (await import('../mfa-settings.js')).openMfaSettings();
  });
  document.getElementById('btn-copy-email')?.addEventListener('click', async () => {
    const email = document.getElementById('home-email').textContent;
    try {
      await navigator.clipboard.writeText(email);
      toast('Account email copied');
    } catch {
      const range = document.createRange(); range.selectNodeContents(document.getElementById('home-email'));
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      toast('Select and copy your account email address');
    }
  });
}

/** Renders user profile info across hero, stats, and storage bars. */
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

  // Storage (both Home and Data & privacy sections)
  const { used, limit, percent: pct } = storageSummary(user);
  const setStorage = (fillId, usedId, limitId) => {
    const fill = document.getElementById(fillId);
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.parentElement?.setAttribute('role', 'img');
      fill.parentElement?.setAttribute('aria-label', used !== null && limit !== null ? `${formatBytes(used)} of ${formatBytes(limit)} used` : 'Storage usage unavailable');
    }
    const u = document.getElementById(usedId);
    if (u) u.textContent = used === null ? 'Usage unavailable' : `${formatBytes(used)} used`;
    const l = document.getElementById(limitId);
    if (l) l.textContent = limit === null ? 'Limit unavailable' : `${formatBytes(limit)} total`;
  };
  setStorage('home-storage-fill', 'home-storage-used', 'home-storage-limit');
  setStorage('dp-storage-fill', 'dp-storage-used', 'dp-storage-limit');

  // Actionable suggestions based only on supplied security metadata.
  const issues = homeRecommendations(user);
  const sub = document.getElementById('home-security-sub');
  const list = document.getElementById('home-security-issues');
  if (sub) sub.textContent = issues.length ? 'Options to help you keep access to your account.' : 'Review your sign-in methods, recovery options and devices.';
  if (list) list.innerHTML = issues.map(item => `<div class="home-recommendation"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>
    <button type="button" class="btn btn-text" data-home-action data-dialog="${item.dialog || ''}" data-target="${item.target || ''}">${escapeHtml(item.action)}</button></div>`).join('');
  bindActions();
}

/** Loads recent account activity for the Home tab summary card. */
export async function loadHome(user) {
  const current = beginView('home');
  try {
    if (!user) return;
    renderUserEverywhere(user);
    const box = document.getElementById('home-activity');
    if (!box) return;

    const rows = await getActivity();
    if (!current()) return;
    box.innerHTML =
      rows.length === 0
        ? '<div class="text-muted text-sm">No recent activity yet.</div>'
        : rows.slice(0, 3).map(activityRow).join('');

  } catch { if (current()) renderDataFailure('home-activity', () => loadHome(user)); }
}
