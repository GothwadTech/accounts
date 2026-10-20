/**
 * =============================================================================
 * COMMON HELPERS — shared UI + auth logic (`/signin` · `/signup` · `/me`)
 * =============================================================================
 */

import { api, clearTokens } from './api.js';
import {
  fetchAccounts,
  switchToAccount,
  signOutAccount,
  signOutAllAccounts,
  initialsFor,
  MAX_ACCOUNTS,
  safeNextUrl,
  addAccountHref,
} from './accounts.js';

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
  if (!next && !add && !choose) return;
  document.querySelectorAll('a[href^="/signin"], a[href^="/signup"]').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.origin);
    if (next) url.searchParams.set('next', next);
    if (add === '1') url.searchParams.set('add', '1');
    if (choose === '1') url.searchParams.set('choose', '1');
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
    return { authenticated: true, user: res.data.user };
  }
  return { authenticated: false, user: null };
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/signin?next=${next}`;
    return null;
  }
  return session.user;
}

export async function redirectIfAuthed() {
  const params = new URLSearchParams(location.search);
  const add = params.get('add') === '1';
  const form = params.get('form') === '1';
  const choose = params.get('choose') === '1';
  const next = params.get('next') || '';
  const isOAuth = /\/oauth\/authorize/i.test(next);

  // Explicit form mode (`add=1` or `form=1`): stay on Sign-In / Sign-Up form without redirect
  if (add || form) {
    return { authenticated: false, user: null, showChooser: false };
  }

  // Chooser mode (`?choose=1` or OAuth authorize flow): check live server accounts in 1 request
  if (choose || isOAuth) {
    const state = await fetchAccounts();
    if (state.accounts.length >= 1) {
      return { authenticated: false, user: null, showChooser: true, accountsState: state };
    }
    return { authenticated: false, user: null, showChooser: false };
  }

  const session = await getSession();
  if (session.authenticated) {
    location.href = safeNextUrl(next, '/me');
  }
  return session;
}

/** Sign out only the active slot (or all accounts when `{ all: true }`). */
export async function signOut({ all = false } = {}) {
  if (all) {
    await signOutAllAccounts();
    clearTokens();
    location.href = '/signin';
    return;
  }

  const state = await fetchAccounts();
  if (state.activeId) {
    const out = await signOutAccount(state.activeId);
    clearTokens();
    if (out.ok && !out.signedOutAll) {
      location.href = '/me';
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
  const { activeId, accounts } = authed ? await fetchAccounts() : { activeId: null, accounts: [] };
  const user = session.user || {};
  const ini = initialsFor(user);

  el.innerHTML = `
    <div class="container topbar-inner">
      <a class="brand" href="${authed ? '/me' : '/signin'}">
        <img class="brand-logo sm" src="/icon-192.png" alt="Gothwad" />
        <span class="brand-name">Gothwad</span>
      </a>
      <nav class="nav">
        ${authed ? `
          <a class="nav-link hide-mobile" href="/me">My Account</a>
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

  bindAccountMenu(accounts, activeId, user);
}

function bindAccountMenu(accounts, activeId, user) {
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
      location.reload();
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
  if (one) one.addEventListener('click', () => signOut());
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
