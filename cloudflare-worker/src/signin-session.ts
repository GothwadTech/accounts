/** Shared session issuance. Password and MFA gates are committed with session creation. */
import { ACCOUNT_SLOTS, type D1Database, type Env, type ResponseWrapper } from './types.ts';
import { issueSessionAccessToken, randomToken, REFRESH_TOKEN_TTL_MS, sha256Hex } from './crypto.ts';
import { json } from './http.ts';
import { buildSignInCookies, inspectBrowserAccounts } from './browser-slots.ts';
import { fetchProfile, logActivity, parseUserAgent, presentUser } from './users.ts';
import { sessionResponse } from './sso-policy.ts';
import type { SignInGate } from './mfa-proofs.ts';
import { authQuery } from './db.ts';

export async function completeSignIn(
  request: Request, db: D1Database, env: Env,
  account: { userId: string; username: string; passwordHash: string },
  options: { remember: boolean; addMode: boolean }, withCors: ResponseWrapper, gate?: SignInGate,
): Promise<Response> {
  const { remember, addMode } = options;
  const inspected = addMode ? await inspectBrowserAccounts(request, db, env) : null;
  if (inspected && inspected.validSlots.length >= ACCOUNT_SLOTS.length &&
    !inspected.validSlots.some(s => s.username.toLowerCase() === account.username.toLowerCase())) {
    return withCors(json({ error: 'max_accounts_reached',
      message: `Maximum ${ACCOUNT_SLOTS.length} accounts can stay signed in on one browser. Sign out of one first.` }, 409));
  }
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const refresh = randomToken();
  const hash = await sha256Hex(refresh);
  const ua = parseUserAgent(request.headers.get('User-Agent') || '');
  const prefix = gate?.statements || [];
  const predicate = gate?.sql || 'NOT EXISTS (SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND enabled = 1)';
  const predicateBindings = gate?.bindings || [account.userId];
  const statements = [
    ...prefix,
    db.prepare(`INSERT INTO user_sessions
      (id, user_id, device_name, browser, os, ip_address, remember_me, last_active, is_current, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?) AND (${predicate}) RETURNING id`)
      .bind(sessionId, account.userId, ua.device_name, ua.browser, ua.os,
        request.headers.get('CF-Connecting-IP') || '', remember ? 1 : 0, now, now,
        account.userId, account.passwordHash, ...predicateBindings),
    db.prepare(`INSERT INTO auth_refresh_tokens (token_hash, user_id, session_id, expires_at, revoked, created_at)
      SELECT ?, ?, ?, ?, 0, ? WHERE EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?)`)
      .bind(hash, account.userId, sessionId, new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(), now, sessionId, account.userId),
  ];
  if (gate?.version) statements.push(db.prepare(`INSERT INTO auth_mfa_sessions (session_id, user_id, factor_version)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?)`)
    .bind(sessionId, account.userId, gate.version, sessionId, account.userId));
  const results = await authQuery(() => db.batch(statements));
  if (!results[prefix.length].results?.length) {
    return withCors(json({ error: 'verification_expired', message: 'Sign-in verification expired. Please sign in again.' }, 401));
  }
  if (inspected) {
    const previous = inspected.validSlots.find(s => s.username.toLowerCase() === account.username.toLowerCase());
    if (previous?.creds.sessionId) {
      await db.prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?')
        .bind(previous.creds.sessionId, account.userId).run();
    }
  }
  const accessToken = await issueSessionAccessToken(env, { userId: account.userId, username: account.username, sessionId });
  const profile = await fetchProfile(db, account.userId);
  const slots = await buildSignInCookies(request, db, env, {
    userId: account.userId, username: account.username,
    firstName: String(profile?.first_name || ''), lastName: String(profile?.last_name || ''),
    accessToken, refreshToken: refresh, sessionId, remember, addMode, sessionCreatedAt: now,
  });
  if (!slots.ok) {
    await db.prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?').bind(sessionId, account.userId).run();
    return withCors(json({ error: slots.error, message: slots.message }, 409));
  }
  await logActivity(db, account.userId, 'signin', 'Signed in',
    gate?.method === 'passkey' ? 'Passkey verification completed' : gate ? 'Authenticator or recovery-code verification completed' : `${ua.browser} on ${ua.os || 'unknown OS'}`, request);
  return withCors(json(sessionResponse(request, env, { ok: true, activeId: slots.slot, authuser: slots.authuser, user: presentUser(profile, env),
    access_token: accessToken, refresh_token: refresh, session_id: sessionId }), 200,
    slots.cookies.map(c => ['Set-Cookie', c] as [string, string])));
}
