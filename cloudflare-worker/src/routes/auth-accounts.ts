/**
 * =============================================================================
 * IDENTITY BOOTSTRAP & PASSWORD RECOVERY ROUTES
 *   - `GET  /auth/me`               -> Single-call user + `authuser` + `accounts`
 *   - `POST /auth/forgot-password`  -> Recovery email dispatch
 *   - `POST /auth/reset-password`   -> Password update + full session revocation
 * =============================================================================
 */

import type { D1Database, Env, ResponseWrapper } from '../types.ts';
import { authQuery } from '../db.ts';
import { apiError, isValidUsername, json, readJson } from '../http.ts';
import { hashPassword, randomToken, RESET_TOKEN_TTL_MS, sha256Hex } from '../crypto.ts';
import { clearAllAuthCookies } from '../cookies.ts';
import { fetchProfile, logActivity, presentUser, sendResetEmail } from '../users.ts';
import { resolveSession } from '../sessions.ts';
import { inspectBrowserAccounts, toPublicAccountSummary } from '../browser-slots.ts';

export async function handleAuthAccountsRoute(
  request: Request,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  // ----------------------------------------------------------------- /auth/me
  if (route === '/auth/me' && request.method === 'GET') {
    const inspected = await inspectBrowserAccounts(request, db, env);
    const session = await resolveSession(request, db, env, inspected);
    if (!session.ok || !session.authUser) {
      return withCors(
        json(
          { authenticated: false },
          401,
          clearAllAuthCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
        ),
      );
    }

    const profile = await authQuery(() => fetchProfile(db, session.authUser!.id));
    const username = profile?.username || session.authUser.username;
    if (!username) {
      return withCors(
        json({ error: 'profile_unavailable', message: 'Account username is missing. Contact support.' }, 503),
      );
    }
    const profileWithUsername = { ...(profile || {}), id: session.authUser.id, username };
    const cookieSet = new Set<string>(session.newCookies || []);

    // Bundle live multi-account switcher metadata right inside `/auth/me` so `/u/<n>/me`
    // boots with 1 single request instead of 2 sequential D1 calls!
    for (const c of inspected.cookiesToSet) cookieSet.add(c);

    const resolvedSlot =
      (session.slot && inspected.validSlots.find((s) => s.slot === session.slot)) ||
      inspected.validSlots.find((s) => s.userId === session.authUser!.id);
    const authuser = resolvedSlot ? Math.max(0, inspected.validSlots.indexOf(resolvedSlot)) : 0;

    const body: Record<string, any> = {
      authenticated: true,
      user: presentUser(profileWithUsername, env),
      activeId: resolvedSlot?.slot || session.slot || null,
      authuser,
      accounts: inspected.validSlots.map((s, idx) => toPublicAccountSummary(s, env, idx)),
    };
    if (session.newTokens) {
      body.access_token = session.newTokens.access_token;
      body.refresh_token = session.newTokens.refresh_token;
    } else if (session.accessToken) {
      body.access_token = session.accessToken;
    }

    const headers: [string, string][] = Array.from(cookieSet).map((c) => ['Set-Cookie', c]);
    return withCors(json(body, 200, headers));
  }

  // ---------------------------------------------------- /auth/forgot-password
  if (route === '/auth/forgot-password' && request.method === 'POST') {
    const body = await readJson(request);
    const username = String(body.username || '').toLowerCase().trim();
    const genericOk = () =>
      withCors(
        json({
          ok: true,
          message: 'If that account exists, a reset link has been sent to its recovery email.',
        }),
      );

    if (!isValidUsername(username)) return genericOk();

    const profile = await db
      .prepare('SELECT id, username, first_name, recovery_email FROM profiles WHERE username = ? LIMIT 1')
      .bind(username)
      .first();
    if (!profile?.recovery_email) return genericOk();

    const rawReset = randomToken();
    const tokenHash = await sha256Hex(rawReset);
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await db
      .prepare(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`,
      )
      .bind(tokenHash, profile.id, expiresAt, nowIso)
      .run();

    const hubBase = (env.AUTH_HUB_URL || `https://accounts.${env.APP_DOMAIN}`).replace(/\/+$/, '');
    const resetLink = `${hubBase}/signin/#type=recovery&access_token=${encodeURIComponent(rawReset)}`;
    const sent = await sendResetEmail(env, String(profile.recovery_email), resetLink);

    const responsePayload: Record<string, any> = {
      ok: true,
      message: 'If that account exists, a reset link has been sent to its recovery email.',
    };
    if (env.DEV_MODE === 'true' && !sent) {
      responsePayload.dev_reset_link = resetLink;
      responsePayload.dev_reset_token = rawReset;
    }
    return withCors(json(responsePayload));
  }

  // ----------------------------------------------------- /auth/reset-password
  if (route === '/auth/reset-password' && request.method === 'POST') {
    const body = await readJson(request);
    const authHeader = request.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const rawToken = String(bearerToken || body.token || body.reset_token || '').trim();
    const newPassword = String(body.password || '');

    if (!rawToken) return withCors(apiError('Reset token is required'));
    if (newPassword.length < 8) return withCors(apiError('Password must be at least 8 characters'));
    if (newPassword.length > 128) return withCors(apiError('Password must be at most 128 characters'));

    const tokenHash = await sha256Hex(rawToken);
    const nowIso = new Date().toISOString();

    const consumed = await db
      .prepare(
        `UPDATE password_reset_tokens
            SET used = 1
          WHERE token_hash = ? AND used = 0 AND expires_at > ?
          RETURNING user_id`,
      )
      .bind(tokenHash, nowIso)
      .first();

    if (!consumed?.user_id) {
      return withCors(apiError('Reset link is invalid or has expired.', 400));
    }

    const userId = String(consumed.user_id);
    const newHash = await hashPassword(newPassword);

    await db.batch([
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(newHash, nowIso, userId),
      db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId),
    ]);

    await logActivity(
      db,
      userId,
      'password_reset',
      'Password reset via recovery email',
      'All active sessions were signed out',
      request,
    );

    return withCors(json({ ok: true, message: 'Password updated. You can now sign in.' }));
  }

  return null;
}
