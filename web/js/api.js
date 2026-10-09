/**
 * =============================================================================
 * API HELPER — Worker ke saath baat karne ka simple tarika
 * =============================================================================
 * HYBRID AUTH (2 tarah se session chalta hai — dono ek saath):
 *
 *   1. Cookies (HttpOnly) — automatically jaati/aati hain (credentials: 'include')
 *      → production SSO ke liye best (subdomains share karte hain)
 *
 *   2. Tokens (sessionStorage) — signin/signup/me ke response mein aate hain,
 *      hum unhe save karke HAR request par Authorization header mein bhejte hain
 *      → zaroori hai kyunki Arena preview jaise IFRAME/webview environments mein
 *        browsers third-party cookies BLOCK kar dete hain!
 *
 * Isliye login karke dashboard par tikna ab dono jagah (iframe + normal tab) chalega.
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

/* ------------------------------------------------------------- api call */
/**
 * API call karo. Response hamesha { ok, status, data, error } shape mein.
 * - Tokens (agar response mein aayein) automatically save ho jaate hain.
 * - Network fail ho to throw nahi — error object hi return hota hai.
 */
export async function apiCall(path, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  // Session tokens header mein (iframe/webview-safe auth)
  const tokens = getTokens();
  const access = token || tokens.access_token;
  if (access) headers['Authorization'] = `Bearer ${access}`;
  if (!token && tokens.refresh_token) headers['X-Gothwad-Refresh'] = tokens.refresh_token;

  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'include', // cookies bhi bhejo (production SSO ke liye)
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
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
