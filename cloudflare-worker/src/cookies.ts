/**
 * =============================================================================
 * SUBDOMAIN SSO COOKIES, MULTI-ACCOUNT SLOTS (`a`..`f`) & CSRF VERIFICATION
 * =============================================================================
 * Every cookie matches `^gothwad_[a-z_]+=` (Mail proxy allowlist) and slot
 * session cookies strictly match `^gothwad_sess_[a-z]$`.
 */

import {
  ACCOUNT_SLOTS,
  ACCOUNTS_COOKIE_NAME,
  ACTIVE_COOKIE_NAME,
  MULTI_ACCOUNT_MAX_AGE,
  type AccountCookieEntry,
  type AccountSlot,
  type Env,
  type SlotCredentials,
} from './types.ts';
import { ACCESS_TOKEN_TTL_SECONDS, b64url, b64urlToBytes, getSigningSecret, timingSafeBytesEqual } from './crypto.ts';

export function cookieDomain(request: Request, env: Env): string | null {
  const host = new URL(request.url).hostname;
  if (host === env.APP_DOMAIN || host.endsWith(`.${env.APP_DOMAIN}`)) {
    return `.${env.APP_DOMAIN}`;
  }
  return null;
}

export function makeCookie(
  request: Request,
  env: Env,
  name: string,
  value: string,
  maxAgeSeconds: number | null,
): string {
  const domain = cookieDomain(request, env);
  const isSecure = new URL(request.url).protocol === 'https:' || !!domain;
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isSecure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

export function sessionCookies(
  request: Request,
  env: Env,
  tokens: {
    access_token: string;
    refresh_token: string;
    session_id?: string | null;
    remember: boolean;
  },
): string[] {
  const maxAge = tokens.remember ? MULTI_ACCOUNT_MAX_AGE : null;
  const cookies = [
    makeCookie(request, env, 'gothwad_at', tokens.access_token, tokens.remember ? ACCESS_TOKEN_TTL_SECONDS : null),
    makeCookie(request, env, 'gothwad_rt', tokens.refresh_token, maxAge),
  ];
  if (tokens.session_id) {
    cookies.push(makeCookie(request, env, 'gothwad_sid', tokens.session_id, maxAge));
  }
  return cookies;
}

export function clearCookies(request: Request, env: Env): string[] {
  return [
    makeCookie(request, env, 'gothwad_at', '', 0),
    makeCookie(request, env, 'gothwad_rt', '', 0),
    makeCookie(request, env, 'gothwad_sid', '', 0),
  ];
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function isAccountSlot(value: unknown): value is AccountSlot {
  return typeof value === 'string' && (ACCOUNT_SLOTS as readonly string[]).includes(value);
}

export function slotCookieName(slot: AccountSlot): string {
  return `gothwad_sess_${slot}`;
}

export function encodeSlotCredentials(creds: SlotCredentials): string {
  return `s1~${creds.accessToken}~${creds.refreshToken}~${creds.sessionId}~${creds.remember ? '1' : '0'}`;
}

export function decodeSlotCredentials(raw: string | null | undefined): SlotCredentials | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('~');
  if (parts.length !== 5 || parts[0] !== 's1') return null;
  const [, accessToken, refreshToken, sessionId, remFlag] = parts;
  if (!accessToken && !refreshToken) return null;
  return {
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    sessionId: sessionId || '',
    remember: remFlag !== '0',
  };
}

export function makeSlotSessionCookie(
  request: Request,
  env: Env,
  slot: AccountSlot,
  creds: SlotCredentials,
): string {
  return makeCookie(
    request,
    env,
    slotCookieName(slot),
    encodeSlotCredentials(creds),
    creds.remember ? MULTI_ACCOUNT_MAX_AGE : null,
  );
}

async function computeAccountsCookieHmac(payloadB64: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`gothwad_accounts:v1:${payloadB64}`));
  return new Uint8Array(sig);
}

export async function signAccountsCookieValue(entries: AccountCookieEntry[], env: Env): Promise<string> {
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(entries)));
  const sigBytes = await computeAccountsCookieHmac(payloadB64, getSigningSecret(env));
  return `v1.${payloadB64}.${b64url(sigBytes)}`;
}

export async function verifyAccountsCookieValue(
  raw: string | null | undefined,
  env: Env,
): Promise<AccountCookieEntry[] | null> {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;

    const providedSig = b64urlToBytes(parts[2]);
    const expectedSig = await computeAccountsCookieHmac(parts[1], getSigningSecret(env));
    if (providedSig.length === 0 || !timingSafeBytesEqual(providedSig, expectedSig)) return null;

    const jsonText = new TextDecoder('utf-8', { fatal: true }).decode(b64urlToBytes(parts[1]));
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return null;

    const seen = new Set<AccountSlot>();
    const clean: AccountCookieEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !isAccountSlot(item.slot) || seen.has(item.slot)) continue;
      if (typeof item.username !== 'string' || !item.username) continue;
      seen.add(item.slot);
      clean.push({
        slot: item.slot,
        username: String(item.username),
        firstName: typeof item.firstName === 'string' ? item.firstName : '',
        lastName: typeof item.lastName === 'string' ? item.lastName : '',
        addedAt: typeof item.addedAt === 'string' && item.addedAt ? item.addedAt : new Date(0).toISOString(),
        lastUsedAt: typeof item.lastUsedAt === 'string' && item.lastUsedAt ? item.lastUsedAt : new Date(0).toISOString(),
      });
    }
    return clean;
  } catch {
    return null;
  }
}

export function makeAccountsCookie(request: Request, env: Env, signedValue: string): string {
  return makeCookie(request, env, ACCOUNTS_COOKIE_NAME, signedValue, MULTI_ACCOUNT_MAX_AGE);
}

export function makeActiveCookie(request: Request, env: Env, slot: AccountSlot): string {
  return makeCookie(request, env, ACTIVE_COOKIE_NAME, slot, MULTI_ACCOUNT_MAX_AGE);
}

export function clearAllAuthCookies(request: Request, env: Env): string[] {
  const cookies = clearCookies(request, env);
  if (getCookie(request, ACTIVE_COOKIE_NAME) !== null) {
    cookies.push(makeCookie(request, env, ACTIVE_COOKIE_NAME, '', 0));
  }
  if (getCookie(request, ACCOUNTS_COOKIE_NAME) !== null) {
    cookies.push(makeCookie(request, env, ACCOUNTS_COOKIE_NAME, '', 0));
  }
  for (const slot of ACCOUNT_SLOTS) {
    if (getCookie(request, slotCookieName(slot)) !== null) {
      cookies.push(makeCookie(request, env, slotCookieName(slot), '', 0));
    }
  }
  return cookies;
}

export function isTrustedGothwadOrigin(rawOrigin: string, request: Request, env: Env): boolean {
  if (!rawOrigin || rawOrigin === 'null') return false;
  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    return false;
  }

  const normalizedOrigin = parsed.origin;
  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.includes(normalizedOrigin)) return true;

  try {
    if (env.AUTH_HUB_URL && new URL(env.AUTH_HUB_URL).origin === normalizedOrigin) return true;
  } catch {
    // Ignore malformed AUTH_HUB_URL
  }

  const appDomain = (env.APP_DOMAIN || '').trim().toLowerCase();
  const host = parsed.hostname.toLowerCase();
  if (appDomain && (host === appDomain || host.endsWith(`.${appDomain}`))) {
    return parsed.protocol === 'https:' || env.DEV_MODE === 'true';
  }

  const reqHost = new URL(request.url).hostname.toLowerCase();
  const isLoopbackReq = reqHost === 'localhost' || reqHost === '127.0.0.1';
  if ((isLoopbackReq || env.DEV_MODE === 'true') && (host === 'localhost' || host === '127.0.0.1')) {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  return false;
}

export function verifyCsrfOrigin(
  request: Request,
  env: Env,
  opts: { requireHeader: boolean } = { requireHeader: true },
): boolean {
  const origin = request.headers.get('Origin');
  if (origin !== null) {
    return isTrustedGothwadOrigin(origin.trim(), request, env);
  }
  const referer = request.headers.get('Referer');
  if (referer !== null) {
    return isTrustedGothwadOrigin(referer.trim(), request, env);
  }

  const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
    return false;
  }

  // Server-to-server Gothwad Worker proxy subrequests (e.g. Gothwad Mail Worker `callAccounts`)
  // omit browser `Origin`/`Referer` headers and send explicit `Accept: application/json`.
  const accept = (request.headers.get('Accept') || '').trim().toLowerCase();
  if (accept === 'application/json') {
    return true;
  }

  return !opts.requireHeader;
}

export function resolveSafeRedirectTarget(rawNext: string | null | undefined, request: Request, env: Env): string {
  const hubBase = (env.AUTH_HUB_URL || '').replace(/\/+$/, '');
  const fallback = `${hubBase || new URL(request.url).origin}/u/0/me`;
  if (!rawNext || typeof rawNext !== 'string') return fallback;

  if (rawNext.startsWith('/') && !rawNext.startsWith('//')) {
    return `${hubBase || new URL(request.url).origin}${rawNext}`;
  }
  try {
    const candidate = new URL(rawNext);
    if (isTrustedGothwadOrigin(candidate.origin, request, env)) {
      return candidate.toString();
    }
  } catch {
    // Reject untrusted or malformed destination
  }
  return fallback;
}

export function refererHasQueryParam(request: Request, key: string, expectedValue: string): boolean {
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try {
    return new URL(referer).searchParams.get(key) === expectedValue;
  } catch {
    return false;
  }
}
