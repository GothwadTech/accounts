/** Additive WebAuthn schema, mirrored by migration 09. */
export const PASSKEY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auth_passkeys (
    id TEXT PRIMARY KEY, credential_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL,
    name TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT,
    version TEXT NOT NULL, last_proof TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_passkeys_user ON auth_passkeys(user_id)`,
  `CREATE TABLE IF NOT EXISTS auth_passkey_challenges (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, challenge TEXT NOT NULL, origin TEXT NOT NULL, rp_id TEXT NOT NULL,
    session_id TEXT REFERENCES user_sessions(id) ON DELETE CASCADE,
    password_hash_snapshot TEXT NOT NULL, factor_version TEXT,
    remember_me INTEGER NOT NULL DEFAULT 1, add_mode INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON auth_passkey_challenges(expires_at)`,
];
