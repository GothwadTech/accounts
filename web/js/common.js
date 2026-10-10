/**
 * =============================================================================
 * COMMON HELPERS — shared UI + auth logic (har page yeh use karta hai)
 * Routes: /signin · /signup · /me   (iske alawa koi page nahi)
 * =============================================================================
 */

import { api, clearTokens, getTokens } from './api.js';
import {
  rememberAccount,
  listAccounts,
  removeAccount,
  clearAllAccounts,
  switchToAccount,
  switchToNextAvailable,
  initialsFor,
  canAddAccount,
  MAX_ACCOUNTS,
  safeNextUrl,
} from './accounts.js';

/* ----------------------------------------------------------------- toasts */
/** toast('Saved!', 'success') ya toast('Something went wrong', 'error') */
export function toast(message, type = 'success') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span>${type === 'error' ? '⚠️' : '✅'}</span>
    <span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/** HTML-escape (XSS se bachav — user input ko kabhi directly mat chhapo) */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ------------------------------------------------------------ button busy */
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

/* ---------------------------------------------------------------- session */
/**
 * Current session check: /api/auth/me call karta hai.
 * Returns: { authenticated, user }
 */
export async function getSession() {
  const res = await api.get('/auth/me');
  if (res.ok && res.data && res.data.authenticated) {
    rememberAccount(res.data.user);
    return { authenticated: true, user: res.data.user };
  }
  return { authenticated: false, user: null };
}

/**
 * Protected page (/me): login nahi hai to /signin par bhej do.
 * Returns user object (logged-in case mein).
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session.authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/signin?next=${next}`;
    return null;
  }
  return session.user;
}

/** /signin, /signup: pehle se logged-in hai to /me par bhej do. */
export async function redirectIfAuthed() {
  const params = new URLSearchParams(location.search);
  const add = params.get('add') === '1';
  const form = params.get('form') === '1';
  const choose = params.get('choose') === '1';
  const next = params.get('next') || '';
  const isOAuth = /\/oauth\/authorize/i.test(next);
  const saved = listAccounts();

  // Form: add account / use another account — picker skip
  if (add || form) return { authenticated: false, user: null, showChooser: false };

  // Google-style chooser: saved accounts (OAuth ya 1+ accounts)
  if (saved.length >= 1 && (choose || isOAuth || saved.length >= 1)) {
    return { authenticated: false, user: null, showChooser: true };
  }

  const session = await getSession();
  if (session.authenticated) {
    location.href = safeNextUrl(next, '/me');
  }
  return session;
}

/** Sign out current account. Agar doosra saved hai to uspe switch. */
export async function signOut({ all = false } = {}) {
  if (all) {
    const list = listAccounts();
    for (const a of list) {
      await api.post('/auth/signout', { session_id: a.session_id || null });
    }
    clearAllAccounts();
    clearTokens();
    location.href = '/signin';
    return;
  }

  const tokens = getTokens();
  await api.post('/auth/signout', { session_id: tokens.session_id || null });
  const current = listAccounts().find(
    (a) => a.session_id === tokens.session_id || a.refresh_token === tokens.refresh_token,
  );
  const except = [current?.id, current?.username, tokens.session_id].filter(Boolean);
  if (current) removeAccount(current.id);
  clearTokens();

  const sw = await switchToNextAvailable(except);
  if (sw.ok) {
    location.href = '/me';
    return;
  }
  location.href = '/signin';
}

/* ---------------------------------------------------------------- header */
/**
 * Topbar render karo (real Gothwad logo + auth state ke hisaab se buttons).
 * Har page mein <header id="topbar"></header> hona chahiye.
 * NOTE: agar session pehle se pata ho (getPageSession()) to use bhejo —
 * warna ye khud /auth/me call karega.
 */
export async function renderTopbar(existingSession = null) {
  const el = document.getElementById('topbar');
  if (!el) return;

  const session = existingSession || (await getSession());
  const authed = session.authenticated;

  const accounts = listAccounts();
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
              <div class="acct-menu-head">
                <div class="acct-menu-name">${escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Account')}</div>
                <div class="acct-menu-email mono">${escapeHtml(user.email || '')}</div>
              </div>
              ${accounts.map((a) => `
                <button type="button" class="acct-menu-item" data-switch="${escapeHtml(a.id)}" role="menuitem">
                  <span class="avatar sm">${escapeHtml(initialsFor(a))}</span>
                  <span>
                    <span class="acct-item-name">${escapeHtml(`${a.first_name || ''} ${a.last_name || ''}`.trim() || a.username)}</span>
                    <span class="acct-item-email mono">${escapeHtml(a.email || a.username)}</span>
                  </span>
                  ${a.username === user.username ? '<span class="acct-check">✓</span>' : ''}
                </button>
              `).join('')}
              <a class="acct-menu-item" id="link-add-account" href="/signin?add=1">
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

  bindAccountMenu(accounts, user);
}

function bindAccountMenu(accounts, user) {
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
      const acc = accounts.find((a) => a.id === id);
      if (!acc || acc.username === user.username) {
        menu.classList.add('hidden');
        return;
      }
      const sw = await switchToAccount(acc);
      if (!sw.ok) {
        toast(sw.error || 'Could not switch account', 'error');
        return;
      }
      location.reload();
    });
  });

  const addLink = document.getElementById('link-add-account');
  if (addLink) {
    addLink.addEventListener('click', (e) => {
      const gate = canAddAccount();
      if (!gate.ok) {
        e.preventDefault();
        toast(gate.error, 'error');
      }
    });
  }

  const one = document.getElementById('btn-signout-one');
  if (one) one.addEventListener('click', () => signOut());
  const all = document.getElementById('btn-signout-all');
  if (all) all.addEventListener('click', () => signOut({ all: true }));
}

/* ---------------------------------------------------------------- format */
/** Bytes ko human-readable banao: 1536 → "1.5 KB" */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** ISO date → "9 Oct 2026, 2:30 PM" */
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

/* -------------------------------------------------------- password strength */
/** 0-4 score: very weak → strong */
export function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

/* ------------------------------------------------------------- eye toggle */
/**
 * Show/hide password buttons — har page par <button class="input-eye" data-eye="FIELD_ID">
 * Setup: setupPasswordEyes() call karo page load par.
 */
export function setupPasswordEyes() {
  document.querySelectorAll('.input-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁️';
    });
  });
}
