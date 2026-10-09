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
  /** Secret for signing OAuth access tokens (JWT HS256). `wrangler secret put JWT_SECRET` */
  JWT_SECRET?: string;
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
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gothwad-Refresh');
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
 * Request se session verify karo.
 *
 * TOKEN KE 2 SOURCES (hybrid auth):
 *   1. Headers: Authorization: Bearer + X-Gothwad-Refresh
 *      (SPA/iframe/webview ke liye — jahan third-party cookies block hote hain)
 *   2. HttpOnly cookies (gothwad_at / gothwad_rt)
 *      (production SSO ke liye — subdomains share karte hain)
 *
 * Access token expire ho gaya ho to refresh token se automatically
 * naya token le lete hain (JWT session management — auto-refresh + rotation).
 */
async function resolveSession(
  request: Request,
  env: Env,
): Promise<{
  ok: boolean;
  accessToken?: string;
  newCookies?: string[];
  newTokens?: { access_token: string; refresh_token: string };
  authUser?: Record<string, any>;
}> {
  // Priority: headers (explicit) → cookies (automatic)
  const authHeader = request.headers.get('Authorization') || '';
  const headerAccess = authHeader.replace('Bearer ', '').trim();
  const headerRefresh = (request.headers.get('X-Gothwad-Refresh') || '').trim();
  const accessToken = headerAccess || getCookie(request, 'gothwad_at');
  const refreshToken = headerRefresh || getCookie(request, 'gothwad_rt');

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
      const sessionId = getCookie(request, 'gothwad_sid');
      const newTokens = {
        access_token: data.access_token as string,
        refresh_token: data.refresh_token as string,
      };
      return {
        ok: true,
        accessToken: data.access_token,
        authUser: data.user,
        newTokens, // client (frontend) ko body mein bhejne ke liye — rotation!
        newCookies: sessionCookies(request, env, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
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

// =============================================================================
// STEP 2 — OAUTH 2.0 PROVIDER HELPERS ("Sign in with Gothwad")
// =============================================================================
// Gothwad khud ek OAuth 2.0 provider hai. GrixChat / ClashDrive / Notes jaisi
// apps "Sign in with Gothwad" button lagakar user ko yahan bhejti hain.
//
// Standard OAuth 2.0 Authorization Code flow + PKCE (mobile/SPA ke liye).
// Docs: docs/OAUTH.md

/** Konsi scopes supported hain — aur consent screen par kya dikhega. */
const OAUTH_SCOPES: Record<string, string> = {
  profile: 'View your basic profile (name, username, avatar)',
  email: 'View your Gothwad email address',
  drive: 'Read & write files in your Gothwad Drive',
  'drive.read': 'View files in your Gothwad Drive',
  notes: 'Read & write your Gothwad Notes',
  chat: 'Access your Gothwad Chat messages',
  offline_access: 'Keep you signed in to this app even when you are away',
};

/** Space-separated scope string → clean array (unknown scopes hata do). */
function parseScopes(scopeStr: string): string[] {
  return String(scopeStr || '')
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s && OAUTH_SCOPES[s]);
}

/* --------------------------- base64url + hashing helpers ------------------- */

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Random secure token (codes, refresh tokens ke liye). */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------- JWT (HS256) ------------------------------- */
// Access token ek signed JWT hota hai. Koi bhi app /oauth/userinfo par isse
// bhej sakta hai — Worker signature verify karke profile deta hai.

async function signJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!ok) return null;

    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

/* --------------------------- OAuth request body ---------------------------- */
// OAuth spec form-encoding use karta hai, lekin hum JSON bhi accept karte hain
// taaki beginner apps ko dikkat na ho.

async function readFormOrJson(request: Request): Promise<Record<string, any>> {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text));
  }
  return readJson(request);
}

/* ------------------------------ OAuth clients ------------------------------ */
// Client = ecosystem app (jaise gothwad-chat). DB mein registered hona zaroori.

async function findOAuthClient(env: Env, clientId: string): Promise<Record<string, any> | null> {
  // Pehle client_id se, phir id se (dono same ho sakte hain)
  for (const col of ['client_id', 'id']) {
    const res = await SB.adminFetch(
      env,
      `/rest/v1/ecosystem_apps?${col}=eq.${encodeURIComponent(clientId)}&select=*`,
    );
    const rows = (await res.json()) as Record<string, any>[];
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
}

/**
 * redirect_uri check — SIRF registered URLs allowed (security!).
 * Phle exact match; DEV_MODE mein localhost URLs extra allowed (testing ke liye).
 */
function isRedirectUriAllowed(env: Env, client: Record<string, any>, redirectUri: string): boolean {
  const allowed: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
  if (allowed.includes(redirectUri)) return true;
  if (env.DEV_MODE === 'true') {
    try {
      const u = new URL(redirectUri);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    } catch { /* invalid URL */ }
  }
  return false;
}

/** PKCE verify: SHA256(code_verifier) === code_challenge (method S256) */
async function verifyPkce(verifier: string, challenge: string | null, method: string | null): Promise<boolean> {
  if (!challenge) return true; // PKCE optional (confidential clients)
  if (method && method !== 'S256') return false; // sirf S256 supported
  const computed = await sha256Base64Url(verifier);
  return computed === challenge;
}

/** Client secret check — sirf confidential clients (secret_hash set ho) ke liye. */
async function verifyClientSecret(client: Record<string, any>, secret: string | undefined): Promise<boolean> {
  if (!client.secret_hash) return true; // public client (PKCE se protected)
  if (!secret) return false;
  return (await sha256Hex(secret)) === client.secret_hash;
}

/** OAuth access token banao (1 ghanta valid). */
async function issueAccessToken(env: Env, opts: {
  userId: string; username: string; clientId: string; scopes: string[];
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: env.AUTH_HUB_URL,          // issuer: Gothwad Accounts
    sub: opts.userId,               // subject: user ki id
    aud: opts.clientId,             // audience: kaunsi app
    client_id: opts.clientId,
    username: opts.username,
    scope: opts.scopes.join(' '),
    iat: now,
    exp: now + 3600,                // 1 hour
    jti: randomToken().slice(0, 16), // unique token id
  }, env.JWT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * CONSENT PAGE — Worker khud render karta hai (self-contained HTML).
 * Isliye accounts site par sirf 3 routes hain: /signin, /signup, /me.
 * Allow/Deny button /oauth/decision ko call karta hai, phir app par redirect.
 */
function consentPageHtml(
  env: Env,
  client: Record<string, any>,
  authUser: Record<string, any>,
  profile: Record<string, any> | null,
  params: URLSearchParams,
): Response {
  const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  // User ki identity (profile se, fallback auth metadata se)
  const username = profile?.username || authUser.user_metadata?.username || String(authUser.email || '').split('@')[0] || 'user';
  const firstName = profile?.first_name || authUser.user_metadata?.first_name || '';
  const lastName = profile?.last_name || authUser.user_metadata?.last_name || '';
  const displayName = `${firstName} ${lastName}`.trim() || username;
  const initials = ((firstName[0] || username[0] || '?') + (lastName[0] || '')).toUpperCase();

  const scopeIcons: Record<string, string> = {
    profile: '🪪', email: '📧', drive: '☁️', 'drive.read': '☁️',
    notes: '📝', chat: '💬', offline_access: '🕐',
  };
  const scopes = parseScopes(params.get('scope') || '');
  const scopeItems = scopes.map((s) => `
    <div class="scope">
      <div class="scope-icon">${scopeIcons[s] || '🔑'}</div>
      <div><div class="scope-name">${esc(s)}</div>
      <div class="scope-desc">${esc(OAUTH_SCOPES[s] || '')}</div></div>
    </div>`).join('');

  const data = {
    client_id: params.get('client_id') || '',
    redirect_uri: params.get('redirect_uri') || '',
    response_type: params.get('response_type') || 'code',
    scope: params.get('scope') || '',
    state: params.get('state') || '',
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || 'S256',
  };

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Authorize — Gothwad</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0d1117; color: #e6edf3;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  body::before { content: ''; position: fixed; inset: 0 0 auto 0; height: 280px;
    background: radial-gradient(ellipse 80% 100% at 50% -30%, rgba(47,128,237,0.16), transparent 70%); }
  .card { background: #161b22; border: 1px solid #2a3140; border-radius: 18px; padding: 36px 30px;
          max-width: 460px; width: 100%; box-shadow: 0 8px 30px rgba(0,0,0,0.45); position: relative; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 20px; }
  .brand img { width: 52px; height: 52px; border-radius: 15px; box-shadow: 0 4px 14px rgba(47,128,237,0.35); }
  .brand span { font-size: 22px; font-weight: 700; background: linear-gradient(120deg,#4da3ff,#2980eb);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  h1 { font-size: 19px; font-weight: 700; text-align: center; letter-spacing: -0.01em; }
  .sub { text-align: center; color: #8b98a9; font-size: 13px; margin: 6px 0 20px; }
  .user { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #1c2330;
          border: 1px solid #2a3140; border-radius: 12px; margin-bottom: 18px; }
  .user .av { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg,#2f80ed,#1b5fc1);
              color: #fff; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .user .n { font-size: 13px; font-weight: 600; } .user .e { font-size: 11px; color: #8b98a9; font-family: monospace; }
  .label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
           color: #6a7686; margin-bottom: 10px; }
  .scope { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #1c2330;
           border: 1px solid #2a3140; border-radius: 10px; margin-bottom: 8px; }
  .scope-icon { width: 34px; height: 34px; border-radius: 10px; background: #0f141b; display: flex;
                align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .scope-name { font-size: 12.5px; font-weight: 600; } .scope-desc { font-size: 11px; color: #8b98a9; margin-top: 1px; }
  .note { background: rgba(47,128,237,0.12); border: 1px solid rgba(47,128,237,0.35); color: #a8c7f5;
          border-radius: 10px; padding: 11px 13px; font-size: 11.5px; line-height: 1.55; margin: 16px 0; }
  .row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; margin-top: 4px; }
  .btn { padding: 12px 18px; border-radius: 12px; border: none; font-size: 13.5px; font-weight: 700;
         font-family: inherit; cursor: pointer; width: 100%; transition: background 0.15s; }
  .btn-ghost { background: transparent; color: #e6edf3; border: 1px solid #2a3140; }
  .btn-ghost:hover { background: #21283a; }
  .btn-primary { background: #2f80ed; color: #fff; box-shadow: 0 4px 16px rgba(47,128,237,0.3); }
  .btn-primary:hover { background: #4da3ff; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.25);
             border-top-color: #fff; border-radius: 50%; animation: sp 0.7s linear infinite; vertical-align: -2px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  .err { background: rgba(240,71,71,0.12); border: 1px solid rgba(240,71,71,0.35); color: #ff8a8a;
         border-radius: 10px; padding: 11px 13px; font-size: 12px; margin-bottom: 14px; display: none; }
</style></head>
<body>
  <div class="card">
    <div class="brand"><img src="/favicon.ico" onerror="this.style.display='none'" alt="Gothwad" /><span>Gothwad</span></div>
    <h1>${esc(client.name)} wants to access your account</h1>
    <p class="sub">Gothwad Account se sign in kar rahe ho</p>

    <div class="user">
      <div class="av">${esc(initials)}</div>
      <div><div class="n">${esc(displayName)}</div>
      <div class="e">${esc(username)}@${esc(env.APP_DOMAIN)}</div></div>
    </div>

    <div class="label">This will allow the app to:</div>
    ${scopeItems}

    <div class="note">🔒 Gothwad kabhi aapka password app ke saath share nahi karta.
      Access kabhi bhi <b>/me → Connected apps</b> se hata sakte ho.</div>

    <div class="err" id="err"></div>
    <div class="row">
      <button class="btn btn-ghost" id="deny">Deny</button>
      <button class="btn btn-primary" id="allow">Allow access</button>
    </div>
  </div>
<script>
  const data = ${JSON.stringify(data)};
  async function decide(approved) {
    const btn = document.getElementById(approved ? 'allow' : 'deny');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (approved ? 'Authorizing…' : 'Denying…');
    try {
      // Absolute path use karo "/api/oauth/decision" — "/oauth/decision" bina /api ke
      // Worker tak nahi pahunchta jab Worker sirf accounts.gothwadtech.com/api/* par ho.
      // Router "/api" prefix strip kar deta hai, isliye yeh api.* domain par bhi chalta hai.
      const res = await fetch('/api/oauth/decision', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, ...data }),
      });
      const out = await res.json();
      if (!res.ok || !out.redirect_url) throw new Error(out.error || 'Authorization failed');
      location.href = out.redirect_url;
    } catch (e) {
      const err = document.getElementById('err');
      err.textContent = e.message; err.style.display = 'block';
      btn.disabled = false; btn.textContent = approved ? 'Allow access' : 'Deny';
    }
  }
  document.getElementById('allow').onclick = () => decide(true);
  document.getElementById('deny').onclick = () => decide(false);
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
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
      const pathname = url.pathname;
    const route = pathname.startsWith('/api') ? pathname.slice(4) : pathname;

      // -------------------------------------------------------------- health
      if (route === '/health' && request.method === 'GET') {
        return withCors(json({ status: 'ok', service: 'gothwad-auth-api', time: new Date().toISOString() }));
      }

      // ------------------------------------------------- check-username (GET)
      // Signup page live check karta hai: username available hai ya nahi.
      if (route === '/auth/check-username' && request.method === 'GET') {
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
      if (route === '/auth/signup' && request.method === 'POST') {
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
            {
              ok: true,
              user: presentUser(profile, login.user, env),
              // Hybrid auth: cookies SET hote hain + tokens body mein bhi
              // (iframe/webview mein third-party cookies block hote hain —
              //  wahan frontend in tokens ko sessionStorage mein rakhta hai)
              access_token: login.access_token,
              refresh_token: login.refresh_token,
              session_id: sessionId,
            },
            201,
            cookies.map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // ---------------------------------------------------------- signin
      // Identifier = username ya full email, dono chalte hain.
      if (route === '/auth/signin' && request.method === 'POST') {
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
            {
              ok: true,
              user: presentUser(profile, auth.user, env),
              // Hybrid auth: cookies SET + tokens body mein (iframe/webview safe)
              access_token: auth.access_token,
              refresh_token: auth.refresh_token,
              session_id: sessionId,
            },
            200,
            cookies.map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // ---------------------------------------------------------- signout
      if (route === '/auth/signout' && request.method === 'POST') {
        // Hybrid auth: headers (token) ya cookies — dono se signout chalta hai.
        // resolveSession auto-refresh bhi kar sakta hai, taaki expired access
        // ke saath bhi refresh-token family properly revoke ho.
        const session = await resolveSession(request, env);

        if (session.ok && session.accessToken) {
          // Supabase side poora token family revoke karo
          await fetch(SB.authUrl(env, '/logout'), {
            method: 'POST',
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` },
          }).catch(() => undefined);
        }

        // Device session row hatao (frontend body mein session_id bhejta hai,
        // fallback: gothwad_sid cookie)
        const body = await readJson(request);
        const sessionId = String(body.session_id || '') || getCookie(request, 'gothwad_sid');
        if (sessionId && session.ok) {
          // user_id guard: user sirf APNA session row delete kar sake
          await SB.adminFetch(
            env,
            `/rest/v1/user_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(session.authUser!.id)}`,
            { method: 'DELETE' },
          ).catch(() => undefined);
        }

        return withCors(
          json({ ok: true, message: 'Signed out' }, 200, clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string])),
        );
      }

      // ------------------------------------------------------- session (me)
      // Frontend page-load par call karta hai: "logged-in hoon kya?"
      // Access token expire ho to automatically refresh ho jaata hai.
      if (route === '/auth/me' && request.method === 'GET') {
        const session = await resolveSession(request, env);
        if (!session.ok) {
          return withCors(
            json({ authenticated: false }, 200, clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string])),
          );
        }

        const profile = await fetchProfile(env, session.authUser!.id);
        const headers: [string, string][] = (session.newCookies || []).map((c) => ['Set-Cookie', c]);

        // Body mein tokens: rotation ke baad NAYA refresh token zaroor bhejo
        // (warna frontend ka purana token revoke ho jaata hai), warna current access.
        const body: Record<string, any> = { authenticated: true, user: presentUser(profile, session.authUser, env) };
        if (session.newTokens) {
          body.access_token = session.newTokens.access_token;
          body.refresh_token = session.newTokens.refresh_token;
        } else if (session.accessToken) {
          body.access_token = session.accessToken;
        }
        return withCors(json(body, 200, headers));
      }

      // ------------------------------------------------- refresh (rotation)
      // Single-flight refresh ke liye: frontend token expire hone par YAHAN
      // ek hi dafa refresh karta hai (parallel requests ek hi refresh ka
      // intezaar karti hain — rotation race khatam!).
      if (route === '/auth/refresh' && request.method === 'POST') {
        const body = await readJson(request);
        const refresh =
          (request.headers.get('X-Gothwad-Refresh') || '').trim() ||
          String(body.refresh_token || '').trim();
        if (!refresh) return withCors(apiError('Missing refresh token', 401));

        const res = await fetch(SB.authUrl(env, '/token?grant_type=refresh_token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        const data = (await res.json()) as Record<string, any>;
        if (!res.ok || !data.access_token) {
          return withCors(apiError('Session expired, please sign in again', 401));
        }

        // Purana session id rakho (device row continuity ke liye)
        const sessionId = String(body.session_id || '') || getCookie(request, 'gothwad_sid');
        const newTokens = {
          access_token: data.access_token as string,
          refresh_token: data.refresh_token as string,
        };
        const headers: [string, string][] = sessionCookies(request, env, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          session_id: sessionId,
          remember: true,
        }).map((c) => ['Set-Cookie', c]);

        return withCors(
          json(
            {
              ok: true,
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              session_id: sessionId || undefined,
            },
            200,
            headers,
          ),
        );
      }

      // ------------------------------------------------- forgot-password
      // Sirf username maango. Reset link RECOVERY email par jaata hai.
      // (Hamesha same generic response — taaki koi pata na laga sake ki
      //  kaunsa username exist karta hai. Security best-practice.)
      if (route === '/auth/forgot-password' && request.method === 'POST') {
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
            options: { redirect_to: `${env.AUTH_HUB_URL}/signin` },
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
      if (route === '/auth/reset-password' && request.method === 'POST') {
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
      if (route === '/auth/change-password' && request.method === 'POST') {
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
      if (route === '/auth/update-profile' && request.method === 'POST') {
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
      if (route === '/auth/sessions' && request.method === 'GET') {
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
      if (route === '/auth/sessions/revoke' && request.method === 'POST') {
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
      if (route === '/auth/sessions/revoke-others' && request.method === 'POST') {
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

      // ================================================================
      // STEP 2 — OAUTH 2.0 PROVIDER ("Sign in with Gothwad")
      // External apps ke liye canonical paths: /oauth/* (bina /api ke bhi chalte hain)
      // ================================================================

      // ------------------------------------------- /oauth/app-info (GET)
      // Consent screen ko app ka naam chahiye hota hai. Public info only.
      if (route === '/oauth/app-info' && request.method === 'GET') {
        const clientId = url.searchParams.get('client_id') || '';
        const client = await findOAuthClient(env, clientId);
        if (!client) return withCors(apiError('Unknown OAuth client', 404));
        return withCors(json({
          id: client.id,
          name: client.name,
          icon: client.icon,
          is_verified: !!client.is_verified,
          scopes_supported: Object.keys(OAUTH_SCOPES),
        }));
      }

      // --------------------------------------------- /oauth/authorize (GET)
      // User ko "Sign in with Gothwad" button yahan bhejta hai.
      // Flow: validate params → login hai? → consent screen par redirect.
      if (route === '/oauth/authorize' && request.method === 'GET') {
        const clientId = url.searchParams.get('client_id') || '';
        const redirectUri = url.searchParams.get('redirect_uri') || '';
        const responseType = url.searchParams.get('response_type') || '';
        const scopes = parseScopes(url.searchParams.get('scope') || '');

        const client = await findOAuthClient(env, clientId);
        if (!client) return withCors(apiError('Unknown client_id', 400));
        if (responseType !== 'code') return withCors(apiError('Only response_type=code is supported', 400));
        if (!isRedirectUriAllowed(env, client, redirectUri)) {
          return withCors(apiError('redirect_uri is not registered for this app', 400));
        }
        if (scopes.length === 0) return withCors(apiError('At least one valid scope is required', 400));

        // Public clients (secret nahi) ke liye PKCE mandatory — security best practice
        const challenge = url.searchParams.get('code_challenge');
        const isPublicClient = !client.secret_hash;
        if (isPublicClient && !challenge) {
          return withCors(apiError('PKCE required: pass code_challenge (S256)', 400));
        }

        // Logged-in nahi? → signin page par bhejo, login ke baad wapas yahin
        const session = await resolveSession(request, env);
        if (!session.ok) {
          const loginUrl = `${env.AUTH_HUB_URL}/signin?next=${encodeURIComponent(url.toString())}`;
          return withCors(new Response(null, { status: 302, headers: { Location: loginUrl } }));
        }

        // Logged-in → consent screen (Worker khud HTML render karta hai —
        // site par koi extra route/page nahi chahiye!)
        const profile = await fetchProfile(env, session.authUser!.id);
        return withCors(consentPageHtml(env, client, session.authUser!, profile, url.searchParams));
      }

      // ---------------------------------------------- /oauth/decision (POST)
      // Consent screen se: user ne Allow/Deny kiya.
      if ((route === '/oauth/decision' || route === '/oauth/authorize/decision') && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const approved = body.approved === true;
        const clientId = String(body.client_id || '');
        const redirectUri = String(body.redirect_uri || '');
        const state = body.state ? String(body.state) : '';
        const scopes = parseScopes(String(body.scope || ''));
        const challenge = body.code_challenge ? String(body.code_challenge) : null;
        const challengeMethod = body.code_challenge_method ? String(body.code_challenge_method) : 'S256';

        const client = await findOAuthClient(env, clientId);
        if (!client) return withCors(apiError('Unknown client_id', 400));
        if (!isRedirectUriAllowed(env, client, redirectUri)) {
          return withCors(apiError('redirect_uri is not registered', 400));
        }

        // User ne DENY kiya → error ke saath app par wapas
        if (!approved) {
          const denyUrl = `${redirectUri}?error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ''}`;
          return withCors(json({ redirect_url: denyUrl }));
        }

        if (scopes.length === 0) return withCors(apiError('No valid scopes requested', 400));

        // One-time authorization code banao (5 minute valid)
        const code = randomToken();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await SB.adminFetch(env, '/rest/v1/oauth_auth_codes', {
          method: 'POST',
          body: JSON.stringify({
            code,
            client_id: client.id,
            user_id: session.authUser!.id,
            redirect_uri: redirectUri,
            scopes,
            code_challenge: challenge,
            code_challenge_method: challenge ? challengeMethod : null,
            expires_at: expiresAt,
            used: false,
          }),
        });

        // Grant save (dashboard mein "Connected apps" dikhta hai)
        // Pehle check, phir insert/update — taaki duplicate na bane
        const existingRes = await SB.adminFetch(
          env,
          `/rest/v1/app_authorizations?user_id=eq.${encodeURIComponent(session.authUser!.id)}&app_id=eq.${encodeURIComponent(client.id)}&select=id`,
        );
        const existingRows = (await existingRes.json()) as Record<string, any>[];
        const grantBody = {
          user_id: session.authUser!.id,
          app_id: client.id,
          scopes,
          granted_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        };
        if (existingRows.length > 0) {
          await SB.adminFetch(env, `/rest/v1/app_authorizations?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ scopes, last_used_at: new Date().toISOString() }),
          });
        } else {
          await SB.adminFetch(env, '/rest/v1/app_authorizations', { method: 'POST', body: JSON.stringify(grantBody) });
        }

        // App par wapas: code + state ke saath (standard OAuth redirect)
        const backUrl = `${redirectUri}?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
        return withCors(json({ redirect_url: backUrl }));
      }

      // -------------------------------------------------- /oauth/token (POST)
      // App apna code yahan token se exchange karta hai.
      // grant_type=authorization_code  ya  grant_type=refresh_token
      // (form-encoding standard hai — JSON bhi accept karte hain)
      if (route === '/oauth/token' && request.method === 'POST') {
        const body = await readFormOrJson(request);
        const grantType = String(body.grant_type || '');
        const clientId = String(body.client_id || '');
        const clientSecret = body.client_secret ? String(body.client_secret) : undefined;

        const client = await findOAuthClient(env, clientId);
        if (!client) return withCors(json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 401));
        if (!(await verifyClientSecret(client, clientSecret))) {
          return withCors(json({ error: 'invalid_client', error_description: 'Bad client_secret' }, 401));
        }

        // ---- Authorization Code grant ----
        if (grantType === 'authorization_code') {
          const code = String(body.code || '');
          const redirectUri = String(body.redirect_uri || '');
          const codeVerifier = body.code_verifier ? String(body.code_verifier) : '';

          const codeRes = await SB.adminFetch(env, `/rest/v1/oauth_auth_codes?code=eq.${encodeURIComponent(code)}&select=*`);
          const codeRows = (await codeRes.json()) as Record<string, any>[];
          const row = codeRows[0];

          // Har check zaroori hai: code ek baar hi use ho sakta hai!
          if (!row || row.used) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Code is invalid or already used' }, 400));
          }
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Code expired' }, 400));
          }
          if (row.client_id !== client.id || row.redirect_uri !== redirectUri) {
            return withCors(json({ error: 'invalid_grant', error_description: 'redirect_uri or client mismatch' }, 400));
          }
          if (!(await verifyPkce(codeVerifier, row.code_challenge, row.code_challenge_method))) {
            return withCors(json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400));
          }

          // Code burn — reuse rokne ke liye turant used mark karo
          await SB.adminFetch(env, `/rest/v1/oauth_auth_codes?code=eq.${encodeURIComponent(code)}`, {
            method: 'PATCH', body: JSON.stringify({ used: true }),
          });

          const profile = await fetchProfile(env, row.user_id);
          const username = profile?.username || '';
          const scopes: string[] = row.scopes || [];
          const accessToken = await issueAccessToken(env, {
            userId: row.user_id, username, clientId: client.id, scopes,
          });

          const response: Record<string, any> = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: scopes.join(' '),
          };

          // offline_access scope → refresh token (30 din, DB mein sirf hash)
          if (scopes.includes('offline_access')) {
            const rt = randomToken();
            await SB.adminFetch(env, '/rest/v1/oauth_refresh_tokens', {
              method: 'POST',
              body: JSON.stringify({
                token_hash: await sha256Hex(rt),
                user_id: row.user_id,
                client_id: client.id,
                scopes,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                revoked: false,
              }),
            });
            response.refresh_token = rt;
          }

          return withCors(json(response));
        }

        // ---- Refresh Token grant (rotation ke saath) ----
        if (grantType === 'refresh_token') {
          const rt = String(body.refresh_token || '');
          const hash = await sha256Hex(rt);

          const rtRes = await SB.adminFetch(env, `/rest/v1/oauth_refresh_tokens?token_hash=eq.${encodeURIComponent(hash)}&select=*`);
          const rtRows = (await rtRes.json()) as Record<string, any>[];
          const row = rtRows[0];

          if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' }, 400));
          }
          if (row.client_id !== client.id) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Token was issued to another app' }, 400));
          }

          // ROTATION: purana token revoke, naya bhejo (token leak par purana bekaar)
          await SB.adminFetch(env, `/rest/v1/oauth_refresh_tokens?token_hash=eq.${encodeURIComponent(hash)}`, {
            method: 'PATCH', body: JSON.stringify({ revoked: true }),
          });

          const profile = await fetchProfile(env, row.user_id);
          const accessToken = await issueAccessToken(env, {
            userId: row.user_id,
            username: profile?.username || '',
            clientId: client.id,
            scopes: row.scopes || [],
          });

          const newRt = randomToken();
          await SB.adminFetch(env, '/rest/v1/oauth_refresh_tokens', {
            method: 'POST',
            body: JSON.stringify({
              token_hash: await sha256Hex(newRt),
              user_id: row.user_id,
              client_id: client.id,
              scopes: row.scopes || [],
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              revoked: false,
            }),
          });

          return withCors(json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: (row.scopes || []).join(' '),
            refresh_token: newRt,
          }));
        }

        return withCors(json({ error: 'unsupported_grant_type' }, 400));
      }

      // ------------------------------------------------ /oauth/userinfo (GET)
      // Apps yahan se user ka profile leti hain (Bearer access_token ke saath).
      // Response scopes par depend karta hai — jyada data kabhi nahi.
      if (route === '/oauth/userinfo' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) return withCors(json({ error: 'invalid_token' }, 401));

        const payload = await verifyJwt(token, env.JWT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY);
        if (!payload) return withCors(json({ error: 'invalid_token' }, 401));

        const scopes: string[] = String(payload.scope || '').split(' ').filter(Boolean);
        const profile = await fetchProfile(env, String(payload.sub));

        const info: Record<string, any> = { sub: payload.sub };

        if (scopes.includes('profile')) {
          info.name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
          info.preferred_username = profile?.username || payload.username;
          info.picture = profile?.avatar_url || null;
          info.updated_at = profile?.updated_at || null;
        }
        if (scopes.includes('email')) {
          info.email = `${profile?.username || payload.username}@${env.APP_DOMAIN}`; // derived (Rule #2)
          info.email_verified = true;
        }
        if (scopes.includes('drive') || scopes.includes('drive.read')) {
          info.drive = {
            used_bytes: Number(profile?.storage_used_bytes || 0),
            limit_bytes: Number(profile?.storage_limit_bytes || 0),
            write_access: scopes.includes('drive'),
          };
        }
        return withCors(json(info));
      }

      // ------------------------------ /api/oauth/authorizations (GET, session)
      // Dashboard ke "Connected apps" tab ke liye: user ke grants + app details.
      if (route === '/oauth/authorizations' && request.method === 'GET') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const uid = session.authUser!.id;
        const [grantsRes, appsRes] = await Promise.all([
          SB.adminFetch(env, `/rest/v1/app_authorizations?user_id=eq.${encodeURIComponent(uid)}&select=*`),
          SB.adminFetch(env, `/rest/v1/ecosystem_apps?select=*`),
        ]);
        const grants = (await grantsRes.json()) as Record<string, any>[];
        const apps = (await appsRes.json()) as Record<string, any>[];

        const connected = (grants || []).map((g) => {
          const app = (apps || []).find((a) => a.id === g.app_id) || {};
          return {
            app_id: g.app_id,
            name: app.name || g.app_id,
            icon: app.icon || 'app',
            scopes: g.scopes || [],
            granted_at: g.granted_at,
            last_used_at: g.last_used_at,
          };
        });
        return withCors(json({ ok: true, connected, apps: (apps || []).map((a) => ({ id: a.id, name: a.name, icon: a.icon, description: a.description })) }));
      }

      // ------------------------------------- /api/oauth/revoke (POST, session)
      // Dashboard se "Disconnect" — grant + refresh tokens sab revoke.
      if (route === '/oauth/revoke' && request.method === 'POST') {
        const session = await resolveSession(request, env);
        if (!session.ok) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const appId = String(body.app_id || '');
        if (!appId) return withCors(apiError('app_id is required'));
        const uid = session.authUser!.id;

        await SB.adminFetch(
          env,
          `/rest/v1/app_authorizations?user_id=eq.${encodeURIComponent(uid)}&app_id=eq.${encodeURIComponent(appId)}`,
          { method: 'DELETE' },
        );
        await SB.adminFetch(
          env,
          `/rest/v1/oauth_refresh_tokens?user_id=eq.${encodeURIComponent(uid)}&client_id=eq.${encodeURIComponent(appId)}`,
          { method: 'PATCH', body: JSON.stringify({ revoked: true }) },
        );
        return withCors(json({ ok: true, message: 'App disconnected' }));
      }

      return withCors(apiError('Endpoint not found', 404));
    } catch (err: any) {
      console.error('Worker error:', err);
      return withCors(apiError('Internal server error', 500));
    }
  },
};
