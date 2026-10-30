import { oauthDecision } from './oauth-decision.ts';
import { oauthToken } from './oauth-token.ts';
import { currentOAuthBinding } from '../oauth-state.ts';
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
  readJson,
} from '../http.ts';
import {
  getSigningSecret,
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
  parseScopes,
  pkceRequestError,
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
    return oauthDecision(request, db, env, withCors, setOAuthCookies);
  }
  if (route === '/oauth/token' && request.method === 'POST') {
    return oauthToken(request, db, env, withCors);
  }

  if (route === '/oauth/userinfo' && request.method === 'GET') {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return withCors(json({ error: 'invalid_token' }, 401));

    const payload = await verifyJwt(token, getSigningSecret(env));
    if (!payload || payload.token_use !== 'oauth_access' || payload.iss !== env.AUTH_HUB_URL ||
      !payload.client_id || payload.aud !== payload.client_id || !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now() / 1000 || !Number.isFinite(payload.iat) || payload.iat > Date.now() / 1000 + 30) {
      return withCors(json({ error: 'invalid_token' }, 401));
    }

    const scopes: string[] = String(payload.scope || '')
      .split(' ')
      .filter(Boolean);
    const tokenHash = await sha256Hex(token);
    const binding = await oauthQuery(() => currentOAuthBinding(db, tokenHash, 'access'));
    if (!binding || binding.user_id !== payload.sub || binding.client_id !== payload.client_id ||
      !scopes.every(scope => parseJsonStringArray(binding.granted_scopes).includes(scope))) {
      return withCors(json({ error: 'invalid_token' }, 401));
    }
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
      db.prepare('DELETE FROM oauth_credential_bindings WHERE user_id = ? AND client_id = ?').bind(uid, appId),
      db.prepare('DELETE FROM oauth_auth_codes WHERE user_id = ? AND client_id = ?').bind(uid, appId),
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
