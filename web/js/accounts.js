/**
 * Multiple Gothwad Accounts on one browser (Google-style switcher).
 * Active session cookies + sessionStorage tokens = current account.
 * Other accounts: refresh tokens in localStorage (same device only).
 */

import { api, getTokens, saveTokens, clearTokens } from './api.js';

const LIST_KEY = 'gothwad_accounts';
const ACTIVE_KEY = 'gothwad_active_account';
export const MAX_ACCOUNTS = 15;

export function canAddAccount(username) {
  const list = listAccounts();
  if (username && list.some((a) => a.username === String(username).toLowerCase())) {
    return { ok: true, replacing: true };
  }
  if (list.length >= MAX_ACCOUNTS) {
    return {
      ok: false,
      error: `This device already has ${MAX_ACCOUNTS} Gothwad Accounts. Sign out of one to add another.`,
    };
  }
  return { ok: true, replacing: false };
}

export function listAccounts() {
  try {
    const rows = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch { /* private mode */ }
}

export function getActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || '';
  } catch {
    return '';
  }
}

export function setActiveId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}

function accountId(user) {
  return String(user?.id || user?.username || '');
}

export function rememberAccount(user, tokens = null) {
  if (!user) return;
  const t = tokens || getTokens();
  const id = accountId(user);
  if (!id) return;
  const prev = listAccounts().find((a) => a.id === id || a.username === user.username) || {};
  const row = {
    id,
    username: user.username || prev.username || '',
    email: user.email || prev.email || '',
    first_name: user.first_name || prev.first_name || '',
    last_name: user.last_name || prev.last_name || '',
    access_token: t.access_token || prev.access_token || '',
    refresh_token: t.refresh_token || prev.refresh_token || '',
    session_id: t.session_id || prev.session_id || '',
  };
  const list = listAccounts().filter((a) => a.id !== id && a.username !== row.username);
  list.unshift(row);
  persist(list.slice(0, MAX_ACCOUNTS));
  setActiveId(id);
}

export function updateAccountTokens(id, tokens) {
  if (!id || !tokens) return;
  const list = listAccounts().map((a) => {
    if (a.id !== id && a.username !== id) return a;
    return {
      ...a,
      access_token: tokens.access_token || a.access_token,
      refresh_token: tokens.refresh_token || a.refresh_token,
      session_id: tokens.session_id || a.session_id,
    };
  });
  persist(list);
}

export function removeAccount(id) {
  persist(listAccounts().filter((a) => a.id !== id && a.username !== id));
}

export function clearAllAccounts() {
  try {
    localStorage.removeItem(LIST_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}

/** Switch cookies + tokens to this saved account, then caller reloads. */
export async function switchToAccount(account) {
  if (!account?.refresh_token) return { ok: false, error: 'This account needs to sign in again.' };
  saveTokens({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    session_id: account.session_id,
  });
  const res = await api.post('/auth/refresh', {
    refresh_token: account.refresh_token,
    session_id: account.session_id || null,
  });
  if (!res.ok) {
    removeAccount(account.id || account.username);
    clearTokens();
    return { ok: false, error: res.error || 'Session expired. Please sign in again.' };
  }
  setActiveId(account.id || account.username);
  updateAccountTokens(account.id || account.username, {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    session_id: res.data.session_id || account.session_id,
  });
  return { ok: true };
}

/** Logout ke baad next saved account try karo (dead sessions skip). */
export async function switchToNextAvailable(exceptIds = []) {
  const skip = new Set(exceptIds.filter(Boolean).map(String));
  const leftover = listAccounts().filter(
    (a) => !skip.has(String(a.id)) && !skip.has(String(a.username)) && !skip.has(String(a.session_id)),
  );
  for (const acc of leftover) {
    const sw = await switchToAccount(acc);
    if (sw.ok) return { ok: true, account: acc };
  }
  return { ok: false };
}

export function safeNextUrl(raw, fallback = '/me') {
  if (raw && (raw.startsWith('/') || (typeof location !== 'undefined' && raw.startsWith(location.origin)))) {
    return raw;
  }
  return fallback;
}

export function initialsFor(user) {
  const f = (user?.first_name || '')[0] || '';
  const l = (user?.last_name || '')[0] || '';
  const u = (user?.username || '?')[0];
  return ((f + l) || u || '?').toUpperCase();
}
