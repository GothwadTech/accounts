/** Password-verified, email-confirmed recovery replacement without silent activation. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { apiError, isValidEmail, json, readJson } from '../http.ts';
import { randomToken, sha256Hex, verifyPassword } from '../crypto.ts';
import { resolveSession } from '../sessions.ts';
import { logActivity } from '../users.ts';
import { sendSecurityEmail } from '../security-email.ts';
import { authQuery } from '../db.ts';
import { authorizeActionMfa } from '../mfa-proofs.ts';

export async function handleRecoveryChangeRoute(
  request: Request, db: D1Database, env: Env, route: string, withCors: ResponseWrapper,
): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  if (route === '/auth/recovery-email/request') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser?.sessionId) return withCors(apiError('Please sign in again', 401));
    const body = await readJson(request);
    const newEmail = String(body.recovery_email || '').trim().toLowerCase();
    const password = String(body.current_password || '');
    if (!isValidEmail(newEmail) || newEmail.length > 254) return withCors(apiError('Enter a valid recovery email'));
    if (!password || password.length > 128) return withCors(apiError('Your current password is required', 400));
    const account = await db.prepare(
      `SELECT u.password_hash, p.recovery_email FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = ?`,
    ).bind(session.authUser.id).first();
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      return withCors(apiError('Current password is incorrect', 400));
    }
    const proofGate = await authorizeActionMfa(db, env, session.authUser.id, String(body.mfa_code || '').trim());
    if (!proofGate) {
      return withCors(json({ error: 'mfa_required', message: 'Enter a fresh authenticator code or unused recovery code.' }, 400));
    }
    if (newEmail === account.recovery_email) return withCors(apiError('This recovery email is already set', 400));
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
      return withCors(json({ error: 'email_unavailable', message: 'Recovery verification email is not configured. Your current recovery email has not changed.' }, 503));
    }
    const token = randomToken();
    const hash = await sha256Hex(token);
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    const stored = await db.prepare(
      `INSERT INTO recovery_email_changes
       (token_hash, user_id, session_id, new_email, previous_email, password_hash_snapshot, expires_at, consumed_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, NULL
       WHERE EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
         WHERE u.id = ? AND u.password_hash = ? AND s.id = ?) AND (${proofGate.sql})
       ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash,
         session_id = excluded.session_id, new_email = excluded.new_email,
         previous_email = excluded.previous_email, password_hash_snapshot = excluded.password_hash_snapshot,
         expires_at = excluded.expires_at, consumed_by = NULL RETURNING user_id`,
    ).bind(hash, session.authUser.id, session.authUser.sessionId, newEmail,
      account.recovery_email, account.password_hash, expires,
      session.authUser.id, account.password_hash, session.authUser.sessionId, ...proofGate.bindings).first();
    if (!stored) return withCors(apiError('Security state changed. Verify again before retrying.', 409));
    const link = `${env.AUTH_HUB_URL.replace(/\/+$/, '')}/verify-recovery/#token=${encodeURIComponent(token)}`;
    const delivered = await sendSecurityEmail(env, newEmail, 'Verify your Gothwad recovery email',
      `Confirm the replacement recovery email for your Gothwad Account within 15 minutes:\n\n${link}\n\nIf you did not request this change, ignore this message. Your existing recovery address remains unchanged.`);
    if (!delivered) {
      await db.prepare('DELETE FROM recovery_email_changes WHERE token_hash = ?').bind(hash).run();
      return withCors(json({ error: 'email_unavailable', message: 'Could not send verification. Your current recovery email has not changed.' }, 503));
    }
    await logActivity(db, session.authUser.id, 'recovery_change_requested', 'Recovery verification requested', undefined, request);
    return withCors(json({ ok: true, pending: true, message: 'Check the replacement email for a verification link. Your current recovery email stays active until you confirm.' }), session.newCookies || []);
  }

  if (route === '/auth/recovery-email/verify') {
    const body = await readJson(request);
    const token = String(body.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return withCors(apiError('Verification link is invalid or expired', 400));
    const hash = await sha256Hex(token);
    const now = new Date().toISOString();
    const nonce = randomToken();
    // Every write is gated by this request's unique winner marker, inside one transaction.
    // Password changes, revoked requesting sessions, old addresses, expiry, and replay fail closed.
    const results = await authQuery(() => db.batch([
      db.prepare(
        `UPDATE recovery_email_changes SET consumed_by = ?
         WHERE token_hash = ? AND consumed_by IS NULL AND expires_at > ?
           AND EXISTS (SELECT 1 FROM users u JOIN profiles p ON p.id = u.id
             JOIN user_sessions s ON s.user_id = u.id
             WHERE u.id = recovery_email_changes.user_id
               AND s.id = recovery_email_changes.session_id
               AND u.password_hash = recovery_email_changes.password_hash_snapshot
               AND p.recovery_email IS recovery_email_changes.previous_email)
         RETURNING user_id, new_email, previous_email`,
      ).bind(nonce, hash, now),
      db.prepare(
        `UPDATE profiles SET recovery_email = (
           SELECT new_email FROM recovery_email_changes WHERE token_hash = ? AND consumed_by = ?
         ), updated_at = ? WHERE id = (
           SELECT user_id FROM recovery_email_changes WHERE token_hash = ? AND consumed_by = ?
         )`,
      ).bind(hash, nonce, now, hash, nonce),
      db.prepare(
        `INSERT INTO verified_recovery_emails (user_id, email, verified_at)
         SELECT user_id, new_email, ? FROM recovery_email_changes WHERE token_hash = ? AND consumed_by = ?
         ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`,
      ).bind(now, hash, nonce),
      db.prepare(
        `UPDATE password_reset_tokens SET used = 1 WHERE user_id = (
           SELECT user_id FROM recovery_email_changes WHERE token_hash = ? AND consumed_by = ?
         )`,
      ).bind(hash, nonce),
    ]));
    const changed = results[0].results?.[0] as { user_id: string; new_email: string; previous_email: string | null } | undefined;
    if (!changed) return withCors(apiError('Verification link is invalid or expired', 400));
    const notified = changed.previous_email
      ? await sendSecurityEmail(env, changed.previous_email, 'Your Gothwad recovery email changed',
        'Your Gothwad Account recovery email was replaced after password and destination verification. If you did not authorize this, open Gothwad Accounts directly and review your password and signed-in devices.')
      : true;
    await logActivity(db, changed.user_id, 'recovery_email_verified', 'Recovery email changed',
      notified ? 'Replacement address verified; previous address notified when present' : 'Replacement verified; previous-address notification could not be delivered', request);
    return withCors(json({ ok: true, verified: true, notification_sent: notified,
      message: 'Recovery email verified and updated. Existing password-reset links were invalidated.' }));
  }
  return null;
}
