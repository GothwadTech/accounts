/** Password change, proof-state validation, and revocation commit atomically. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { apiError, json, readJson } from '../http.ts';
import { hashPassword, verifyPassword } from '../crypto.ts';
import { resolveSession } from '../sessions.ts';
import { authorizeActionMfa } from '../mfa-proofs.ts';
import { logActivity } from '../users.ts';

export async function handlePasswordChangeRoute(request: Request, db: D1Database, env: Env,
  route: string, withCors: ResponseWrapper): Promise<Response | null> {
  if (route !== '/auth/change-password' || request.method !== 'POST') return null;
  const session = await resolveSession(request, db, env);
  if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));
  const body = await readJson(request);
  const current = String(body.current_password || '');
  const next = String(body.new_password || '');
  if (next.length < 8 || next.length > 128) return withCors(apiError('New password must be between 8 and 128 characters'));
  const userId = session.authUser.id;
  const sid = session.authUser.sessionId;
  if (!sid) return withCors(apiError('Please sign in again before changing your password', 401));
  const account = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
  if (!current || current.length > 128 || !account || !(await verifyPassword(current, account.password_hash))) {
    return withCors(apiError('Current password is incorrect', 400));
  }
  const proof = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
  if (!proof) return withCors(json({ error: 'mfa_required', message: 'Enter a fresh authenticator code or unused recovery code.' }, 400));
  const hash = await hashPassword(next);
  // The randomly salted new password hash marks this transaction's mutation winner.
  const won = 'EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)';
  const params = [userId, hash];
  const results = await db.batch([
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ?
      AND (${proof.sql}) AND EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?) RETURNING id`)
      .bind(hash, new Date().toISOString(), userId, account.password_hash, ...proof.bindings, sid, userId),
    db.prepare(`UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND (session_id IS NULL OR session_id <> ?) AND (${won})`)
      .bind(userId, sid, ...params),
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND id <> ? AND (${won})`).bind(userId, sid, ...params),
    db.prepare(`DELETE FROM recovery_email_changes WHERE user_id = ? AND (${won})`).bind(userId, ...params),
    db.prepare(`UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0 AND (${won})`).bind(userId, ...params),
  ]);
  if (!results[0].results?.length) return withCors(apiError('Security state changed. Verify again before retrying.', 409));
  await logActivity(db, userId, 'password_change', 'Password changed', 'Your password was updated and other devices were signed out', request);
  return withCors(json({ ok: true, message: 'Password changed. Other devices were signed out.' }), session.newCookies || []);
}
