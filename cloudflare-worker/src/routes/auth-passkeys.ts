/** Identity-origin-only WebAuthn endpoints. Private keys never reach the server. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { json, readJson } from '../http.ts';
import { passkeyOriginAllowed, passkeyConfig } from '../passkey-core.ts';
import { registrationOptions, verifyRegistration } from '../passkey-registration.ts';
import { passkeyLoginOptions, verifyPasskeyLogin } from '../passkey-login.ts';
import { resolveSession } from '../sessions.ts';
import { authorizeActionMfa, reserveMfaAttempt } from '../mfa-proofs.ts';
import { verifyPassword } from '../crypto.ts';
import { logActivity } from '../users.ts';
import { authQuery } from '../db.ts';

export async function handlePasskeyRoute(request: Request, db: D1Database, env: Env, route: string, wrap: ResponseWrapper): Promise<Response | null> {
  if (!route.startsWith('/auth/passkeys/')) return null;
  if (!passkeyOriginAllowed(request, env)) return wrap(json({ error: 'untrusted_passkey_origin' }, 403));
  return authQuery(async () => {
    const body = request.method === 'POST' ? await readJson(request) : {};
    const invalid = () => wrap(json({ error: 'passkey_verification_failed', message: 'Verify your account details, second factor, and passkey, then try again.' }, 400));
    if (route === '/auth/passkeys/login/options' && request.method === 'POST') {
      const options = await passkeyLoginOptions(db, env, body);
      return options ? wrap(json({ ok: true, ...options })) : invalid();
    }
    if (route === '/auth/passkeys/login/verify' && request.method === 'POST') {
      return verifyPasskeyLogin(request, db, env, body, wrap);
    }
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser?.sessionId) return wrap(json({ error: 'unauthorized' }, 401));
    const userId = session.authUser.id;
    const sid = session.authUser.sessionId;
    if (route === '/auth/passkeys/list' && request.method === 'GET') {
      const rows = await db.prepare('SELECT id, name, created_at, last_used_at FROM auth_passkeys WHERE user_id = ? ORDER BY created_at')
        .bind(userId).all();
      return wrap(json({ ok: true, rp_id: passkeyConfig(env).rpID, passkeys: rows.results || [] }), session.newCookies || []);
    }
    if (route === '/auth/passkeys/register/options' && request.method === 'POST') {
      const options = await registrationOptions(db, env, userId, sid, body);
      return options ? wrap(json({ ok: true, ...options }), session.newCookies || []) : invalid();
    }
    if (route === '/auth/passkeys/register/verify' && request.method === 'POST') {
      if (!(await reserveMfaAttempt(db, userId))) return invalid();
      const ok = await verifyRegistration(db, env, userId, sid, body);
      if (!ok) return invalid();
      await logActivity(db, userId, 'passkey_added', 'Passkey added', undefined, request);
      return wrap(json({ ok: true }), session.newCookies || []);
    }
    if (route === '/auth/passkeys/delete' && request.method === 'POST') {
      if (!(await reserveMfaAttempt(db, userId))) return invalid();
      const account = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
      const password = String(body.current_password || '');
      if (!password || password.length > 128 || !account || !(await verifyPassword(password, account.password_hash))) return invalid();
      const gate = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
      if (!gate) return invalid();
      const deleted = await db.prepare(`DELETE FROM auth_passkeys WHERE id = ? AND user_id = ? AND (${gate.sql})
        AND EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
          WHERE u.id = ? AND u.password_hash = ? AND s.id = ?) RETURNING id`)
        .bind(String(body.id || ''), userId, ...gate.bindings, userId, account.password_hash, sid).first();
      if (!deleted) return invalid();
      await logActivity(db, userId, 'passkey_removed', 'Passkey removed', undefined, request);
      return wrap(json({ ok: true }), session.newCookies || []);
    }
    return wrap(json({ error: 'not_found' }, 404));
  });
}
