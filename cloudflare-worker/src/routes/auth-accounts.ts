/**
 * =============================================================================
 * MULTI-ACCOUNT & RECOVERY ROUTES — `/auth/me`, `/auth/accounts`, `/auth/switch`,
 * `/auth/accounts/:id/signout`, `/auth/forgot-password`, `/auth/reset-password`
 * =============================================================================
 */

import {
  ACCOUNT_SLOTS,
  ACCOUNTS_COOKIE_NAME,
  ACTIVE_COOKIE_NAME,
  type AccountCookieEntry,
  type D1Database,
  type Env,
  type ResponseWrapper,
  type SlotCredentials,
} from '../types.ts';
import { authQuery } from '../db.ts';
import { apiError, isValidUsername, json, readJson } from '../http.ts';
import { hashPassword, randomToken, RESET_TOKEN_TTL_MS, sha256Hex } from '../crypto.ts';
import {
  clearAllAuthCookies,
  decodeSlotCredentials,
  getCookie,
  isAccountSlot,
  makeAccountsCookie,
  makeActiveCookie,
  makeCookie,
  makeSlotSessionCookie,
  sessionCookies,
  signAccountsCookieValue,
  slotCookieName,
  verifyAccountsCookieValue,
  verifyCsrfOrigin,
} from '../cookies.ts';
import { fetchProfile, logActivity, presentUser, sendResetEmail } from '../users.ts';
import { resolveSession, rotateSessionRefreshToken } from '../sessions.ts';
import {
  inspectBrowserAccounts,
  pickMostRecentSlot,
  toPublicAccountSummary,
} from '../browser-slots.ts';

export async function handleAuthAccountsRoute(
  request: Request,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  // ----------------------------------------------------------- /auth/accounts
  if (route === '/auth/accounts' && request.method === 'GET') {
    const inspected = await inspectBrowserAccounts(request, db, env);
    if (inspected.validSlots.length === 0) {
      return withCors(
        json(
          { authenticated: false },
          401,
          clearAllAuthCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
        ),
      );
    }

    const requestedActive = getCookie(request, ACTIVE_COOKIE_NAME);
    let activeSlotInfo = inspected.validSlots.find((s) => s.slot === requestedActive);
    const cookies = [...inspected.cookiesToSet];

    if (!activeSlotInfo) {
      activeSlotInfo = pickMostRecentSlot(inspected.validSlots);
      cookies.push(makeActiveCookie(request, env, activeSlotInfo.slot));
      cookies.push(
        ...sessionCookies(request, env, {
          access_token: activeSlotInfo.creds.accessToken,
          refresh_token: activeSlotInfo.creds.refreshToken,
          session_id: activeSlotInfo.creds.sessionId,
          remember: activeSlotInfo.creds.remember,
        }),
      );
    } else if (activeSlotInfo.rotated) {
      cookies.push(
        ...sessionCookies(request, env, {
          access_token: activeSlotInfo.creds.accessToken,
          refresh_token: activeSlotInfo.creds.refreshToken,
          session_id: activeSlotInfo.creds.sessionId,
          remember: activeSlotInfo.creds.remember,
        }),
      );
    }

    return withCors(
      json(
        {
          activeId: activeSlotInfo.slot,
          accounts: inspected.validSlots.map((s) => toPublicAccountSummary(s, env)),
        },
        200,
        cookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ------------------------------------------------------------- /auth/switch
  if (route === '/auth/switch' && request.method === 'POST') {
    if (!verifyCsrfOrigin(request, env, { requireHeader: true })) {
      return withCors(json({ error: 'csrf_rejected', message: 'Cross-site request rejected' }, 403));
    }

    const body = await readJson(request);
    const targetId = String(body.id || '').trim();
    if (!isAccountSlot(targetId)) {
      return withCors(json({ error: 'invalid_account_id', message: 'Invalid account slot' }, 400));
    }

    const rawTargetCookie = getCookie(request, slotCookieName(targetId));
    const targetCreds = decodeSlotCredentials(rawTargetCookie);
    const rotated = targetCreds?.refreshToken
      ? await rotateSessionRefreshToken(db, env, targetCreds.refreshToken, targetCreds.sessionId)
      : null;

    if (!rotated) {
      const pruneCookies: string[] = [makeCookie(request, env, slotCookieName(targetId), '', 0)];
      const existingEntries = await verifyAccountsCookieValue(getCookie(request, ACCOUNTS_COOKIE_NAME), env);
      if (existingEntries) {
        const remainingEntries = existingEntries.filter((e) => e.slot !== targetId);
        if (remainingEntries.length > 0) {
          pruneCookies.push(makeAccountsCookie(request, env, await signAccountsCookieValue(remainingEntries, env)));
        } else {
          pruneCookies.push(makeCookie(request, env, ACCOUNTS_COOKIE_NAME, '', 0));
        }
      }
      return withCors(
        json(
          { error: 'account_not_signed_in' },
          409,
          pruneCookies.map((c) => ['Set-Cookie', c] as [string, string]),
        ),
      );
    }

    const nowIso = new Date().toISOString();
    const profile = await authQuery(() => fetchProfile(db, rotated.user.id));
    const newTargetCreds: SlotCredentials = {
      accessToken: rotated.access_token,
      refreshToken: rotated.refresh_token,
      sessionId: rotated.session_id || targetCreds?.sessionId || '',
      remember: targetCreds?.remember ?? true,
    };

    const inspectedOthers = await inspectBrowserAccounts(request, db, env, { excludeSlot: targetId });
    const existingEntries = await verifyAccountsCookieValue(getCookie(request, ACCOUNTS_COOKIE_NAME), env);
    const prevTargetMeta = (existingEntries || []).find((e) => e.slot === targetId);

    const nextEntries: AccountCookieEntry[] = [];
    for (const s of inspectedOthers.validSlots) {
      nextEntries.push({
        slot: s.slot,
        username: s.username,
        firstName: s.firstName,
        lastName: s.lastName,
        addedAt: s.addedAt,
        lastUsedAt: s.lastUsedAt,
      });
    }
    nextEntries.push({
      slot: targetId,
      username: String(profile?.username || rotated.user.username),
      firstName: String(profile?.first_name || prevTargetMeta?.firstName || ''),
      lastName: String(profile?.last_name || prevTargetMeta?.lastName || ''),
      addedAt: prevTargetMeta?.addedAt || nowIso,
      lastUsedAt: nowIso,
    });
    nextEntries.sort((a, b) => ACCOUNT_SLOTS.indexOf(a.slot) - ACCOUNT_SLOTS.indexOf(b.slot));

    const otherAuxCookies = inspectedOthers.cookiesToSet.filter(
      (c) => !c.startsWith(`${ACCOUNTS_COOKIE_NAME}=`),
    );
    const switchCookies: string[] = [
      ...otherAuxCookies,
      ...sessionCookies(request, env, {
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token,
        session_id: rotated.session_id,
        remember: newTargetCreds.remember,
      }),
      makeSlotSessionCookie(request, env, targetId, newTargetCreds),
      makeActiveCookie(request, env, targetId),
      makeAccountsCookie(request, env, await signAccountsCookieValue(nextEntries, env)),
    ];

    const username = String(profile?.username || rotated.user.username);
    const profileWithUsername = { ...(profile || {}), id: rotated.user.id, username };

    return withCors(
      json(
        { ok: true, activeId: targetId, user: presentUser(profileWithUsername, env) },
        200,
        switchCookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ----------------------------------------------- /auth/accounts/:id/signout
  if (route.startsWith('/auth/accounts/') && route.endsWith('/signout') && request.method === 'POST') {
    if (!verifyCsrfOrigin(request, env, { requireHeader: true })) {
      return withCors(json({ error: 'csrf_rejected', message: 'Cross-site request rejected' }, 403));
    }

    const slotParam = route.slice('/auth/accounts/'.length, -'/signout'.length);
    if (!isAccountSlot(slotParam)) {
      return withCors(json({ error: 'invalid_account_id', message: 'Invalid account slot' }, 400));
    }

    const rawTargetSlot = getCookie(request, slotCookieName(slotParam));
    const targetCreds = decodeSlotCredentials(rawTargetSlot);
    const currentActive = getCookie(request, ACTIVE_COOKIE_NAME);
    const isLegacySingleSlot =
      !targetCreds &&
      slotParam === 'a' &&
      !isAccountSlot(currentActive) &&
      (getCookie(request, 'gothwad_at') || getCookie(request, 'gothwad_rt'));

    const rtToRevoke = targetCreds?.refreshToken || (isLegacySingleSlot ? getCookie(request, 'gothwad_rt') : null);
    const sidToRevoke = targetCreds?.sessionId || (isLegacySingleSlot ? getCookie(request, 'gothwad_sid') : null);

    if (rtToRevoke) {
      const rtHash = await sha256Hex(rtToRevoke);
      await authQuery(() =>
        db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(rtHash).run(),
      );
    }
    if (sidToRevoke) {
      const sessRow = await authQuery(() =>
        db.prepare('SELECT user_id FROM user_sessions WHERE id = ? LIMIT 1').bind(sidToRevoke).first(),
      );
      await authQuery(() => db.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sidToRevoke).run());
      if (sessRow?.user_id) {
        await logActivity(db, String(sessRow.user_id), 'signout', 'Signed out', undefined, request);
      }
    }

    const remaining = await inspectBrowserAccounts(request, db, env, { excludeSlot: slotParam });
    if (remaining.validSlots.length === 0) {
      const clearList = [
        ...clearAllAuthCookies(request, env),
        makeCookie(request, env, slotCookieName(slotParam), '', 0),
      ];
      const deduped = Array.from(new Set(clearList));
      return withCors(
        json(
          { ok: true, signedOutAll: true, activeId: null, accounts: [] },
          200,
          deduped.map((c) => ['Set-Cookie', c] as [string, string]),
        ),
      );
    }

    const stillActive =
      currentActive && currentActive !== slotParam
        ? remaining.validSlots.find((s) => s.slot === currentActive)
        : undefined;
    const nextActive = stillActive || pickMostRecentSlot(remaining.validSlots);

    const nextEntries: AccountCookieEntry[] = remaining.validSlots.map((s) => ({
      slot: s.slot,
      username: s.username,
      firstName: s.firstName,
      lastName: s.lastName,
      addedAt: s.addedAt,
      lastUsedAt: s.lastUsedAt,
    }));

    const remAuxCookies = remaining.cookiesToSet.filter((c) => !c.startsWith(`${ACCOUNTS_COOKIE_NAME}=`));
    const outCookies: string[] = [
      ...remAuxCookies,
      makeCookie(request, env, slotCookieName(slotParam), '', 0),
      makeActiveCookie(request, env, nextActive.slot),
      ...sessionCookies(request, env, {
        access_token: nextActive.creds.accessToken,
        refresh_token: nextActive.creds.refreshToken,
        session_id: nextActive.creds.sessionId,
        remember: nextActive.creds.remember,
      }),
      makeAccountsCookie(request, env, await signAccountsCookieValue(nextEntries, env)),
    ];

    return withCors(
      json(
        {
          ok: true,
          signedOutAll: false,
          activeId: nextActive.slot,
          accounts: remaining.validSlots.map((s) => toPublicAccountSummary(s, env)),
        },
        200,
        outCookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ----------------------------------------------------------------- /auth/me
  if (route === '/auth/me' && request.method === 'GET') {
    const session = await resolveSession(request, db, env);
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
    const headers: [string, string][] = (session.newCookies || []).map((c) => ['Set-Cookie', c]);

    const body: Record<string, any> = {
      authenticated: true,
      user: presentUser(profileWithUsername, env),
    };
    if (session.newTokens) {
      body.access_token = session.newTokens.access_token;
      body.refresh_token = session.newTokens.refresh_token;
    } else if (session.accessToken) {
      body.access_token = session.accessToken;
    }
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
      .prepare('SELECT id, recovery_email FROM profiles WHERE username = ? LIMIT 1')
      .bind(username)
      .first();
    if (!profile?.id || !profile?.recovery_email) return genericOk();

    const rawResetToken = randomToken();
    const resetHash = await sha256Hex(rawResetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await db
      .prepare(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`,
      )
      .bind(resetHash, String(profile.id), expiresAt, new Date().toISOString())
      .run();

    const resetLink = `${env.AUTH_HUB_URL.replace(/\/+$/, '')}/signin#access_token=${rawResetToken}&type=recovery`;
    const emailed = await sendResetEmail(env, String(profile.recovery_email), resetLink);

    if (!emailed && env.DEV_MODE === 'true') {
      return withCors(
        json({
          ok: true,
          message: 'DEV_MODE: reset link below (Resend not configured).',
          dev_reset_link: resetLink,
        }),
      );
    }
    return genericOk();
  }

  // ----------------------------------------------------- /auth/reset-password
  if (route === '/auth/reset-password' && request.method === 'POST') {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const body = await readJson(request);
    const password = String(body.password || '');

    if (!token) {
      return withCors(apiError('Missing reset token. Please use the link from your email.', 401));
    }
    if (password.length < 8) return withCors(apiError('Password must be at least 8 characters'));
    if (password.length > 128) return withCors(apiError('Password must be at most 128 characters'));

    const tokenHash = await sha256Hex(token);
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
      return withCors(apiError('Reset link is invalid or expired. Please request a new one.', 400));
    }

    const userId = String(consumed.user_id);
    const newPasswordHash = await hashPassword(password);

    await db.batch([
      db
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .bind(newPasswordHash, nowIso, userId),
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId),
    ]);

    await logActivity(
      db,
      userId,
      'password_reset',
      'Password reset',
      'Password was reset using the email recovery link',
      request,
    );

    return withCors(json({ ok: true, message: 'Password updated! You can now sign in.' }));
  }

  return null;
}
