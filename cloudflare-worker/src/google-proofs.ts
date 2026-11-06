/** Browser-only Google proof cookies and one-use security reauthentication. */
import type { D1Database, Env } from './types.ts';
import { googleLinksSnapshot } from './google-methods.ts';
import { getCookie } from './cookies.ts';
import { randomToken, sha256Hex, verifyPassword } from './crypto.ts';

// This marker is not a password or a password hash. It cannot pass verifyPassword.
export const NO_PASSWORD_PREFIX = '!no-password:';
export const hasPassword = (hash: string) => !String(hash).startsWith(NO_PASSWORD_PREFIX);
export const googleCookieName = (kind: string) => `gothwad_google_${kind}`;
export function googleCookie(env: Env, kind: string, value: string, seconds = 600) {
  const secure = new URL(env.AUTH_HUB_URL).protocol === 'https:' ? '; Secure' : '';
  // Host-only intentionally: these are upstream handshake proofs, NOT parent-domain SSO cookies.
  return `${googleCookieName(kind)}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${seconds}`;
}
export async function googleTicket(request: Request, db: D1Database, purpose = 'auth') {
  const token = getCookie(request, googleCookieName(purpose === 'auth' ? 'pending' : 'reauth')) || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT * FROM auth_google_tickets WHERE token_hash = ? AND purpose = ?
    AND used_by IS NULL AND expires_at > ? ${purpose === 'reauth' ? `AND (${liveGoogleSession})` : ''}`).bind(await sha256Hex(token), purpose, new Date().toISOString()).first();
}
export const liveGoogleSession = `EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
  WHERE u.id = auth_google_tickets.user_id AND s.id = auth_google_tickets.session_id
    AND u.password_hash = auth_google_tickets.password_snapshot)
  AND (SELECT version FROM auth_mfa_factors WHERE user_id = auth_google_tickets.user_id AND enabled = 1)
    IS auth_google_tickets.factor_version
  AND EXISTS (SELECT 1 FROM auth_google_ticket_guards g WHERE g.token_hash = auth_google_tickets.token_hash
    AND g.links_snapshot = ${googleLinksSnapshot('auth_google_tickets.user_id')})
  AND EXISTS (SELECT 1 FROM auth_google_methods m WHERE m.user_id = auth_google_tickets.user_id
    AND m.issuer = 'https://accounts.google.com' AND m.subject = auth_google_tickets.subject)`;

export async function confirmAccountCredential(request: Request, db: D1Database, userId: string,
  sid: string, password: string, hash: string): Promise<boolean> {
  if (hasPassword(hash)) return !!password && password.length <= 128 && await verifyPassword(password, hash);
  const token = getCookie(request, googleCookieName('reauth')) || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  // Consume before the action, exactly as a fresh password check; every caller retains its
  // existing atomic live-session, credential-snapshot and MFA mutation guards.
  const proof = await db.prepare(`UPDATE auth_google_tickets SET used_by = ? WHERE token_hash = ?
    AND purpose = 'reauth' AND user_id = ? AND session_id = ? AND password_snapshot = ?
    AND used_by IS NULL AND expires_at > ? AND (${liveGoogleSession}) RETURNING token_hash`)
    .bind(randomToken(), await sha256Hex(token), userId, sid, hash, new Date().toISOString()).first();
  return !!proof;
}
