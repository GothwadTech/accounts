/**
 * =============================================================================
 * OAUTH 2.0 PROVIDER ROUTES ("Sign in with Gothwad")
 * =============================================================================
 */

import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { oauthQuery } from '../db.ts';
import {
  apiError,
  CORE_GOTHWAD_SERVICES,
  json,
  parseJsonStringArray,
  readFormOrJson,
  readJson,
} from '../http.ts';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  getSigningSecret,
  issueOAuthAccessToken,
  OAUTH_CODE_TTL_MS,
  randomToken,
  REFRESH_TOKEN_TTL_MS,
  sha256Hex,
  verifyJwt,
} from '../crypto.ts';
import { fetchProfile, logActivity, resolveAvatarUrl } from '../users.ts';
import { resolveSession } from '../sessions.ts';
import {
  consentPageHtml,
  findOAuthClient,
  isRedirectUriAllowed,
  OAUTH_SCOPES,
  oauthCallbackUrl,
  parseScopes,
  pkceRequestError,
  verifyClientSecret,
  verifyPkce,
} from '../oauth-helpers.ts';

export async function handleOAuthRoute(
  request: Request,
  url: URL,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
  setOAuthCookies: (cookies: string[]) => void,
): Promise<Response | null> {
  if (route === '/oauth/app-info' && request.method === 'GET') {
    const clientId = url.searchParams.get('client_id') || '';
    const client = await findOAuthClient(db, clientId);
    if (!client) return withCors(apiError('Unknown OAuth client', 404));
    return withCors(
      json({
        id: client.id,
        name: client.name,
        icon: client.icon,
        is_verified: !!client.is_verified,
        scopes_supported: Object.keys(OAUTH_SCOPES),
      }),
    );
  }

  if (route === '/oauth/authorize' && request.method === 'GET') {
    const clientId = url.searchParams.get('client_id') || '';
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    const responseType = url.searchParams.get('response_type') || '';
    const scopes = parseScopes(url.searchParams.get('scope') || '');

    const client = await findOAuthClient(db, clientId);
    if (!client) return withCors(apiError('Unknown client_id', 400));
    if (responseType !== 'code') return withCors(apiError('Only response_type=code is supported', 400));
    if (!isRedirectUriAllowed(env, client, redirectUri)) {
      return withCors(apiError('redirect_uri is not registered for this app', 400));
    }
    if (scopes.length === 0) return withCors(apiError('At least one valid scope is required', 400));

    const pkceError = pkceRequestError(
      client,
      url.searchParams.get('code_challenge'),
      url.searchParams.get('code_challenge_method'),
    );
    if (pkceError) return withCors(apiError(pkceError, 400));

    const session = await oauthQuery(() => resolveSession(request, db, env));
    setOAuthCookies(session.newCookies || []);
    if (!session.ok || !session.authUser) {
      const loginUrl = `${env.AUTH_HUB_URL}/signin?choose=1&next=${encodeURIComponent(url.toString())}`;
      return withCors(new Response(null, { status: 302, headers: { Location: loginUrl } }));
    }

    const profile = await oauthQuery(() => fetchProfile(db, session.authUser!.id));
    return withCors(
      consentPageHtml(env, client, session.authUser, profile, url.searchParams, url.toString()),
      session.newCookies,
    );
  }

  if ((route === '/oauth/decision' || route === '/oauth/authorize/decision') && request.method === 'POST') {
    const session = await oauthQuery(() => resolveSession(request, db, env));
    setOAuthCookies(session.newCookies || []);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const respond = (res: Response) => withCors(res, session.newCookies);
    const body = await readJson(request);
    const approved = body.approved === true;
    const clientId = String(body.client_id || '');
    const redirectUri = String(body.redirect_uri || '');
    const state = body.state ? String(body.state) : '';
    const scopes = parseScopes(String(body.scope || ''));
    const challenge = body.code_challenge ? String(body.code_challenge) : null;
    const challengeMethod = body.code_challenge_method ? String(body.code_challenge_method) : null;

    const client = await findOAuthClient(db, clientId);
    if (!client) return respond(apiError('Unknown client_id', 400));
    if (!isRedirectUriAllowed(env, client, redirectUri)) {
      return respond(apiError('redirect_uri is not registered', 400));
    }

    if (!approved) {
      const denyUrl = oauthCallbackUrl(redirectUri, { error: 'access_denied' }, state);
      return respond(json({ redirect_url: denyUrl }));
    }

    if (scopes.length === 0) return respond(apiError('No valid scopes requested', 400));
    const pkceError = pkceRequestError(client, challenge, challengeMethod);
    if (pkceError) return respond(apiError(pkceError, 400));

    const code = randomToken();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + OAUTH_CODE_TTL_MS).toISOString();
    const scopesJson = JSON.stringify(scopes);

    await oauthQuery(() =>
      db
        .prepare(
          `INSERT INTO oauth_auth_codes (
             code, client_id, user_id, redirect_uri, scopes,
             code_challenge, code_challenge_method, expires_at, used, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(
          code,
          client.id,
          session.authUser!.id,
          redirectUri,
          scopesJson,
          challenge,
          challenge ? challengeMethod : null,
          expiresAt,
          nowIso,
        )
        .run(),
    );

    await oauthQuery(() =>
      db
        .prepare(
          `INSERT INTO app_authorizations (id, user_id, app_id, scopes, granted_at, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, app_id) DO UPDATE SET
             scopes = excluded.scopes,
             last_used_at = excluded.last_used_at`,
        )
        .bind(crypto.randomUUID(), session.authUser!.id, client.id, scopesJson, nowIso, nowIso)
        .run(),
    );

    await logActivity(
      db,
      session.authUser.id,
      'app_authorized',
      `App connected: ${client.name}`,
      `Scopes: ${scopes.join(', ')}`,
      request,
    );

    const backUrl = oauthCallbackUrl(redirectUri, { code }, state);
    return respond(json({ redirect_url: backUrl }));
  }

  if (route === '/oauth/token' && request.method === 'POST') {
    const body = await readFormOrJson(request);
    const grantType = String(body.grant_type || '');
    const clientId = String(body.client_id || '');
    const clientSecret = body.client_secret ? String(body.client_secret) : undefined;

    const client = await findOAuthClient(db, clientId);
    if (!client) {
      return withCors(json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 401));
    }
    if (!(await verifyClientSecret(client, clientSecret))) {
      return withCors(json({ error: 'invalid_client', error_description: 'Bad client_secret' }, 401));
    }

    if (grantType === 'authorization_code') {
      const code = String(body.code || '');
      const redirectUri = String(body.redirect_uri || '');
      const codeVerifier = body.code_verifier ? String(body.code_verifier) : '';

      const row = await oauthQuery(() =>
        db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ? LIMIT 1').bind(code).first(),
      );

      if (!row || row.used) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Code is invalid or already used' }, 400));
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Code expired' }, 400));
      }
      if (row.client_id !== client.id || row.redirect_uri !== redirectUri) {
        return withCors(json({ error: 'invalid_grant', error_description: 'redirect_uri or client mismatch' }, 400));
      }
      if (
        pkceRequestError(client, row.code_challenge ?? null, row.code_challenge_method ?? null) ||
        !(await verifyPkce(codeVerifier, row.code_challenge ?? null, row.code_challenge_method ?? null))
      ) {
        return withCors(json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400));
      }

      const nowIso = new Date().toISOString();
      const consumed = await oauthQuery(() =>
        db
          .prepare(
            `UPDATE oauth_auth_codes
                SET used = 1
              WHERE code = ? AND used = 0 AND expires_at > ?
              RETURNING user_id, scopes`,
          )
          .bind(code, nowIso)
          .first(),
      );
      if (!consumed) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Code is invalid or already used' }, 400));
      }

      const userId = String(consumed.user_id);
      const profile = await fetchProfile(db, userId);
      const scopes = parseJsonStringArray(consumed.scopes);
      const accessToken = await issueOAuthAccessToken(env, {
        userId,
        username: profile?.username || '',
        clientId: client.id,
        scopes,
      });

      const response: Record<string, any> = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: scopes.join(' '),
      };

      if (scopes.includes('offline_access')) {
        const rt = randomToken();
        const rtHash = await sha256Hex(rt);
        await oauthQuery(() =>
          db
            .prepare(
              `INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              rtHash,
              userId,
              client.id,
              JSON.stringify(scopes),
              new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
              nowIso,
            )
            .run(),
        );
        response.refresh_token = rt;
      }

      return withCors(json(response));
    }

    if (grantType === 'refresh_token') {
      const rt = String(body.refresh_token || '');
      const hash = await sha256Hex(rt);

      const row = await oauthQuery(() =>
        db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? LIMIT 1').bind(hash).first(),
      );

      if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' }, 400));
      }
      if (row.client_id !== client.id) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Token was issued to another app' }, 400));
      }

      const nowIso = new Date().toISOString();
      const consumed = await oauthQuery(() =>
        db
          .prepare(
            `UPDATE oauth_refresh_tokens
                SET revoked = 1
              WHERE token_hash = ? AND revoked = 0 AND expires_at > ?
              RETURNING user_id, scopes`,
          )
          .bind(hash, nowIso)
          .first(),
      );
      if (!consumed) {
        return withCors(json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' }, 400));
      }

      const userId = String(consumed.user_id);
      const scopes = parseJsonStringArray(consumed.scopes);
      const profile = await fetchProfile(db, userId);
      const accessToken = await issueOAuthAccessToken(env, {
        userId,
        username: profile?.username || '',
        clientId: client.id,
        scopes,
      });

      const newRt = randomToken();
      const newRtHash = await sha256Hex(newRt);
      await oauthQuery(() =>
        db
          .prepare(
            `INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            newRtHash,
            userId,
            client.id,
            JSON.stringify(scopes),
            new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
            nowIso,
          )
          .run(),
      );

      return withCors(
        json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          scope: scopes.join(' '),
          refresh_token: newRt,
        }),
      );
    }

    return withCors(json({ error: 'unsupported_grant_type' }, 400));
  }

  if (route === '/oauth/userinfo' && request.method === 'GET') {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return withCors(json({ error: 'invalid_token' }, 401));

    const payload = await verifyJwt(token, getSigningSecret(env));
    if (!payload || payload.token_use !== 'oauth_access') {
      return withCors(json({ error: 'invalid_token' }, 401));
    }

    const scopes: string[] = String(payload.scope || '')
      .split(' ')
      .filter(Boolean);
    const profile = await fetchProfile(db, String(payload.sub));
    if (!profile) {
      return withCors(json({ error: 'invalid_token' }, 401));
    }

    const info: Record<string, any> = { sub: payload.sub };

    if (scopes.includes('profile')) {
      info.name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      info.preferred_username = profile.username || payload.username;
      info.picture = resolveAvatarUrl(profile.avatar_url, env);
      info.updated_at = profile.updated_at || null;
    }
    if (scopes.includes('email')) {
      info.email = `${profile.username || payload.username}@${env.APP_DOMAIN}`;
      info.email_verified = true;
    }
    if (scopes.includes('drive') || scopes.includes('drive.read')) {
      info.drive = {
        used_bytes: Number(profile.storage_used_bytes || 0),
        limit_bytes: Number(profile.storage_limit_bytes || 0),
        write_access: scopes.includes('drive'),
      };
    }
    return withCors(json(info));
  }

  if (route === '/oauth/authorizations' && request.method === 'GET') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const uid = session.authUser.id;
    const [grantsOut, appsOut] = await Promise.all([
      db.prepare('SELECT * FROM app_authorizations WHERE user_id = ?').bind(uid).all(),
      db.prepare('SELECT * FROM ecosystem_apps').all(),
    ]);

    const grants = grantsOut.results || [];
    const apps = appsOut.results || [];

    const connected = grants.map((g) => {
      const app = apps.find((a) => a.id === g.app_id) || {};
      return {
        app_id: g.app_id,
        name: app.name || g.app_id,
        icon: app.icon || 'app',
        scopes: parseJsonStringArray(g.scopes),
        granted_at: g.granted_at,
        last_used_at: g.last_used_at,
        core: CORE_GOTHWAD_SERVICES.has(g.app_id),
      };
    });

    const catalog = apps.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      description: a.description,
      core: CORE_GOTHWAD_SERVICES.has(a.id) || !!a.is_core,
      homepage: a.homepage_url || null,
    }));

    return withCors(json({ ok: true, connected, apps: catalog }));
  }

  if (route === '/oauth/revoke' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const body = await readJson(request);
    const appId = String(body.app_id || '');
    if (!appId) return withCors(apiError('app_id is required'));
    if (CORE_GOTHWAD_SERVICES.has(appId)) {
      return withCors(
        apiError('Gothwad Services stay connected to your account and cannot be disconnected.', 403),
      );
    }

    const uid = session.authUser.id;
    await db.batch([
      db.prepare('DELETE FROM app_authorizations WHERE user_id = ? AND app_id = ?').bind(uid, appId),
      db
        .prepare('UPDATE oauth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND client_id = ?')
        .bind(uid, appId),
    ]);

    await logActivity(db, uid, 'app_revoked', 'App disconnected', `Access removed for ${appId}`, request);
    return withCors(json({ ok: true, message: 'App disconnected' }));
  }

  return null;
}
