-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 02: ACCOUNT ACTIVITY LOG (CLOUDFLARE D1)
-- =============================================================================
-- File: sql/02_account_activity.sql
-- Engine: Cloudflare D1 (SQLite)
--
-- KYA HAI IS FILE MEIN?
--   Google Account jaisi "Recent security / account activity" feed.
--   Har login, password change, device sign-out, ya OAuth app connection par
--   Worker yahan entry add karta hai aur automatically har user ki latest 100
--   entries maintain karta hai (taaki D1 database hamesha fast aur lightweight rahe).
--
-- SAFE HAI: First-run aur re-run dono 100% safe (`IF NOT EXISTS`).
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_account_activity_user
  ON account_activity (user_id, created_at DESC);
