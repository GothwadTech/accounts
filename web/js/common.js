/**
 * =============================================================================
 * COMMON HELPERS — shared UI + auth logic (har page yeh use karta hai)
 * Routes: /signin · /signup · /me   (iske alawa koi page nahi)
 * =============================================================================
 */

import { api, clearTokens, getTokens } from './api.js';

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
  const session = await getSession();
  if (session.authenticated) {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    // Sirf relative ya apne hi origin ke URLs allow (open-redirect se bachav)
    const safeNext = next && (next.startsWith('/') || next.startsWith(location.origin)) ? next : '/me';
    location.href = safeNext;
  }
  return session;
}

/** Sign out + /signin par redirect. */
export async function signOut() {
  // session_id body mein: taaki device row bhi delete ho (header-auth case)
  await api.post('/auth/signout', { session_id: getTokens().session_id || null });
  clearTokens(); // sessionStorage se tokens hatao (hybrid auth)
  location.href = '/signin';
}

/* ---------------------------------------------------------------- header */
/**
 * Topbar render karo (real Gothwad logo + auth state ke hisaab se buttons).
 * Har page mein <header id="topbar"></header> hona chahiye.
 */
export async function renderTopbar() {
  const el = document.getElementById('topbar');
  if (!el) return;

  const session = await getSession();
  const authed = session.authenticated;

  el.innerHTML = `
    <div class="container topbar-inner">
      <a class="brand" href="${authed ? '/me' : '/signin'}">
        <img class="brand-logo sm" src="/icon-192.png" alt="Gothwad" />
        <span class="brand-name">Gothwad</span>
      </a>
      <nav class="nav">
        ${authed ? `
          <a class="nav-link hide-mobile" href="/me">My Account</a>
          <button class="btn btn-ghost" id="btn-signout" style="padding:8px 14px;">Sign out</button>
        ` : `
          <a class="nav-link" href="/signin">Sign in</a>
          <a class="btn btn-primary" href="/signup" style="padding:8px 16px;">Create account</a>
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
