-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 01: CLOUDFLARE D1 CORE SCHEMA (100% NATIVE, ZERO SUPABASE)
-- =============================================================================
-- File: sql/01_core_schema.sql
-- Engine: Cloudflare D1 (SQLite)
--
-- OVERVIEW:
--   Core identity database for Gothwad Accounts — native password credentials (`users`),
--   user profile metadata (`profiles`), active signed-in devices (`user_sessions`),
--   refresh & password-reset token vaults, and OAuth 2.0 provider tables (`ecosystem_apps`,
--   `app_authorizations`, `oauth_auth_codes`, `oauth_refresh_tokens`).
--
-- AUTO-BOOTSTRAP + MANUAL CONSOLE SUPPORT:
--   1. The Worker automatically runs `ensureSchema()` on startup so even a brand-new
--      empty D1 database initializes automatically with zero downtime.
--   2. Every statement in this file is 100% IDEMPOTENT (`IF NOT EXISTS`), making both
--      first-time runs and repeated console re-runs completely safe.
--
-- ARCHITECTURE INVARIANTS:
--   * Rule #1 (Domain-agnostic): Zero hardcoded domain strings anywhere in SQL.
--   * Rule #2 (100% Pure Username DB): Neither `users` nor `profiles` stores an
--     `email` column. Primary email is always computed at runtime as
--     `username || '@' || APP_DOMAIN` inside the Worker layer.
--   * Security: Passwords (`PBKDF2-HMAC-SHA256`), refresh tokens (`SHA-256`),
--     and password-reset tokens (`SHA-256`) are stored strictly hashed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USERS — Core Identity Vault
-- -----------------------------------------------------------------------------
-- Stores only UUID, lowercase username, and PBKDF2-SHA256 password hash.
-- Zero email columns!

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT username_length CHECK (length(username) BETWEEN 3 AND 24),
  CONSTRAINT username_lowercase CHECK (username = lower(username))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);


-- -----------------------------------------------------------------------------
-- 2. PROFILES — Personal Info & Storage Quota
-- -----------------------------------------------------------------------------
-- Rule #2: Stores only `username`. `recovery_email` is strictly an optional external
-- recovery address for password resets (never the user's primary Gothwad email).

CREATE TABLE IF NOT EXISTS profiles (
  id                  TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name          TEXT NOT NULL DEFAULT '',
  last_name           TEXT NOT NULL DEFAULT '',
  recovery_email      TEXT,
  phone_number        TEXT,
  avatar_url          TEXT,
  date_of_birth       TEXT,                          -- 'YYYY-MM-DD' ya NULL
  gender              TEXT,                          -- 'Male' | 'Female' | 'Other' | 'Rather not say' | NULL
  two_factor_enabled  INTEGER NOT NULL DEFAULT 0,    -- 0 = false, 1 = true
  storage_used_bytes  INTEGER NOT NULL DEFAULT 0,
  storage_limit_bytes INTEGER NOT NULL DEFAULT 16106127360, -- 15 GB default quota
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT gender_values CHECK (
    gender IS NULL OR gender IN ('Male', 'Female', 'Other', 'Rather not say')
  )
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone_number) WHERE phone_number IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. USER_SESSIONS — Active Logged-In Devices (Security Tab -> Your Devices)
-- -----------------------------------------------------------------------------
-- Signing out a device from the dashboard deletes its row immediately, revoking
-- all associated access and refresh tokens in real time.

CREATE TABLE IF NOT EXISTS user_sessions (
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
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id, last_active DESC);


-- -----------------------------------------------------------------------------
-- 4. AUTH_REFRESH_TOKENS — Account Session Refresh Tokens (Hashed Only!)
-- -----------------------------------------------------------------------------
-- Stores SHA-256 hashes of browser slot / `X-Gothwad-Refresh` tokens.
-- `ON DELETE CASCADE` on `session_id` revokes the refresh token on device sign-out.

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256(raw_refresh_token)
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id TEXT REFERENCES user_sessions (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_session ON auth_refresh_tokens (session_id);


-- -----------------------------------------------------------------------------
-- 5. PASSWORD_RESET_TOKENS — Single-Use 15-Minute Recovery Links
-- -----------------------------------------------------------------------------
-- Generates a random token on password reset request; stores only its SHA-256 hash.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256(raw_reset_token)
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);


-- -----------------------------------------------------------------------------
-- 6. ECOSYSTEM_APPS — Registered "Sign in with Gothwad" OAuth 2.0 Clients
-- -----------------------------------------------------------------------------
-- `redirect_uris` is a JSON array string (e.g. '["https://mail.example.com/auth/callback"]').
-- `secret_hash` NULL indicates a public client (PKCE S256 required).

CREATE TABLE IF NOT EXISTS ecosystem_apps (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  redirect_uris TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(redirect_uris)),
  is_verified   INTEGER NOT NULL DEFAULT 0,
  client_id     TEXT UNIQUE,
  secret_hash   TEXT,
  homepage_url  TEXT,
  is_core       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO ecosystem_apps (id, client_id, name, description, icon, is_verified, is_core) VALUES
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
ON CONFLICT (id) DO UPDATE SET
  client_id   = COALESCE(ecosystem_apps.client_id, excluded.client_id),
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  is_core     = excluded.is_core;


-- -----------------------------------------------------------------------------
-- 7. APP_AUTHORIZATIONS — User Grants for Ecosystem Apps
-- -----------------------------------------------------------------------------
-- `scopes` is a JSON array string (e.g. '["profile","email","offline_access"]').

CREATE TABLE IF NOT EXISTS app_authorizations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  app_id       TEXT NOT NULL REFERENCES ecosystem_apps (id) ON DELETE CASCADE,
  scopes       TEXT NOT NULL DEFAULT '["profile","email"]' CHECK (json_valid(scopes)),
  granted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_app_auth_user ON app_authorizations (user_id);


-- -----------------------------------------------------------------------------
-- 8. OAUTH_AUTH_CODES — One-Time 5-Minute OAuth Authorization Codes
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code                  TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  redirect_uri          TEXT NOT NULL,
  scopes                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scopes)),
  code_challenge        TEXT,
  code_challenge_method TEXT,
  expires_at            TEXT NOT NULL,
  used                  INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_auth_codes (user_id);


-- -----------------------------------------------------------------------------
-- 9. OAUTH_REFRESH_TOKENS — Long-Lived App Refresh Tokens (SHA-256 Hashed Only)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id         TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  scopes     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scopes)),
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens (user_id);
