/**
 * `/me` — Avatar renderer helper (profile photo with monogram fallback).
 * Extracted to avoid circular imports between `me.js` and section tabs.
 */

import { escapeHtml } from '../../js/common.js';
import { initialsFor } from '../../js/accounts.js';

/** Renders either the user's profile image or uppercase initials inside `el`. */
export function renderAvatar(el, user) {
  if (!el) return;
  if (user?.avatar_url) {
    el.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" alt="" />`;
  } else {
    el.textContent = initialsFor(user);
  }
}
