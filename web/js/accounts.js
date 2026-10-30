import { trustedRedirectOrigin } from './trusted-origins.js';
/**
 * =============================================================================
 * MULTI-ACCOUNT SESSIONS — Server-Side `HttpOnly` Slots (`a`..`f` / `u/0..5`)
 * =============================================================================
 */

import { api, clearTokens } from './api.js';
import { GOTHWAD_CONFIG } from './config.js';
import { mePathForAuthuser } from './authuser.js';

export const MAX_ACCOUNTS = 6;

export function normalizeAccount(raw, fallbackIndex = 0) {
  const firstName = raw?.firstName ?? raw?.first_name ?? '';
  const lastName = raw?.lastName ?? raw?.last_name ?? '';
  const username = String(raw?.username || '');
  const authuser = Number.isInteger(raw?.authuser) ? raw.authuser : fallbackIndex;
  return {
    id: String(raw?.id || raw?.slot || ''),
    authuser,
    username,
    firstName,
    lastName,
    first_name: firstName,
    last_name: lastName,
    avatar_url: raw?.avatarUrl ?? raw?.avatar_url ?? null,
    accountUrl: raw?.accountUrl || mePathForAuthuser(authuser),
    email: raw?.email || (username ? `${username}@${GOTHWAD_CONFIG.APP_DOMAIN}` : ''),
    lastUsedAt: raw?.lastUsedAt || null,
  };
}

export function clearAllAccounts() {
  clearTokens();
}

export function addAccountHref(nextUrl = '') {
  const q = new URLSearchParams();
  q.set('choose', '1');
  q.set('add', '1');
  if (nextUrl) q.set('next', nextUrl);
  return `/signin?${q.toString()}`;
}

export async function fetchAccounts() {
  const res = await api.get('/auth/accounts');
  if (!res.ok || !res.data || !Array.isArray(res.data.accounts)) {
    return { activeId: null, authuser: 0, accounts: [] };
  }
  const accounts = res.data.accounts.map((a, idx) => normalizeAccount(a, idx));
  return {
    activeId: res.data.activeId || null,
    authuser: Number.isInteger(res.data.authuser) ? res.data.authuser : 0,
    accounts,
  };
}

/**
 * Switch active account in 1 request (`POST /api/auth/switch`) using `{ id }` or `{ authuser }`.
 * Returns `{ ok, activeId, authuser, user, accounts }`.
 */
export async function switchToAccount(accountOrSelector) {
  const payload = {};
  if (typeof accountOrSelector === 'number') {
    payload.authuser = accountOrSelector;
  } else if (typeof accountOrSelector === 'string') {
    if (/^\d+$/.test(accountOrSelector)) {
      payload.authuser = Number.parseInt(accountOrSelector, 10);
    } else {
      payload.id = accountOrSelector;
    }
  } else if (accountOrSelector && typeof accountOrSelector === 'object') {
    if (accountOrSelector.id) payload.id = String(accountOrSelector.id);
    if (Number.isInteger(accountOrSelector.authuser)) payload.authuser = accountOrSelector.authuser;
  }

  if (!payload.id && payload.authuser === undefined) {
    return { ok: false, status: 400, error: 'Invalid account selection.' };
  }

  const res = await api.post('/auth/switch', payload);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: res.data?.error || '',
      error:
        res.status === 409
          ? 'Session ended for that account. Please sign in again.'
          : res.error || 'Could not switch account.',
    };
  }
  const accounts = Array.isArray(res.data?.accounts)
    ? res.data.accounts.map((a, idx) => normalizeAccount(a, idx))
    : null;
  return {
    ok: true,
    activeId: res.data?.activeId || payload.id || null,
    authuser: Number.isInteger(res.data?.authuser) ? res.data.authuser : (payload.authuser ?? 0),
    user: res.data?.user || null,
    accounts,
  };
}

export async function signOutAccount(slotId) {
  const res = await api.post(`/auth/accounts/${encodeURIComponent(slotId)}/signout`, {});
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.error || 'Could not sign out.' };
  }
  return {
    ok: true,
    signedOutAll: !!res.data?.signedOutAll,
    activeId: res.data?.activeId || null,
    authuser: Number.isInteger(res.data?.authuser) ? res.data.authuser : 0,
    accounts: Array.isArray(res.data?.accounts)
      ? res.data.accounts.map((a, idx) => normalizeAccount(a, idx))
      : [],
  };
}

export async function signOutAllAccounts() {
  clearTokens();
  return api.post('/auth/signout', {});
}

export function safeNextUrl(raw, fallback = '/u/0/me') {
  if (typeof raw !== 'string' || !raw || /[\\\x00-\x20\x7f]/.test(raw)) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    if (trustedRedirectOrigin(url)) return url.toString();
  } catch { /* Invalid URL: use the account dashboard. */ }
  return fallback;
}

export function initialsFor(u) {
  const fn = u?.first_name ?? u?.firstName ?? '';
  const ln = u?.last_name ?? u?.lastName ?? '';
  return (`${fn[0] || ''}${ln[0] || ''}`.toUpperCase() || u?.username?.[0]?.toUpperCase() || '?');
}
