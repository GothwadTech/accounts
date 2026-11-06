// Icons load independently so optional artwork does not inflate the sign-in entry.
if (typeof document !== 'undefined') {
  const iconsSource = new URL('/js/icons.js', import.meta.url).href;
  import(iconsSource).catch(() => {});
}
/**
 * =============================================================================
 * COMMON HELPERS — shared UI + Google-style `authuser` auth logic
 * =============================================================================
 */

import { clearTokens } from './api.js';
import {
  fetchAccounts,
  switchToAccount,
  signOutAccount,
  signOutAllAccounts,
  safeNextUrl,
} from './accounts.js';
import { getSession } from './session.js';
export { getSession } from './session.js';
import { isInternalAccountHubPath, mePathForAuthuser } from './authuser.js';

export function toast(message, type = 'success') {
  const inline = document.getElementById('modal-error');
  if (type === 'error' && inline) { inline.textContent = message; inline.hidden = false; inline.focus?.(); return; }
  const status = document.getElementById('page-status');
  if (status) { status.textContent = message; status.hidden = false; status.setAttribute('role', type === 'error' ? 'alert' : 'status'); status.dataset.kind = type; return; }
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const hasMaterialIcons = !!document.querySelector('link[href*="Material+Symbols"]');
  const icon = hasMaterialIcons
    ? `<span class="msym" style="font-size:18px;">${type === 'error' ? 'error' : 'check_circle'}</span>`
    : `<span>${type === 'error' ? '⚠️' : '✅'}</span>`;
  el.innerHTML = `
    ${icon}
    <span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function carryNextOnAuthLinks() {
  const cur = new URLSearchParams(location.search);
  const next = cur.get('next');
  const add = cur.get('add');
  const choose = cur.get('choose');
  const authuser = cur.get('authuser') ?? cur.get('u');
  if (!next && !add && !choose && !authuser) return;
  document.querySelectorAll('a[href^="/signin"], a[href^="/signup"]').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.origin);
    if (next) url.searchParams.set('next', next);
    if (add === '1') url.searchParams.set('add', '1');
    if (choose === '1') url.searchParams.set('choose', '1');
    if (authuser) url.searchParams.set('authuser', authuser);
    a.setAttribute('href', url.pathname + url.search);
  });
}

export function setBusy(btn, busy, busyText = 'Please wait...') {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.busy === 'true') return;
    btn.dataset.busy = 'true'; btn.setAttribute('aria-busy', 'true');
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${escapeHtml(busyText)}`;
  } else {
    delete btn.dataset.busy; btn.removeAttribute('aria-busy');
    btn.disabled = false;
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/signin?next=${next}`;
    return null;
  }
  return session;
}

export async function redirectIfAuthed() {
  const params = new URLSearchParams(location.search);
  const add = params.get('add') === '1';
  const form = params.get('form') === '1';
  const choose = params.get('choose') === '1';
  const next = params.get('next') || '';
  const requestedAuthuser = params.get('authuser') ?? params.get('u');
  const isOAuth = /\/oauth\/authorize/i.test(next);

  if (add || form) {
    return { authenticated: false, user: null, showChooser: false };
  }

  // If `?authuser=<n>` was passed to `/signin` (without `?choose=1`) and matches a live session,
  // activate that slot in 1 call and redirect straight to `next` or `/u/<n>/me`!
  if (requestedAuthuser !== null && !choose && !isOAuth) {
    const sw = await switchToAccount(requestedAuthuser);
    if (sw.ok) {
      const dest = isInternalAccountHubPath(next) || !next
        ? mePathForAuthuser(sw.authuser)
        : safeNextUrl(next, mePathForAuthuser(sw.authuser));
      location.href = dest;
      return { authenticated: true, user: sw.user, showChooser: false };
    }
  }

  if (choose || isOAuth) {
    const state = await fetchAccounts();
    if (state.accounts.length >= 1) {
      return { authenticated: false, user: null, showChooser: true, accountsState: state };
    }
    return { authenticated: false, user: null, showChooser: false };
  }

  const session = await getSession().catch(() => ({ authenticated: false, unavailable: true }));
  if (session.authenticated) {
    const fallback = mePathForAuthuser(session.authuser);
    location.href = isInternalAccountHubPath(next) || !next ? fallback : safeNextUrl(next, fallback);
  }
  return session;
}

/** Sign out ONLY the active/current-tab slot (or all accounts when `{ all: true }`). */
export async function signOut({ all = false, slotId = null } = {}) {
  if (all) {
    await signOutAllAccounts();
    clearTokens();
    location.href = '/signin';
    return;
  }

  const targetSlot = slotId || (await fetchAccounts()).activeId;
  if (targetSlot) {
    const out = await signOutAccount(targetSlot);
    clearTokens();
    if (out.ok && !out.signedOutAll) {
      location.href = mePathForAuthuser(out.authuser || 0);
      return;
    }
    location.href = '/signin?choose=1';
    return;
  }

  await signOutAllAccounts();
  clearTokens();
  location.href = '/signin';
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function setupPasswordEyes() {
  document.querySelectorAll('.input-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = btn.querySelector('.msym');
      if (icon) {
        icon.textContent = isPassword ? 'visibility_off' : 'visibility';
      } else {
        btn.textContent = isPassword ? '🙈' : '👁️';
      }
    });
  });
}
