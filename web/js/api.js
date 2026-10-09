/**
 * =============================================================================
 * API HELPER — Worker ke saath baat karne ka simple tarika
 * =============================================================================
 * HYBRID AUTH (2 tarah se session chalta hai — dono ek saath):
 *
 *   1. Cookies (HttpOnly) — automatically jaati/aati hain (credentials: 'include')
 *      → production SSO ke liye best (subdomains share karte hain)
 *
 *   2. Tokens (sessionStorage) — signin/signup ke response mein aate hain,
 *      hum unhe save karke har request par Authorization header mein bhejte hain
 *      → zaroori hai kyunki iframe/webview environments mein browsers
 *        third-party cookies BLOCK kar dete hain!
 *
 * REFRESH — SINGLE FLIGHT (bahut zaroori!):
 *   Access token expire ho to ek hi jagah refresh hota hai. Agar 3 parallel
 *   requests ek hi refresh token se refresh karein to rotation race ho jaati
 *   hai (1 jeetti hain, 2 haarti hain → dashboard "logged in" bhi dikhta hai
 *   aur bounce bhi karta hai). Isliye refresh SIRF ek dafa hota hai — baaki
 *   sab requests uske poore hone ka intezaar karti hain, phir sab naye token
 *   se retry karti hain.
 */

import { apiUrl } from './config.js';

/* ----------------------------------------------------------- token storage */
const TOKEN_KEY = 'gothwad_tokens';

export function saveTokens({ access_token, refresh_token, session_id }) {
  try {
    const prev = getTokens();
    const next = {
      access_token: access_token || prev.access_token || '',
      // refresh_token sirf tab badlo jab mile (rotation case) — warna purana rakho
      refresh_token: refresh_token || prev.refresh_token || '',
      session_id: session_id || prev.session_id || '',
    };
    if (next.access_token || next.refresh_token) {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    }
  } catch { /* private mode / storage blocked — cookies phir bhi chalte hain */ }
}

export function getTokens() {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || '{}');
  } catch {
    return {};
  }
}

export function clearTokens() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/* --------------------------------------------- single-flight token refresh */
// Ek waqt mein sirf EK refresh — jitni bhi requests pending hon, sab isi ka
// intezaar karti hain (rotation race khatam!).
let refreshPromise = null;

async function doRefresh() {
  const t = getTokens();
  if (!t.refresh_token) return false;

  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ refresh_token: t.refresh_token, session_id: t.session_id || null }),
  }).catch(() => null);
  if (!res || !res.ok) {
    clearTokens(); // session sach mein khatam
    return false;
  }
  const data = await res.json().catch(() => null);
  if (data && data.access_token) {
    saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      session_id: data.session_id,
    });
    return true;
  }
  clearTokens();
  return false;
}

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/* ------------------------------------------------------------- api call */
function authHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getTokens();
  const access = token || t.access_token;
  if (access) headers['Authorization'] = `Bearer ${access}`;
  // NOTE: X-Gothwad-Refresh har request par NAHI bhejte (rotation race se bachne
  // ke liye). Refresh sirf /auth/refresh par hota hai — single flight.
  return headers;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * API call karo. Response hamesha { ok, status, data, error } shape mein.
 * - Agar access token dead nikle (401 / authenticated:false) to ek baar
 *   automatically refresh karke request RETRY hoti hai.
 * - Network fail ho to throw nahi — error object hi return hota hai.
 */
export async function apiCall(path, { method = 'GET', body = null, token = null } = {}) {
  const opts = {
    method,
    credentials: 'include', // cookies bhi bhejo (production SSO ke liye)
    body: body ? JSON.stringify(body) : undefined,
  };

  try {
    let res = await fetch(apiUrl(path), { ...opts, headers: authHeaders(token) });
    let data = await parseJson(res);

    // Token dead hai? (401, ya /auth/me bole authenticated:false)
    // → ek baar refresh karke retry (sirf jab tokens storage mein hon).
    const hadToken = !token && !!getTokens().access_token;
    const dead = res.status === 401 || (data && data.authenticated === false);
    if (hadToken && dead) {
      const usedAccess = getTokens().access_token;
      await refreshOnce();
      const now = getTokens();
      // Refresh safal → naye token se retry. Warna (sach mein logged-out) chhod do.
      if (now.access_token && now.access_token !== usedAccess) {
        res = await fetch(apiUrl(path), { ...opts, headers: authHeaders(token) });
        data = await parseJson(res);
      }
    }

    // Response mein tokens aaye hain (rotation ya fresh login) → save karo
    if (data && data.access_token) {
      saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        session_id: data.session_id,
      });
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (data && data.error) || `Request failed (${res.status})`,
    };
  } catch (err) {
    // Network error — API reachable nahi hai (config check karo)
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
