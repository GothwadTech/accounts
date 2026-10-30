/** Enrollment activation and recovery-code generation commit as one guarded transaction. */
import type { D1Database, Env } from './types.ts';
import { randomToken } from './crypto.ts';
import { decryptMfaSeed, encryptMfaSeed, newAuthenticator, newRecoveryCodes, totpCounter } from './mfa-crypto.ts';
import type { MfaFactor } from './mfa-proofs.ts';

export async function prepareMfaEnrollment(db: D1Database, env: Env,
  account: { id: string; username: string; password_hash: string }, sessionId: string) {
  const generated = newAuthenticator(account.username, env.APP_DOMAIN);
  const ciphertext = await encryptMfaSeed(env, account.id, generated.secret);
  const version = crypto.randomUUID();
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();
  const row = await db.prepare(`INSERT INTO auth_mfa_factors
    (user_id, secret_ciphertext, version, enabled, setup_session_id, password_hash_snapshot, pending_expires_at)
    SELECT ?, ?, ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)
    ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext = excluded.secret_ciphertext,
      version = excluded.version, setup_session_id = excluded.setup_session_id,
      password_hash_snapshot = excluded.password_hash_snapshot, pending_expires_at = excluded.pending_expires_at,
      last_counter = -1, last_proof = NULL WHERE auth_mfa_factors.enabled = 0 RETURNING user_id`)
    .bind(account.id, ciphertext, version, sessionId, account.password_hash, expires, account.id, account.password_hash).first();
  return row ? { enrollment_id: version, secret: generated.secret, otpauth_uri: generated.uri, expires_in: 900 } : null;
}

export async function confirmMfaEnrollment(db: D1Database, env: Env,
  account: { id: string; password_hash: string }, sessionId: string, enrollmentId: string, code: string) {
  const pending = await db.prepare(`SELECT * FROM auth_mfa_factors WHERE user_id = ? AND enabled = 0
    AND version = ? AND setup_session_id = ? AND pending_expires_at > ? AND password_hash_snapshot = ?`)
    .bind(account.id, enrollmentId, sessionId, new Date().toISOString(), account.password_hash).first<MfaFactor>();
  if (!pending) return null;
  const counter = totpCounter(await decryptMfaSeed(env, account.id, pending.secret_ciphertext), code);
  if (counter === null) return null;
  const codes = await newRecoveryCodes(account.id);
  const marker = randomToken();
  const now = new Date().toISOString();
  const guard = 'EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND last_proof = ?)';
  const params = [account.id, marker];
  const batch = [
    db.prepare(`UPDATE auth_mfa_factors SET enabled = 1, setup_session_id = NULL, password_hash_snapshot = '',
      last_counter = ?, last_proof = ?, enrolled_at = ? WHERE user_id = ? AND enabled = 0
      AND version = ? AND setup_session_id = ? AND pending_expires_at > ? AND password_hash_snapshot = ?
      AND EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
        WHERE u.id = ? AND u.password_hash = ? AND s.id = ?) RETURNING user_id`)
      .bind(counter, marker, now, account.id, enrollmentId, sessionId, now, account.password_hash,
        account.id, account.password_hash, sessionId),
    db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
    ...codes.map(c => db.prepare(`INSERT INTO auth_mfa_recovery_codes (code_hash, user_id, created_at)
      SELECT ?, ?, ? WHERE ${guard}`).bind(c.hash, account.id, now, ...params)),
    db.prepare(`UPDATE profiles SET two_factor_enabled = 1 WHERE id = ? AND (${guard})`).bind(account.id, ...params),
    db.prepare(`UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND (session_id IS NULL OR session_id <> ?)
      AND (${guard})`).bind(account.id, sessionId, ...params),
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND id <> ? AND (${guard})`).bind(account.id, sessionId, ...params),
    db.prepare(`INSERT INTO auth_mfa_sessions (session_id, user_id, factor_version)
      SELECT ?, ?, ? WHERE ${guard} ON CONFLICT(session_id) DO UPDATE SET factor_version = excluded.factor_version`)
      .bind(sessionId, account.id, enrollmentId, ...params),
    db.prepare(`DELETE FROM auth_mfa_challenges WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
    db.prepare(`DELETE FROM recovery_email_changes WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
    db.prepare(`DELETE FROM oauth_credential_bindings WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
    db.prepare(`UPDATE oauth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
    db.prepare(`UPDATE oauth_auth_codes SET used = 1 WHERE user_id = ? AND (${guard})`).bind(account.id, ...params),
  ];
  const results = await db.batch(batch);
  return results[0].results?.length ? codes.map(c => c.code) : null;
}
