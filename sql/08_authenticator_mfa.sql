-- Additive, idempotent authenticator MFA. No plaintext seeds or recovery codes.
CREATE TABLE IF NOT EXISTS auth_mfa_factors (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_ciphertext TEXT NOT NULL, version TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
    setup_session_id TEXT REFERENCES user_sessions(id) ON DELETE CASCADE,
    password_hash_snapshot TEXT NOT NULL, pending_expires_at TEXT NOT NULL,
    last_counter INTEGER NOT NULL DEFAULT -1, last_proof TEXT, enrolled_at TEXT
  );

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
    code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_by TEXT, created_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON auth_mfa_recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    password_hash_snapshot TEXT NOT NULL, factor_version TEXT NOT NULL,
    remember_me INTEGER NOT NULL, add_mode INTEGER NOT NULL,
    expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_by TEXT
  );

CREATE TABLE IF NOT EXISTS auth_mfa_sessions (
    session_id TEXT PRIMARY KEY REFERENCES user_sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, factor_version TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS auth_mfa_attempts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
  );
