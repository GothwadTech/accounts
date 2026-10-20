/**
 * =============================================================================
 * MULTI-ACCOUNT SESSIONS — Server-Side `HttpOnly` Cookie Slots (`a`..`f`)
 * =============================================================================
 * Zero tokens or account records in `localStorage` or `sessionStorage`.
 * Every account slot is verified live by the Worker against D1 sessions:
 *   - GET  /api/auth/accounts
 *   - POST /api/auth/switch                { id: "<slot>" }
 *   - POST /api/auth/accounts/:id/signout
 *   - POST /api/auth/signout               (sign out all slots)
 * =============================================================================
 */

import { api, clearTokens } from './api.js';
import { GOTHWAD_CONFIG } from './config.js';

export const MAX_ACCOUNTS = 6;

function normalizeAccount(raw) {
  const firstName = raw?.firstName ?? raw?.first_name ?? '';
  const lastName = raw?.lastName ?? raw?.last_name ?? '';
  const username = String(raw?.username || '');
  return {
    id: String(raw?.id || raw?.slot || ''),
    username,
    firstName,
    lastName,
    first_name: firstName,
    last_name: lastName,
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

/**
 * Fetch live signed-in accounts from `GET /api/auth/accounts`.
 * Returns `{ activeId: string | null, accounts: Array }`.
 */
export async function fetchAccounts() {
  const res = await api.get('/auth/accounts');
  if (!res.ok || !res.data || !Array.isArray(res.data.accounts)) {
    return { activeId: null, accounts: [] };
  }
  return {
    activeId: res.data.activeId || null,
    accounts: res.data.accounts.map(normalizeAccount),
  };
}

/**
 * Switch active account in 1 request (`POST /api/auth/switch`) with zero password prompt.
 * On revoked session (`409`), server keeps active slot intact and returns `{ error: "account_not_signed_in" }`.
 */
export async function switchToAccount(accountOrSlotId) {
  const slotId =
    typeof accountOrSlotId === 'string'
      ? accountOrSlotId
      : String(accountOrSlotId?.id || '');
  if (!slotId) {
    return { ok: false, status: 400, error: 'Invalid account selection.' };
  }
  const res = await api.post('/auth/switch', { id: slotId });
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
  return {
    ok: true,
    activeId: res.data?.activeId || slotId,
    user: res.data?.user || null,
  };
}

/**
 * Sign out ONLY slot `slotId` (`POST /api/auth/accounts/:id/signout`).
 */
export async function signOutAccount(slotId) {
  const res = await api.post(`/auth/accounts/${encodeURIComponent(slotId)}/signout`, {});
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.error || 'Could not sign out.' };
  }
  return {
    ok: true,
    signedOutAll: !!res.data?.signedOutAll,
    activeId: res.data?.activeId || null,
    accounts: Array.isArray(res.data?.accounts) ? res.data.accounts.map(normalizeAccount) : [],
  };
}

export async function signOutAllAccounts() {
  clearTokens();
  return api.post('/auth/signout', {});
}

/**
 * Validate `?next=` destination — only relative paths or `APP_DOMAIN` / `*.APP_DOMAIN` allowed.
 */
export function safeNextUrl(raw, fallback = '/me') {
  if (typeof raw !== 'string' || !raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    const host = url.hostname.toLowerCase();
    const app = String(GOTHWAD_CONFIG.APP_DOMAIN || '').toLowerCase();
    const sameHost = typeof location !== 'undefined' && host === location.hostname;
    const appDomain = !!app && (host === app || host.endsWith(`.${app}`));
    if (sameHost || appDomain) return url.toString();
  } catch { /* invalid URL */ }
  return fallback;
}

export function initialsFor(user) {
  const f = (user?.firstName ?? user?.first_name ?? '')[0] || '';
  const l = (user?.lastName ?? user?.last_name ?? '')[0] || '';
  const u = (user?.username || '?')[0];
  return ((f + l) || u || '?').toUpperCase();
}
