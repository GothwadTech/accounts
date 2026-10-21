/**
 * =============================================================================
 * COMMON HELPERS — shared UI + Google-style `authuser` auth logic
 * =============================================================================
 */

import { api, clearTokens } from './api.js';
import {
  fetchAccounts,
  normalizeAccount,
  switchToAccount,
  signOutAccount,
  signOutAllAccounts,
  initialsFor,
  MAX_ACCOUNTS,
  safeNextUrl,
  addAccountHref,
} from './accounts.js';
import { isInternalAccountHubPath, mePathForAuthuser } from './authuser.js';

export function toast(message, type = 'success') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
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
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${escapeHtml(busyText)}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
  }
}

export async function getSession() {
  const res = await api.get('/auth/me');
  if (res.ok && res.data && res.data.authenticated) {
    const accounts = Array.isArray(res.data.accounts)
      ? res.data.accounts.map((a, idx) => normalizeAccount(a, idx))
      : [];
    return {
      authenticated: true,
      user: res.data.user,
      activeId: res.data.activeId || null,
      authuser: Number.isInteger(res.data.authuser) ? res.data.authuser : 0,
      accounts,
    };
  }
  return { authenticated: false, user: null, activeId: null, authuser: 0, accounts: [] };
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

  const session = await getSession();
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

export async function renderTopbar(existingSession = null) {
  const el = document.getElementById('topbar');
  if (!el) return;

  const session = existingSession || (await getSession());
  const authed = session.authenticated;
  const activeId = session.activeId || null;
  const accounts = authed
    ? session.accounts?.length
      ? session.accounts
      : (await fetchAccounts()).accounts
    : [];
  const user = session.user || {};
  const myAccountHref = mePathForAuthuser(session.authuser || 0);
  const ini = initialsFor(user);

  el.innerHTML = `
    <div class="container topbar-inner">
      <a class="brand" href="${authed ? escapeHtml(myAccountHref) : '/signin'}">
        <img class="brand-logo sm" src="/icon-192.png" alt="Gothwad" />
        <span class="brand-name">Gothwad</span>
      </a>
      <nav class="nav">
        ${authed ? `
          <a class="nav-link hide-mobile" href="${escapeHtml(myAccountHref)}">My Account</a>
          <div class="acct-switch" id="acct-switch">
            <button type="button" class="acct-switch-btn" id="acct-switch-btn" aria-label="Switch account">
              <span class="avatar sm">${escapeHtml(ini)}</span>
            </button>
            <div class="acct-menu hidden" id="acct-menu" role="menu">
              ${accounts.map((a) => `
                <button type="button" class="acct-menu-item" data-switch="${escapeHtml(a.id)}" role="menuitem">
                  <span class="avatar sm">${escapeHtml(initialsFor(a))}</span>
                  <span>
                    <span class="acct-item-name">${escapeHtml(`${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username)}</span>
                    <span class="acct-item-email mono">${escapeHtml(a.email || a.username)}</span>
                  </span>
                  ${a.id === activeId || a.username === user.username ? '<span class="acct-check">✓</span>' : ''}
                </button>
              `).join('')}
              <a class="acct-menu-item" id="link-add-account" href="${escapeHtml(addAccountHref(location.pathname + location.search))}">
                <span class="acct-plus">+</span>
                <span>Add another account</span>
              </a>
              <button type="button" class="acct-menu-item" id="btn-signout-one">Sign out</button>
              ${accounts.length > 1 ? '<button type="button" class="acct-menu-item danger" id="btn-signout-all">Sign out all accounts</button>' : ''}
            </div>
          </div>
        ` : `
          <a class="nav-link" href="/signin">Sign in</a>
          <a class="btn btn-primary" href="/signup" style="padding:8px 16px;">Create account</a>
        `}
      </nav>
    </div>`;

  bindAccountMenu(accounts, activeId);
}

function bindAccountMenu(accounts, activeId) {
  const btn = document.getElementById('acct-switch-btn');
  const menu = document.getElementById('acct-menu');
  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => menu.classList.add('hidden'));
    menu.addEventListener('click', (e) => e.stopPropagation());
  }

  menu?.querySelectorAll('[data-switch]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-switch');
      if (!id || id === activeId) {
        menu.classList.add('hidden');
        return;
      }
      const sw = await switchToAccount(id);
      if (!sw.ok) {
        toast(sw.error || 'Could not switch account', 'error');
        if (sw.status === 409) {
          location.href = addAccountHref(location.pathname + location.search);
        }
        return;
      }
      location.href = mePathForAuthuser(sw.authuser || 0);
    });
  });

  const addLink = document.getElementById('link-add-account');
  if (addLink) {
    addLink.addEventListener('click', (e) => {
      if (accounts.length >= MAX_ACCOUNTS) {
        e.preventDefault();
        toast(
          `Maximum ${MAX_ACCOUNTS} accounts can stay signed in on one browser. Sign out of one first.`,
          'error',
        );
      }
    });
  }

  const one = document.getElementById('btn-signout-one');
  if (one) one.addEventListener('click', () => signOut({ slotId: activeId }));
  const all = document.getElementById('btn-signout-all');
  if (all) all.addEventListener('click', () => signOut({ all: true }));
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

export function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
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
