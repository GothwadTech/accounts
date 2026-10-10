import { formatBytes, formatDate } from '../../../js/common.js';
import { gothwadEmail } from '../../../js/config.js';

export function updateOverview(u) {
  if (!u) return;
  const initials = ((u.first_name || '?')[0] || '?') + ((u.last_name || '')[0] || '');

  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.textContent = initials.toUpperCase();

  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = `Welcome, ${u.first_name || u.username}`;

  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = gothwadEmail(u.username);

  // Overview stats
  const statEmail = document.getElementById('stat-email');
  if (statEmail) statEmail.textContent = gothwadEmail(u.username);

  const statUser = document.getElementById('stat-username');
  if (statUser) statUser.textContent = `@${u.username}`;

  const statCreated = document.getElementById('stat-created');
  if (statCreated) statCreated.textContent = formatDate(u.created_at);

  // Storage bar
  const used = Number(u.storage_used_bytes || 0);
  const limit = Number(u.storage_limit_bytes || 1);
  const pct = Math.max(1, Math.min(100, Math.round((used / limit) * 100)));

  const storageFill = document.getElementById('storage-fill');
  if (storageFill) storageFill.style.width = `${pct}%`;

  const storageUsed = document.getElementById('storage-used');
  if (storageUsed) storageUsed.textContent = `${formatBytes(used)} used`;

  const storageLimit = document.getElementById('storage-limit');
  if (storageLimit) storageLimit.textContent = `${formatBytes(limit)} total`;

  const tag2fa = document.getElementById('tag-2fa');
  if (tag2fa) tag2fa.textContent = u.two_factor_enabled ? '2FA: enabled' : '2FA: not enabled';
}
