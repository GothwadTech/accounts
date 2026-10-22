-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 04: KIWI STORE & CORE ECOSYSTEM OAUTH REGISTRATION
-- =============================================================================
-- Engine: Cloudflare D1 (SQLite)
-- Safe to run repeatedly (idempotent).
--
-- OVERVIEW:
--   1. Registers production web, localhost dev, and native Android APK callbacks
--      for Kiwi Store (`kiwi-store`).
--   2. Migrates any existing user grants from legacy `gothwad-store` rows to
--      `kiwi-store`, deletes stale authorization codes, and revokes legacy refresh tokens.
-- =============================================================================

INSERT INTO ecosystem_apps (id, name, description, icon, redirect_uris, is_verified, client_id, is_core)
VALUES (
  'kiwi-store',
  'Kiwi Store',
  'Apps and add-ons for Kiwi Store',
  'store',
  json_array(
    'https://kiwistore.gothwadtech.com/auth/callback',
    'https://kiwiconsole.gothwadtech.com/auth/callback',
    'https://kiwiadmin.gothwadtech.com/auth/callback',
    'http://localhost:3000/auth/callback',
    'gothwadstore://oauth/callback',
    'kiwistore://oauth/callback'
  ),
  0,
  'kiwi-store',
  1
)
ON CONFLICT (id) DO UPDATE SET
  name          = excluded.name,
  description   = excluded.description,
  icon          = excluded.icon,
  redirect_uris = excluded.redirect_uris,
  client_id     = excluded.client_id,
  is_core       = excluded.is_core;

-- Preserve user grants from any legacy `gothwad-store` row before removing it
INSERT INTO app_authorizations (id, user_id, app_id, scopes, granted_at, last_used_at)
SELECT
  lower(hex(randomblob(16))),
  user_id,
  'kiwi-store',
  scopes,
  granted_at,
  last_used_at
FROM app_authorizations
WHERE app_id = 'gothwad-store'
ON CONFLICT (user_id, app_id) DO UPDATE SET
  scopes = (
    SELECT json_group_array(s)
    FROM (
      SELECT DISTINCT value AS s FROM json_each(app_authorizations.scopes)
      UNION
      SELECT DISTINCT value AS s FROM json_each(excluded.scopes)
    )
  ),
  granted_at   = MIN(app_authorizations.granted_at, excluded.granted_at),
  last_used_at = MAX(app_authorizations.last_used_at, excluded.last_used_at);

-- Invalidate legacy `gothwad-store` OAuth codes & refresh tokens
DELETE FROM oauth_auth_codes WHERE client_id = 'gothwad-store';

UPDATE oauth_refresh_tokens
   SET revoked = 1
 WHERE client_id = 'gothwad-store' AND revoked = 0;

DELETE FROM ecosystem_apps WHERE id = 'gothwad-store';
