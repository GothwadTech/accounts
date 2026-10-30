/** Strict RP/origin policy and durable, bounded WebAuthn challenges. */
import type { D1Database, Env } from './types.ts';
import { randomToken, sha256Hex } from './crypto.ts';
import { enabledMfa, type ActionGate } from './mfa-proofs.ts';
import { DatabaseUnavailableError } from './db.ts';

export function passkeyConfig(env: Env): { origin: string; rpID: string } {
  const url = new URL(env.AUTH_HUB_URL);
  const local = env.DEV_MODE === 'true' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new DatabaseUnavailableError('Passkeys require a secure account origin');
  const rpID = env.WEBAUTHN_RP_ID || url.hostname;
  // Restrict keys to the identity host; do not silently authorize every sibling application.
  if (rpID !== url.hostname) throw new DatabaseUnavailableError('Passkey RP ID must match the account hostname');
  return { origin: url.origin, rpID };
}
export function passkeyOriginAllowed(request: Request, env: Env): boolean {
  const expected = passkeyConfig(env).origin;
  if (request.headers.has('Origin')) return request.headers.get('Origin') === expected;
  if (request.method === 'GET') {
    try { return new URL(request.headers.get('Referer') || '').origin === expected; } catch { return false; }
  }
  return false;
}
export type PasskeyChallenge = {
  token_hash: string; user_id: string; kind: string; challenge: string; origin: string; rp_id: string;
  session_id: string | null; password_hash_snapshot: string; factor_version: string | null;
  remember_me: number; add_mode: number; expires_at: string;
};
export const factorSnapshotSql = (user: string, version: string) =>
  `(SELECT version FROM auth_mfa_factors WHERE user_id = ${user} AND enabled = 1) IS ${version}`;

export async function savePasskeyChallenge(db: D1Database, env: Env,
  account: { id: string; password_hash: string }, kind: string, challenge: string,
  options: { sessionId?: string; remember?: boolean; addMode?: boolean; gate?: ActionGate } = {}) {
  const { origin, rpID } = passkeyConfig(env);
  const factor = await enabledMfa(db, account.id);
  const token = randomToken();
  const gate = options.gate || { sql: '1', bindings: [] };
  const now = new Date().toISOString();
  const inserted = await db.prepare(`INSERT INTO auth_passkey_challenges
    (token_hash, user_id, kind, challenge, origin, rp_id, session_id, password_hash_snapshot,
      factor_version, remember_me, add_mode, expires_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (${gate.sql})
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)
      AND ${factorSnapshotSql('?', '?')} RETURNING token_hash`)
    .bind(await sha256Hex(token), account.id, kind, challenge, origin, rpID, options.sessionId || null,
      account.password_hash, factor?.version || null, options.remember === false ? 0 : 1, options.addMode ? 1 : 0,
      new Date(Date.now() + 300_000).toISOString(), ...gate.bindings,
      account.id, account.password_hash, account.id, factor?.version || null).first();
  await db.prepare(`DELETE FROM auth_passkey_challenges WHERE token_hash IN (
    SELECT token_hash FROM auth_passkey_challenges WHERE expires_at <= ? LIMIT 100)`).bind(now).run();
  // Keep at most five pending challenges per user; signing in elsewhere can supersede old prompts.
  await db.prepare(`DELETE FROM auth_passkey_challenges WHERE user_id = ? AND token_hash NOT IN (
    SELECT token_hash FROM auth_passkey_challenges WHERE user_id = ? ORDER BY expires_at DESC, rowid DESC LIMIT 5)`)
    .bind(account.id, account.id).run();
  return inserted ? token : null;
}
export async function takePasskeyAttempt(db: D1Database, token: string, kind: string): Promise<PasskeyChallenge | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`UPDATE auth_passkey_challenges SET attempts = attempts + 1
    WHERE token_hash = ? AND kind = ? AND used_by IS NULL AND expires_at > ? AND attempts < 3 RETURNING *`)
    .bind(await sha256Hex(token), kind, new Date().toISOString()).first<PasskeyChallenge>();
}
export function livePasskeySql(): string {
  return `EXISTS (SELECT 1 FROM auth_passkey_challenges c JOIN users u ON u.id = c.user_id
    WHERE c.token_hash = ? AND c.used_by IS NULL AND c.expires_at > ?
      AND u.password_hash = c.password_hash_snapshot
      AND ${factorSnapshotSql('c.user_id', 'c.factor_version')})`;
}
export function rejectsEmbeddedResponse(response: { response?: { clientDataJSON?: string } }): boolean {
  try {
    const raw = response.response?.clientDataJSON || '';
    if (raw.length > 8192) return true;
    const fields = response.response as Record<string, unknown>;
    for (const [name, limit] of [['attestationObject', 65536], ['authenticatorData', 8192], ['signature', 2048]] as const) {
      if (fields?.[name] !== undefined && (typeof fields[name] !== 'string' || (fields[name] as string).length > limit)) return true;
    }
    const bytes = Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).crossOrigin === true;
  } catch { return true; }
}
