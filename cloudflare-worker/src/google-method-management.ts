/** Private method listing and atomic unlink, credential rotation and other-device revocation. */
import type { D1Database, Env, ResponseWrapper } from './types.ts';
import { json, readJson } from './http.ts';
import { resolveSession } from './sessions.ts';
import { confirmAccountCredential, hasPassword, NO_PASSWORD_PREFIX } from './google-proofs.ts';
import { hashPassword } from './crypto.ts';
import { authorizeActionMfa } from './mfa-proofs.ts';
import { googleMethods, GOOGLE_METHOD_LIMIT, notifyGoogleChange } from './google-methods.ts';
import { GOOGLE_ISSUER } from './google-oidc.ts';
import { fetchProfile, presentUser } from './users.ts';

export async function manageGoogleMethods(request: Request, db: D1Database, env: Env, route: string,
  wrap: ResponseWrapper): Promise<Response | null> {
  if (!((route === '/auth/google/links' && request.method === 'GET') ||
    (route === '/auth/google/unlink' && request.method === 'POST'))) return null;
  const session = await resolveSession(request, db, env);
  if (!session.ok || !session.authUser?.sessionId) return wrap(json({ error: 'unauthorized' }, 401));
  const userId = session.authUser.id, sid = session.authUser.sessionId;
  const account = await db.prepare('SELECT u.password_hash, p.recovery_email FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = ?').bind(userId).first();
  if (!account) return wrap(json({ error: 'unauthorized' }, 401));
  const previous = await googleMethods(db, userId);
  const passwordSet = hasPassword(account.password_hash);
  if (request.method === 'GET') return wrap(json({ ok: true, user_id: userId, links: previous.map(row => ({ ...row, is_recovery: String(row.email).toLowerCase() === String(account.recovery_email || '').toLowerCase() })), limit: GOOGLE_METHOD_LIMIT,
    has_password: passwordSet, can_remove_last: passwordSet }), session.newCookies || []);
  const body = await readJson(request);
  if (body.expected_user_id && body.expected_user_id !== userId) return wrap(json({ error: 'account_changed' }, 409));
  const method = previous.find(row => row.id === body.id);
  if (!method) return wrap(json({ error: 'method_not_found' }, 404));
  // Passkeys can sign in, but passkey-only security reauthentication is not implemented.
  // Require a password before removing the last Google method, even when a passkey exists.
  if (!passwordSet && previous.length <= 1) return wrap(json({ error: 'last_google_method',
    message: 'Add a password before removing your last Google sign-in method.' }, 409));
  const password = String(body.current_password || '');
  if (!(await confirmAccountCredential(request, db, userId, sid, password, account.password_hash))) {
    return wrap(json({ error: 'reauthentication_required', message: 'Verify your current account again.' }, 400));
  }
  const gate = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
  if (!gate) return wrap(json({ error: 'mfa_required', message: 'Enter a fresh authenticator or recovery code.' }, 400));
  // Rotate even a native password's salt without changing its value. Old Google/MFA/
  // passkey proofs and OAuth credential bindings cannot outlive method removal.
  const rotated = passwordSet ? await hashPassword(password) : NO_PASSWORD_PREFIX + crypto.randomUUID();
  const won = 'EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)';
  const marker = [userId, rotated];
  const results = await db.batch([
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ?
      AND (${gate.sql}) AND EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?)
      AND EXISTS (SELECT 1 FROM auth_google_methods WHERE id = ? AND user_id = ? AND issuer = ?)
      AND (? = 1 OR (SELECT COUNT(*) FROM auth_google_methods WHERE user_id = ? AND issuer = ?) > 1)
      RETURNING id`).bind(rotated, new Date().toISOString(), userId, account.password_hash,
        ...gate.bindings, sid, userId, method.id, userId, GOOGLE_ISSUER, passwordSet ? 1 : 0, userId, GOOGLE_ISSUER),
    db.prepare(`DELETE FROM auth_google_methods WHERE id = ? AND user_id = ? AND (${won})`).bind(method.id, userId, ...marker),
    db.prepare(`UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND (session_id IS NULL OR session_id <> ?) AND (${won})`)
      .bind(userId, sid, ...marker),
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND id <> ? AND (${won})`).bind(userId, sid, ...marker),
    ...['auth_google_flows', 'auth_google_tickets', 'auth_mfa_challenges', 'auth_passkey_challenges', 'recovery_email_changes']
      .map(table => db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND (${won})`).bind(userId, ...marker)),
    db.prepare(`UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND (${won})`).bind(userId, ...marker),
  ]);
  if (!results[0].results?.length) return wrap(json({ error: 'security_state_changed',
    message: 'Security state changed. Verify again before retrying.' }, 409));
  const sent = await notifyGoogleChange(db, env, userId, 'removed', String(method.email), previous, request);
  return wrap(json({ ok: true, notification_sent: sent, user: presentUser(await fetchProfile(db, userId), env) }), session.newCookies || []);
}
