/** PKCE/client-authenticated token endpoint with atomic, grant-bound credential rotation. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { json, readFormOrJson } from '../http.ts';
import { sha256Hex } from '../crypto.ts';
import { findOAuthClient, pkceRequestError, verifyClientSecret, verifyPkce } from '../oauth-helpers.ts';
import { exchangeOAuthCredential } from '../oauth-state.ts';
import { oauthQuery } from '../db.ts';
export async function oauthToken(request: Request, db: D1Database, env: Env, wrap: ResponseWrapper) {
  const body = await readFormOrJson(request);
  const client = await findOAuthClient(db, String(body.client_id || ''));
  if (!client || !(await verifyClientSecret(client, body.client_secret ? String(body.client_secret) : undefined))) {
    return wrap(json({ error: 'invalid_client', error_description: 'Invalid OAuth client credentials' }, 401));
  }
  const kind = body.grant_type === 'authorization_code' ? 'code' : body.grant_type === 'refresh_token' ? 'refresh' : null;
  if (!kind) return wrap(json({ error: 'unsupported_grant_type' }, 400));
  const raw = String(kind === 'code' ? body.code || '' : body.refresh_token || '');
  const invalid = (description: string) => wrap(json({ error: 'invalid_grant', error_description: description }, 400));
  const row = await oauthQuery(() => kind === 'code'
    ? db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ? LIMIT 1').bind(raw).first()
    : sha256Hex(raw).then(hash => db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? LIMIT 1').bind(hash).first()));
  if (!row || row.used || row.revoked || row.expires_at <= new Date().toISOString() || row.client_id !== client.id) {
    return invalid('Credential is invalid, expired, revoked, or already used');
  }
  if (kind === 'code') {
    if (row.redirect_uri !== String(body.redirect_uri || '')) return invalid('redirect_uri or client mismatch');
    if (pkceRequestError(client, row.code_challenge ?? null, row.code_challenge_method ?? null) ||
      !(await verifyPkce(String(body.code_verifier || ''), row.code_challenge ?? null, row.code_challenge_method ?? null))) {
      return invalid('PKCE verification failed');
    }
  }
  const tokens = await oauthQuery(() => exchangeOAuthCredential(db, env, kind, raw, row));
  return tokens ? wrap(json(tokens)) : invalid('Consent was revoked or the credential has already been exchanged');
}
