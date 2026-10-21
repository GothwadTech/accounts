/**
 * =============================================================================
 * GOOGLE-GRADE MULTI-ACCOUNT SWITCHER ROUTES
 *   - `GET  /auth/accounts`              -> Ordered `accounts` (`authuser: 0..5`)
 *   - `POST /auth/switch`                -> Switch by `{ id }` OR `{ authuser }`
 *   - `GET  /auth/switch?authuser=&next=`-> First-party top-level cross-app jump
 *   - `POST /auth/accounts/:id/signout`  -> Single-slot signout without wiping all
 * =============================================================================
 */

import {
  ACCOUNTS_COOKIE_NAME,
  ACTIVE_COOKIE_NAME,
  type AccountCookieEntry,
  type AccountSlot,
  type D1Database,
  type Env,
  type ResponseWrapper,
  type SlotCredentials,
  type VerifiedBrowserSlot,
} from '../types.ts';
import { authQuery } from '../db.ts';
import { json, readJson } from '../http.ts';
import { issueSessionAccessToken, sha256Hex } from '../crypto.ts';
import {
  clearAllAuthCookies,
  decodeSlotCredentials,
  getCookie,
  isAccountSlot,
  makeAccountsCookie,
  makeActiveCookie,
  makeCookie,
  makeSlotSessionCookie,
  resolveSafeRedirectTarget,
  sessionCookies,
  signAccountsCookieValue,
  slotCookieName,
  verifyAccountsCookieValue,
  verifyCsrfOrigin,
} from '../cookies.ts';
import { fetchProfile, logActivity, presentUser } from '../users.ts';
import { rotateSessionRefreshToken, validateCredentialsAgainstDb } from '../sessions.ts';
import {
  inspectBrowserAccounts,
  pickMostRecentSlot,
  selectSlotBySelector,
  toPublicAccountSummary,
} from '../browser-slots.ts';

async function activateBrowserSlot(
  request: Request,
  db: D1Database,
  env: Env,
  targetId: AccountSlot,
): Promise<
  | {
      ok: true;
      activeId: AccountSlot;
      authuser: number;
      user: Record<string, any>;
      accounts: ReturnType<typeof toPublicAccountSummary>[];
      cookies: string[];
    }
  | { ok: false; pruneCookies: string[] }
> {
  const rawTargetCookie = getCookie(request, slotCookieName(targetId));
  const targetCreds = decodeSlotCredentials(rawTargetCookie);
  if (!targetCreds) {
    return {
      ok: false,
      pruneCookies: [makeCookie(request, env, slotCookieName(targetId), '', 0)],
    };
  }

  // Prefer atomic refresh rotation when available; if another tab JUST rotated the slot's
  // refresh token in parallel, fall back to live `validateCredentialsAgainstDb` (`cookieSlot: true`)
  // so valid signed-in accounts NEVER fail with false `409 account_not_signed_in`!
  const rotated = targetCreds.refreshToken
    ? await rotateSessionRefreshToken(db, env, targetCreds.refreshToken, targetCreds.sessionId)
    : null;
  const fallbackValid = rotated
    ? null
    : await validateCredentialsAgainstDb(db, env, { ...targetCreds, cookieSlot: true });

  const resolvedUser = rotated?.user || fallbackValid?.authUser;
  if (!resolvedUser) {
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
    return { ok: false, pruneCookies };
  }

  const nowIso = new Date().toISOString();
  const profile = await authQuery(() => fetchProfile(db, resolvedUser.id));
  const freshAccess =
    rotated?.access_token ||
    fallbackValid?.accessToken ||
    (await issueSessionAccessToken(env, {
      userId: resolvedUser.id,
      username: resolvedUser.username,
      sessionId: resolvedUser.sessionId,
    }));

  const newTargetCreds: SlotCredentials = {
    accessToken: freshAccess,
    refreshToken: rotated?.refresh_token || targetCreds.refreshToken,
    sessionId: rotated?.session_id || resolvedUser.sessionId || targetCreds.sessionId || '',
    remember: targetCreds.remember ?? true,
  };

  const inspectedOthers = await inspectBrowserAccounts(request, db, env, { excludeSlot: targetId });
  const existingEntries = await verifyAccountsCookieValue(getCookie(request, ACCOUNTS_COOKIE_NAME), env);
  const prevOrder = new Map<AccountSlot, number>();
  (existingEntries || []).forEach((e, idx) => prevOrder.set(e.slot, idx));
  const prevTargetMeta = (existingEntries || []).find((e) => e.slot === targetId);

  const username = String(profile?.username || resolvedUser.username);
  const targetSlotObj: VerifiedBrowserSlot = {
    slot: targetId,
    userId: resolvedUser.id,
    username,
    firstName: String(profile?.first_name || prevTargetMeta?.firstName || ''),
    lastName: String(profile?.last_name || prevTargetMeta?.lastName || ''),
    avatarUrl: profile?.avatar_url ? String(profile.avatar_url) : null,
    addedAt: prevTargetMeta?.addedAt || nowIso,
    lastUsedAt: nowIso,
    creds: newTargetCreds,
    rotated: true,
  };

  // Preserve stable Google-style session order (`0, 1, 2...`) across switches so `/u/0` and `/u/1`
  // never swap positions unexpectedly!
  const allValidSlots: VerifiedBrowserSlot[] = [...inspectedOthers.validSlots, targetSlotObj].sort(
    (a, b) => {
      const ia = prevOrder.get(a.slot);
      const ib = prevOrder.get(b.slot);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.slot.localeCompare(b.slot);
    },
  );

  const nextEntries: AccountCookieEntry[] = allValidSlots.map((s) => ({
    slot: s.slot,
    username: s.username,
    firstName: s.firstName,
    lastName: s.lastName,
    addedAt: s.addedAt,
    lastUsedAt: s.lastUsedAt,
  }));

  const otherAuxCookies = inspectedOthers.cookiesToSet.filter(
    (c) => !c.startsWith(`${ACCOUNTS_COOKIE_NAME}=`),
  );
  const cookies: string[] = [
    ...otherAuxCookies,
    ...sessionCookies(request, env, {
      access_token: newTargetCreds.accessToken,
      refresh_token: newTargetCreds.refreshToken,
      session_id: newTargetCreds.sessionId,
      remember: newTargetCreds.remember,
    }),
    makeSlotSessionCookie(request, env, targetId, newTargetCreds),
    makeActiveCookie(request, env, targetId),
    makeAccountsCookie(request, env, await signAccountsCookieValue(nextEntries, env)),
  ];

  const authuser = Math.max(
    0,
    allValidSlots.findIndex((s) => s.slot === targetId),
  );
  const profileWithUsername = { ...(profile || {}), id: resolvedUser.id, username };

  return {
    ok: true,
    activeId: targetId,
    authuser,
    user: presentUser(profileWithUsername, env) || {},
    accounts: allValidSlots.map((s, idx) => toPublicAccountSummary(s, env, idx)),
    cookies,
  };
}

export async function handleAuthSwitchRoute(
  request: Request,
  url: URL,
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

    const authuser = Math.max(0, inspected.validSlots.indexOf(activeSlotInfo));
    return withCors(
      json(
        {
          activeId: activeSlotInfo.slot,
          authuser,
          accounts: inspected.validSlots.map((s, idx) => toPublicAccountSummary(s, env, idx)),
        },
        200,
        cookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // -------------------------- GET /auth/switch?authuser=<n>&next=<trustedUrl>
  if (route === '/auth/switch' && request.method === 'GET') {
    const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
    if (secFetchSite === 'cross-site') {
      return withCors(json({ error: 'csrf_rejected', message: 'Cross-site navigation rejected' }, 403));
    }

    const selector = (
      url.searchParams.get('authuser') ??
      url.searchParams.get('u') ??
      url.searchParams.get('id') ??
      ''
    ).trim();
    const safeDest = resolveSafeRedirectTarget(url.searchParams.get('next'), request, env);
    if (!selector) {
      return Response.redirect(safeDest, 302);
    }

    const inspected = await inspectBrowserAccounts(request, db, env);
    const chosen = selectSlotBySelector(inspected.validSlots, selector, env);
    if (!chosen) {
      const signinUrl = new URL(`${(env.AUTH_HUB_URL || url.origin).replace(/\/+$/, '')}/signin`);
      signinUrl.searchParams.set('choose', '1');
      signinUrl.searchParams.set('next', safeDest);
      return Response.redirect(signinUrl.toString(), 302);
    }

    const switched = await activateBrowserSlot(request, db, env, chosen.slot);
    if (!switched.ok) {
      const signinUrl = new URL(`${(env.AUTH_HUB_URL || url.origin).replace(/\/+$/, '')}/signin`);
      signinUrl.searchParams.set('next', safeDest);
      return Response.redirect(signinUrl.toString(), 302);
    }

    const headers = new Headers({ Location: safeDest, 'Cache-Control': 'no-store' });
    for (const c of switched.cookies) headers.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers });
  }

  // ------------------------------------------------------- POST /auth/switch
  if (route === '/auth/switch' && request.method === 'POST') {
    if (!verifyCsrfOrigin(request, env, { requireHeader: true })) {
      return withCors(json({ error: 'csrf_rejected', message: 'Cross-site request rejected' }, 403));
    }

    const body = await readJson(request);
    let targetId: AccountSlot | null = null;

    if (body.id !== undefined && body.id !== null && String(body.id).trim() !== '') {
      const candidate = String(body.id).trim();
      if (!isAccountSlot(candidate)) {
        return withCors(json({ error: 'invalid_account_id', message: 'Invalid account slot' }, 400));
      }
      targetId = candidate;
    } else if (body.authuser !== undefined && body.authuser !== null && String(body.authuser).trim() !== '') {
      const inspected = await inspectBrowserAccounts(request, db, env);
      const found = selectSlotBySelector(inspected.validSlots, String(body.authuser), env);
      if (!found) {
        return withCors(json({ error: 'account_not_signed_in' }, 409));
      }
      targetId = found.slot;
    } else {
      return withCors(json({ error: 'invalid_account_id', message: 'Invalid account slot' }, 400));
    }

    const switched = await activateBrowserSlot(request, db, env, targetId);
    if (!switched.ok) {
      return withCors(
        json(
          { error: 'account_not_signed_in' },
          409,
          switched.pruneCookies.map((c) => ['Set-Cookie', c] as [string, string]),
        ),
      );
    }

    return withCors(
      json(
        {
          ok: true,
          activeId: switched.activeId,
          authuser: switched.authuser,
          user: switched.user,
          accounts: switched.accounts,
        },
        200,
        switched.cookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ----------------------------------------- POST /auth/accounts/:id/signout
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
      await authQuery(() =>
        db.batch([
          db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE session_id = ?').bind(sidToRevoke),
          db.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sidToRevoke),
        ]),
      );
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
          { ok: true, signedOutAll: true, activeId: null, authuser: null, accounts: [] },
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
    const authuser = Math.max(0, remaining.validSlots.indexOf(nextActive));

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
          authuser,
          accounts: remaining.validSlots.map((s, idx) => toPublicAccountSummary(s, env, idx)),
        },
        200,
        outCookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  return null;
}
