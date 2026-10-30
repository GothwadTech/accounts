/** Password-first, short-lived MFA challenges; no session credentials before proof. */
import type { D1Database, Env, ResponseWrapper } from './types.ts';
import { randomToken, sha256Hex } from './crypto.ts';
import { json, readJson } from './http.ts';
import { enabledMfa, matchMfaProof, proofMarkerSql, proofStatement, reserveMfaAttempt } from './mfa-proofs.ts';
import { completeSignIn } from './signin-session.ts';

export async function beginMfaSignIn(db: D1Database,
  account: { userId: string; passwordHash: string }, options: { remember: boolean; addMode: boolean }): Promise<Response | null> {
  const factor = await enabledMfa(db, account.userId);
  if (!factor) return null;
  const token = randomToken();
  const expires = new Date(Date.now() + 5 * 60_000).toISOString();
  await db.prepare(`INSERT INTO auth_mfa_challenges
    (token_hash, user_id, password_hash_snapshot, factor_version, remember_me, add_mode, expires_at, attempts, used_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
    ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash,
      password_hash_snapshot = excluded.password_hash_snapshot, factor_version = excluded.factor_version,
      remember_me = excluded.remember_me, add_mode = excluded.add_mode, expires_at = excluded.expires_at,
      attempts = 0, used_by = NULL`)
    .bind(await sha256Hex(token), account.userId, account.passwordHash, factor.version,
      options.remember ? 1 : 0, options.addMode ? 1 : 0, expires).run();
  return json({ ok: true, mfa_required: true, challenge: token, expires_in: 300,
    message: 'Enter an authenticator code or an unused recovery code.' }, 202);
}

export async function finishMfaSignIn(request: Request, db: D1Database, env: Env, withCors: ResponseWrapper): Promise<Response> {
  const body = await readJson(request);
  const token = String(body.challenge || '');
  const code = String(body.code || '').trim();
  const failed = () => withCors(json({ error: 'invalid_mfa', message: 'Verification failed or expired. Use a fresh code or sign in again.' }, 401));
  if (!/^[a-f0-9]{64}$/.test(token) || !code || code.length > 128) return failed();
  const hash = await sha256Hex(token);
  const now = new Date().toISOString();
  const challenge = await db.prepare(`UPDATE auth_mfa_challenges SET attempts = attempts + 1
    WHERE token_hash = ? AND used_by IS NULL AND expires_at > ? AND attempts < 5 RETURNING *`).bind(hash, now).first();
  if (!challenge) return failed();
  if (!(await reserveMfaAttempt(db, challenge.user_id))) {
    return withCors(json({ error: 'rate_limited', message: 'Too many verification attempts. Wait five minutes.' }, 429, { 'Retry-After': '300' }));
  }
  const factor = await enabledMfa(db, challenge.user_id);
  if (!factor || factor.version !== challenge.factor_version) return failed();
  const account = await db.prepare('SELECT id, username, password_hash FROM users WHERE id = ? AND password_hash = ?')
    .bind(challenge.user_id, challenge.password_hash_snapshot).first();
  if (!account) return failed();
  const proof = await matchMfaProof(env, factor, code);
  if (!proof) return failed();
  const marker = randomToken();
  const live = `EXISTS (SELECT 1 FROM auth_mfa_challenges c JOIN users u ON u.id = c.user_id
    WHERE c.token_hash = ? AND c.user_id = ? AND c.used_by IS NULL AND c.attempts <= 5
      AND c.expires_at > ? AND c.factor_version = ? AND u.password_hash = c.password_hash_snapshot)`;
  const liveBindings = [hash, challenge.user_id, new Date().toISOString(), factor.version];
  const statements = [
    proofStatement(db, factor, proof, marker, live, liveBindings),
    db.prepare(`UPDATE auth_mfa_challenges SET used_by = ? WHERE token_hash = ? AND used_by IS NULL
      AND (${proofMarkerSql(proof)}) RETURNING user_id`).bind(marker, hash, challenge.user_id, marker),
  ];
  return completeSignIn(request, db, env,
    { userId: account.id, username: account.username, passwordHash: account.password_hash },
    { remember: !!challenge.remember_me, addMode: !!challenge.add_mode }, withCors,
    { statements, sql: 'EXISTS (SELECT 1 FROM auth_mfa_challenges WHERE token_hash = ? AND used_by = ?)',
      bindings: [hash, marker], version: factor.version });
}
