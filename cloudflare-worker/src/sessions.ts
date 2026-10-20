/**
 * =============================================================================
 * SESSION ENGINE — Atomic Refresh Rotation, 10s Race Grace & Active Resolution
 * =============================================================================
 */

import {
  ACTIVE_COOKIE_NAME,
  type AccountSlot,
  type D1Database,
  type Env,
  type SessionUser,
  type SlotCredentials,
} from './types.ts';
import { authQuery } from './db.ts';
import {
  getSigningSecret,
  issueSessionAccessToken,
  randomToken,
  REFRESH_TOKEN_TTL_MS,
  sha256Hex,
  verifyJwt,
} from './crypto.ts';
import {
  decodeSlotCredentials,
  getCookie,
  isAccountSlot,
  makeSlotSessionCookie,
  sessionCookies,
  slotCookieName,
} from './cookies.ts';

export async function rotateSessionRefreshToken(
  db: D1Database,
  env: Env,
  rawRefreshToken: string,
  fallbackSessionId?: string | null,
): Promise<{
  user: SessionUser;
  access_token: string;
  refresh_token: string;
  session_id: string | null;
} | null> {
  return authQuery(async () => {
    const hash = await sha256Hex(rawRefreshToken);
    const nowIso = new Date().toISOString();

    const consumed = await db
      .prepare(
        `UPDATE auth_refresh_tokens
            SET revoked = 1
          WHERE token_hash = ? AND revoked = 0 AND expires_at > ?
          RETURNING user_id, session_id`,
      )
      .bind(hash, nowIso)
      .first();

    if (!consumed?.user_id) return null;

    const userId = String(consumed.user_id);
    const userRow = await db
      .prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first();
    if (!userRow?.username) return null;

    const sid = (consumed.session_id ? String(consumed.session_id) : null) || fallbackSessionId || null;
    if (sid) {
      const updatedSession = await db
        .prepare('UPDATE user_sessions SET last_active = ? WHERE id = ? AND user_id = ? RETURNING id')
        .bind(nowIso, sid, userId)
        .first();
      if (!updatedSession) return null;
    }

    const newRefresh = randomToken();
    const newRefreshHash = await sha256Hex(newRefresh);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    await db
      .prepare(
        `INSERT INTO auth_refresh_tokens (token_hash, user_id, session_id, expires_at, revoked, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      )
      .bind(newRefreshHash, userId, sid, newExpiresAt, nowIso)
      .run();

    const username = String(userRow.username);
    const newAccess = await issueSessionAccessToken(env, { userId, username, sessionId: sid });

    return {
      user: { id: userId, username, sessionId: sid },
      access_token: newAccess,
      refresh_token: newRefresh,
      session_id: sid,
    };
  });
}

export async function validateCredentialsAgainstDb(
  db: D1Database,
  env: Env,
  creds: { accessToken?: string | null; refreshToken?: string | null; sessionId?: string | null; remember?: boolean },
): Promise<{
  ok: boolean;
  authUser?: SessionUser;
  accessToken?: string;
  rotated?: { access_token: string; refresh_token: string; session_id: string | null };
}> {
  const accessToken = creds.accessToken || '';
  const refreshToken = creds.refreshToken || '';
  const cookieSid = creds.sessionId || null;

  if (!accessToken && !refreshToken) return { ok: false };

  if (accessToken) {
    const payload = await verifyJwt(accessToken, getSigningSecret(env));
    if (payload && payload.token_use === 'session' && payload.sub) {
      const userId = String(payload.sub);
      const tokenSid = payload.sid ? String(payload.sid) : null;
      const verified = await authQuery(async () => {
        const userRow = await db
          .prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1')
          .bind(userId)
          .first();
        if (!userRow?.username) return null;
        if (tokenSid) {
          const sessRow = await db
            .prepare('SELECT id FROM user_sessions WHERE id = ? AND user_id = ? LIMIT 1')
            .bind(tokenSid, userId)
            .first();
          if (!sessRow) return null;
        }
        return {
          id: userId,
          username: String(userRow.username),
          sessionId: tokenSid || cookieSid || null,
        };
      });
      if (verified) {
        return { ok: true, authUser: verified, accessToken };
      }
    }
  }

  if (refreshToken) {
    const rotated = await rotateSessionRefreshToken(db, env, refreshToken, cookieSid);
    if (rotated) {
      return {
        ok: true,
        authUser: rotated.user,
        accessToken: rotated.access_token,
        rotated: {
          access_token: rotated.access_token,
          refresh_token: rotated.refresh_token,
          session_id: rotated.session_id,
        },
      };
    }

    const graceUser = await authQuery(async () => {
      const hash = await sha256Hex(refreshToken);
      const prevRow = await db
        .prepare('SELECT user_id, session_id FROM auth_refresh_tokens WHERE token_hash = ? LIMIT 1')
        .bind(hash)
        .first();
      if (!prevRow?.user_id || !prevRow?.session_id) return null;

      const userId = String(prevRow.user_id);
      const sid = String(prevRow.session_id);
      const cutoffIso = new Date(Date.now() - 10_000).toISOString();

      const [sessRow, freshSibling, userRow] = await Promise.all([
        db.prepare('SELECT id FROM user_sessions WHERE id = ? AND user_id = ? LIMIT 1').bind(sid, userId).first(),
        db
          .prepare(
            `SELECT token_hash FROM auth_refresh_tokens
              WHERE user_id = ? AND session_id = ? AND revoked = 0 AND created_at >= ?
              LIMIT 1`,
          )
          .bind(userId, sid, cutoffIso)
          .first(),
        db.prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1').bind(userId).first(),
      ]);

      if (!sessRow || !freshSibling || !userRow?.username) return null;
      return { id: userId, username: String(userRow.username), sessionId: sid };
    });

    if (graceUser) {
      const freshAccess = await issueSessionAccessToken(env, {
        userId: graceUser.id,
        username: graceUser.username,
        sessionId: graceUser.sessionId,
      });
      return { ok: true, authUser: graceUser, accessToken: freshAccess };
    }
  }

  return { ok: false };
}

export async function resolveSession(
  request: Request,
  db: D1Database,
  env: Env,
): Promise<{
  ok: boolean;
  accessToken?: string;
  newCookies?: string[];
  newTokens?: { access_token: string; refresh_token: string };
  authUser?: SessionUser;
  slot?: AccountSlot;
}> {
  const authHeader = request.headers.get('Authorization') || '';
  const headerAccess = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerRefresh = (request.headers.get('X-Gothwad-Refresh') || '').trim();

  if (!headerAccess && !headerRefresh) {
    const rawActive = getCookie(request, ACTIVE_COOKIE_NAME);
    if (isAccountSlot(rawActive)) {
      const slotCreds = decodeSlotCredentials(getCookie(request, slotCookieName(rawActive)));
      if (slotCreds) {
        const slotCheck = await validateCredentialsAgainstDb(db, env, slotCreds);
        if (slotCheck.ok && slotCheck.authUser) {
          if (slotCheck.rotated) {
            const newTokens = {
              access_token: slotCheck.rotated.access_token,
              refresh_token: slotCheck.rotated.refresh_token,
            };
            const updatedSlotCreds: SlotCredentials = {
              accessToken: slotCheck.rotated.access_token,
              refreshToken: slotCheck.rotated.refresh_token,
              sessionId: slotCheck.rotated.session_id || slotCreds.sessionId,
              remember: slotCreds.remember,
            };
            return {
              ok: true,
              slot: rawActive,
              accessToken: slotCheck.rotated.access_token,
              authUser: slotCheck.authUser,
              newTokens,
              newCookies: [
                ...sessionCookies(request, env, {
                  access_token: newTokens.access_token,
                  refresh_token: newTokens.refresh_token,
                  session_id: slotCheck.rotated.session_id,
                  remember: slotCreds.remember,
                }),
                makeSlotSessionCookie(request, env, rawActive, updatedSlotCreds),
              ],
            };
          }
          return {
            ok: true,
            slot: rawActive,
            accessToken: slotCheck.accessToken,
            authUser: slotCheck.authUser,
          };
        }
      }
    }
  }

  const accessToken = headerAccess || getCookie(request, 'gothwad_at');
  const refreshToken = headerRefresh || getCookie(request, 'gothwad_rt');
  const cookieSid = getCookie(request, 'gothwad_sid');

  const fallbackCheck = await validateCredentialsAgainstDb(db, env, {
    accessToken,
    refreshToken,
    sessionId: cookieSid,
    remember: true,
  });

  if (fallbackCheck.ok && fallbackCheck.authUser) {
    if (fallbackCheck.rotated) {
      const newTokens = {
        access_token: fallbackCheck.rotated.access_token,
        refresh_token: fallbackCheck.rotated.refresh_token,
      };
      return {
        ok: true,
        accessToken: fallbackCheck.rotated.access_token,
        authUser: fallbackCheck.authUser,
        newTokens,
        newCookies: sessionCookies(request, env, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          session_id: fallbackCheck.rotated.session_id,
          remember: true,
        }),
      };
    }
    return {
      ok: true,
      accessToken: fallbackCheck.accessToken,
      authUser: fallbackCheck.authUser,
    };
  }

  return { ok: false };
}
