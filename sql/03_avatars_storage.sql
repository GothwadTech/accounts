-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 03: PROFILE PHOTOS STORAGE (CLOUDFLARE D1 + R2 READY)
-- =============================================================================
-- File: sql/03_avatars_storage.sql
-- Engine: Cloudflare D1 (SQLite)
--
-- OVERVIEW:
--   Cloudflare-native profile photo storage table (`user_avatars`).
--
--   DESIGN HIGHLIGHTS:
--   1. Zero Credit Card Required: Runs on Cloudflare D1's free plan without adding
--      a payment card. Browsers pre-resize uploads to 256x256 (~12–25 KB), comfortably
--      fitting 100,000+ profile avatars inside free D1 storage.
--   2. Edge CDN Cached: Served at `/api/avatars/:userId?v=:etag` with
--      `Cache-Control: public, max-age=31536000, immutable` and `ETag` headers so
--      Cloudflare's global edge serves repeat requests in < 5ms with zero DB reads.
--   3. Optional R2 Drop-In Upgrade: If an `AVATARS_BUCKET` R2 binding is later added,
--      the Worker transparently switches to R2 without changing any frontend URLs.
--   4. Automatic Cascade Cleanup: `ON DELETE CASCADE` removes avatar blobs immediately
--      whenever a user deletes their account.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  data         BLOB NOT NULL,
  etag         TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
