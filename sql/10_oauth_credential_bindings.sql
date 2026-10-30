
-- Durable grant-bound OAuth credentials. Old unbound tokens require fresh consent.
CREATE TABLE IF NOT EXISTS oauth_credential_bindings (
    credential_hash TEXT PRIMARY KEY, kind TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL, grant_id TEXT NOT NULL, password_snapshot TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_oauth_bindings_user ON oauth_credential_bindings(user_id, client_id);

CREATE INDEX IF NOT EXISTS idx_oauth_bindings_expiry ON oauth_credential_bindings(expires_at);
