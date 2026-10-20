/**
 * =============================================================================
 * GOOGLE-STYLE MULTI-ACCOUNT URL ENGINE (`/u/0/me`, `/u/1/me`, `?authuser=0`)
 * =============================================================================
 * Mirrors Google Identity (`myaccount.google.com/u/0`, `mail.google.com/mail/u/1`):
 *   - Path routing: `/u/<0..5>/me` (or `/u/<0..5>`)
 *   - Query routing: `?authuser=<0..5|username|email>` or `?u=<0..5>`
 *   - Per-tab isolation: every `fetch()` from `/u/1/me` automatically attaches
 *     `X-Gothwad-Authuser: 1` so multiple browser tabs work independently!
 * =============================================================================
 */

import { apiUrl } from './config.js';

const PATH_AUTHUSER_RE = /^\/u\/(\d+)(?:\/|$)/;

export function parsePageAuthuser(loc = globalThis.location) {
  if (!loc) return null;
  try {
    const pathMatch = String(loc.pathname || '').match(PATH_AUTHUSER_RE);
    if (pathMatch) return pathMatch[1];

    const params = new URLSearchParams(loc.search || '');
    const q = params.get('authuser') ?? params.get('u');
    if (q !== null && q.trim() !== '') return q.trim();
  } catch {
    // Ignore environments without a full Location object
  }
  return null;
}

export function mePathForAuthuser(authuser = 0, hash = '') {
  const idx = Number.isInteger(authuser) && authuser >= 0 ? authuser : 0;
  const cleanHash = hash && hash.startsWith('#') ? hash : hash ? `#${hash}` : '';
  return `/u/${idx}/me${cleanHash}`;
}

export function isInternalAccountHubPath(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return false;
  return (
    urlOrPath === '/me' ||
    urlOrPath === '/me/' ||
    urlOrPath.startsWith('/me?') ||
    urlOrPath.startsWith('/me#') ||
    /^\/u\/\d+(?:\/me)?(?:[/?#]|$)/.test(urlOrPath)
  );
}

export function syncMeBrowserUrl(authuser = 0, { push = false } = {}) {
  const loc = globalThis.location;
  const hist = globalThis.history;
  if (!loc || !hist) return;

  const target = mePathForAuthuser(authuser, loc.hash || '');
  const current = `${loc.pathname || ''}${loc.search || ''}${loc.hash || ''}`;
  if (current === target) return;

  try {
    if (push && typeof hist.pushState === 'function') {
      hist.pushState({ authuser }, '', target);
    } else if (typeof hist.replaceState === 'function') {
      hist.replaceState({ authuser }, '', target);
    }
  } catch {
    // Non-browser test environment without History pushState support
  }
}

export function buildEcosystemAppHref(rawAppUrl, authuser = 0) {
  if (!rawAppUrl) return '#';
  const idx = Number.isInteger(authuser) && authuser >= 0 ? authuser : 0;
  try {
    const dest = new URL(rawAppUrl, globalThis.location?.origin || 'https://accounts.gothwadtech.com');
    dest.searchParams.set('authuser', String(idx));
    return apiUrl(`/auth/switch?authuser=${encodeURIComponent(String(idx))}&next=${encodeURIComponent(dest.toString())}`);
  } catch {
    return rawAppUrl;
  }
}
