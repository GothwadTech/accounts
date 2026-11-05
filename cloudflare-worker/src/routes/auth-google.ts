/** Upstream Google redirects; state, PKCE, nonce and browser binding are server-owned. */
import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { b64url, randomToken, sha256Hex, verifyPassword } from '../crypto.ts';
import { getCookie, resolveSafeRedirectTarget } from '../cookies.ts';
import { json, readJson } from '../http.ts';
import { resolveSession } from '../sessions.ts';
import { authorizeActionMfa, enabledMfa } from '../mfa-proofs.ts';
import { exchangeGoogleCode, googleConfig, GOOGLE_ISSUER } from '../google-oidc.ts';
import { googleCookie, googleCookieName, googleTicket, liveGoogleSession } from '../google-proofs.ts';
import { authQuery } from '../db.ts';
import { handleGoogleFinish } from '../google-signin.ts';

const ttl = () => new Date(Date.now() + 5 * 60_000).toISOString();
const liveFlow = `EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
  WHERE u.id = auth_google_flows.user_id AND s.id = auth_google_flows.session_id
    AND u.password_hash = auth_google_flows.password_snapshot)
  AND (SELECT version FROM auth_mfa_factors WHERE user_id = auth_google_flows.user_id AND enabled = 1)
    IS auth_google_flows.factor_version`;

export async function handleGoogleRoute(request: Request, db: D1Database, env: Env,
  route: string, wrap: ResponseWrapper): Promise<Response | null> {
  if (!route.startsWith('/auth/google/')) return null;
  return authQuery(() => handleGoogleRequest(request, db, env, route, wrap));
}

async function handleGoogleRequest(request: Request, db: D1Database, env: Env,
  route: string, wrap: ResponseWrapper): Promise<Response> {
  const config = googleConfig(env);
  if (route === '/auth/google/config' && request.method === 'GET') return wrap(json({ enabled: !!config }));
  if (!config) return wrap(json({ error: 'google_unavailable', message: 'Google sign-in is not configured yet.' }, 503));
  const url = new URL(request.url);
  if (route === '/auth/google/start' && request.method === 'POST') {
    const body = await readJson(request);
    const purpose = String(body.purpose || 'auth');
    if (!['auth', 'reauth', 'link'].includes(purpose)) return wrap(json({ error: 'invalid_request' }, 400));
    let userId: string | null = null, sid: string | null = null, snapshot: string | null = null;
    let factorVersion: string | null = null;
    let authuser = 0;
    let cookies: string[] = [];
    let gate: { sql: string; bindings: unknown[] } = { sql: '1', bindings: [] };
    if (purpose !== 'auth') {
      const session = await resolveSession(request, db, env);
      if (!session.ok || !session.authUser?.sessionId) return wrap(json({ error: 'unauthorized' }, 401));
      userId = session.authUser.id; sid = session.authUser.sessionId;
      if (body.expected_user_id && body.expected_user_id !== userId) return wrap(json({ error: 'account_changed' }, 409));
      authuser = session.slot ? 'abcdef'.indexOf(session.slot) : 0;
      cookies = session.newCookies || [];
      const account = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
      if (!account) return wrap(json({ error: 'unauthorized' }, 401));
      snapshot = account.password_hash;
      factorVersion = (await enabledMfa(db, userId))?.version || null;
      const linked = await db.prepare('SELECT subject FROM auth_external_identities WHERE issuer = ? AND user_id = ?')
        .bind(GOOGLE_ISSUER, userId).first();
      if (purpose === 'reauth' && !linked) return wrap(json({ error: 'google_not_linked' }, 409));
      if (purpose === 'link') {
        const password = String(body.current_password || '');
        if (linked) return wrap(json({ error: 'google_already_linked' }, 409));
        if (!password || password.length > 128 || !(await verifyPassword(password, account.password_hash))) {
          return wrap(json({ error: 'reauthentication_required', message: 'Confirm your current password.' }, 400));
        }
        const proof = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
        if (!proof) return wrap(json({ error: 'mfa_required', message: 'Enter a fresh authenticator or recovery code.' }, 400));
        gate = proof;
      }
      // No old security proof may satisfy a new verification attempt.
      await db.prepare("UPDATE auth_google_tickets SET used_by = ? WHERE user_id = ? AND session_id = ? AND purpose = 'reauth' AND used_by IS NULL")
        .bind(randomToken(), userId, sid).run();
    }
    const state = randomToken(), browser = randomToken(), verifier = randomToken(), nonce = randomToken();
    const next = body.next ? resolveSafeRedirectTarget(String(body.next), request, env) : '';
    const saved = await db.prepare(`INSERT INTO auth_google_flows
      (state_hash, browser_hash, verifier, nonce, purpose, user_id, session_id, password_snapshot,
       factor_version, authuser, add_mode, remember_me, next_url, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (${gate.sql})
        AND (? IS NULL OR EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
          WHERE u.id = ? AND u.password_hash = ? AND s.id = ?)) RETURNING state_hash`)
      .bind(await sha256Hex(state), await sha256Hex(browser), verifier, nonce, purpose, userId, sid,
        snapshot, factorVersion, authuser, body.add === true ? 1 : 0, body.remember === false ? 0 : 1, next, ttl(),
        ...gate.bindings, userId, userId, snapshot, sid).first();
    if (!saved) return wrap(json({ error: 'verification_expired' }, 409));
    await db.batch([
      db.prepare('DELETE FROM auth_google_flows WHERE state_hash IN (SELECT state_hash FROM auth_google_flows WHERE expires_at <= ? LIMIT 100)').bind(new Date().toISOString()),
      db.prepare('DELETE FROM auth_google_tickets WHERE token_hash IN (SELECT token_hash FROM auth_google_tickets WHERE expires_at <= ? LIMIT 100)').bind(new Date().toISOString()),
    ]);
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: 'code', scope: 'openid email profile', state, nonce,
      code_challenge: b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))),
      code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return wrap(json({ ok: true, url: target.toString() }), [...cookies, googleCookie(env, 'flow', browser), googleCookie(env, 'result', 'pending')]);
  }
  if (route === '/auth/google/callback' && request.method === 'GET') {
    const failed = () => wrap(new Response(null, { status: 303,
      headers: { Location: `${config.origin}/signin/google/?error=1`, 'Referrer-Policy': 'no-referrer' } }),
      [googleCookie(env, 'flow', '', 0), googleCookie(env, 'result', 'failed')]);
    const state = url.searchParams.get('state') || '';
    const browser = getCookie(request, googleCookieName('flow')) || '';
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser) || url.searchParams.getAll('state').length !== 1) return failed();
    const marker = randomToken();
    const flow = await db.prepare(`UPDATE auth_google_flows SET used_by = ? WHERE state_hash = ?
      AND browser_hash = ? AND used_by IS NULL AND expires_at > ?
      AND (purpose = 'auth' OR (${liveFlow})) RETURNING *`)
      .bind(marker, await sha256Hex(state), await sha256Hex(browser), new Date().toISOString()).first();
    if (!flow || url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1) return failed();
    let identity;
    try { identity = await exchangeGoogleCode(env, url.searchParams.get('code') || '', flow.verifier, flow.nonce); }
    catch { return failed(); } // Never log provider tokens or authorization codes.
    if (flow.purpose === 'link') {
      try {
        const linked = await db.prepare(`INSERT INTO auth_external_identities (issuer, subject, user_id, provider_email, created_at)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM auth_google_flows WHERE state_hash = ? AND used_by = ? AND (${liveFlow}))
          RETURNING user_id`).bind(GOOGLE_ISSUER, identity.subject, flow.user_id, identity.email, new Date().toISOString(),
            flow.state_hash, marker).first();
        if (!linked) return failed();
      } catch { return failed(); } // A Google identity cannot be transferred or merged by email.
      return wrap(new Response(null, { status: 303, headers: { Location: `${config.origin}/u/${flow.authuser}/me#security` } }),
        [googleCookie(env, 'flow', '', 0)]);
    }
    if (flow.purpose === 'reauth') {
      const linked = await db.prepare('SELECT user_id FROM auth_external_identities WHERE issuer = ? AND subject = ? AND user_id = ?')
        .bind(GOOGLE_ISSUER, identity.subject, flow.user_id).first();
      if (!linked) return failed();
    }
    const ticket = randomToken();
    const stored = await db.prepare(`INSERT INTO auth_google_tickets
      (token_hash, purpose, subject, provider_email, authoritative, first_name, last_name, user_id,
       session_id, password_snapshot, factor_version, add_mode, remember_me, next_url, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM auth_google_flows WHERE state_hash = ? AND used_by = ?
        AND (purpose = 'auth' OR (${liveFlow}))) RETURNING token_hash`)
      .bind(await sha256Hex(ticket), flow.purpose, identity.subject, identity.email, identity.authoritative ? 1 : 0,
        identity.firstName, identity.lastName, flow.user_id, flow.session_id, flow.password_snapshot, flow.factor_version,
        flow.add_mode, flow.remember_me, flow.next_url, ttl(), flow.state_hash, marker).first();
    if (!stored) return failed();
    const page = flow.purpose === 'reauth' ? '/signin/google/?reauth=1' : '/signin/google/';
    return wrap(new Response(null, { status: 303, headers: { Location: config.origin + page, 'Referrer-Policy': 'no-referrer' } }),
      [googleCookie(env, 'flow', '', 0), googleCookie(env, flow.purpose === 'reauth' ? 'reauth' : 'pending', ticket, 300)]);
  }
  if (route === '/auth/google/status' && request.method === 'GET' && url.searchParams.get('reauth') === '1') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser?.sessionId) return wrap(json({ error: 'unauthorized' }, 401));
    const ticket = await googleTicket(request, db, 'reauth');
    const live = ticket && await db.prepare(`SELECT token_hash FROM auth_google_tickets WHERE token_hash = ?
      AND user_id = ? AND session_id = ? AND (${liveGoogleSession})`)
      .bind(ticket.token_hash, session.authUser.id, session.authUser.sessionId).first();
    return wrap(json({ ok: true, ready: !!live, failed: getCookie(request, googleCookieName('result')) === 'failed' }), session.newCookies || []);
  }
  return handleGoogleFinish(request, db, env, route, wrap);
}
