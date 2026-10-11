/**
 * /me — avatar render helper (photo ya initials).
 * Alag module hai taaki me.js ↔ tabs circular import na ho.
 */

import { escapeHtml } from '../../js/common.js';
import { initialsFor } from '../../js/accounts.js';

/** Avatar element render: photo ho to photo, warna initials. */
export function renderAvatar(el, user) {
  if (!el) return;
  if (user?.avatar_url) {
    el.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" alt="" />`;
  } else {
    el.textContent = initialsFor(user);
  }
}
