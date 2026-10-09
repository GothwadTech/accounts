/**
 * =============================================================================
 * API HELPER — Worker ke saath baat karne ka simple tarika
 * =============================================================================
 * Har request ke saath cookies jaati hain (credentials: 'include') — isliye
 * session management browser + Worker khud sambhalte hain. Token copy-paste
 * karne ki zaroorat nahi.
 */

import { apiUrl } from './config.js';

/**
 * API call karo. Response hamesha { ok, status, data } shape mein milta hai.
 * Network fail ho to throw nahi karta — error object hi return karta hai,
 * taaki UI asaani se error dikha sake.
 */
export async function apiCall(path, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'include', // cookies bhejo (session ke liye)
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
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
