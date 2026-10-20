-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 03: PROFILE PHOTOS STORAGE (CLOUDFLARE D1 + R2 READY)
-- =============================================================================
-- File: sql/03_avatars_storage.sql
-- Engine: Cloudflare D1 (SQLite)
--
-- KYA HAI IS FILE MEIN?
--   Profile photos (avatars) ke liye Cloudflare-native storage table!
--
--   WHY THIS DESIGN IS AWESOME:
--   1. ZERO Credit Card Required: Cloudflare D1 completely free plan par bina
--      card add kiye chalta hai. Frontend pehle se photo ko 256x256 (~12-25 KB)
--      resize karke bhejta hai. 5 GB free D1 mein 1,00,000+ avatars aaram se aate hain!
--   2. Zero Repeated DB Reads (Edge CDN Cached): Worker `/api/avatars/:userId?v=:etag`
--      ko `Cache-Control: public, max-age=31536000, immutable` aur `ETag` ke saath
--      Cloudflare Global CDN Cache se serve karta hai (< 5ms speed worldwide!).
--   3. Optional R2 Drop-In Upgrade: Agar future mein aap Cloudflare R2 bucket bind
--      karte ho (`AVATARS_BUCKET`), Worker bina kisi URL ya frontend change ke
--      automatically R2 bucket use karne lagta hai!
--   4. Automatic GDPR Clean Delete: User account delete hote hi `ON DELETE CASCADE`
--      se photo bhi turant clean ho jaati hai.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mime_type  TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data       BLOB NOT NULL,
  byte_size  INTEGER NOT NULL,
  etag       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
