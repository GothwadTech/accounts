-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 02: ACCOUNT ACTIVITY LOG (CLOUDFLARE D1)
-- =============================================================================
-- File: sql/02_account_activity.sql
-- Engine: Cloudflare D1 (SQLite)
--
-- OVERVIEW:
--   Google Account-style "Recent security & account activity" feed.
--   Logs every sign-in, password change, device sign-out, and OAuth app grant,
--   automatically retaining the latest 100 entries per user so D1 stays lean.
--
-- IDEMPOTENT: Safe on both initial bootstrap and repeated console runs (`IF NOT EXISTS`).
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_user_time
  ON account_activity (user_id, created_at DESC);
