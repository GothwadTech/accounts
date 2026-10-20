/**
 * =============================================================================
 * BROWSER MULTI-ACCOUNT SLOTS (`a`..`f`) — Inspection, Legacy Promotion & Sign-In
 * =============================================================================
 */

import {
  ACCOUNT_SLOTS,
  ACCOUNTS_COOKIE_NAME,
  type AccountCookieEntry,
  type AccountSlot,
  type D1Database,
  type Env,
  type PublicAccountSummary,
  type SlotCredentials,
  type VerifiedBrowserSlot,
} from './types.ts';
import { authQuery } from './db.ts';
import {
  decodeSlotCredentials,
  getCookie,
  makeAccountsCookie,
  makeActiveCookie,
  makeCookie,
  makeSlotSessionCookie,
  sessionCookies,
  signAccountsCookieValue,
  slotCookieName,
  verifyAccountsCookieValue,
} from './cookies.ts';
import { fetchProfile } from './users.ts';
import { validateCredentialsAgainstDb } from './sessions.ts';

export async function inspectBrowserAccounts(
  request: Request,
  db: D1Database,
  env: Env,
  opts: { excludeSlot?: AccountSlot } = {},
): Promise<{
  validSlots: VerifiedBrowserSlot[];
  cookiesToSet: string[];
  hadValidAccountsCookie: boolean;
}> {
  const parsedEntries = await verifyAccountsCookieValue(getCookie(request, ACCOUNTS_COOKIE_NAME), env);
  const hadValidAccountsCookie = parsedEntries !== null;
  const entryMap = new Map<AccountSlot, AccountCookieEntry>();
  const orderedCandidates: AccountSlot[] = [];

  for (const entry of parsedEntries || []) {
    entryMap.set(entry.slot, entry);
    orderedCandidates.push(entry.slot);
  }
  for (const slot of ACCOUNT_SLOTS) {
    if (!entryMap.has(slot) && getCookie(request, slotCookieName(slot)) !== null) {
      orderedCandidates.push(slot);
    }
  }

  const validSlots: VerifiedBrowserSlot[] = [];
  const cookiesToSet: string[] = [];
  let droppedAnySlot = false;
  const nowIso = new Date().toISOString();

  for (const slot of orderedCandidates) {
    if (opts.excludeSlot === slot) continue;
    const rawSlotCookie = getCookie(request, slotCookieName(slot));
    const slotCreds = decodeSlotCredentials(rawSlotCookie);
    if (!slotCreds) {
      droppedAnySlot = true;
      if (rawSlotCookie !== null) {
        cookiesToSet.push(makeCookie(request, env, slotCookieName(slot), '', 0));
      }
      continue;
    }

    const check = await validateCredentialsAgainstDb(db, env, slotCreds);
    if (!check.ok || !check.authUser) {
      droppedAnySlot = true;
      cookiesToSet.push(makeCookie(request, env, slotCookieName(slot), '', 0));
      continue;
    }

    const profile = await authQuery(() => fetchProfile(db, check.authUser!.id));
    const prevMeta = entryMap.get(slot);
    const updatedCreds: SlotCredentials = check.rotated
      ? {
          accessToken: check.rotated.access_token,
          refreshToken: check.rotated.refresh_token,
          sessionId: check.rotated.session_id || slotCreds.sessionId,
          remember: slotCreds.remember,
        }
      : {
          accessToken: check.accessToken || slotCreds.accessToken,
          refreshToken: slotCreds.refreshToken,
          sessionId: check.authUser.sessionId || slotCreds.sessionId,
          remember: slotCreds.remember,
        };

    if (check.rotated) {
      cookiesToSet.push(makeSlotSessionCookie(request, env, slot, updatedCreds));
    }

    validSlots.push({
      slot,
      userId: check.authUser.id,
      username: String(profile?.username || check.authUser.username),
      firstName: String(profile?.first_name || prevMeta?.firstName || ''),
      lastName: String(profile?.last_name || prevMeta?.lastName || ''),
      addedAt: prevMeta?.addedAt || nowIso,
      lastUsedAt: prevMeta?.lastUsedAt || nowIso,
      creds: updatedCreds,
      rotated: !!check.rotated,
    });
  }

  if (validSlots.length === 0 && opts.excludeSlot !== 'a') {
    const legacyAt = getCookie(request, 'gothwad_at');
    const legacyRt = getCookie(request, 'gothwad_rt');
    const legacySid = getCookie(request, 'gothwad_sid');
    if (legacyAt || legacyRt) {
      const legacyCheck = await validateCredentialsAgainstDb(db, env, {
        accessToken: legacyAt,
        refreshToken: legacyRt,
        sessionId: legacySid,
        remember: true,
      });
      if (legacyCheck.ok && legacyCheck.authUser) {
        const profile = await authQuery(() => fetchProfile(db, legacyCheck.authUser!.id));
        const promotedCreds: SlotCredentials = legacyCheck.rotated
          ? {
              accessToken: legacyCheck.rotated.access_token,
              refreshToken: legacyCheck.rotated.refresh_token,
              sessionId: legacyCheck.rotated.session_id || legacySid || '',
              remember: true,
            }
          : {
              accessToken: legacyCheck.accessToken || legacyAt || '',
              refreshToken: legacyRt || '',
              sessionId: legacyCheck.authUser.sessionId || legacySid || '',
              remember: true,
            };
        cookiesToSet.push(makeSlotSessionCookie(request, env, 'a', promotedCreds));
        if (legacyCheck.rotated) {
          cookiesToSet.push(
            ...sessionCookies(request, env, {
              access_token: promotedCreds.accessToken,
              refresh_token: promotedCreds.refreshToken,
              session_id: promotedCreds.sessionId,
              remember: true,
            }),
          );
        }
        validSlots.push({
          slot: 'a',
          userId: legacyCheck.authUser.id,
          username: String(profile?.username || legacyCheck.authUser.username),
          firstName: String(profile?.first_name || ''),
          lastName: String(profile?.last_name || ''),
          addedAt: nowIso,
          lastUsedAt: nowIso,
          creds: promotedCreds,
          rotated: !!legacyCheck.rotated,
        });
        droppedAnySlot = true;
      }
    }
  }

  if ((!hadValidAccountsCookie || droppedAnySlot) && validSlots.length > 0) {
    const entries: AccountCookieEntry[] = validSlots.map((s) => ({
      slot: s.slot,
      username: s.username,
      firstName: s.firstName,
      lastName: s.lastName,
      addedAt: s.addedAt,
      lastUsedAt: s.lastUsedAt,
    }));
    cookiesToSet.push(makeAccountsCookie(request, env, await signAccountsCookieValue(entries, env)));
  }

  return { validSlots, cookiesToSet, hadValidAccountsCookie };
}

export function toPublicAccountSummary(slotInfo: VerifiedBrowserSlot, env: Env): PublicAccountSummary {
  return {
    id: slotInfo.slot,
    username: slotInfo.username,
    firstName: slotInfo.firstName,
    lastName: slotInfo.lastName,
    email: `${slotInfo.username}@${env.APP_DOMAIN}`,
    lastUsedAt: slotInfo.lastUsedAt,
  };
}

export function pickMostRecentSlot(slots: VerifiedBrowserSlot[]): VerifiedBrowserSlot {
  return slots.reduce((best, cur) =>
    new Date(cur.lastUsedAt).getTime() > new Date(best.lastUsedAt).getTime() ? cur : best,
  );
}

export async function buildSignInCookies(
  request: Request,
  db: D1Database,
  env: Env,
  opts: {
    userId: string;
    username: string;
    firstName: string;
    lastName: string;
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    remember: boolean;
    addMode: boolean;
  },
): Promise<{ ok: true; slot: AccountSlot; cookies: string[] } | { ok: false; error: string; message: string }> {
  const nowIso = new Date().toISOString();
  const newCreds: SlotCredentials = {
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken,
    sessionId: opts.sessionId,
    remember: opts.remember,
  };

  if (!opts.addMode) {
    const cookies: string[] = [
      ...sessionCookies(request, env, {
        access_token: opts.accessToken,
        refresh_token: opts.refreshToken,
        session_id: opts.sessionId,
        remember: opts.remember,
      }),
      makeSlotSessionCookie(request, env, 'a', newCreds),
      makeActiveCookie(request, env, 'a'),
    ];
    for (const slot of ACCOUNT_SLOTS) {
      if (slot !== 'a' && getCookie(request, slotCookieName(slot)) !== null) {
        cookies.push(makeCookie(request, env, slotCookieName(slot), '', 0));
      }
    }
    const entries: AccountCookieEntry[] = [
      {
        slot: 'a',
        username: opts.username,
        firstName: opts.firstName,
        lastName: opts.lastName,
        addedAt: nowIso,
        lastUsedAt: nowIso,
      },
    ];
    cookies.push(makeAccountsCookie(request, env, await signAccountsCookieValue(entries, env)));
    return { ok: true, slot: 'a', cookies };
  }

  const inspected = await inspectBrowserAccounts(request, db, env);
  const existingForSameUser = inspected.validSlots.find(
    (s) => s.username.toLowerCase() === opts.username.toLowerCase(),
  );

  let targetSlot: AccountSlot | undefined = existingForSameUser?.slot;
  if (!targetSlot) {
    const used = new Set<AccountSlot>(inspected.validSlots.map((s) => s.slot));
    targetSlot = ACCOUNT_SLOTS.find((s) => !used.has(s));
  }

  if (!targetSlot) {
    return {
      ok: false,
      error: 'max_accounts_reached',
      message: `Maximum ${ACCOUNT_SLOTS.length} accounts can stay signed in on one browser. Sign out of one first.`,
    };
  }

  const entries: AccountCookieEntry[] = [];
  for (const s of inspected.validSlots) {
    if (s.slot === targetSlot) continue;
    entries.push({
      slot: s.slot,
      username: s.username,
      firstName: s.firstName,
      lastName: s.lastName,
      addedAt: s.addedAt,
      lastUsedAt: s.lastUsedAt,
    });
  }
  entries.push({
    slot: targetSlot,
    username: opts.username,
    firstName: opts.firstName,
    lastName: opts.lastName,
    addedAt: existingForSameUser?.addedAt || nowIso,
    lastUsedAt: nowIso,
  });

  const keptAuxCookies = inspected.cookiesToSet.filter((c) => !c.startsWith(`${ACCOUNTS_COOKIE_NAME}=`));
  const cookies: string[] = [
    ...keptAuxCookies,
    ...sessionCookies(request, env, {
      access_token: opts.accessToken,
      refresh_token: opts.refreshToken,
      session_id: opts.sessionId,
      remember: opts.remember,
    }),
    makeSlotSessionCookie(request, env, targetSlot, newCreds),
    makeActiveCookie(request, env, targetSlot),
    makeAccountsCookie(request, env, await signAccountsCookieValue(entries, env)),
  ];

  return { ok: true, slot: targetSlot, cookies };
}
