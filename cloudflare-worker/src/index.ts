/**
 * =============================================================================
 * GOTHWAD ACCOUNTS — AUTH API (Cloudflare Worker)
 * =============================================================================
 * Yeh Worker "Gothwad Account" ka real backend hai. Yeh karta hai:
 *   - Signup / Signin / Signout  (Supabase Auth ke saath)
 *   - JWT session management     (HttpOnly cookies + auto refresh)
 *   - "Remember me" support      (30-day vs browser-session cookies)
 *   - Password reset / change
 *   - Profile read / update
 *   - Device sessions list + remote revoke
 *
 * SECURITY RULES (yaad rakho!):
 *   - SUPABASE_SERVICE_ROLE_KEY sirf yahan (Worker) hai — frontend kabhi nahi.
 *   - Frontend sirf is Worker ke /api/* routes call karta hai (Supabase directly nahi).
 *   - Session tokens HttpOnly cookies mein jaate hain → JS unhe chhu nahi sakta.
 *
 * DOMAIN RULE: kahin bhi domain hardcode nahi. Sab kuch env vars se:
 *   APP_DOMAIN, AUTH_HUB_URL, SUPABASE_URL ...
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Environment variables (wrangler.toml [vars] + `wrangler secret put` secrets)
// -----------------------------------------------------------------------------
export interface Env {
  /** Root domain, e.g. "gothwadtech.com" — email = username@APP_DOMAIN */
  APP_DOMAIN: string;
  /** Public URL of the frontend (for password-reset redirect), e.g. https://accounts.gothwadtech.com */
  AUTH_HUB_URL: string;
  /** Supabase project URL, e.g. https://abcdxyz.supabase.co */
  SUPABASE_URL: string;
  /** Supabase anon key (public). Used as apikey for user-auth calls. */
  SUPABASE_ANON_KEY: string;
  /** Supabase service_role key (SECRET). Only this Worker may see it. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Resend API key (SECRET) — password-reset emails ke liye (optional). */
  RESEND_API_KEY?: string;
  /** "From" address for Resend emails. */
  RESEND_FROM?: string;
  /** "true" = developer mode (reset link API response mein bhi milega). Prod me "false". */
  DEV_MODE?: string;
  /** Extra allowed CORS origins, comma separated (dev/preview ke liye). */
  ALLOWED_ORIGINS?: string;
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

/** JSON response banana aasan banane ke liye. */
function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

/** Standard error shape: { error: "human readable message" } */
function apiError(message: string, status = 400, extraHeaders?: HeadersInit): Response {
  return json({ error: message }, status, extraHeaders);
}

/** Body se JSON padho, galat JSON par friendly error. */
async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    return (await request.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

/** Username validation — schema.sql ke CHECK constraint jaisa hi. */
function isValidUsername(username: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username);
}

/** Basic email format check. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Usernames jo system ke liye reserved hain (inhe koi le nahi sakta). */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'assets', 'mail', 'email', 'smtp', 'imap', 'pop',
  'support', 'help', 'root', 'security', 'billing', 'legal', 'abuse', 'postmaster',
  'webmaster', 'hostmaster', 'noreply', 'no-reply', 'donotreply', 'www', 'web', 'ftp',
  'cdn', 'static', 'status', 'dev', 'test', 'staging', 'gothwad', 'gothwadtech',
  'login', 'signin', 'signup', 'logout', 'account', 'accounts', 'auth', 'oauth',
  'me', 'everyone', 'team', 'official', 'pay', 'payments', 'wallet', 'store', 'shop',
]);

// -----------------------------------------------------------------------------
// CORS — sirf Gothwad domains + configured dev origins
// -----------------------------------------------------------------------------
function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin') || '';
  const rootDomain = env.APP_DOMAIN;

  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowed =
    origin.endsWith(`.${rootDomain}`) ||
    origin === `https://${rootDomain}` ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    extra.includes(origin);

  if (allowed && origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true'); // cookies ke liye zaroori
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

// -----------------------------------------------------------------------------
// Cookies — session tokens ko HttpOnly cookies mein store karte hain
// -----------------------------------------------------------------------------
// Cookie names:  gothwad_at = access token (JWT, ~1 hour)
//                gothwad_rt = refresh token (30 days / browser session)
//                gothwad_sid = device-session row id (dashboard ke liye)

/** Kya hum local/preview host par hain? (Wahan Domain attribute nahi lagta.) */
function cookieDomain(request: Request, env: Env): string | null {
  const host = new URL(request.url).hostname;
  if (host === env.APP_DOMAIN || host.endsWith(`.${env.APP_DOMAIN}`)) {
    return `.${env.APP_DOMAIN}`; // SSO: mail./drive./accounts. sab share karein
  }
  return null; // localhost / preview → host-only cookie
}

function makeCookie(
  request: Request,
  env: Env,
  name: string,
  value: string,
  maxAgeSeconds: number | null, // null = browser-session cookie (band hote hi delete)
): string {
  const domain = cookieDomain(request, env);
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',     // JavaScript kabhi na padh sake
    'Secure',       // sirf HTTPS
    'SameSite=Lax', // cross-site form attacks se bachav
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

function sessionCookies(request: Request, env: Env, tokens: {
  access_token: string;
  refresh_token: string;
  session_id?: string | null;
  remember: boolean;
}): string[] {
  // Remember=true  → 30 din tak login rahega
  // Remember=false → browser band karte hi session khatam
  const maxAge = tokens.remember ? 60 * 60 * 24 * 30 : null;
  const cookies = [
    makeCookie(request, env, 'gothwad_at', tokens.access_token, tokens.remember ? 60 * 60 : null),
    makeCookie(request, env, 'gothwad_rt', tokens.refresh_token, maxAge),
  ];
  if (tokens.session_id) {
    cookies.push(makeCookie(request, env, 'gothwad_sid', tokens.session_id, maxAge));
  }
  return cookies;
}

function clearCookies(request: Request, env: Env): string[] {
  return [
    makeCookie(request, env, 'gothwad_at', '', 0),
    makeCookie(request, env, 'gothwad_rt', '', 0),
    makeCookie(request, env, 'gothwad_sid', '', 0),
  ];
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// -----------------------------------------------------------------------------
// Supabase REST/API helpers
// -----------------------------------------------------------------------------
const SB = {
  /** Supabase Auth ka base URL. */
  authUrl(env: Env, path: string): string {
    return `${env.SUPABASE_URL}/auth/v1${path}`;
  },

  /** service_role se call — RLS bypass, sirf Worker ke liye! */
  async adminFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${env.SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(init.headers || {}),
      },
    });
  },

  /** User ke apne access_token se call — RLS laagu hoti hai. */
  async userFetch(env: Env, path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${env.SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers || {}),
      },
    });
  },
};

/** profiles table se user ka profile lao (service_role se). */
async function fetchProfile(env: Env, userId: string): Promise<Record<string, any> | null> {
  const res = await SB.adminFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
  );
  const rows = (await res.json()) as Record<string, any>[];
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Profile ke saath API-friendly user object banao.
 * YAHAN email calculate hota hai — database mein sirf username hai! (Rule #2)
 */
function presentUser(profile: Record<string, any> | null, authUser: Record<string, any> | null, env: Env) {
  if (!profile && !authUser) return null;
  const username = profile?.username || '';
  return {
    id: profile?.id || authUser?.id || '',
    username,
    email: username ? `${username}@${env.APP_DOMAIN}` : '', // derived — stored nahi hai
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    recovery_email: profile?.recovery_email || '',
    phone_number: profile?.phone_number || '',
    avatar_url: profile?.avatar_url || null,
    two_factor_enabled: !!profile?.two_factor_enabled,
    storage_used_bytes: Number(profile?.storage_used_bytes || 0),
    storage_limit_bytes: Number(profile?.storage_limit_bytes || 16106127360),
    created_at: profile?.created_at || null,
  };
}

/**
 * Request ke cookies se session verify karo.
 * Access token expire ho gaya ho to refresh token se automatically
 * naya token le lete hain (JWT session management — Rule: auto-refresh).
 */
async function resolveSession(
  request: Request,
  env: Env,
): Promise<{
  ok: boolean;
  accessToken?: string;
  newCookies?: string[];
  authUser?: Record<string, any>;
}> {
  const accessToken = getCookie(request, 'gothwad_at');
  const refreshToken = getCookie(request, 'gothwad_rt');

  if (!accessToken && !refreshToken) return { ok: false };

  // 1) Try current access token
  if (accessToken) {
    const res = await fetch(SB.authUrl(env, '/user'), {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return { ok: true, accessToken, authUser: (await res.json()) as Record<string, any> };
    }
  }

  // 2) Access token khatam → refresh token se naya le lo (rotation ke saath)
  if (refreshToken) {
    const res = await fetch(SB.authUrl(env, '/token?grant_type=refresh_token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const remember = getCookie(request, 'gothwad_rt') !== null && !!getCookie(request, 'gothwad_sid');
      const sessionId = getCookie(request, 'gothwad_sid');
      return {
        ok: true,
        accessToken: data.access_token,
        authUser: data.user,
        newCookies: sessionCookies(request, env, {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          session_id: sessionId,
          remember: true, // refresh hote waqt lambi validity hi rakhte hain
        }),
      };
    }
  }

  return { ok: false };
}

/** User-Agent se simple device info nikalo (dashboard ke liye). */
function parseUserAgent(ua: string): { device_name: string; browser: string; os: string; device_type: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Unknown browser';

  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' :
    'Unknown OS';

  const device_type = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : /iPad|Tablet/.test(ua) ? 'Tablet' : 'Desktop';

  return { device_name: `${browser} on ${os}`, browser, os, device_type };
}

// -----------------------------------------------------------------------------
// Resend — password reset email bhejne ke liye (free: 3000 emails/month)
// -----------------------------------------------------------------------------
async function sendResetEmail(env: Env, toEmail: string, resetLink: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const from = env.RESEND_FROM || `Gothwad Accounts <no-reply@${env.APP_DOMAIN}>`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#e94560;">🔥 Gothwad Accounts</h2>
      <p>Aapne password reset ka request kiya hai. Neeche button dabao aur 30 minute ke andar naya password set karo:</p>
      <p><a href="${resetLink}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset my password</a></p>
      <p style="color:#888;font-size:12px;">Agar aapne yeh request nahi kiya, to yeh email ignore kar do. Koi action nahi chahiye.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: 'Reset your Gothwad Account password',
      html,
    }),
  });
  return res.ok;
}

// =============================================================================
// MAIN ROUTER
// =============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Har JSON response par CORS headers lagao
    const withCors = (res: Response): Response => {
      corsHeaders.forEach((v, k) => res.headers.set(k, v));
      return res;
    };

    try {
      const { pathname } = url;

      // -------------------------------------------------------------- health
      if (pathname === '/api/health' && request.method === 'GET') {
        return withCors(json({ status: 'ok', service: 'gothwad-auth-api', time: new Date().toISOString() }));
      }

      // ------------------------------------------------- check-username (GET)
      // Signup page live check karta hai: username available hai ya nahi.
      if (pathname === '/api/auth/check-username' && request.method === 'GET') {
        const username = (url.searchParams.get('username') || '').toLowerCase().trim();
        if (!username || !isValidUsername(username)) {
          return withCors(json({ available: false, valid: false, error: 'Invalid username format' }));
        }
        if (RESERVED_USERNAMES.has(username)) {
          return withCors(json({ available: false, valid: true, error: 'This username is reserved' }));
        }

        // DB mein check — service_role se (RLS bypass; yeh Worker trusted hai)
        const res = await SB.adminFetch(
          env,
          `/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`,
        );
        const rows = (await res.json()) as Record<string, any>[];
        const available = Array.isArray(rows) && rows.length === 0;

        return withCors(json({ available, valid: true, username, email: `${username}@${env.APP_DOMAIN}` }));
      }

      // ---------------------------------------------------------- signup
      // Naya Gothwad Account banao.
      // Flow: validate → username free? → Supabase auth user banao (email_confirm
      // true, kyunki @APP_DOMAIN mail abhi live nahi) → trigger profile banata
      // hai → turant session cookies set kar dete hain (auto login!).
      if (pathname === '/api/auth/signup' && request.method === 'POST') {
        const body = await readJson(request);
        const firstName = String(body.first_name || '').trim();
        const lastName = String(body.last_name || '').trim();
        const username = String(body.username || '').toLowerCase().trim();
        const password = String(body.password || '');
        const recoveryEmail = String(body.recovery_email || '').toLowerCase().trim();
        const phoneNumber = String(body.phone_number || '').trim();

        if (!firstName || !lastName) return withCors(apiError('First and last name are required'));
        if (!isValidUsername(username)) {
          return withCors(apiError('Username must be 3-24 chars: a-z, 0-9, dot, dash, underscore'));
        }
        if (RESERVED_USERNAMES.has(username)) return withCors(apiError('This username is reserved'));
        if (password.length < 8) return withCors(apiError('Password must be at least 8 characters'));
        if (!isValidEmail(recoveryEmail)) return withCors(apiError('A valid recovery email is required'));

        // Username pehle se liya hua hai?
        const existing = await SB.adminFetch(
          env,
          `/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`,
        );
        const existingRows = (await existing.json()) as Record<string, any>[];
        if (Array.isArray(existingRows) && existingRows.length > 0) {
          return withCors(apiError('This username is already taken', 409));
        }

        // Supabase Auth mein user banao (service_role = admin power).
        // email_confirm: true → user ko confirmation email ki zaroorat nahi
        // (custom @APP_DOMAIN mail abhi bana nahi, isliye smart choice).
        const createRes = await SB.adminFetch(env, '/auth/v1/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            email: `${username}@${env.APP_DOMAIN}`, // derived email (Rule #2)
            password,
            email_confirm: true,
            user_metadata: {
              username,
              first_name: firstName,
              last_name: lastName,
              recovery_email: recoveryEmail,
              phone_number: phoneNumber || null,
            },
          }),
        });

        if (!createRes.ok) {
          const err = (await createRes.json()) as Record<string, any>;
          const msg = err?.msg || err?.message || 'Could not create account';
          return withCors(apiError(msg, 400));
        }

        // Trigger ne profile bana diya. Login session bhi bana dete hain.
        const loginRes = await fetch(SB.authUrl(env, '/token?grant_type=password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
          body: JSON.stringify({ email: `${username}@${env.APP_DOMAIN}`, password }),
        });
        const login = (await loginRes.json()) as Record<string, any>;

        if (!loginRes.ok) {
          // Account ban gaya, login fail hua → user manually login karega
          return withCors(json({ ok: true, needs_signin: true, username }));
        }

        // Device session row (dashboard ke Security tab ke liye)
        const ua = parseUserAgent(request.headers.get('User-Agent') || '');
        const sessRes = await SB.adminFetch(env, '/rest/v1/user_sessions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: login.user.id,
            device_name: ua.device_name,
            browser: ua.browser,
            os: ua.os,
            ip_address: request.headers.get('CF-Connecting-IP') || '',
            remember_me: body.remember !== false,
            is_current: true,
          }),
        });
        const sessRows = (await sessRes.json()) as Record<string, any>[];
        const sessionId = sessRows?.[0]?.id || null;

        const profile = await fetchProfile(env, login.user.id);
        const cookies = sessionCookies(request, env, {
          access_token: login.access_token,
          refresh_token: login.refresh_token,
          session_id: sessionId,
          remember: body.remember !== false,
        });

        return withCors(
          json(
            { ok: true, user: presentUser(profile, login.user, env) },
            201,
            cookies.map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // ---------------------------------------------------------- signin
      // Identifier = username ya full email, dono chalte hain.
      if (pathname === '/api/auth/signin' && request.method === 'POST') {
        const body = await readJson(request);
        const identifier = String(body.identifier || '').trim().toLowerCase();
        const password = String(body.password || '');
        const remember = body.remember === true;

        if (!identifier || !password) return withCors(apiError('Username and password are required'));

        // "pawan" → "pawan@APP_DOMAIN"; "pawan@xyz.com" → waise hi rehne do
        const email = identifier.includes('@') ? identifier : `${identifier}@${env.APP_DOMAIN}`;

        const authRes = await fetch(SB.authUrl(env, '/token?grant_type=password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
          body: JSON.stringify({ email, password }),
        });
        const auth = (await authRes.json()) as Record<string, any>;

        if (!authRes.ok) {
          return withCors(apiError('Invalid username or password', 401));
        }

        // Device session row banao
        const ua = parseUserAgent(request.headers.get('User-Agent') || '');
        const sessRes = await SB.adminFetch(env, '/rest/v1/user_sessions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: auth.user.id,
            device_name: ua.device_name,
            browser: ua.browser,
            os: ua.os,
            ip_address: request.headers.get('CF-Connecting-IP') || '',
            remember_me: remember,
            is_current: true,
          }),
        });
        const sessRows = (await sessRes.json()) as Record<string, any>[];
        const sessionId = sessRows?.[0]?.id || null;

        const profile = await fetchProfile(env, auth.user.id);
        const cookies = sessionCookies(request, env, {
          access_token: auth.access_token,
          refresh_token: auth.refresh_token,
          session_id: sessionId,
          remember,
        });

        return withCors(
          json(
            { ok: true, user: presentUser(profile, auth.user, env) },
            200,
            cookies.map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // ---------------------------------------------------------- signout
      if (pathname === '/api/auth/signout' && request.method === 'POST') {
        const accessToken = getCookie(request, 'gothwad_at');
        const sessionId = getCookie(request, 'gothwad_sid');

        // Supabase side refresh tokens revoke karo
        if (accessToken) {
          await fetch(SB.authUrl(env, '/logout'), {
            method: 'POST',
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
          }).catch(() => undefined);
        }

        // Device session row hatao
        if (sessionId) {
          await SB.adminFetch(env, `/rest/v1/user_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
          }).catch(() => undefined);
        }

        return withCors(
          json({ ok: true, message: 'Signed out' }, 200, clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string])),
        );
      }

      // ------------------------------------------------------- session (me)
      // Frontend page-load par call karta hai: "logged-in hoon kya?"
      // Access token expire ho to automatically refresh ho jaata hai.
      if (pathname === '/api/auth/me' && request.method === 'GET') {
        const session = await resolveSession(request, env);
        if (!session.ok) {
          return withCors(
            json({ authenticated: false }, 200, clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string])),
          );
        }

        const profile = await fetchProfile(env, session.authUser!.id);
        const headers: [string, string][] = (session.newCookies || []).map((c) => ['Set-Cookie', c]);
        return withCors(
          json({ authenticated: true, user: presentUser(profile, session.authUser, env) }, 200, headers),
        );
      }

      // ------------------------------------------------- forgot-password
      // Sirf username maango. Reset link RECOVERY email par jaata hai.
      // (Hamesha same generic response — taaki koi pata na laga sake ki
      //  kaunsa username exist karta hai. Security best-practice.)
      if (pathname === '/api/auth/forgot-password' && request.method === 'POST') {
        const body = await readJson(request);
        const username = String(body.username || '').toLowerCase().trim();
        const genericOk = () =>
          withCors(json({ ok: true, message: 'If that account exists, a reset link has been sent to its recovery email.' }));

        if (!isValidUsername(username)) return genericOk();

        const profRes = await SB.adminFetch(
          env,
          `/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,recovery_email`,
        );
        const profRows = (await profRes.json()) as Record<string, any>[];
        const profile = profRows?.[0];
        if (!profile?.recovery_email) return genericOk();

        // Supabase se signed recovery link banao
        const linkRes = await SB.adminFetch(env, '/auth/v1/admin/generate_link', {
          method: 'POST',
          body: JSON.stringify({
            type: 'recovery',
            email: `${username}@${env.APP_DOMAIN}`,
            options: { redirect_to: `${env.AUTH_HUB_URL}/reset-password.html` },
          }),
        });
        const linkData = (await linkRes.json()) as Record<string, any>;
        const resetLink = linkData?.action_link;
        if (!resetLink) return genericOk();

        const emailed = await sendResetEmail(env, profile.recovery_email, resetLink);

        // DEV_MODE: Resend configure nahi hai to link response mein de dete hain
        // taaki development mein flow test ho sake. Production me DEV_MODE=false!
        if (!emailed && env.DEV_MODE === 'true') {
          return withCors(json({ ok: true, message: 'DEV_MODE: reset link below (Resend not configured).', dev_reset_link: resetLink }));
        }
        return genericOk();
      }

      // ------------------------------------------------- reset-password
      // User reset link par click karke aaya hai → uske token se naya password.
      if (pathname === '/api/auth/reset-password' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '').trim();
        const body = await readJson(request);
        const password = String(body.password || '');

        if (!token) return withCors(apiError('Missing reset token. Please use the link from your email.', 401));
        if (password.length < 8) return withCors(apiError('Password must be at least 8 characters'));

        const res = await fetch(SB.authUrl(env, '/user'), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          return withCors(apiError('Reset link is invalid or expired. Please request a new one.', 400));
        }
        return withCors(json({ ok: true, message: 'Password updated! You can now sign in.' }));
      }

      // ------------------------------------------------- change-password
      // Logged-in user apna password change kare.
      if (pathname === '/api/auth/change-password' && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const currentPassword = String(body.current_password || '');
        const newPassword = String(body.new_password || '');
        if (newPassword.length < 8) return withCors(apiError('New password must be at least 8 characters'));

        // Purana password sahi hai? (password grant se verify)
        const email = session.authUser!.email;
        const verifyRes = await fetch(SB.authUrl(env, '/token?grant_type=password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
          body: JSON.stringify({ email, password: currentPassword }),
        });
        if (!verifyRes.ok) return withCors(apiError('Current password is incorrect', 400));

        const res = await fetch(SB.authUrl(env, '/user'), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ password: newPassword }),
        });
        if (!res.ok) return withCors(apiError('Could not change password', 400));

        return withCors(json({ ok: true, message: 'Password changed successfully' }));
      }

      // ------------------------------------------------- update-profile
      if (pathname === '/api/auth/update-profile' && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const patch: Record<string, any> = {};
        if (typeof body.first_name === 'string') patch.first_name = body.first_name.trim();
        if (typeof body.last_name === 'string') patch.last_name = body.last_name.trim();
        if (typeof body.recovery_email === 'string') {
          const rec = body.recovery_email.trim().toLowerCase();
          if (rec && !isValidEmail(rec)) return withCors(apiError('Invalid recovery email'));
          patch.recovery_email = rec || null;
        }
        if (typeof body.phone_number === 'string') patch.phone_number = body.phone_number.trim() || null;
        if (typeof body.avatar_url === 'string') patch.avatar_url = body.avatar_url.trim() || null;

        const userId = session.authUser!.id;
        const res = await SB.adminFetch(
          env,
          `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
          { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) },
        );
        if (!res.ok) return withCors(apiError('Could not update profile', 400));

        const rows = (await res.json()) as Record<string, any>[];
        return withCors(json({ ok: true, user: presentUser(rows[0], session.authUser, env) }));
      }

      // ------------------------------------------------------- sessions
      if (pathname === '/api/auth/sessions' && request.method === 'GET') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const currentSid = getCookie(request, 'gothwad_sid');
        const res = await SB.adminFetch(
          env,
          `/rest/v1/user_sessions?user_id=eq.${encodeURIComponent(session.authUser!.id)}&order=last_active.desc&select=*`,
        );
        const rows = (await res.json()) as Record<string, any>[];
        const sessions = (rows || []).map((r) => ({ ...r, is_current: r.id === currentSid }));
        return withCors(json({ ok: true, sessions }));
      }

      // Ek specific device se sign-out (remote revoke)
      if (pathname === '/api/auth/sessions/revoke' && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const sessionId = String(body.session_id || '');
        if (!sessionId) return withCors(apiError('session_id is required'));

        // NOTE: user_id filter = user sirf APNA session delete kar sake
        await SB.adminFetch(
          env,
          `/rest/v1/user_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(session.authUser!.id)}`,
          { method: 'DELETE' },
        );
        return withCors(json({ ok: true, message: 'Device signed out' }));
      }

      // Saare other devices se sign-out
      if (pathname === '/api/auth/sessions/revoke-others' && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const currentSid = getCookie(request, 'gothwad_sid') || '';
        await SB.adminFetch(
          env,
          `/rest/v1/user_sessions?user_id=eq.${encodeURIComponent(session.authUser!.id)}&id=neq.${encodeURIComponent(currentSid)}`,
          { method: 'DELETE' },
        );
        return withCors(json({ ok: true, message: 'All other devices signed out' }));
      }

      return withCors(apiError('Endpoint not found', 404));
    } catch (err: any) {
      console.error('Worker error:', err);
      return withCors(apiError('Internal server error', 500));
    }
  },
};
