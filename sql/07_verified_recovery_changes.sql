-- Existing recovery addresses remain usable; new replacements require ownership proof.
CREATE TABLE IF NOT EXISTS recovery_email_changes (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  previous_email TEXT,
  password_hash_snapshot TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_by TEXT
);
CREATE TABLE IF NOT EXISTS verified_recovery_emails (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
