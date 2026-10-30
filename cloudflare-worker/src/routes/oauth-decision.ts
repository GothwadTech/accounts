/** Consent grant, authorization code, and revocation binding commit atomically. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { apiError, json, readJson } from '../http.ts';
import { OAUTH_CODE_TTL_MS, randomToken, sha256Hex } from '../crypto.ts';
import { findOAuthClient, isRedirectUriAllowed, oauthCallbackUrl, parseScopes, pkceRequestError } from '../oauth-helpers.ts';
import { resolveSession } from '../sessions.ts';
import { logActivity } from '../users.ts';
import { oauthQuery } from '../db.ts';
export async function oauthDecision(request: Request, db: D1Database, env: Env, wrap: ResponseWrapper,
  setCookies: (cookies: string[]) => void) {
  const session = await oauthQuery(() => resolveSession(request, db, env));
  setCookies(session.newCookies || []);
  if (!session.ok || !session.authUser?.sessionId) return wrap(apiError('Please sign in first', 401));
  const respond = (response: Response) => wrap(response, session.newCookies);
  const body = await readJson(request);
  const client = await findOAuthClient(db, String(body.client_id || ''));
  const redirect = String(body.redirect_uri || '');
  const state = String(body.state || '');
  if (!client) return respond(apiError('Unknown client_id', 400));
  if (!isRedirectUriAllowed(env, client, redirect)) return respond(apiError('redirect_uri is not registered', 400));
  if (body.approved !== true) return respond(json({ redirect_url: oauthCallbackUrl(redirect, { error: 'access_denied' }, state) }));
  const scopes = parseScopes(String(body.scope || ''));
  if (!scopes.length) return respond(apiError('No valid scopes requested', 400));
  const challenge = body.code_challenge ? String(body.code_challenge) : null;
  const method = body.code_challenge_method ? String(body.code_challenge_method) : null;
  const error = pkceRequestError(client, challenge, method);
  if (error) return respond(apiError(error, 400));
  const uid = session.authUser.id;
  const sid = session.authUser.sessionId;
  const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(uid).first();
  if (!user) return respond(apiError('Please sign in first', 401));
  const code = randomToken();
  const codeHash = await sha256Hex(code);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + OAUTH_CODE_TTL_MS).toISOString();
  const scopeJson = JSON.stringify(scopes);
  const live = `EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
    WHERE u.id = ? AND u.password_hash = ? AND s.id = ?)`;
  const result = await oauthQuery(() => db.batch([
    db.prepare(`INSERT INTO app_authorizations (id, user_id, app_id, scopes, granted_at, last_used_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE (${live})
      ON CONFLICT (user_id, app_id) DO UPDATE SET scopes = excluded.scopes, last_used_at = excluded.last_used_at`)
      .bind(crypto.randomUUID(), uid, client.id, scopeJson, now, now, uid, user.password_hash, sid),
    db.prepare(`INSERT INTO oauth_auth_codes
      (code, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ? WHERE (${live}) RETURNING code`)
      .bind(code, client.id, uid, redirect, scopeJson, challenge, challenge ? method : null, expires, now, uid, user.password_hash, sid),
    db.prepare(`INSERT INTO oauth_credential_bindings
      (credential_hash, kind, user_id, client_id, grant_id, password_snapshot, expires_at)
      SELECT ?, 'code', a.user_id, a.app_id, a.id, ?, ? FROM app_authorizations a
      WHERE a.user_id = ? AND a.app_id = ? AND EXISTS (SELECT 1 FROM oauth_auth_codes WHERE code = ?)`)
      .bind(codeHash, user.password_hash, expires, uid, client.id, code),
  ]));
  if (!result[1].results?.length) return respond(apiError('Session changed; please sign in again', 401));
  await logActivity(db, uid, 'app_authorized', `App connected: ${client.name}`, `Scopes: ${scopes.join(', ')}`, request);
  return respond(json({ redirect_url: oauthCallbackUrl(redirect, { code }, state) }));
}
