/**
 * /me — PERSONAL INFO section (photo, name, dob, gender, contact rows + dialogs).
 */

import { escapeHtml } from '../../../js/common.js';
import { gothwadEmail } from '../../../js/config.js';
import { renderAvatar } from '../avatar.js';
import { setDialogUser, openDialog } from '../dialogs.js';

let user = null;
let onUserUpdated = () => {};

export function initPersonalInfo(currentUser, cb) {
  user = currentUser;
  if (cb) onUserUpdated = cb;

  // Dialog system ko user do (save ke baad callback bhi)
  setDialogUser(user, (updated) => {
    user = updated;
    onUserUpdated(updated);
    refreshRows();
  });

  // Rows → dialogs
  document.querySelectorAll('#section-personal [data-dialog]').forEach((row) => {
    row.addEventListener('click', () => openDialog(row.dataset.dialog));
  });

  // Photo overlay (click + keyboard)
  const overlay = document.getElementById('pi-photo-edit');
  overlay?.addEventListener('click', () => openDialog('photo'));
  overlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDialog('photo');
    }
  });

  refreshRows();
}

/** Rows ke values update karo (profile change ke baad bhi call hota hai). */
export function refreshRows() {
  if (!user) return;

  renderAvatar(document.getElementById('pi-photo'), user);

  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('pi-name').textContent = name;
  document.getElementById('pi-email').textContent = gothwadEmail(user.username);
  document.getElementById('pi-dob').textContent = user.date_of_birth || 'Not set';
  document.getElementById('pi-gender').textContent = user.gender || 'Not set';
  document.getElementById('pi-phone').textContent = user.phone_number || 'Not set';
  document.getElementById('pi-recovery').textContent = user.recovery_email || 'Not set';
}
