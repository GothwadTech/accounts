/**
 * =============================================================================
 * COMMON HELPERS — shared UI + auth logic (har page yeh use karta hai)
 * =============================================================================
 */

import { api } from './api.js';

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
 * Returns: { authenticated, user } — cookies ki wajah se token manage nahi karna padta.
 */
export async function getSession() {
  const res = await api.get('/auth/me');
  if (res.ok && res.data && res.data.authenticated) {
    return { authenticated: true, user: res.data.user };
  }
  return { authenticated: false, user: null };
}

/**
 * Protected pages (dashboard): login nahi hai to login.html par bhej do.
 * Returns user object (already logged-in case mein).
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session.authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `login.html?next=${next}`;
    return null;
  }
  return session.user;
}

/** Login/Signup pages: pehle se logged-in hai to ?next= ya dashboard par bhej do. */
export async function redirectIfAuthed() {
  const session = await getSession();
  if (session.authenticated) {
    const params = new URLSearchParams(location.search);
    location.href = params.get('next') || 'dashboard.html';
  }
  return session;
}

/** Sign out + login page par redirect. */
export async function signOut() {
  await api.post('/auth/signout', {});
  location.href = 'login.html';
}

/* ---------------------------------------------------------------- header */
/**
 * Topbar render karo (auth state ke hisaab se buttons badalte hain).
 * Har page mein <header id="topbar"></header> hona chahiye.
 */
export async function renderTopbar() {
  const el = document.getElementById('topbar');
  if (!el) return;

  const session = await getSession();
  const authed = session.authenticated;

  el.innerHTML = `
    <div class="container topbar-inner">
      <a class="brand" href="index.html">
        <span class="flame">🔥</span>
        <span>
          GOTHWAD
          <span class="brand-sub">Accounts</span>
        </span>
      </a>
      <nav class="nav">
        ${authed ? `
          <a class="nav-link hide-mobile" href="dashboard.html">My Account</a>
          <button class="btn btn-ghost" id="btn-signout" style="padding:8px 14px;">Sign out</button>
        ` : `
          <a class="nav-link" href="login.html">Sign in</a>
          <a class="btn btn-primary" href="signup.html" style="padding:8px 16px;">Create account</a>
        `}
      </nav>
    </div>`;

  const signoutBtn = document.getElementById('btn-signout');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => signOut());
  }
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
