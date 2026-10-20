/**
 * =============================================================================
 * AUTH DISCOVERY & REGISTRATION ROUTES — `/auth/check-*` & `/auth/signup`
 * =============================================================================
 */

import { ACCOUNT_SLOTS, type D1Database, type Env, type ResponseWrapper } from '../types.ts';
import {
  apiError,
  GENDER_VALUES,
  identifierLooksLikePhone,
  isValidEmail,
  isValidUsername,
  json,
  readJson,
  RESERVED_USERNAMES,
} from '../http.ts';
import {
  hashPassword,
  issueSessionAccessToken,
  randomToken,
  REFRESH_TOKEN_TTL_MS,
  sha256Hex,
} from '../crypto.ts';
import { refererHasQueryParam, sessionCookies } from '../cookies.ts';
import { fetchProfile, logActivity, lookupAccount, parseUserAgent, presentUser } from '../users.ts';
import { buildSignInCookies, inspectBrowserAccounts } from '../browser-slots.ts';

export async function handleAuthEntryRoute(
  request: Request,
  url: URL,
  db: D1Database,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  // ----------------------------------------------------- /auth/check-username
  if (route === '/auth/check-username' && request.method === 'GET') {
    const username = (url.searchParams.get('username') || '').toLowerCase().trim();
    if (!username || !isValidUsername(username)) {
      return withCors(json({ available: false, valid: false, error: 'Invalid username format' }));
    }
    if (RESERVED_USERNAMES.has(username)) {
      return withCors(json({ available: false, valid: true, error: 'This username is reserved' }));
    }

    const row = await db
      .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
      .bind(username)
      .first();

    return withCors(
      json({
        available: !row,
        valid: true,
        username,
        email: `${username}@${env.APP_DOMAIN}`,
      }),
    );
  }

  // --------------------------------------------------- /auth/check-identifier
  if (route === '/auth/check-identifier' && (request.method === 'GET' || request.method === 'POST')) {
    let raw = (url.searchParams.get('identifier') || '').trim();
    if (request.method === 'POST') {
      const body = await readJson(request);
      raw = String(body.identifier || raw || '').trim();
    }
    if (!raw) {
      return withCors(apiError('Please enter your username, email or phone number.', 400));
    }

    const appDomain = (env.APP_DOMAIN || 'gothwadtech.com').toLowerCase();
    if (
      !identifierLooksLikePhone(raw) &&
      raw.includes('@') &&
      !raw.toLowerCase().endsWith(`@${appDomain}`)
    ) {
      return withCors(
        json(
          { exists: false, error: `Only @${appDomain} suffix is allowed.`, isThirdParty: true },
          400,
        ),
      );
    }

    const found = await lookupAccount(db, raw);
    if (!found.exists) {
      const msg =
        found.kind === 'phone'
          ? "This phone number isn't registered with Gothwad Accounts."
          : "This username doesn't exist. Check the spelling, or create a new account.";
      return withCors(json({ exists: false, error: msg }));
    }
    return withCors(json({ exists: true, kind: found.kind }));
  }

  // ------------------------------------------------------------- /auth/signup
  if (route === '/auth/signup' && request.method === 'POST') {
    const body = await readJson(request);
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    const recoveryEmail = String(body.recovery_email || '').toLowerCase().trim();
    const phoneNumber = String(body.phone_number || '').trim();
    const dobRaw = String(body.date_of_birth || '').trim();
    const gender = String(body.gender || '').trim();
    const remember = body.remember !== false;

    if (!firstName || !lastName) return withCors(apiError('First and last name are required'));
    if (!isValidUsername(username)) {
      return withCors(apiError('Username must be 3-24 chars: a-z, 0-9, dot, dash, underscore'));
    }
    if (RESERVED_USERNAMES.has(username)) return withCors(apiError('This username is reserved'));
    if (password.length < 8) return withCors(apiError('Password must be at least 8 characters'));
    if (password.length > 128) return withCors(apiError('Password must be at most 128 characters'));
    if (!isValidEmail(recoveryEmail)) return withCors(apiError('A valid recovery email is required'));

    if (dobRaw) {
      const d = new Date(dobRaw);
      const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) && !isNaN(d.getTime()) && d < new Date();
      if (!dobOk) return withCors(apiError('Date of birth must be a valid past date (YYYY-MM-DD)'));
    }
    if (gender && !GENDER_VALUES.includes(gender)) {
      return withCors(apiError('Gender must be one of: ' + GENDER_VALUES.join(', ')));
    }

    const addMode =
      url.searchParams.get('add') === '1' ||
      body.add === true ||
      refererHasQueryParam(request, 'add', '1');

    if (addMode) {
      const preCheck = await inspectBrowserAccounts(request, db, env);
      if (preCheck.validSlots.length >= ACCOUNT_SLOTS.length) {
        return withCors(
          json(
            {
              error: 'max_accounts_reached',
              message: `Maximum ${ACCOUNT_SLOTS.length} accounts can stay signed in on one browser. Sign out of one first.`,
            },
            409,
          ),
        );
      }
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
      .bind(username)
      .first();
    if (existing) {
      return withCors(apiError('This username is already taken', 409));
    }

    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const rawRefresh = randomToken();
    const refreshHash = await sha256Hex(rawRefresh);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
    const ua = parseUserAgent(request.headers.get('User-Agent') || '');

    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO users (id, username, password_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(userId, username, passwordHash, nowIso, nowIso),
        db
          .prepare(
            `INSERT INTO profiles (
               id, username, first_name, last_name, recovery_email, phone_number,
               date_of_birth, gender, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            userId,
            username,
            firstName,
            lastName,
            recoveryEmail,
            phoneNumber || null,
            dobRaw || null,
            gender || null,
            nowIso,
            nowIso,
          ),
        db
          .prepare(
            `INSERT INTO user_sessions (
               id, user_id, device_name, browser, os, ip_address, remember_me, last_active, is_current, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            sessionId,
            userId,
            ua.device_name,
            ua.browser,
            ua.os,
            request.headers.get('CF-Connecting-IP') || '',
            remember ? 1 : 0,
            nowIso,
            nowIso,
          ),
        db
          .prepare(
            `INSERT INTO auth_refresh_tokens (token_hash, user_id, session_id, expires_at, revoked, created_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
          )
          .bind(refreshHash, userId, sessionId, refreshExpiresAt, nowIso),
      ]);
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('unique')) {
        return withCors(apiError('This username is already taken', 409));
      }
      throw err;
    }

    const accessToken = await issueSessionAccessToken(env, { userId, username, sessionId });
    const profile = await fetchProfile(db, userId);
    await logActivity(db, userId, 'signup', 'Account created', `Welcome to Gothwad, ${firstName}!`, request);

    const slotResult = await buildSignInCookies(request, db, env, {
      userId,
      username,
      firstName,
      lastName,
      accessToken,
      refreshToken: rawRefresh,
      sessionId,
      remember,
      addMode,
    });
    const cookies = slotResult.ok
      ? slotResult.cookies
      : sessionCookies(request, env, {
          access_token: accessToken,
          refresh_token: rawRefresh,
          session_id: sessionId,
          remember,
        });

    return withCors(
      json(
        {
          ok: true,
          user: presentUser(profile, env),
          access_token: accessToken,
          refresh_token: rawRefresh,
          session_id: sessionId,
        },
        201,
        cookies.map((c) => ['Set-Cookie', c] as [string, string]),
      ),
    );
  }

  return null;
}
