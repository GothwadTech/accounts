import { sessionResponse } from '../sso-policy.ts';
/**
 * =============================================================================
 * AUTH CREDENTIAL LIFECYCLE ROUTES — `/auth/signin`, `/auth/signout`, `/auth/refresh`
 * =============================================================================
 */

import {
  ACCOUNT_SLOTS,
  ACTIVE_COOKIE_NAME,
  type D1Database,
  type Env,
  type ResponseWrapper,
} from '../types.ts';
import { apiError, identifierLooksLikePhone, json, readJson } from '../http.ts';
import {
  sha256Hex,
  verifyPassword,
} from '../crypto.ts';
import {
  clearAllAuthCookies,
  decodeSlotCredentials,
  getCookie,
  isAccountSlot,
  makeSlotSessionCookie,
  refererHasQueryParam,
  sessionCookies,
  slotCookieName,
} from '../cookies.ts';
import { logActivity, lookupAccount } from '../users.ts';
import { resolveSession, rotateSessionRefreshToken } from '../sessions.ts';
import { beginMfaSignIn } from '../mfa-login.ts';
import { completeSignIn } from '../signin-session.ts';

export async function handleAuthSessionRoute(
  request: Request,
  url: URL,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  // ------------------------------------------------------------- /auth/signin
  if (route === '/auth/signin' && request.method === 'POST') {
    const body = await readJson(request);
    const rawIdentifier = String(body.identifier || '').trim();
    const password = String(body.password || '');
    const remember = body.remember !== false;
    const addMode =
      url.searchParams.get('add') === '1' ||
      body.add === true ||
      refererHasQueryParam(request, 'add', '1');

    if (password.length > 128 || rawIdentifier.length > 254) return withCors(apiError('Sign-in input is too long', 400));
    if (!rawIdentifier || !password) {
      return withCors(apiError('Username, email or phone and password are required'));
    }

    const appDomain = (env.APP_DOMAIN || 'gothwadtech.com').toLowerCase();
    if (
      !identifierLooksLikePhone(rawIdentifier) &&
      rawIdentifier.includes('@') &&
      !rawIdentifier.toLowerCase().endsWith(`@${appDomain}`)
    ) {
      return withCors(apiError(`Only @${appDomain} suffix is allowed.`, 400));
    }

    const found = await lookupAccount(db, rawIdentifier);
    if (!found.exists) {
      const msg =
        found.kind === 'phone'
          ? "This phone number isn't registered with Gothwad Accounts."
          : "This username doesn't exist. Check the spelling, or create a new account.";
      return withCors(apiError(msg, 404));
    }

    const validPassword = await verifyPassword(password, found.passwordHash);
    if (!validPassword) {
      return withCors(apiError('Incorrect password. Try again or use Forgot password.', 401));
    }

    const challenge = await beginMfaSignIn(db, found, { remember, addMode });
    if (challenge) return withCors(challenge);
    return completeSignIn(request, db, env, found, { remember, addMode }, withCors);
  }

  // ------------------------------------------------------------ /auth/signout
  if (route === '/auth/signout' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    const body = await readJson(request);
    const sessionIdsToDelete = new Set<string>();
    const refreshTokensToRevoke = new Set<string>();

    const explicitSid =
      String(body.session_id || '') ||
      session.authUser?.sessionId ||
      getCookie(request, 'gothwad_sid');
    if (explicitSid) sessionIdsToDelete.add(explicitSid);

    const explicitRt =
      (request.headers.get('X-Gothwad-Refresh') || '').trim() || getCookie(request, 'gothwad_rt');
    if (explicitRt) refreshTokensToRevoke.add(explicitRt);

    for (const slot of ACCOUNT_SLOTS) {
      const creds = decodeSlotCredentials(getCookie(request, slotCookieName(slot)));
      if (creds?.refreshToken) refreshTokensToRevoke.add(creds.refreshToken);
      if (creds?.sessionId) sessionIdsToDelete.add(creds.sessionId);
    }

    for (const rt of refreshTokensToRevoke) {
      const refreshHash = await sha256Hex(rt);
      await db
        .prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?')
        .bind(refreshHash)
        .run()
        .catch(() => undefined);
    }

    for (const sid of sessionIdsToDelete) {
      await db
        .prepare('DELETE FROM user_sessions WHERE id = ?')
        .bind(sid)
        .run()
        .catch(() => undefined);
    }

    if (session.ok && session.authUser) {
      await logActivity(db, session.authUser.id, 'signout', 'Signed out', undefined, request);
    }

    return withCors(
      json(
        { ok: true, message: 'Signed out' },
        200,
        clearAllAuthCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ------------------------------------------------------------ /auth/refresh
  if (route === '/auth/refresh' && request.method === 'POST') {
    const body = await readJson(request);
    const activeSlot = getCookie(request, ACTIVE_COOKIE_NAME);
    const activeSlotCreds = isAccountSlot(activeSlot)
      ? decodeSlotCredentials(getCookie(request, slotCookieName(activeSlot)))
      : null;
    const refresh =
      (request.headers.get('X-Gothwad-Refresh') || '').trim() ||
      String(body.refresh_token || '').trim() ||
      activeSlotCreds?.refreshToken ||
      getCookie(request, 'gothwad_rt') ||
      '';
    if (!refresh) return withCors(apiError('Missing refresh token', 401));

    const fallbackSid =
      String(body.session_id || '') || activeSlotCreds?.sessionId || getCookie(request, 'gothwad_sid');
    const rotated = await rotateSessionRefreshToken(db, env, refresh, fallbackSid);
    if (!rotated) {
      return withCors(apiError('Session expired, please sign in again', 401));
    }

    const outCookies = sessionCookies(request, env, {
      access_token: rotated.access_token,
      refresh_token: rotated.refresh_token,
      session_id: rotated.session_id,
      remember: activeSlotCreds?.remember ?? true,
    });
    if (isAccountSlot(activeSlot)) {
      outCookies.push(
        makeSlotSessionCookie(request, env, activeSlot, {
          accessToken: rotated.access_token,
          refreshToken: rotated.refresh_token,
          sessionId: rotated.session_id || activeSlotCreds?.sessionId || '',
          remember: activeSlotCreds?.remember ?? true,
        }),
      );
    }
    const headers: [string, string][] = outCookies.map((c) => ['Set-Cookie', c]);

    return withCors(
      json(
        sessionResponse(request, env, {
          ok: true,
          access_token: rotated.access_token,
          refresh_token: rotated.refresh_token,
          session_id: rotated.session_id || undefined,
        }),
        200,
        headers,
      ),
    );
  }

  return null;
}
