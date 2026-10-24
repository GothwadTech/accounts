/** Request-local UI bootstrap: memory only, no persisted identity or credentials. */
import { api } from './api.js';
import { normalizeAccount } from './accounts.js';
import { parsePageAuthuser } from './authuser.js';

let bootstrap = null;
const pending = new Map();

function sessionRequest(selector) {
  if (!pending.has(selector)) {
    const promise = loadSession().finally(() => pending.delete(selector));
    pending.set(selector, promise);
  }
  return pending.get(selector);
}

/** Start identity discovery before the dashboard's larger module tree loads. */
export function primeSession() {
  if (bootstrap) return;
  const selector = parsePageAuthuser();
  const promise = sessionRequest(selector);
  bootstrap = { selector, promise };
  // The dashboard consumes the same rejection and presents its retry UI.
  promise.catch(() => {});
}

export function getSession() {
  const selector = parsePageAuthuser();
  const initial = bootstrap;
  bootstrap = null;
  return initial?.selector === selector ? initial.promise : sessionRequest(selector);
}

async function loadSession() {
  const res = await api.get('/auth/me');
  if (res.ok && res.data && res.data.authenticated) {
    const accounts = Array.isArray(res.data.accounts)
      ? res.data.accounts.map((a, idx) => normalizeAccount(a, idx))
      : [];
    return {
      authenticated: true,
      user: res.data.user,
      activeId: res.data.activeId || null,
      authuser: Number.isInteger(res.data.authuser) ? res.data.authuser : 0,
      accounts,
    };
  }
  if (res.status !== 401) {
    throw new Error(res.error || 'Could not check your Gothwad session. Please retry.');
  }
  return { authenticated: false, user: null, activeId: null, authuser: 0, accounts: [] };
}
