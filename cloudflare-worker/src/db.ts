/**
 * =============================================================================
 * D1 SCHEMA BOOTSTRAP & ERROR ISOLATION (`getDb`, `authQuery`, `oauthQuery`)
 * =============================================================================
 * Cold-start safe via WeakMap: initializes core/security tables + ecosystem seeds
 * automatically without ever overwriting existing `redirect_uris` or `secret_hash`.
 */

import type { D1Database, D1PreparedStatement, Env } from './types.ts';
import { OAUTH_STATE_SCHEMA } from './oauth-schema.ts';
import { PASSKEY_SCHEMA } from './passkey-schema.ts';
import { MFA_SCHEMA } from './mfa-schema.ts';

const initializedDbs = new WeakMap<object, Promise<void>>();

const BOOTSTRAP_STATEMENTS: string[] = [
  ...MFA_SCHEMA,
  ...PASSKEY_SCHEMA,
  ...OAUTH_STATE_SCHEMA,
  `CREATE TABLE IF NOT EXISTS recovery_email_changes (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
    new_email TEXT NOT NULL, previous_email TEXT,
    password_hash_snapshot TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS verified_recovery_emails (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL, verified_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expiry ON auth_rate_limits (expires_at)`,
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

function buildDefaultCallbackSeedStatements(db: D1Database, rawDomain?: string): D1PreparedStatement[] {
  const domain = (rawDomain || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
    return [];
  }
  const defaults: Array<[string, string[]]> = [
    ['gothwad-meet', [`https://meet.${domain}/auth/callback`, `https://meet.${domain}/oauth/callback`]],
    ['gothwad-mail', [`https://mail.${domain}/auth/callback`, `https://mail.${domain}/oauth/callback`]],
    [
      'kiwi-store',
      [
        'gothwadstore://oauth/callback',
        'kiwistore://oauth/callback',
        `https://kiwistore.${domain}/auth/callback`,
        `https://kiwiconsole.${domain}/auth/callback`,
        `https://kiwiadmin.${domain}/auth/callback`,
        `https://kiwiapp.${domain}/auth/callback`,
        'http://localhost:3000/auth/callback',
        'http://localhost:5173/auth/callback',
      ],
    ],
    ['gothwad-drive', [`https://drive.${domain}/auth/callback`, `https://drive.${domain}/oauth/callback`]],
    ['gothwad-tube', [`https://plustube.${domain}/auth/callback`, `https://tube.${domain}/auth/callback`]],
    ['gothwad-chat', [`https://grixchat.${domain}/auth/callback`, `https://chat.${domain}/auth/callback`]],
    ['gothwad-indogram', [`https://indogram.${domain}/auth/callback`]],
  ];
  return defaults.map(([id, uris]) =>
    db
      .prepare("UPDATE ecosystem_apps SET redirect_uris = ? WHERE id = ? AND (redirect_uris IS NULL OR redirect_uris = '[]')")
      .bind(JSON.stringify(uris), id),
  );
}

export class DatabaseUnavailableError extends Error {
  constructor(message = 'Database temporarily unavailable') {
    super(message);
  }
}

export class OAuthDatabaseError extends Error {
  constructor() {
    super('OAuth database temporarily unavailable');
  }
}

export async function getDb(env: Env): Promise<D1Database> {
  if (!env.DB) {
    throw new DatabaseUnavailableError(
      "Cloudflare D1 binding 'DB' is missing. Add [[d1_databases]] binding = 'DB' in wrangler.toml.",
    );
  }
  const key = env.DB as unknown as object;
  let pending = initializedDbs.get(key);
  if (!pending) {
    const statements = [
      ...BOOTSTRAP_STATEMENTS.map((sql) => env.DB.prepare(sql)),
      ...buildDefaultCallbackSeedStatements(env.DB, env.APP_DOMAIN),
    ];
    pending = env.DB.batch(statements)
      .then(() => undefined)
      .catch((err) => {
        initializedDbs.delete(key);
        throw err instanceof DatabaseUnavailableError ? err : new DatabaseUnavailableError();
      });
    initializedDbs.set(key, pending);
  }
  await pending;
  return env.DB;
}

export async function authQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError || err instanceof OAuthDatabaseError) throw err;
    throw new DatabaseUnavailableError('Database temporarily unavailable');
  }
}

export async function oauthQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    throw new OAuthDatabaseError();
  }
}
