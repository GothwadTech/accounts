/**
 * =============================================================================
 * GOTHWAD ACCOUNTS — 100% CLOUDFLARE NATIVE AUTH & OAUTH 2.0 WORKER
 * =============================================================================
 * Zero Supabase. Zero external auth vendor. Zero MAU cap. Zero 7-day auto-pause.
 *
 * Yeh single Cloudflare Worker poore Gothwad Ecosystem ka Identity Hub hai:
 *   1. Native Auth Engine:
 *      - WebCrypto PBKDF2-HMAC-SHA256 (100,000 iterations + random 16B salt)
 *      - Constant-time hash verification (timing-attack safe)
 *      - Hybrid Session Model: HttpOnly `.APP_DOMAIN` SSO cookies + Bearer headers
 *      - SHA-256 hashed refresh token rotation + instant remote device sign-out
 *      - Single-use 15-minute password recovery links (Resend email + DEV_MODE)
 *   2. Storage Engine:
 *      - Cloudflare D1 (`env.DB`) SQLite — 100% Pure Username DB (NO email column!)
 *      - Profile Avatars via Cloudflare D1 `user_avatars` + Global Edge CDN Cache
 *        (with transparent zero-change drop-in support for R2 `env.AVATARS_BUCKET`)
 *      - Auto-Schema Bootstrap on cold start (`ensureSchema`) + numbered SQL in `sql/`
 *   3. OAuth 2.0 Provider ("Sign in with Gothwad"):
 *      - `/oauth/authorize`, `/oauth/decision`, `/oauth/token`, `/oauth/userinfo`
 *      - Mandatory S256 PKCE for public clients, atomic one-time code & refresh rotation
 *      - Strict JWT `token_use` isolation (`session` vs `oauth_access`)
 *   4. Internal Server-to-Server Lookup (`GET /api/internal/usernames/:username`):
 *      - Constant-time `MAIL_INTERNAL_TOKEN` check for Gothwad Mail inbound routing
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Minimal Cloudflare D1 & R2 Type Definitions (Zero extra NPM packages required)
// -----------------------------------------------------------------------------

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = Record<string, any>> {
  success: boolean;
  results: T[];
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, any>>(colName?: string): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface R2ObjectBody {
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
  httpEtag?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

// -----------------------------------------------------------------------------
// Environment Bindings (`wrangler.toml` + `wrangler secret put`)
// -----------------------------------------------------------------------------

export interface Env {
  /** Primary Cloudflare D1 SQLite database binding (`gothwad-accounts-db`) */
  DB: D1Database;
  /** Optional Cloudflare R2 bucket for avatars; falls back to D1 `user_avatars` automatically! */
  AVATARS_BUCKET?: R2Bucket;
  /** Root domain, e.g. "gothwadtech.com" — email is always derived: username@APP_DOMAIN */
  APP_DOMAIN: string;
  /** Public URL of Accounts frontend, e.g. "https://accounts.gothwadtech.com" */
  AUTH_HUB_URL: string;
  /** Dedicated Worker Custom Domain for server-to-server calls, e.g. "api.gothwadtech.com" */
  API_DOMAIN?: string;
  /** Strong random secret for signing HS256 Session & OAuth JWTs (`wrangler secret put JWT_SECRET`) */
  JWT_SECRET?: string;
  /** Shared secret for Mail Worker -> Accounts internal lookup (`wrangler secret put MAIL_INTERNAL_TOKEN`) */
  MAIL_INTERNAL_TOKEN?: string;
  /** Optional Resend API key for outbound password-reset emails (`wrangler secret put RESEND_API_KEY`) */
  RESEND_API_KEY?: string;
  /** Optional sender address for Resend password-reset emails */
  RESEND_FROM?: string;
  /** "true" = local dev helpers (localhost OAuth URIs + dev reset link fallback). MUST be "false" in prod! */
  DEV_MODE?: string;
  /** Optional extra CORS origins (comma-separated) for local/preview testing */
  ALLOWED_ORIGINS?: string;
}

// -----------------------------------------------------------------------------
// Automatic Idempotent D1 Schema Bootstrap (Cold-Start Safe via WeakMap)
// -----------------------------------------------------------------------------
// WHY: Naya D1 database connect karte hi pehli request par saari tables aur
// core ecosystem seeds apne-aap ban jaate hain — aur existing `redirect_uris`
// ya `secret_hash` kabhi overwrite nahi hote!

const initializedDbs = new WeakMap<object, Promise<void>>();

const BOOTSTRAP_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id                  TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    first_name          TEXT NOT NULL DEFAULT '',
    last_name           TEXT NOT NULL DEFAULT '',
    recovery_email      TEXT,
    phone_number        TEXT,
    avatar_url          TEXT,
    date_of_birth       TEXT,
    gender              TEXT,
    two_factor_enabled  INTEGER NOT NULL DEFAULT 0,
    storage_used_bytes  INTEGER NOT NULL DEFAULT 0,
    storage_limit_bytes INTEGER NOT NULL DEFAULT 16106127360,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone_number) WHERE phone_number IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_name TEXT NOT NULL DEFAULT 'Unknown device',
    browser     TEXT NOT NULL DEFAULT 'Unknown',
    os          TEXT,
    ip_address  TEXT,
    remember_me INTEGER NOT NULL DEFAULT 0,
    last_active TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    is_current  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id, last_active DESC)`,
  `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id TEXT REFERENCES user_sessions (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_refresh_session ON auth_refresh_tokens (session_id)`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id)`,
  `CREATE TABLE IF NOT EXISTS ecosystem_apps (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    icon          TEXT,
    redirect_uris TEXT NOT NULL DEFAULT '[]',
    is_verified   INTEGER NOT NULL DEFAULT 0,
    client_id     TEXT UNIQUE,
    secret_hash   TEXT,
    homepage_url  TEXT,
    is_core       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `INSERT INTO ecosystem_apps (id, client_id, name, description, icon, is_verified, is_core) VALUES
    ('gothwad-meet',     'gothwad-meet',     'Gothwad Meet',              'Video meetings for your Gothwad Account', 'video',          1, 1),
    ('gothwad-mail',     'gothwad-mail',     'Gothwad Mail',              'username inbox for your Gothwad Account', 'mail',           1, 1),
    ('kiwi-store',       'kiwi-store',       'Kiwi Store',                'Apps and add-ons for Kiwi Store',         'store',          1, 1),
    ('gothwad-drive',    'gothwad-drive',    'Gothwad Drive',             'Files and folders on your account',       'hard-drive',     1, 1),
    ('gothwad-notes',    'gothwad-notes',    'Gothwad Notes',             'Notes and lists, synced',                 'file-text',      1, 1),
    ('gothwad-calendar', 'gothwad-calendar', 'Gothwad Calendar',          'Events and reminders',                    'calendar',       1, 1),
    ('gothwad-contacts', 'gothwad-contacts', 'Gothwad Contacts',          'People and addresses',                    'users',          1, 1),
    ('gothwad-tube',     'gothwad-tube',     'Gothwad Tube (PlusTube)',   'Video — PlusTube',                        'play',           1, 0),
    ('gothwad-chat',     'gothwad-chat',     'GrixChat (Gothwad Chat)',   'Messaging',                               'message-circle', 1, 0),
    ('gothwad-indogram', 'gothwad-indogram', 'Indogram',                  'Telegram-style chat',                     'send',           1, 0)
  ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS app_authorizations (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    app_id       TEXT NOT NULL REFERENCES ecosystem_apps (id) ON DELETE CASCADE,
    scopes       TEXT NOT NULL DEFAULT '["profile","email"]',
    granted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, app_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_app_auth_user ON app_authorizations (user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_auth_codes (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    redirect_uri          TEXT NOT NULL,
    scopes                TEXT NOT NULL DEFAULT '[]',
    code_challenge        TEXT,
    code_challenge_method TEXT,
    expires_at            TEXT NOT NULL,
    used                  INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_auth_codes (user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
    id         TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id  TEXT NOT NULL,
    scopes     TEXT NOT NULL DEFAULT '[]',
    expires_at TEXT NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens (user_id)`,
  `CREATE TABLE IF NOT EXISTS account_activity (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    detail     TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_account_activity_user ON account_activity (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS user_avatars (
    user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    mime_type  TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data       BLOB NOT NULL,
    byte_size  INTEGER NOT NULL,
    etag       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
];

async function getDb(env: Env): Promise<D1Database> {
  if (!env.DB) {
    throw new DatabaseUnavailableError(
      "Cloudflare D1 binding 'DB' is missing. Add [[d1_databases]] binding = 'DB' in wrangler.toml.",
    );
  }
  const key = env.DB as unknown as object;
  let pending = initializedDbs.get(key);
  if (!pending) {
    pending = env.DB.batch(BOOTSTRAP_STATEMENTS.map((sql) => env.DB.prepare(sql)))
      .then(() => undefined)
      .catch((err) => {
        initializedDbs.delete(key);
        throw err;
      });
    initializedDbs.set(key, pending);
  }
  await pending;
  return env.DB;
}

class DatabaseUnavailableError extends Error {
  constructor(message = 'Database temporarily unavailable') {
    super(message);
  }
}

class OAuthDatabaseError extends Error {
  constructor() {
    super('OAuth database temporarily unavailable');
  }
}

// -----------------------------------------------------------------------------
// Response, Validation & JSON Helpers
// -----------------------------------------------------------------------------

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

function apiError(message: string, status = 400, extraHeaders?: HeadersInit): Response {
  return json({ error: message }, status, extraHeaders);
}

function internalJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    return (await request.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

async function readFormOrJson(request: Request): Promise<Record<string, any>> {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text));
  }
  return readJson(request);
}

function parseJsonStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function identifierLooksLikePhone(raw: string): boolean {
  const digitsOnly = raw.replace(/[\s\-()]/g, '');
  return /^(\+)?[0-9]{7,15}$/.test(digitsOnly);
}

function usernameFromIdentifier(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return lower.includes('@') ? (lower.split('@')[0] || '') : lower;
}

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'assets', 'mail', 'email', 'smtp', 'imap', 'pop',
  'support', 'help', 'root', 'security', 'billing', 'legal', 'abuse', 'postmaster',
  'webmaster', 'hostmaster', 'noreply', 'no-reply', 'donotreply', 'www', 'web', 'ftp',
  'cdn', 'static', 'status', 'dev', 'test', 'staging', 'gothwad', 'gothwadtech',
  'login', 'signin', 'signup', 'logout', 'account', 'accounts', 'auth', 'oauth',
  'me', 'everyone', 'team', 'official', 'pay', 'payments', 'wallet', 'store', 'shop',
]);

const CORE_GOTHWAD_SERVICES = new Set([
  'gothwad-meet', 'gothwad-mail', 'kiwi-store', 'gothwad-drive',
  'gothwad-notes', 'gothwad-calendar', 'gothwad-contacts',
]);

const GENDER_VALUES = ['Male', 'Female', 'Other', 'Rather not say'];

// -----------------------------------------------------------------------------
// Cryptography: WebCrypto PBKDF2-SHA256 Passwords, SHA-256 Tokens, HS256 JWTs
// -----------------------------------------------------------------------------
// IMPORTANT CLOUDFLARE WORKERS DETAIL:
// Cloudflare Workers V8 WebCrypto enforces max `100,000` PBKDF2 iterations.
// Format stored in D1: `pbkdf2_sha256$100000$<base64url-salt>$<base64url-hash>`

const PBKDF2_ITERATIONS = 100_000;
const ACCESS_TOKEN_TTL_SECONDS = 3600;               // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;             // 15 minutes
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;               // 5 minutes

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlDecode(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return timingSafeBytesEqual(new Uint8Array(hashA), new Uint8Array(hashB)) && a.length === b.length;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_ITERATIONS) return false;
    const salt = b64urlToBytes(parts[2]);
    const expected = b64urlToBytes(parts[3]);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      keyMaterial,
      expected.length * 8,
    );
    return timingSafeBytesEqual(new Uint8Array(derived), expected);
  } catch {
    return false;
  }
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getSigningSecret(env: Env): string {
  const configured = (env.JWT_SECRET || '').trim();
  if (configured) return configured;
  if (env.DEV_MODE === 'true') return 'gothwad-dev-mode-only-jwt-secret';
  throw new DatabaseUnavailableError(
    "Missing Worker secret 'JWT_SECRET'. Run `npx wrangler secret put JWT_SECRET` or add it in Cloudflare Dashboard -> Variables and Secrets.",
  );
}

async function signJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
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
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = b64urlToBytes(parts[2]);
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!ok) return null;

    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function issueSessionAccessToken(
  env: Env,
  opts: { userId: string; username: string; sessionId?: string | null },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      token_use: 'session',
      iss: env.AUTH_HUB_URL,
      sub: opts.userId,
      username: opts.username,
      sid: opts.sessionId || null,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomToken().slice(0, 16),
    },
    getSigningSecret(env),
  );
}

async function issueOAuthAccessToken(
  env: Env,
  opts: { userId: string; username: string; clientId: string; scopes: string[] },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      token_use: 'oauth_access',
      iss: env.AUTH_HUB_URL,
      sub: opts.userId,
      aud: opts.clientId,
      client_id: opts.clientId,
      username: opts.username,
      scope: opts.scopes.join(' '),
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomToken().slice(0, 16),
    },
    getSigningSecret(env),
  );
}

// -----------------------------------------------------------------------------
// CORS & Subdomain SSO Cookie Helpers
// -----------------------------------------------------------------------------

export function buildCorsHeaders(request: Request, env: Env): Headers {
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
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gothwad-Refresh');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

export function cookieDomain(request: Request, env: Env): string | null {
  const host = new URL(request.url).hostname;
  if (host === env.APP_DOMAIN || host.endsWith(`.${env.APP_DOMAIN}`)) {
    return `.${env.APP_DOMAIN}`;
  }
  return null;
}

function isApiHost(request: Request, env: Env): boolean {
  const apiHost = (env.API_DOMAIN || '').trim().toLowerCase();
  return apiHost !== '' && new URL(request.url).hostname.toLowerCase() === apiHost;
}

function makeCookie(
  request: Request,
  env: Env,
  name: string,
  value: string,
  maxAgeSeconds: number | null,
): string {
  const domain = cookieDomain(request, env);
  const isSecure = new URL(request.url).protocol === 'https:' || !!domain;
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isSecure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

function sessionCookies(
  request: Request,
  env: Env,
  tokens: {
    access_token: string;
    refresh_token: string;
    session_id?: string | null;
    remember: boolean;
  },
): string[] {
  const maxAge = tokens.remember ? 60 * 60 * 24 * 30 : null;
  const cookies = [
    makeCookie(request, env, 'gothwad_at', tokens.access_token, tokens.remember ? ACCESS_TOKEN_TTL_SECONDS : null),
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
// User Lookup, Profile Formatting & Activity Log Helpers (D1 Native)
// -----------------------------------------------------------------------------

function resolveAvatarUrl(rawUrl: string | null | undefined, env: Env): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  // Relative path stored in D1 (`/api/avatars/:id?v=:etag`) -> dynamically resolved
  // against `AUTH_HUB_URL` so domain migration (`gothwad.in`) never breaks avatars!
  const base = (env.AUTH_HUB_URL || '').replace(/\/+$/, '');
  return base ? `${base}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}` : rawUrl;
}

function presentUser(profile: Record<string, any> | null | undefined, env: Env) {
  if (!profile) return null;
  const username = String(profile.username || '');
  return {
    id: String(profile.id || ''),
    username,
    email: username ? `${username}@${env.APP_DOMAIN}` : '',
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    recovery_email: profile.recovery_email || '',
    phone_number: profile.phone_number || '',
    avatar_url: resolveAvatarUrl(profile.avatar_url, env),
    date_of_birth: profile.date_of_birth || null,
    gender: profile.gender || null,
    two_factor_enabled: !!profile.two_factor_enabled,
    storage_used_bytes: Number(profile.storage_used_bytes || 0),
    storage_limit_bytes: Number(profile.storage_limit_bytes ?? 16106127360),
    created_at: profile.created_at || null,
  };
}

async function fetchProfile(db: D1Database, userId: string): Promise<Record<string, any> | null> {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first();
}

async function lookupAccount(
  db: D1Database,
  rawIdentifier: string,
): Promise<{
  exists: boolean;
  userId: string;
  username: string;
  passwordHash: string;
  kind: 'phone' | 'username';
}> {
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };

  if (identifierLooksLikePhone(trimmed)) {
    const cleanDigits = trimmed.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    let row = await db
      .prepare(
        `SELECT u.id, u.username, u.password_hash
           FROM profiles p
           JOIN users u ON u.id = p.id
          WHERE p.phone_number = ?
          LIMIT 1`,
      )
      .bind(trimmed)
      .first();

    if (!row && cleanDigits) {
      row = await db
        .prepare(
          `SELECT u.id, u.username, u.password_hash
             FROM profiles p
             JOIN users u ON u.id = p.id
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(p.phone_number, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
            LIMIT 1`,
        )
        .bind(`%${cleanDigits}`)
        .first();
    }

    if (row?.username) {
      return {
        exists: true,
        userId: String(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        kind: 'phone',
      };
    }
    return { exists: false, userId: '', username: '', passwordHash: '', kind: 'phone' };
  }

  const username = usernameFromIdentifier(trimmed);
  if (!username) return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };

  const row = await db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1')
    .bind(username)
    .first();

  if (!row?.username) {
    return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };
  }

  return {
    exists: true,
    userId: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    kind: 'username',
  };
}

async function logActivity(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  detail?: string,
  request?: Request,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO account_activity (id, user_id, type, title, detail, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        type,
        title,
        detail || null,
        request?.headers.get('CF-Connecting-IP') || null,
        request?.headers.get('User-Agent') || null,
        now,
      )
      .run();

    // Auto-trim older activity rows (> 100 per user) to keep free D1 lean forever
    await db
      .prepare(
        `DELETE FROM account_activity
          WHERE user_id = ?
            AND id NOT IN (
              SELECT id FROM account_activity
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT 100
            )`,
      )
      .bind(userId, userId)
      .run();
  } catch {
    // Best-effort security telemetry: must never fail the primary user action
  }
}

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
// Native Session Resolution + Atomic Refresh Token Rotation
// -----------------------------------------------------------------------------

interface SessionUser {
  id: string;
  username: string;
  sessionId: string | null;
}

async function rotateSessionRefreshToken(
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
  const hash = await sha256Hex(rawRefreshToken);
  const nowIso = new Date().toISOString();

  // Atomic consumption: parallel requests cannot both consume the same refresh token
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
    // Verify device session wasn't remotely revoked & touch `last_active`
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
}

async function resolveSession(
  request: Request,
  db: D1Database,
  env: Env,
): Promise<{
  ok: boolean;
  accessToken?: string;
  newCookies?: string[];
  newTokens?: { access_token: string; refresh_token: string };
  authUser?: SessionUser;
}> {
  const authHeader = request.headers.get('Authorization') || '';
  const headerAccess = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerRefresh = (request.headers.get('X-Gothwad-Refresh') || '').trim();
  const accessToken = headerAccess || getCookie(request, 'gothwad_at');
  const refreshToken = headerRefresh || getCookie(request, 'gothwad_rt');
  const cookieSid = getCookie(request, 'gothwad_sid');

  if (!accessToken && !refreshToken) return { ok: false };

  // 1) Validate active `session` JWT + verify account & device session still exist in D1
  if (accessToken) {
    const payload = await verifyJwt(accessToken, getSigningSecret(env));
    if (payload && payload.token_use === 'session' && payload.sub) {
      const userId = String(payload.sub);
      const tokenSid = payload.sid ? String(payload.sid) : null;
      const userRow = await db
        .prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1')
        .bind(userId)
        .first();

      if (userRow?.username) {
        let sessionValid = true;
        if (tokenSid) {
          const sessRow = await db
            .prepare('SELECT id FROM user_sessions WHERE id = ? AND user_id = ? LIMIT 1')
            .bind(tokenSid, userId)
            .first();
          sessionValid = !!sessRow;
        }
        if (sessionValid) {
          return {
            ok: true,
            accessToken,
            authUser: {
              id: userId,
              username: String(userRow.username),
              sessionId: tokenSid || cookieSid || null,
            },
          };
        }
      }
    }
  }

  // 2) Access token expired/missing -> atomically rotate refresh token
  if (refreshToken) {
    const rotated = await rotateSessionRefreshToken(db, env, refreshToken, cookieSid);
    if (rotated) {
      const newTokens = {
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token,
      };
      return {
        ok: true,
        accessToken: rotated.access_token,
        authUser: rotated.user,
        newTokens,
        newCookies: sessionCookies(request, env, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          session_id: rotated.session_id,
          remember: true,
        }),
      };
    }
  }

  return { ok: false };
}

// -----------------------------------------------------------------------------
// OAuth 2.0 Provider Helpers ("Sign in with Gothwad")
// -----------------------------------------------------------------------------

const OAUTH_SCOPES: Record<string, string> = {
  profile: 'View your basic profile (name, username, avatar)',
  email: 'View your Gothwad email address',
  drive: 'Read & write files in your Gothwad Drive',
  'drive.read': 'View files in your Gothwad Drive',
  notes: 'Read & write your Gothwad Notes',
  chat: 'Access your Gothwad Chat messages',
  offline_access: 'Keep you signed in to this app even when you are away',
};

function parseScopes(scopeStr: string): string[] {
  return String(scopeStr || '')
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s && OAUTH_SCOPES[s]);
}

async function oauthQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    throw new OAuthDatabaseError();
  }
}

async function findOAuthClient(db: D1Database, clientId: string): Promise<Record<string, any> | null> {
  if (!clientId) return null;
  const row = await oauthQuery(() =>
    db
      .prepare('SELECT * FROM ecosystem_apps WHERE client_id = ? OR id = ? ORDER BY (client_id = ?) DESC LIMIT 1')
      .bind(clientId, clientId, clientId)
      .first(),
  );
  if (!row) return null;
  return {
    ...row,
    redirect_uris: parseJsonStringArray(row.redirect_uris),
    is_verified: !!row.is_verified,
    is_core: !!row.is_core,
  };
}

function isRedirectUriAllowed(env: Env, client: Record<string, any>, redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri);
    if (
      redirectUri.includes('#') ||
      u.username ||
      u.password ||
      ['javascript:', 'data:', 'file:', 'about:', 'blob:'].includes(u.protocol)
    ) {
      return false;
    }
    const allowed: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    if (allowed.includes(redirectUri)) return true;
    return (
      env.DEV_MODE === 'true' &&
      ['http:', 'https:'].includes(u.protocol) &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function pkceRequestError(
  client: Record<string, any>,
  challenge: string | null,
  method: string | null,
): string | null {
  if (!challenge) {
    if (!client.secret_hash) return 'PKCE required: pass code_challenge (S256)';
    return method ? 'code_challenge is required with code_challenge_method' : null;
  }
  if (method !== 'S256') return 'Only code_challenge_method=S256 is supported';
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return 'Invalid S256 code_challenge';
  return null;
}

async function verifyPkce(
  verifier: string,
  challenge: string | null,
  method: string | null,
): Promise<boolean> {
  if (!challenge) return true;
  if (method !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = await sha256Base64Url(verifier);
  return computed === challenge;
}

function oauthCallbackUrl(
  redirectUri: string,
  result: { code?: string; error?: string },
  state: string,
): string {
  const back = new URL(redirectUri);
  for (const key of ['code', 'error', 'error_description', 'state']) back.searchParams.delete(key);
  for (const [key, value] of Object.entries(result)) back.searchParams.set(key, value);
  if (state) back.searchParams.set('state', state);
  return back.toString();
}

async function verifyClientSecret(client: Record<string, any>, secret: string | undefined): Promise<boolean> {
  if (!client.secret_hash) return true;
  if (!secret) return false;
  return timingSafeEqual(await sha256Hex(secret), String(client.secret_hash));
}

function consentPageHtml(
  env: Env,
  client: Record<string, any>,
  authUser: SessionUser,
  profile: Record<string, any> | null,
  params: URLSearchParams,
  authorizeUrl?: string,
): Response {
  const esc = (s: any) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );

  const username = profile?.username || authUser.username || 'user';
  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const displayName = `${firstName} ${lastName}`.trim() || username;
  const initials = ((firstName[0] || username[0] || '?') + (lastName[0] || '')).toUpperCase();

  const scopeIcons: Record<string, string> = {
    profile: '🪪', email: '📧', drive: '☁️', 'drive.read': '☁️',
    notes: '📝', chat: '💬', offline_access: '🕐',
  };
  const scopes = parseScopes(params.get('scope') || '');
  const scopeItems = scopes
    .map(
      (s) => `
    <div class="scope">
      <div class="scope-icon">${scopeIcons[s] || '🔑'}</div>
      <div><div class="scope-name">${esc(s)}</div>
      <div class="scope-desc">${esc(OAUTH_SCOPES[s] || '')}</div></div>
    </div>`,
    )
    .join('');

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
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #ffffff; --card: #ffffff; --text: #202124; --muted: #5f6368;
    --border: #dadce0; --chip: #f8f9fa; --link: #1a73e8; --blue: #1a73e8;
    --blue-hover: #1765cc; --shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131314; --card: #1e1f20; --text: #e3e3e3; --muted: #9aa0a6;
      --border: #444746; --chip: #131314; --link: #8ab4f8; --blue: #8ab4f8;
      --blue-hover: #aecbfa; --shadow: 0 1px 3px rgba(0,0,0,.5);
    }
  }
  body { font-family: 'Google Sans', Roboto, system-ui, sans-serif; background: var(--bg); color: var(--text);
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 28px; padding: 40px 34px;
          max-width: 450px; width: 100%; box-shadow: var(--shadow); position: relative; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 22px; }
  .brand img { width: 48px; height: 48px; border-radius: 50%; }
  .brand span { font-size: 22px; color: var(--muted); font-weight: 400; }
  h1 { font-size: 22px; font-weight: 400; text-align: center; letter-spacing: 0; }
  .sub { text-align: center; color: var(--muted); font-size: 14px; margin: 8px 0 22px; }
  .user { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--chip);
          border: 1px solid var(--border); border-radius: 100px; margin-bottom: 12px; }
  .user .av { width: 40px; height: 40px; border-radius: 50%; background: var(--blue);
              color: var(--card); font-weight: 500; font-size: 15px; display: flex; align-items: center; justify-content: center; }
  .user .n { font-size: 14px; font-weight: 500; } .user .e { font-size: 12px; color: var(--muted); }
  .label { font-size: 13px; font-weight: 500; color: var(--text); margin: 14px 0 10px; }
  .scope { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--chip);
           border: 1px solid var(--border); border-radius: 16px; margin-bottom: 8px; }
  .scope-icon { width: 36px; height: 36px; border-radius: 50%; background: var(--card); border: 1px solid var(--border);
                display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .scope-name { font-size: 13px; font-weight: 500; } .scope-desc { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .note { background: var(--chip); border: 1px solid var(--border); color: var(--muted);
          border-radius: 16px; padding: 12px 14px; font-size: 12px; line-height: 1.55; margin: 16px 0; }
  .err { background: rgba(217,48,37,0.08); border: 1px solid rgba(217,48,37,0.35); color: #d93025;
         border-radius: 16px; padding: 11px 13px; font-size: 12px; margin-bottom: 14px; display: none; }
  .row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; margin-top: 6px; }
  .btn { padding: 12px 18px; border-radius: 100px; border: none; font-size: 14px; font-weight: 500;
         font-family: inherit; cursor: pointer; width: 100%; transition: background 0.15s; }
  .btn-ghost { background: transparent; color: var(--blue); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--chip); }
  .btn-primary { background: var(--blue); color: #fff; }
  .btn-primary:hover { background: var(--blue-hover); box-shadow: var(--shadow); }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
             border-top-color: #fff; border-radius: 50%; animation: sp 0.7s linear infinite; vertical-align: -2px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  @media (prefers-color-scheme: dark) { .btn-primary { color: #062e6f; } }
</style></head>
<body>
  <div class="card">
    <div class="brand"><img src="/favicon.ico" onerror="this.style.display='none'" alt="Gothwad" /><span>Gothwad</span></div>
    <h1>${esc(client.name)} wants access to your account</h1>
    <p class="sub">Sign in with your Gothwad Account</p>

    <div class="user">
      <div class="av">${esc(initials)}</div>
      <div><div class="n">${esc(displayName)}</div>
      <div class="e">${esc(username)}@${esc(env.APP_DOMAIN)}</div></div>
    </div>
    <p class="sub" style="margin-top:-8px;margin-bottom:14px;">
      <a href="${esc(env.AUTH_HUB_URL)}/signin?choose=1&amp;next=${encodeURIComponent(authorizeUrl || '')}"
         style="color:var(--link);text-decoration:none;font-weight:500;">Use another account</a>
    </p>

    <div class="label">This will allow the app to:</div>
    ${scopeItems}

    <div class="note">Gothwad never shares your password with this app.
      You can remove access anytime from <b>My Account → Security</b>.</div>

    <div class="err" id="err"></div>
    <div class="row">
      <button class="btn btn-ghost" id="deny">Cancel</button>
      <button class="btn btn-primary" id="allow">Continue</button>
    </div>
  </div>
<script>
  const data = ${JSON.stringify(data).replace(/</g, '\\u003c')};
  async function decide(approved) {
    const btn = document.getElementById(approved ? 'allow' : 'deny');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (approved ? 'Authorizing…' : 'Denying…');
    try {
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
// Outbound Password-Reset Email (Resend API — 3,000 free/month)
// -----------------------------------------------------------------------------

async function sendResetEmail(env: Env, toEmail: string, resetLink: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const from = env.RESEND_FROM || `Gothwad Accounts <no-reply@${env.APP_DOMAIN}>`;
  const html = `
    <div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#202124;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:22px;color:#5f6368;font-weight:400;">Gothwad Accounts</div>
      </div>
      <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Reset your password</h2>
      <p style="font-size:14px;line-height:1.6;color:#5f6368;margin:0 0 24px;">
        Hi, we received a request to reset the password for your Gothwad Account.
        Click the button below and set a new password within 15 minutes.
      </p>
      <p style="text-align:center;margin:0 0 24px;">
        <a href="${resetLink}" style="display:inline-block;background:#1a73e8;color:#ffffff;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px;">Reset password</a>
      </p>
      <p style="font-size:12px;color:#5f6368;line-height:1.6;margin:0;">
        If you didn't ask to reset your password, you can ignore this email — no action needed.
      </p>
      <hr style="border:none;border-top:1px solid #dadce0;margin:24px 0;" />
      <p style="font-size:11px;color:#9aa0a6;margin:0;">Gothwad Tech · This is an automated security email.</p>
    </div>`;

  try {
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
  } catch {
    return false;
  }
}

// =============================================================================
// MAIN WORKER ROUTER
// =============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const route = pathname.startsWith('/api') ? pathname.slice(4) : pathname;

    // =========================================================================
    // 1. INTERNAL ENDPOINT — Server-to-Server Only (Mail -> Accounts)
    //    GET /api/internal/usernames/:username
    //    No CORS, no cookies, Cache-Control: no-store, timing-safe auth.
    // =========================================================================
    if (route.startsWith('/internal/usernames/')) {
      if (request.method !== 'GET') {
        console.log('[internal/usernames] status=405');
        return internalJson({ error: 'method_not_allowed' }, 405);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

      if (!env.MAIL_INTERNAL_TOKEN) {
        console.error('[internal/usernames] MAIL_INTERNAL_TOKEN not configured');
        return internalJson({ error: 'server_not_configured' }, 500);
      }
      if (!providedToken) {
        console.log('[internal/usernames] status=401 (missing token)');
        return internalJson({ error: 'unauthorized' }, 401);
      }

      let authorized = false;
      try {
        authorized = await timingSafeEqual(providedToken, env.MAIL_INTERNAL_TOKEN);
      } catch {
        authorized = false;
      }
      if (!authorized) {
        console.log('[internal/usernames] status=401 (bad token)');
        return internalJson({ error: 'unauthorized' }, 401);
      }

      let rawUsername = route.slice('/internal/usernames/'.length);
      try {
        rawUsername = decodeURIComponent(rawUsername);
      } catch {
        return internalJson({ error: 'bad_username' }, 400);
      }

      const normalised = rawUsername.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalised)) {
        return internalJson({ error: 'bad_username' }, 400);
      }

      try {
        const db = await getDb(env);
        const row = await db
          .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
          .bind(normalised)
          .first();
        const exists = !!row?.id;
        console.log(`[internal/usernames] status=200 exists=${exists}`);
        return internalJson({ exists }, 200);
      } catch (e) {
        console.error('[internal/usernames] DB exception', e);
        return internalJson({ error: 'internal_error' }, 500);
      }
    }

    const corsHeaders = buildCorsHeaders(request, env);

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    let oauthCookies: string[] = [];
    const withCors = (res: Response, newCookies: string[] = oauthCookies): Response => {
      corsHeaders.forEach((v, k) => res.headers.set(k, v));
      for (const cookie of newCookies) res.headers.append('Set-Cookie', cookie);
      if (route.startsWith('/oauth/')) {
        res.headers.set('Cache-Control', 'no-store');
        res.headers.set('Pragma', 'no-cache');
      }
      return res;
    };

    try {
      // =======================================================================
      // 2. PUBLIC AVATAR DELIVERY — D1 / R2 + Cloudflare Global Edge Cache
      //    GET /api/avatars/:userId (or /avatars/:userId)
      // =======================================================================
      if (route.startsWith('/avatars/') && request.method === 'GET') {
        const userId = decodeURIComponent(route.slice('/avatars/'.length)).trim();
        if (!userId || userId.includes('/')) {
          return withCors(apiError('Not found', 404));
        }

        // Check Cloudflare Edge Cache first (safe in both Workers runtime and Node local preview!)
        const edgeCache: Cache | undefined =
          typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache })?.default : undefined;
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        if (edgeCache) {
          const cached = await edgeCache.match(cacheKey).catch(() => undefined);
          if (cached) {
            const clientEtag = request.headers.get('If-None-Match');
            if (clientEtag && clientEtag === cached.headers.get('ETag')) {
              return new Response(null, { status: 304, headers: cached.headers });
            }
            return cached;
          }
        }

        let bodyBytes: Uint8Array | null = null;
        let mimeType = 'image/jpeg';
        let etag = '';

        if (env.AVATARS_BUCKET) {
          const obj = await env.AVATARS_BUCKET.get(`avatars/${userId}`);
          if (obj) {
            bodyBytes = new Uint8Array(await obj.arrayBuffer());
            mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
            etag = obj.httpEtag || `"${(await sha256Hex(bodyBytes)).slice(0, 16)}"`;
          }
        }

        if (!bodyBytes) {
          const db = await getDb(env);
          const row = await db
            .prepare('SELECT mime_type, data, etag FROM user_avatars WHERE user_id = ? LIMIT 1')
            .bind(userId)
            .first();
          if (row?.data) {
            bodyBytes =
              row.data instanceof Uint8Array
                ? row.data
                : row.data instanceof ArrayBuffer
                  ? new Uint8Array(row.data)
                  : Uint8Array.from(row.data as Iterable<number>);
            mimeType = String(row.mime_type || 'image/jpeg');
            etag = `"${String(row.etag || '')}"`;
          }
        }

        if (!bodyBytes) {
          return withCors(apiError('Avatar not found', 404));
        }

        const headers = new Headers({
          'Content-Type': mimeType,
          ETag: etag,
          'Cache-Control': url.searchParams.has('v')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        });

        if (request.headers.get('If-None-Match') === etag) {
          return withCors(new Response(null, { status: 304, headers }));
        }

        const response = withCors(new Response(bodyBytes as unknown as BodyInit, { status: 200, headers }));
        if (edgeCache && url.searchParams.has('v')) {
          await edgeCache.put(cacheKey, response.clone()).catch(() => undefined);
        }
        return response;
      }

      // -------------------------------------------------------------- /health
      if (route === '/health' && request.method === 'GET') {
        const db = await getDb(env);
        await db.prepare('SELECT 1 AS ok').first();
        return withCors(
          json({
            status: 'ok',
            service: 'gothwad-auth-api',
            engine: 'cloudflare-d1-native',
            time: new Date().toISOString(),
          }),
        );
      }

      const db = route.startsWith('/oauth/')
        ? await oauthQuery(() => getDb(env))
        : await getDb(env);

      // ------------------------------------------------- /auth/check-username
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

      // ----------------------------------------------- /auth/check-identifier
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
              {
                exists: false,
                error: `Only @${appDomain} suffix is allowed.`,
                isThirdParty: true,
              },
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

      // --------------------------------------------------------- /auth/signup
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

        const cookies = sessionCookies(request, env, {
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

      // --------------------------------------------------------- /auth/signin
      if (route === '/auth/signin' && request.method === 'POST') {
        const body = await readJson(request);
        const rawIdentifier = String(body.identifier || '').trim();
        const password = String(body.password || '');
        const remember = body.remember === true;

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

        const sessionId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const rawRefresh = randomToken();
        const refreshHash = await sha256Hex(rawRefresh);
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
        const ua = parseUserAgent(request.headers.get('User-Agent') || '');

        await db.batch([
          db
            .prepare(
              `INSERT INTO user_sessions (
                 id, user_id, device_name, browser, os, ip_address, remember_me, last_active, is_current, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            )
            .bind(
              sessionId,
              found.userId,
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
            .bind(refreshHash, found.userId, sessionId, refreshExpiresAt, nowIso),
        ]);

        const accessToken = await issueSessionAccessToken(env, {
          userId: found.userId,
          username: found.username,
          sessionId,
        });
        const profile = await fetchProfile(db, found.userId);
        await logActivity(
          db,
          found.userId,
          'signin',
          'Signed in',
          `${ua.browser} on ${ua.os || 'unknown OS'}`,
          request,
        );

        const cookies = sessionCookies(request, env, {
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
            200,
            cookies.map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // -------------------------------------------------------- /auth/signout
      if (route === '/auth/signout' && request.method === 'POST') {
        const session = await resolveSession(request, db, env);
        const body = await readJson(request);
        const sessionId =
          String(body.session_id || '') ||
          session.authUser?.sessionId ||
          getCookie(request, 'gothwad_sid');
        const rawRefresh =
          (request.headers.get('X-Gothwad-Refresh') || '').trim() || getCookie(request, 'gothwad_rt');

        if (rawRefresh) {
          const refreshHash = await sha256Hex(rawRefresh);
          await db
            .prepare('UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?')
            .bind(refreshHash)
            .run()
            .catch(() => undefined);
        }

        if (session.ok && session.authUser) {
          if (sessionId) {
            await db
              .prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?')
              .bind(sessionId, session.authUser.id)
              .run()
              .catch(() => undefined);
          }
          await logActivity(db, session.authUser.id, 'signout', 'Signed out', undefined, request);
        }

        return withCors(
          json(
            { ok: true, message: 'Signed out' },
            200,
            clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // ------------------------------------------------------------- /auth/me
      if (route === '/auth/me' && request.method === 'GET') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) {
          const status = isApiHost(request, env) ? 401 : 200;
          return withCors(
            json(
              { authenticated: false },
              status,
              clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
            ),
          );
        }

        const profile = await fetchProfile(db, session.authUser.id);
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

      // -------------------------------------------------------- /auth/refresh
      if (route === '/auth/refresh' && request.method === 'POST') {
        const body = await readJson(request);
        const refresh =
          (request.headers.get('X-Gothwad-Refresh') || '').trim() ||
          String(body.refresh_token || '').trim() ||
          getCookie(request, 'gothwad_rt') ||
          '';
        if (!refresh) return withCors(apiError('Missing refresh token', 401));

        const fallbackSid = String(body.session_id || '') || getCookie(request, 'gothwad_sid');
        const rotated = await rotateSessionRefreshToken(db, env, refresh, fallbackSid);
        if (!rotated) {
          return withCors(apiError('Session expired, please sign in again', 401));
        }

        const headers: [string, string][] = sessionCookies(request, env, {
          access_token: rotated.access_token,
          refresh_token: rotated.refresh_token,
          session_id: rotated.session_id,
          remember: true,
        }).map((c) => ['Set-Cookie', c]);

        return withCors(
          json(
            {
              ok: true,
              access_token: rotated.access_token,
              refresh_token: rotated.refresh_token,
              session_id: rotated.session_id || undefined,
            },
            200,
            headers,
          ),
        );
      }

      // ------------------------------------------------ /auth/forgot-password
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

        // URL fragment (`#access_token=...`) keeps recovery tokens out of HTTP Referer logs!
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

      // ------------------------------------------------- /auth/reset-password
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

        // Atomic one-time token consumption
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

        // Update password, invalidate any remaining unused reset links & revoke old sessions
        await db.batch([
          db
            .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
            .bind(newPasswordHash, nowIso, userId),
          db
            .prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?')
            .bind(userId),
          db
            .prepare('DELETE FROM user_sessions WHERE user_id = ?')
            .bind(userId),
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

      // ------------------------------------------------ /auth/change-password
      if (route === '/auth/change-password' && request.method === 'POST') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const currentPassword = String(body.current_password || '');
        const newPassword = String(body.new_password || '');
        if (newPassword.length < 8) return withCors(apiError('New password must be at least 8 characters'));
        if (newPassword.length > 128) return withCors(apiError('New password must be at most 128 characters'));

        const userRow = await db
          .prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1')
          .bind(session.authUser.id)
          .first();
        if (!userRow || !(await verifyPassword(currentPassword, String(userRow.password_hash)))) {
          return withCors(apiError('Current password is incorrect', 400));
        }

        const newHash = await hashPassword(newPassword);
        await db
          .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
          .bind(newHash, new Date().toISOString(), session.authUser.id)
          .run();

        await logActivity(
          db,
          session.authUser.id,
          'password_change',
          'Password changed',
          'Your account password was updated',
          request,
        );

        return withCors(json({ ok: true, message: 'Password changed successfully' }));
      }

      // ------------------------------------------------- /auth/update-profile
      if (route === '/auth/update-profile' && request.method === 'POST') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const sets: string[] = [];
        const values: unknown[] = [];

        if (typeof body.first_name === 'string') {
          sets.push('first_name = ?');
          values.push(body.first_name.trim());
        }
        if (typeof body.last_name === 'string') {
          sets.push('last_name = ?');
          values.push(body.last_name.trim());
        }
        if (typeof body.recovery_email === 'string') {
          const rec = body.recovery_email.trim().toLowerCase();
          if (rec && !isValidEmail(rec)) return withCors(apiError('Invalid recovery email'));
          sets.push('recovery_email = ?');
          values.push(rec || null);
        }
        if (typeof body.phone_number === 'string') {
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

        await db
          .prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run();

        await logActivity(
          db,
          session.authUser.id,
          'profile_update',
          'Personal info updated',
          changedFields.join(', '),
          request,
        );

        const updatedProfile = await fetchProfile(db, session.authUser.id);
        return withCors(json({ ok: true, user: presentUser(updatedProfile, env) }));
      }

      // ------------------------------------------------------- /auth/sessions
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

        await db
          .prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?')
          .bind(sessionId, session.authUser.id)
          .run();

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
        await db
          .prepare('DELETE FROM user_sessions WHERE user_id = ? AND id != ?')
          .bind(session.authUser.id, currentSid)
          .run();

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

      // ------------------------------------------------------- /auth/activity
      if (route === '/auth/activity' && request.method === 'GET') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const out = await db
          .prepare('SELECT * FROM account_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
          .bind(session.authUser.id)
          .all();

        return withCors(json({ ok: true, activity: out.results || [] }));
      }

      // --------------------------------------------------------- /auth/avatar
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

        // Store relative versioned path so domain changes never break avatar URLs!
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

      // --------------------------------------------------------- /auth/export
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

      // ------------------------------------------------- /auth/delete-account
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

        if (env.AVATARS_BUCKET) {
          await env.AVATARS_BUCKET.delete(`avatars/${userId}`).catch(() => undefined);
        }

        // Foreign keys (`ON DELETE CASCADE`) atomically clean all 9 child tables!
        await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

        return withCors(
          json(
            { ok: true, message: 'Account deleted' },
            200,
            clearCookies(request, env).map((c) => ['Set-Cookie', c] as [string, string]),
          ),
        );
      }

      // =======================================================================
      // 3. OAUTH 2.0 PROVIDER ("Sign in with Gothwad")
      // =======================================================================

      if (route === '/oauth/app-info' && request.method === 'GET') {
        const clientId = url.searchParams.get('client_id') || '';
        const client = await findOAuthClient(db, clientId);
        if (!client) return withCors(apiError('Unknown OAuth client', 404));
        return withCors(
          json({
            id: client.id,
            name: client.name,
            icon: client.icon,
            is_verified: !!client.is_verified,
            scopes_supported: Object.keys(OAUTH_SCOPES),
          }),
        );
      }

      if (route === '/oauth/authorize' && request.method === 'GET') {
        const clientId = url.searchParams.get('client_id') || '';
        const redirectUri = url.searchParams.get('redirect_uri') || '';
        const responseType = url.searchParams.get('response_type') || '';
        const scopes = parseScopes(url.searchParams.get('scope') || '');

        const client = await findOAuthClient(db, clientId);
        if (!client) return withCors(apiError('Unknown client_id', 400));
        if (responseType !== 'code') return withCors(apiError('Only response_type=code is supported', 400));
        if (!isRedirectUriAllowed(env, client, redirectUri)) {
          return withCors(apiError('redirect_uri is not registered for this app', 400));
        }
        if (scopes.length === 0) return withCors(apiError('At least one valid scope is required', 400));

        const pkceError = pkceRequestError(
          client,
          url.searchParams.get('code_challenge'),
          url.searchParams.get('code_challenge_method'),
        );
        if (pkceError) return withCors(apiError(pkceError, 400));

        const session = await oauthQuery(() => resolveSession(request, db, env));
        oauthCookies = session.newCookies || [];
        if (!session.ok || !session.authUser) {
          const loginUrl = `${env.AUTH_HUB_URL}/signin?choose=1&next=${encodeURIComponent(url.toString())}`;
          return withCors(new Response(null, { status: 302, headers: { Location: loginUrl } }));
        }

        const profile = await oauthQuery(() => fetchProfile(db, session.authUser!.id));
        return withCors(
          consentPageHtml(env, client, session.authUser, profile, url.searchParams, url.toString()),
          session.newCookies,
        );
      }

      if ((route === '/oauth/decision' || route === '/oauth/authorize/decision') && request.method === 'POST') {
        const session = await oauthQuery(() => resolveSession(request, db, env));
        oauthCookies = session.newCookies || [];
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const respond = (res: Response) => withCors(res, session.newCookies);
        const body = await readJson(request);
        const approved = body.approved === true;
        const clientId = String(body.client_id || '');
        const redirectUri = String(body.redirect_uri || '');
        const state = body.state ? String(body.state) : '';
        const scopes = parseScopes(String(body.scope || ''));
        const challenge = body.code_challenge ? String(body.code_challenge) : null;
        const challengeMethod = body.code_challenge_method ? String(body.code_challenge_method) : null;

        const client = await findOAuthClient(db, clientId);
        if (!client) return respond(apiError('Unknown client_id', 400));
        if (!isRedirectUriAllowed(env, client, redirectUri)) {
          return respond(apiError('redirect_uri is not registered', 400));
        }

        if (!approved) {
          const denyUrl = oauthCallbackUrl(redirectUri, { error: 'access_denied' }, state);
          return respond(json({ redirect_url: denyUrl }));
        }

        if (scopes.length === 0) return respond(apiError('No valid scopes requested', 400));
        const pkceError = pkceRequestError(client, challenge, challengeMethod);
        if (pkceError) return respond(apiError(pkceError, 400));

        const code = randomToken();
        const nowIso = new Date().toISOString();
        const expiresAt = new Date(Date.now() + OAUTH_CODE_TTL_MS).toISOString();
        const scopesJson = JSON.stringify(scopes);

        await oauthQuery(() =>
          db
            .prepare(
              `INSERT INTO oauth_auth_codes (
                 code, client_id, user_id, redirect_uri, scopes,
                 code_challenge, code_challenge_method, expires_at, used, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            )
            .bind(
              code,
              client.id,
              session.authUser!.id,
              redirectUri,
              scopesJson,
              challenge,
              challenge ? challengeMethod : null,
              expiresAt,
              nowIso,
            )
            .run(),
        );

        await oauthQuery(() =>
          db
            .prepare(
              `INSERT INTO app_authorizations (id, user_id, app_id, scopes, granted_at, last_used_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (user_id, app_id) DO UPDATE SET
                 scopes = excluded.scopes,
                 last_used_at = excluded.last_used_at`,
            )
            .bind(crypto.randomUUID(), session.authUser!.id, client.id, scopesJson, nowIso, nowIso)
            .run(),
        );

        await logActivity(
          db,
          session.authUser.id,
          'app_authorized',
          `App connected: ${client.name}`,
          `Scopes: ${scopes.join(', ')}`,
          request,
        );

        const backUrl = oauthCallbackUrl(redirectUri, { code }, state);
        return respond(json({ redirect_url: backUrl }));
      }

      if (route === '/oauth/token' && request.method === 'POST') {
        const body = await readFormOrJson(request);
        const grantType = String(body.grant_type || '');
        const clientId = String(body.client_id || '');
        const clientSecret = body.client_secret ? String(body.client_secret) : undefined;

        const client = await findOAuthClient(db, clientId);
        if (!client) {
          return withCors(json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 401));
        }
        if (!(await verifyClientSecret(client, clientSecret))) {
          return withCors(json({ error: 'invalid_client', error_description: 'Bad client_secret' }, 401));
        }

        if (grantType === 'authorization_code') {
          const code = String(body.code || '');
          const redirectUri = String(body.redirect_uri || '');
          const codeVerifier = body.code_verifier ? String(body.code_verifier) : '';

          const row = await oauthQuery(() =>
            db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ? LIMIT 1').bind(code).first(),
          );

          if (!row || row.used) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Code is invalid or already used' }, 400));
          }
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Code expired' }, 400));
          }
          if (row.client_id !== client.id || row.redirect_uri !== redirectUri) {
            return withCors(json({ error: 'invalid_grant', error_description: 'redirect_uri or client mismatch' }, 400));
          }
          if (
            pkceRequestError(client, row.code_challenge ?? null, row.code_challenge_method ?? null) ||
            !(await verifyPkce(codeVerifier, row.code_challenge ?? null, row.code_challenge_method ?? null))
          ) {
            return withCors(json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400));
          }

          const nowIso = new Date().toISOString();
          const consumed = await oauthQuery(() =>
            db
              .prepare(
                `UPDATE oauth_auth_codes
                    SET used = 1
                  WHERE code = ? AND used = 0 AND expires_at > ?
                  RETURNING user_id, scopes`,
              )
              .bind(code, nowIso)
              .first(),
          );
          if (!consumed) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Code is invalid or already used' }, 400));
          }

          const userId = String(consumed.user_id);
          const profile = await fetchProfile(db, userId);
          const scopes = parseJsonStringArray(consumed.scopes);
          const accessToken = await issueOAuthAccessToken(env, {
            userId,
            username: profile?.username || '',
            clientId: client.id,
            scopes,
          });

          const response: Record<string, any> = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            scope: scopes.join(' '),
          };

          if (scopes.includes('offline_access')) {
            const rt = randomToken();
            const rtHash = await sha256Hex(rt);
            await oauthQuery(() =>
              db
                .prepare(
                  `INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
                )
                .bind(
                  crypto.randomUUID(),
                  rtHash,
                  userId,
                  client.id,
                  JSON.stringify(scopes),
                  new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
                  nowIso,
                )
                .run(),
            );
            response.refresh_token = rt;
          }

          return withCors(json(response));
        }

        // ---- Refresh Token grant (with atomic one-winner rotation) ----
        if (grantType === 'refresh_token') {
          const rt = String(body.refresh_token || '');
          const hash = await sha256Hex(rt);

          const row = await oauthQuery(() =>
            db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? LIMIT 1').bind(hash).first(),
          );

          if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' }, 400));
          }
          if (row.client_id !== client.id) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Token was issued to another app' }, 400));
          }

          const nowIso = new Date().toISOString();
          const consumed = await oauthQuery(() =>
            db
              .prepare(
                `UPDATE oauth_refresh_tokens
                    SET revoked = 1
                  WHERE token_hash = ? AND revoked = 0 AND expires_at > ?
                  RETURNING user_id, scopes`,
              )
              .bind(hash, nowIso)
              .first(),
          );
          if (!consumed) {
            return withCors(json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' }, 400));
          }

          const userId = String(consumed.user_id);
          const scopes = parseJsonStringArray(consumed.scopes);
          const profile = await fetchProfile(db, userId);
          const accessToken = await issueOAuthAccessToken(env, {
            userId,
            username: profile?.username || '',
            clientId: client.id,
            scopes,
          });

          const newRt = randomToken();
          const newRtHash = await sha256Hex(newRt);
          await oauthQuery(() =>
            db
              .prepare(
                `INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                newRtHash,
                userId,
                client.id,
                JSON.stringify(scopes),
                new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
                nowIso,
              )
              .run(),
          );

          return withCors(
            json({
              access_token: accessToken,
              token_type: 'Bearer',
              expires_in: ACCESS_TOKEN_TTL_SECONDS,
              scope: scopes.join(' '),
              refresh_token: newRt,
            }),
          );
        }

        return withCors(json({ error: 'unsupported_grant_type' }, 400));
      }

      // ----------------------------------------------------- /oauth/userinfo
      if (route === '/oauth/userinfo' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) return withCors(json({ error: 'invalid_token' }, 401));

        const payload = await verifyJwt(token, getSigningSecret(env));
        if (!payload || payload.token_use !== 'oauth_access') {
          return withCors(json({ error: 'invalid_token' }, 401));
        }

        const scopes: string[] = String(payload.scope || '')
          .split(' ')
          .filter(Boolean);
        const profile = await fetchProfile(db, String(payload.sub));
        if (!profile) {
          return withCors(json({ error: 'invalid_token' }, 401));
        }

        const info: Record<string, any> = { sub: payload.sub };

        if (scopes.includes('profile')) {
          info.name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          info.preferred_username = profile.username || payload.username;
          info.picture = resolveAvatarUrl(profile.avatar_url, env);
          info.updated_at = profile.updated_at || null;
        }
        if (scopes.includes('email')) {
          info.email = `${profile.username || payload.username}@${env.APP_DOMAIN}`;
          info.email_verified = true;
        }
        if (scopes.includes('drive') || scopes.includes('drive.read')) {
          info.drive = {
            used_bytes: Number(profile.storage_used_bytes || 0),
            limit_bytes: Number(profile.storage_limit_bytes || 0),
            write_access: scopes.includes('drive'),
          };
        }
        return withCors(json(info));
      }

      // ----------------------------------------------- /oauth/authorizations
      if (route === '/oauth/authorizations' && request.method === 'GET') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const uid = session.authUser.id;
        const [grantsOut, appsOut] = await Promise.all([
          db.prepare('SELECT * FROM app_authorizations WHERE user_id = ?').bind(uid).all(),
          db.prepare('SELECT * FROM ecosystem_apps').all(),
        ]);

        const grants = grantsOut.results || [];
        const apps = appsOut.results || [];

        const connected = grants.map((g) => {
          const app = apps.find((a) => a.id === g.app_id) || {};
          return {
            app_id: g.app_id,
            name: app.name || g.app_id,
            icon: app.icon || 'app',
            scopes: parseJsonStringArray(g.scopes),
            granted_at: g.granted_at,
            last_used_at: g.last_used_at,
            core: CORE_GOTHWAD_SERVICES.has(g.app_id),
          };
        });

        const catalog = apps.map((a) => ({
          id: a.id,
          name: a.name,
          icon: a.icon,
          description: a.description,
          core: CORE_GOTHWAD_SERVICES.has(a.id) || !!a.is_core,
          homepage: a.homepage_url || null,
        }));

        return withCors(json({ ok: true, connected, apps: catalog }));
      }

      // ------------------------------------------------------- /oauth/revoke
      if (route === '/oauth/revoke' && request.method === 'POST') {
        const session = await resolveSession(request, db, env);
        if (!session.ok || !session.authUser) return withCors(apiError('Please sign in first', 401));

        const body = await readJson(request);
        const appId = String(body.app_id || '');
        if (!appId) return withCors(apiError('app_id is required'));
        if (CORE_GOTHWAD_SERVICES.has(appId)) {
          return withCors(
            apiError('Gothwad Services stay connected to your account and cannot be disconnected.', 403),
          );
        }

        const uid = session.authUser.id;
        await db.batch([
          db.prepare('DELETE FROM app_authorizations WHERE user_id = ? AND app_id = ?').bind(uid, appId),
          db
            .prepare('UPDATE oauth_refresh_tokens SET revoked = 1 WHERE user_id = ? AND client_id = ?')
            .bind(uid, appId),
        ]);

        await logActivity(
          db,
          uid,
          'app_revoked',
          'App disconnected',
          `Access removed for ${appId}`,
          request,
        );
        return withCors(json({ ok: true, message: 'App disconnected' }));
      }

      return withCors(apiError('Endpoint not found', 404));
    } catch (err: any) {
      if (err instanceof OAuthDatabaseError) {
        return withCors(
          json(
            {
              error: 'temporarily_unavailable',
              error_description: 'OAuth storage is unavailable. Please try again later.',
            },
            503,
          ),
        );
      }
      if (err instanceof DatabaseUnavailableError) {
        return withCors(json({ error: 'service_unavailable', message: err.message }, 503));
      }
      console.error('Worker error:', err);
      return withCors(apiError('Internal server error', 500));
    }
  },
};
