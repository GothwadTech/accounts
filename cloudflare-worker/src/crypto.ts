/**
 * =============================================================================
 * CRYPTOGRAPHY — WebCrypto PBKDF2-SHA256 Passwords, SHA-256 Tokens, HS256 JWTs
 * =============================================================================
 * Cloudflare Workers V8 WebCrypto enforces max `100,000` PBKDF2 iterations.
 * Stored password format: `pbkdf2_sha256$100000$<base64url-salt>$<base64url-hash>`
 */

import type { Env } from './types.ts';
import { DatabaseUnavailableError } from './db.ts';

export const PBKDF2_ITERATIONS = 100_000;
export const ACCESS_TOKEN_TTL_SECONDS = 3600;                 // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;             // 15 minutes
export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;               // 5 minutes

export function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlDecode(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

export function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return timingSafeBytesEqual(new Uint8Array(hashA), new Uint8Array(hashB)) && a.length === b.length;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_ITERATIONS) return false;
    const salt = b64urlToBytes(parts[2]);
    const expected = b64urlToBytes(parts[3]);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      keyMaterial,
      expected.length * 8,
    );
    return timingSafeBytesEqual(new Uint8Array(derived), expected);
  } catch {
    return false;
  }
}

export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getSigningSecret(env: Env): string {
  const configured = (env.JWT_SECRET || '').trim();
  if (configured) return configured;
  if (env.DEV_MODE === 'true') return 'gothwad-dev-mode-only-jwt-secret';
  throw new DatabaseUnavailableError(
    "Missing Worker secret 'JWT_SECRET'. Run `npx wrangler secret put JWT_SECRET` or add it in Cloudflare Dashboard -> Variables and Secrets.",
  );
}

export async function signJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = b64urlToBytes(parts[2]);
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!ok) return null;

    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function issueSessionAccessToken(
  env: Env,
  opts: { userId: string; username: string; sessionId?: string | null },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      token_use: 'session',
      iss: env.AUTH_HUB_URL,
      sub: opts.userId,
      username: opts.username,
      sid: opts.sessionId || null,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomToken().slice(0, 16),
    },
    getSigningSecret(env),
  );
}

export async function issueOAuthAccessToken(
  env: Env,
  opts: { userId: string; username: string; clientId: string; scopes: string[] },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      token_use: 'oauth_access',
      iss: env.AUTH_HUB_URL,
      sub: opts.userId,
      aud: opts.clientId,
      client_id: opts.clientId,
      username: opts.username,
      scope: opts.scopes.join(' '),
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomToken().slice(0, 16),
    },
    getSigningSecret(env),
  );
}
