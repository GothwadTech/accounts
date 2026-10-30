/**
 * =============================================================================
 * PROFILE, SESSIONS, SECURITY, AVATAR, EXPORT & DELETE ACCOUNT ROUTES (`/me`)
 * =============================================================================
 */

import {
  ACCOUNTS_COOKIE_NAME,
  type AccountCookieEntry,
  type D1Database,
  type Env,
  type ResponseWrapper,
} from '../types.ts';
import { apiError, GENDER_VALUES, json, parseJsonStringArray, readJson } from '../http.ts';
import { sha256Hex, verifyPassword } from '../crypto.ts';
import {
  clearAllAuthCookies,
  getCookie,
  makeAccountsCookie,
  makeActiveCookie,
  makeCookie,
  sessionCookies,
  signAccountsCookieValue,
  slotCookieName,
  verifyAccountsCookieValue,
} from '../cookies.ts';
import { fetchProfile, logActivity, presentUser } from '../users.ts';
import { resolveSession } from '../sessions.ts';
import { authorizeActionMfa, type ActionGate } from '../mfa-proofs.ts';
import { handlePasswordChangeRoute } from './auth-password-change.ts';
import { inspectBrowserAccounts, pickMostRecentSlot } from '../browser-slots.ts';

export async function handleAuthProfileRoute(
  request: Request,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  const passwordChange = await handlePasswordChangeRoute(request, db, env, route, withCors);
  if (passwordChange) return passwordChange;

  // ----------------------------------------------------- /auth/update-profile
  if (route === '/auth/update-profile' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const body = await readJson(request);
    const sets: string[] = [];
    const values: unknown[] = [];
    let actionGate: ActionGate = { sql: '1', bindings: [] };

    if (typeof body.first_name === 'string') {
      sets.push('first_name = ?');
      values.push(body.first_name.trim());
    }
    if (typeof body.last_name === 'string') {
      sets.push('last_name = ?');
      values.push(body.last_name.trim());
    }
    if (typeof body.recovery_email === 'string') {
      return withCors(json({ error: 'verification_required', message: 'Use the verified recovery-email change flow. Your current recovery email has not changed.' }, 400));
    }
    if (typeof body.phone_number === 'string') {
      if (!session.authUser.sessionId) return withCors(apiError('Please sign in again', 401));
      const password = String(body.current_password || '');
      const account = await db.prepare('SELECT password_hash FROM users WHERE id = ?')
        .bind(session.authUser.id).first();
      if (!password || password.length > 128 || !account || !(await verifyPassword(password, account.password_hash))) {
        return withCors(apiError('Confirm your current password to change your phone number', 400));
      }
      const proofGate = await authorizeActionMfa(db, env, session.authUser.id, String(body.mfa_code || '').trim());
      if (!proofGate) {
        return withCors(json({ error: 'mfa_required', message: 'Enter a fresh authenticator code or unused recovery code.' }, 400));
      }
      actionGate = { sql: `(${proofGate.sql}) AND EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s.user_id = u.id
        WHERE u.id = ? AND u.password_hash = ? AND s.id = ?)`,
        bindings: [...proofGate.bindings, session.authUser.id, account.password_hash, session.authUser.sessionId] };
      sets.push('phone_number = ?');
      values.push(body.phone_number.trim() || null);
    }
    if (typeof body.avatar_url === 'string') {
      sets.push('avatar_url = ?');
      values.push(body.avatar_url.trim() || null);
    }
    if (typeof body.date_of_birth === 'string') {
      const dob = body.date_of_birth.trim();
      if (dob) {
        const d = new Date(dob);
        const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && !isNaN(d.getTime()) && d < new Date();
        if (!valid) return withCors(apiError('Date of birth must be a valid past date (YYYY-MM-DD)'));
        sets.push('date_of_birth = ?');
        values.push(dob);
      } else {
        sets.push('date_of_birth = ?');
        values.push(null);
      }
    }
    if (typeof body.gender === 'string') {
      const g = body.gender.trim();
      if (g && !GENDER_VALUES.includes(g)) {
        return withCors(apiError('Gender must be one of: ' + GENDER_VALUES.join(', ')));
      }
      sets.push('gender = ?');
      values.push(g || null);
    }

    if (sets.length === 0) return withCors(apiError('Nothing to update'));

    const changedFields = sets.map((s) => s.split(' = ')[0]);
    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(session.authUser.id);

    const changed = await db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ? AND (${actionGate.sql}) RETURNING id`)
      .bind(...values, ...actionGate.bindings).first();
    if (!changed) return withCors(apiError('Security state changed. Verify again before retrying.', 409));

    await logActivity(
      db,
      session.authUser.id,
      'profile_update',
      'Personal info updated',
      changedFields.join(', '),
      request,
    );

    const updatedProfile = await fetchProfile(db, session.authUser.id);
    const extraCookies = [...(session.newCookies || [])];
    if (session.slot) {
      const existingEntries = await verifyAccountsCookieValue(getCookie(request, ACCOUNTS_COOKIE_NAME), env);
      if (existingEntries && existingEntries.length > 0) {
        const syncedEntries = existingEntries.map((entry) =>
          entry.slot === session.slot
            ? {
                ...entry,
                firstName: String(updatedProfile?.first_name || ''),
                lastName: String(updatedProfile?.last_name || ''),
              }
            : entry,
        );
        extraCookies.push(makeAccountsCookie(request, env, await signAccountsCookieValue(syncedEntries, env)));
      }
    }
    return withCors(
      json(
        { ok: true, user: presentUser(updatedProfile, env) },
        200,
        extraCookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  // ----------------------------------------------------------- /auth/sessions
  if (route === '/auth/sessions' && request.method === 'GET') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const currentSid = session.authUser.sessionId || getCookie(request, 'gothwad_sid');
    const out = await db
      .prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY last_active DESC')
      .bind(session.authUser.id)
      .all();

    const sessions = (out.results || []).map((r) => ({
      ...r,
      remember_me: !!r.remember_me,
      is_current: r.id === currentSid,
    }));
    return withCors(json({ ok: true, sessions }));
  }

  if (route === '/auth/sessions/revoke' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const body = await readJson(request);
    const sessionId = String(body.session_id || '');
    if (!sessionId) return withCors(apiError('session_id is required'));

    await db.batch([
      db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE session_id = ? AND user_id = ?').bind(sessionId, session.authUser.id),
      db.prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?').bind(sessionId, session.authUser.id),
    ]);

    await logActivity(
      db,
      session.authUser.id,
      'session_revoked',
      'Device signed out',
      'A device was signed out from your account',
      request,
    );
    return withCors(json({ ok: true, message: 'Device signed out' }));
  }

  if (route === '/auth/sessions/revoke-others' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const currentSid = session.authUser.sessionId || getCookie(request, 'gothwad_sid') || '';
    await db.batch([
      db.prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND session_id != ?').bind(session.authUser.id, currentSid),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ? AND id != ?').bind(session.authUser.id, currentSid),
    ]);

    await logActivity(
      db,
      session.authUser.id,
      'session_revoked',
      'All other devices signed out',
      'Every other device was signed out from your account',
      request,
    );
    return withCors(json({ ok: true, message: 'All other devices signed out' }));
  }

  // ----------------------------------------------------------- /auth/activity
  if (route === '/auth/activity' && request.method === 'GET') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const out = await db
      .prepare('SELECT * FROM account_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
      .bind(session.authUser.id)
      .all();

    return withCors(json({ ok: true, activity: out.results || [] }));
  }

  // ------------------------------------------------------------- /auth/avatar
  if (route === '/auth/avatar' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const body = await readJson(request);
    const raw = String(body.image_base64 || '');
    if (!raw) return withCors(apiError('image_base64 is required'));

    let b64 = raw;
    let mime = String(body.mime || 'image/jpeg');
    const m = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return withCors(apiError('Only JPEG, PNG or WebP images are allowed'));
    }

    let bytes: Uint8Array;
    try {
      const bin = atob(b64.replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return withCors(apiError('Invalid base64 image data'));
    }

    if (bytes.length > 2 * 1024 * 1024) {
      return withCors(apiError('Photo is too large (max 2 MB after resize)'));
    }

    const userId = session.authUser.id;
    const etag = (await sha256Hex(bytes)).slice(0, 16);
    const nowIso = new Date().toISOString();

    if (env.AVATARS_BUCKET) {
      await env.AVATARS_BUCKET.put(`avatars/${userId}`, bytes, {
        httpMetadata: { contentType: mime },
      });
    } else {
      await db
        .prepare(
          `INSERT INTO user_avatars (user_id, mime_type, data, byte_size, etag, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             mime_type  = excluded.mime_type,
             data       = excluded.data,
             byte_size  = excluded.byte_size,
             etag       = excluded.etag,
             updated_at = excluded.updated_at`,
        )
        .bind(userId, mime, bytes, bytes.length, etag, nowIso)
        .run();
    }

    const relativeAvatarPath = `/api/avatars/${encodeURIComponent(userId)}?v=${etag}`;
    await db
      .prepare('UPDATE profiles SET avatar_url = ?, updated_at = ? WHERE id = ?')
      .bind(relativeAvatarPath, nowIso, userId)
      .run();

    await logActivity(db, userId, 'avatar_update', 'Profile photo changed', undefined, request);

    const updatedProfile = await fetchProfile(db, userId);
    const presented = presentUser(updatedProfile, env);
    return withCors(json({ ok: true, avatar_url: presented?.avatar_url, user: presented }));
  }

  // ------------------------------------------------------------- /auth/export
  if (route === '/auth/export' && request.method === 'GET') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const userId = session.authUser.id;
    const [profile, sessionsOut, authzOut, activityOut] = await Promise.all([
      fetchProfile(db, userId),
      db.prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all(),
      db
        .prepare('SELECT app_id, scopes, granted_at, last_used_at FROM app_authorizations WHERE user_id = ?')
        .bind(userId)
        .all(),
      db
        .prepare('SELECT * FROM account_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
        .bind(userId)
        .all(),
    ]);

    const exportData = {
      export: 'gothwad-accounts',
      version: 2,
      generated_at: new Date().toISOString(),
      profile: profile ? presentUser(profile, env) : null,
      sessions: (sessionsOut.results || []).map((s) => ({ ...s, remember_me: !!s.remember_me })),
      connected_apps: (authzOut.results || []).map((g) => ({
        ...g,
        scopes: parseJsonStringArray(g.scopes),
      })),
      recent_activity: activityOut.results || [],
    };

    return withCors(
      new Response(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="gothwad-account-data.json"',
          'Cache-Control': 'no-store',
        },
      }),
    );
  }

  // ----------------------------------------------------- /auth/delete-account
  if (route === '/auth/delete-account' && request.method === 'POST') {
    const session = await resolveSession(request, db, env);
    if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

    const body = await readJson(request);
    const password = String(body.password || '');
    if (!password) return withCors(apiError('Password is required to delete your account'));

    const userId = session.authUser.id;
    const userRow = await db
      .prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first();
    if (!userRow || !(await verifyPassword(password, String(userRow.password_hash)))) {
      return withCors(apiError('Incorrect password', 400));
    }

    const proofGate = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
    if (!proofGate) {
      return withCors(json({ error: 'mfa_required', message: 'Enter a fresh authenticator code or unused recovery code.' }, 400));
    }
    const deleted = await db.prepare(`DELETE FROM users WHERE id = ? AND password_hash = ? AND (${proofGate.sql})
      AND EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?) RETURNING id`)
      .bind(userId, userRow.password_hash, ...proofGate.bindings, session.authUser.sessionId, userId).first();
    if (!deleted) return withCors(apiError('Security state changed. Verify again before retrying.', 409));
    if (env.AVATARS_BUCKET) {
      await env.AVATARS_BUCKET.delete(`avatars/${userId}`).catch(() => undefined);
    }

    const remaining = await inspectBrowserAccounts(request, db, env, { excludeSlot: session.slot });
    let deleteOutCookies: string[];
    if (remaining.validSlots.length > 0) {
      const nextActive = pickMostRecentSlot(remaining.validSlots);
      const nextEntries: AccountCookieEntry[] = remaining.validSlots.map((s) => ({
        slot: s.slot,
        username: s.username,
        firstName: s.firstName,
        lastName: s.lastName,
        addedAt: s.addedAt,
        lastUsedAt: s.lastUsedAt,
      }));
      const aux = remaining.cookiesToSet.filter((c) => !c.startsWith(`${ACCOUNTS_COOKIE_NAME}=`));
      deleteOutCookies = [
        ...aux,
        ...(session.slot ? [makeCookie(request, env, slotCookieName(session.slot), '', 0)] : []),
        makeActiveCookie(request, env, nextActive.slot),
        ...sessionCookies(request, env, {
          access_token: nextActive.creds.accessToken,
          refresh_token: nextActive.creds.refreshToken,
          session_id: nextActive.creds.sessionId,
          remember: nextActive.creds.remember,
        }),
        makeAccountsCookie(request, env, await signAccountsCookieValue(nextEntries, env)),
      ];
    } else {
      deleteOutCookies = clearAllAuthCookies(request, env);
    }

    return withCors(
      json(
        { ok: true, message: 'Account deleted' },
        200,
        deleteOutCookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  return null;
}
