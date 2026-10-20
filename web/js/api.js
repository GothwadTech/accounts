/**
 * =============================================================================
 * API HELPER — 100% Cookie-Only Identity (`credentials: 'include'`)
 * =============================================================================
 * SECURITY INVARIANT:
 *   - ZERO JWTs, refresh tokens, or session credentials in `localStorage` or `sessionStorage`.
 *   - All sessions live exclusively in `HttpOnly; Secure; SameSite=Lax; Domain=.APP_DOMAIN`
 *     cookies managed by the Accounts Worker.
 *   - Any legacy client storage keys from pre-v2.1 sessions (`gothwad_tokens`,
 *     `gothwad_accounts`, `gothwad_active_account`) are purged immediately on load.
 * =============================================================================
 */

import { apiUrl } from './config.js';

export function clearTokens() {
  try {
    sessionStorage.removeItem('gothwad_tokens');
  } catch { /* sandboxed / private browsing */ }
  try {
    localStorage.removeItem('gothwad_accounts');
    localStorage.removeItem('gothwad_active_account');
  } catch { /* sandboxed / private browsing */ }
}

// Immediately purge any stale client-stored tokens from older builds on page boot
clearTokens();

/* --------------------------------------------- single-flight cookie refresh */
let refreshPromise = null;

async function doRefresh() {
  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
  }).catch(() => null);
  return !!(res && res.ok);
}

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const SKIP_REFRESH_PREFIXES = [
  '/auth/signin',
  '/auth/signup',
  '/auth/refresh',
  '/auth/signout',
  '/auth/switch',
  '/auth/accounts',
];

/**
 * Call Worker API using first-party `HttpOnly` cookies (`credentials: 'include'`).
 * Always returns `{ ok, status, data, error }`.
 */
export async function apiCall(path, { method = 'GET', body = null } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  };

  try {
    let res = await fetch(apiUrl(path), opts);
    let data = await parseJson(res);

    const canRetryRefresh =
      res.status === 401 && !SKIP_REFRESH_PREFIXES.some((prefix) => path.startsWith(prefix));

    if (canRetryRefresh && (await refreshOnce())) {
      res = await fetch(apiUrl(path), opts);
      data = await parseJson(res);
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (data && (data.message || data.error)) || `Request failed (${res.status})`,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Cannot reach the Gothwad API. Check API_URL in js/config.js (and that the Worker is running).',
    };
  }
}

export const api = {
  get: (path, opts) => apiCall(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiCall(path, { ...opts, method: 'POST', body }),
};
