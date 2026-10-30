/** Authenticator enrollment, management, recovery codes, and the second sign-in step. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { json, readJson } from '../http.ts';
import { randomToken, verifyPassword } from '../crypto.ts';
import { mfaConfigured, newRecoveryCodes } from '../mfa-crypto.ts';
import { enabledMfa, matchMfaProof, proofMarkerSql, proofStatement, reserveMfaAttempt } from '../mfa-proofs.ts';
import { prepareMfaEnrollment, confirmMfaEnrollment } from '../mfa-enrollment.ts';
import { finishMfaSignIn } from '../mfa-login.ts';
import { resolveSession } from '../sessions.ts';
import { fetchProfile, logActivity, presentUser } from '../users.ts';
import { authQuery } from '../db.ts';

export async function handleMfaRoute(request: Request, db: D1Database, env: Env,
  route: string, withCors: ResponseWrapper): Promise<Response | null> {
  if (!route.startsWith('/auth/mfa/')) return null;
  if (route === '/auth/mfa/verify' && request.method === 'POST') {
    return authQuery(() => finishMfaSignIn(request, db, env, withCors));
  }
  const known = ['/auth/mfa/status', '/auth/mfa/enroll', '/auth/mfa/confirm', '/auth/mfa/disable', '/auth/mfa/recovery-codes'];
  if (!known.includes(route) || (route === '/auth/mfa/status' ? request.method !== 'GET' : request.method !== 'POST')) return null;
  return authQuery(async () => {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser?.sessionId) return withCors(json({ error: 'unauthorized' }, 401));
    const userId = session.authUser.id;
    const sid = session.authUser.sessionId;
    const factor = await enabledMfa(db, userId);
    if (route === '/auth/mfa/status') {
      const remaining = await db.prepare('SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_by IS NULL')
        .bind(userId).first<{ count: number }>();
      return withCors(json({ ok: true, enabled: !!factor, enrollment_available: mfaConfigured(env),
        recovery_codes_remaining: factor ? remaining?.count || 0 : 0 }), session.newCookies || []);
    }
    const body = await readJson(request);
    if (!(await reserveMfaAttempt(db, userId))) {
      return withCors(json({ error: 'rate_limited', message: 'Too many security attempts. Wait five minutes.' }, 429, { 'Retry-After': '300' }));
    }
    const password = String(body.current_password || '');
    const account = await db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').bind(userId)
      .first<{ id: string; username: string; password_hash: string }>();
    if (!password || password.length > 128 || !account || !(await verifyPassword(password, account.password_hash))) {
      return withCors(json({ error: 'reauthentication_required', message: 'Confirm your current password.' }, 400));
    }
    if (route === '/auth/mfa/enroll') {
      if (factor) return withCors(json({ error: 'already_enabled', message: 'Authenticator verification is already enabled.' }, 409));
      const setup = await prepareMfaEnrollment(db, env, account, sid);
      return withCors(json(setup ? { ok: true, ...setup } : { error: 'enrollment_changed' }, setup ? 200 : 409), session.newCookies || []);
    }
    if (route === '/auth/mfa/confirm') {
      const codes = await confirmMfaEnrollment(db, env, account, sid, String(body.enrollment_id || ''), String(body.code || '').trim());
      if (!codes) return withCors(json({ error: 'invalid_mfa', message: 'Enrollment expired or the code is invalid. Start again if needed.' }, 400));
      await logActivity(db, userId, 'mfa_enabled', 'Authenticator verification enabled', 'Other devices were signed out', request);
      return withCors(json({ ok: true, recovery_codes: codes, user: presentUser(await fetchProfile(db, userId), env) }), session.newCookies || []);
    }
    if (!factor) return withCors(json({ error: 'not_enabled', message: 'Authenticator verification is not enabled.' }, 409));
    const proof = await matchMfaProof(env, factor, String(body.code || '').trim());
    if (!proof) return withCors(json({ error: 'invalid_mfa', message: 'Enter a fresh authenticator code or unused recovery code.' }, 400));
    const marker = randomToken();
    const gate = 'EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND last_proof = ?)';
    const params = [userId, marker];
    const statements = [
      proofStatement(db, factor, proof, marker,
        'EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id WHERE u.id = ? AND u.password_hash = ? AND s.id = ?)',
        [userId, account.password_hash, sid]),
      db.prepare(`UPDATE auth_mfa_factors SET last_proof = ? WHERE user_id = ? AND version = ? AND (${proofMarkerSql(proof)}) RETURNING user_id`)
        .bind(marker, userId, factor.version, userId, marker),
    ];
    const codes = route === '/auth/mfa/recovery-codes' ? await newRecoveryCodes(userId) : null;
    statements.push(db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ? AND (${gate})`).bind(userId, ...params));
    if (codes) {
      statements.push(...codes.map(c => db.prepare(`INSERT INTO auth_mfa_recovery_codes (code_hash, user_id, created_at)
        SELECT ?, ?, ? WHERE ${gate}`).bind(c.hash, userId, new Date().toISOString(), ...params)));
    } else {
      statements.push(
        db.prepare(`UPDATE auth_mfa_factors SET enabled = 0, secret_ciphertext = '', version = ?, last_counter = -1 WHERE user_id = ? AND (${gate})`)
          .bind(crypto.randomUUID(), userId, ...params),
        db.prepare(`UPDATE profiles SET two_factor_enabled = 0 WHERE id = ? AND (${gate})`).bind(userId, ...params),
        db.prepare(`DELETE FROM auth_mfa_sessions WHERE user_id = ? AND (${gate})`).bind(userId, ...params),
        db.prepare(`UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND (session_id IS NULL OR session_id <> ?) AND (${gate})`).bind(userId, sid, ...params),
        db.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND id <> ? AND (${gate})`).bind(userId, sid, ...params),
        db.prepare(`DELETE FROM auth_mfa_challenges WHERE user_id = ? AND (${gate})`).bind(userId, ...params),
        db.prepare(`DELETE FROM oauth_credential_bindings WHERE user_id = ? AND (${gate})`).bind(userId, ...params),
        db.prepare(`DELETE FROM recovery_email_changes WHERE user_id = ? AND (${gate})`).bind(userId, ...params),
      );
    }
    const result = await db.batch(statements);
    if (!result[1].results?.length) return withCors(json({ error: 'invalid_mfa', message: 'This code was already used or verification expired.' }, 400));
    await logActivity(db, userId, codes ? 'mfa_codes_regenerated' : 'mfa_disabled',
      codes ? 'Recovery codes replaced' : 'Authenticator verification disabled', undefined, request);
    return withCors(json({ ok: true, ...(codes ? { recovery_codes: codes.map(c => c.code) } : {}),
      user: presentUser(await fetchProfile(db, userId), env) }), session.newCookies || []);
  });
}
