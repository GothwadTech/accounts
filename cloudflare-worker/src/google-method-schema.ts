/** Migration 13: many-to-many methods, immutable origin and versioned security proofs. */
export const GOOGLE_METHOD_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auth_google_methods (
    id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_email TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (issuer, subject, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_google_methods_user ON auth_google_methods(user_id, issuer)`,
  `CREATE INDEX IF NOT EXISTS idx_google_methods_subject ON auth_google_methods(issuer, subject)`,
  `CREATE TABLE IF NOT EXISTS auth_google_account_origins (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    created_passwordless INTEGER NOT NULL CHECK (created_passwordless IN (0, 1))
  )`,
  `CREATE TABLE IF NOT EXISTS auth_google_flow_guards (
    state_hash TEXT PRIMARY KEY REFERENCES auth_google_flows(state_hash) ON DELETE CASCADE,
    links_snapshot TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_google_ticket_guards (
    token_hash TEXT PRIMARY KEY REFERENCES auth_google_tickets(token_hash) ON DELETE CASCADE,
    links_snapshot TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO auth_google_methods (id, issuer, subject, user_id, provider_email, created_at)
    SELECT lower(hex(randomblob(16))), issuer, subject, user_id, provider_email, created_at
    FROM auth_external_account_links
    WHERE NOT EXISTS (SELECT 1 FROM auth_schema_versions WHERE version = '13_google_signin_methods')`,
  `INSERT OR IGNORE INTO auth_google_account_origins (user_id, created_passwordless)
    SELECT user_id, created_passwordless FROM auth_external_account_links
    WHERE NOT EXISTS (SELECT 1 FROM auth_schema_versions WHERE version = '13_google_signin_methods')`,
  `INSERT OR IGNORE INTO auth_schema_versions (version) VALUES ('13_google_signin_methods')`,
];
