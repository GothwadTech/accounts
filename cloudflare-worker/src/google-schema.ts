/** Additive upstream identities and short-lived, browser-bound authorization proofs. */
export const GOOGLE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auth_external_identities (
    issuer TEXT NOT NULL, subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_email TEXT NOT NULL, created_at TEXT NOT NULL,
    created_passwordless INTEGER NOT NULL DEFAULT 0 CHECK (created_passwordless IN (0, 1)),
    PRIMARY KEY (issuer, subject), UNIQUE (issuer, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auth_google_flows (
    state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
    verifier TEXT NOT NULL, nonce TEXT NOT NULL, purpose TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES user_sessions(id) ON DELETE CASCADE,
    password_snapshot TEXT, factor_version TEXT, authuser INTEGER NOT NULL,
    add_mode INTEGER NOT NULL, remember_me INTEGER NOT NULL,
    next_url TEXT NOT NULL, expires_at TEXT NOT NULL, used_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_google_flows_expiry ON auth_google_flows(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_google_tickets (
    token_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL,
    subject TEXT NOT NULL, provider_email TEXT NOT NULL, authoritative INTEGER NOT NULL,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES user_sessions(id) ON DELETE CASCADE,
    password_snapshot TEXT, factor_version TEXT, add_mode INTEGER NOT NULL,
    remember_me INTEGER NOT NULL, next_url TEXT NOT NULL, expires_at TEXT NOT NULL, used_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_google_tickets_expiry ON auth_google_tickets(expires_at)`,
];
