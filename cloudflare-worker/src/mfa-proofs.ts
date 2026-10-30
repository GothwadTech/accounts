/** Durable proof attempts and atomic single-use TOTP/recovery consumption. */
import type { D1Database, D1PreparedStatement, Env } from './types.ts';
import { decryptMfaSeed, totpCounter, recoveryCodeHash } from './mfa-crypto.ts';
import { randomToken } from './crypto.ts';

export type MfaFactor = {
  user_id: string; secret_ciphertext: string; version: string; enabled: number;
  setup_session_id: string | null; password_hash_snapshot: string; pending_expires_at: string;
  last_counter: number; last_proof: string | null;
};
export type MfaProof = { counter: number | null; recoveryHash: string | null };
export type SignInGate = { statements: D1PreparedStatement[]; sql: string; bindings: unknown[]; version: string | null; method?: 'passkey' };
export async function enabledMfa(db: D1Database, userId: string): Promise<MfaFactor | null> {
  return db.prepare('SELECT * FROM auth_mfa_factors WHERE user_id = ? AND enabled = 1').bind(userId).first<MfaFactor>();
}
export async function reserveMfaAttempt(db: D1Database, userId: string, now = Date.now()): Promise<boolean> {
  const windowStart = Math.floor(now / 300_000) * 300;
  const row = await db.prepare(`INSERT INTO auth_mfa_attempts (user_id, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      attempts = CASE WHEN auth_mfa_attempts.window_start = excluded.window_start
        THEN MIN(auth_mfa_attempts.attempts + 1, 11) ELSE 1 END,
      window_start = excluded.window_start RETURNING attempts`).bind(userId, windowStart).first<{ attempts: number }>();
  return !!row && row.attempts <= 10;
}
export async function matchMfaProof(env: Env, factor: MfaFactor, code: string): Promise<MfaProof | null> {
  if (code.length > 128) return null;
  if (/^\d{6}$/.test(code)) {
    const counter = totpCounter(await decryptMfaSeed(env, factor.user_id, factor.secret_ciphertext), code);
    return counter !== null && counter > factor.last_counter ? { counter, recoveryHash: null } : null;
  }
  const hash = await recoveryCodeHash(factor.user_id, code);
  return hash ? { counter: null, recoveryHash: hash } : null;
}
/** The extra guard binds login proof consumption to a still-valid preauthentication challenge. */
export function proofStatement(db: D1Database, factor: MfaFactor, proof: MfaProof, marker: string,
  guard = '1', guardBindings: unknown[] = []): D1PreparedStatement {
  if (proof.counter !== null) {
    return db.prepare(`UPDATE auth_mfa_factors SET last_counter = ?, last_proof = ?
      WHERE user_id = ? AND version = ? AND enabled = 1 AND last_counter < ? AND (${guard}) RETURNING user_id`)
      .bind(proof.counter, marker, factor.user_id, factor.version, proof.counter, ...guardBindings);
  }
  return db.prepare(`UPDATE auth_mfa_recovery_codes SET used_by = ? WHERE code_hash = ? AND user_id = ? AND used_by IS NULL
    AND EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND version = ? AND enabled = 1)
    AND (${guard}) RETURNING user_id`)
    .bind(marker, proof.recoveryHash, factor.user_id, factor.user_id, factor.version, ...guardBindings);
}
export function proofMarkerSql(proof: MfaProof): string {
  return proof.counter !== null
    ? 'EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND last_proof = ?)'
    : 'EXISTS (SELECT 1 FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_by = ?)';
}
export type ActionGate = { sql: string; bindings: unknown[] };
/** Proof consumption is single-use; callers bind this gate to the actual mutation. */
export async function authorizeActionMfa(db: D1Database, env: Env, userId: string, code: string): Promise<ActionGate | null> {
  const factor = await enabledMfa(db, userId);
  if (!factor) return { sql: 'NOT EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND enabled = 1)', bindings: [userId] };
  if (!(await reserveMfaAttempt(db, userId))) return null;
  const proof = await matchMfaProof(env, factor, code);
  if (!proof) return null;
  const marker = randomToken();
  if (!(await proofStatement(db, factor, proof, marker).first())) return null;
  return {
    sql: `(${proofMarkerSql(proof)}) AND EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND enabled = 1 AND version = ?)`,
    bindings: [userId, marker, userId, factor.version],
  };
}
