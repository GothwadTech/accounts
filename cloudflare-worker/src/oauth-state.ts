/** Durable OAuth credentials bound to the live consent grant and password version. */
import type { D1Database, Env } from './types.ts';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS, issueOAuthAccessToken, randomToken, sha256Hex } from './crypto.ts';
import { parseJsonStringArray } from './http.ts';

export async function currentOAuthBinding(db: D1Database, hash: string, kind: string) {
  return db.prepare(`SELECT b.*, a.scopes AS granted_scopes FROM oauth_credential_bindings b
    JOIN app_authorizations a ON a.id = b.grant_id AND a.user_id = b.user_id AND a.app_id = b.client_id
    JOIN users u ON u.id = b.user_id AND u.password_hash = b.password_snapshot
    WHERE b.credential_hash = ? AND b.kind = ? AND b.expires_at > ?`)
    .bind(hash, kind, new Date().toISOString()).first();
}
const liveBindingSql = `EXISTS (SELECT 1 FROM oauth_credential_bindings b
  JOIN app_authorizations a ON a.id = b.grant_id AND a.user_id = b.user_id AND a.app_id = b.client_id
  JOIN users u ON u.id = b.user_id AND u.password_hash = b.password_snapshot
  WHERE b.credential_hash = ? AND b.kind = ? AND b.expires_at > ? AND a.scopes = ?)`;

export async function exchangeOAuthCredential(db: D1Database, env: Env,
  kind: 'code' | 'refresh', raw: string, row: Record<string, any>) {
  const oldHash = await sha256Hex(raw);
  const binding = await currentOAuthBinding(db, oldHash, kind);
  if (!binding || binding.user_id !== row.user_id || binding.client_id !== row.client_id) return null;
  const scopes = parseJsonStringArray(row.scopes);
  const granted = parseJsonStringArray(binding.granted_scopes);
  if (!scopes.every(scope => granted.includes(scope))) return null;
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').bind(row.user_id).first();
  if (!user) return null;
  const access = await issueOAuthAccessToken(env, { userId: row.user_id, username: user.username,
    clientId: row.client_id, scopes });
  const accessHash = await sha256Hex(access);
  const refresh = scopes.includes('offline_access') ? randomToken() : null;
  const refreshHash = refresh ? await sha256Hex(refresh) : null;
  const marker = randomToken();
  const now = new Date().toISOString();
  // Consuming the binding, source credential, and issuing replacements is one D1 transaction.
  // The marker is never returned to a caller and cannot authorize a subsequent exchange.
  const table = kind === 'code' ? 'oauth_auth_codes' : 'oauth_refresh_tokens';
  const key = kind === 'code' ? 'code' : 'token_hash';
  const flag = kind === 'code' ? 'used' : 'revoked';
  const statements = [
    db.prepare(`UPDATE oauth_credential_bindings SET kind = ?
      WHERE credential_hash = ? AND kind = ? AND (${liveBindingSql})
      AND EXISTS (SELECT 1 FROM ${table} WHERE ${key} = ? AND ${flag} = 0 AND expires_at > ?) RETURNING user_id`)
      .bind(marker, oldHash, kind, oldHash, kind, now, binding.granted_scopes, kind === 'code' ? raw : oldHash, now),
    db.prepare(`UPDATE ${table} SET ${flag} = 1 WHERE ${key} = ? AND ${flag} = 0 AND expires_at > ?
      AND EXISTS (SELECT 1 FROM oauth_credential_bindings WHERE credential_hash = ? AND kind = ?)`)
      .bind(kind === 'code' ? raw : oldHash, now, oldHash, marker),
  ];
  const insertBinding = (hash: string, type: string, expiry: string) => db.prepare(`INSERT INTO oauth_credential_bindings
    (credential_hash, kind, user_id, client_id, grant_id, password_snapshot, expires_at)
    SELECT ?, ?, user_id, client_id, grant_id, password_snapshot, ? FROM oauth_credential_bindings
    WHERE credential_hash = ? AND kind = ?`)
    .bind(hash, type, expiry, oldHash, marker);
  statements.push(insertBinding(accessHash, 'access', new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString()));
  if (refreshHash) {
    const expiry = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
    statements.push(db.prepare(`INSERT INTO oauth_refresh_tokens
      (id, token_hash, user_id, client_id, scopes, expires_at, revoked, created_at)
      SELECT ?, ?, ?, ?, ?, ?, 0, ? WHERE EXISTS (
        SELECT 1 FROM oauth_credential_bindings WHERE credential_hash = ? AND kind = ?)`)
      .bind(crypto.randomUUID(), refreshHash, row.user_id, row.client_id, JSON.stringify(scopes), expiry, now, oldHash, marker));
    statements.push(insertBinding(refreshHash, 'refresh', expiry));
  }
  const result = await db.batch(statements);
  if (!result[0].results?.length) return null;
  await db.prepare(`DELETE FROM oauth_credential_bindings WHERE credential_hash IN (
    SELECT credential_hash FROM oauth_credential_bindings WHERE expires_at <= ? LIMIT 100)`).bind(now).run();
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: scopes.join(' '), ...(refresh ? { refresh_token: refresh } : {}) };
}
