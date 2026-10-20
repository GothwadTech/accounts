-- =============================================================================
-- GOTHWAD ACCOUNTS — FILE 05: KIWI STORE ANDROID NATIVE OAUTH CALLBACKS (D1)
-- =============================================================================
-- Engine: Cloudflare D1 (SQLite)
-- Safe to run repeatedly: appends native Android schemes only when missing,
-- while preserving all existing web callbacks and client settings.
--
-- Android native callbacks (same `kiwi-store` public PKCE client):
--   * gothwadstore://oauth/callback  — legacy APK transition scheme
--   * kiwistore://oauth/callback     — canonical Kiwi Store Android scheme
-- =============================================================================

UPDATE ecosystem_apps
SET client_id = COALESCE(client_id, id),
    redirect_uris = (
      SELECT json_group_array(uri)
      FROM (
        SELECT DISTINCT value AS uri
        FROM json_each(ecosystem_apps.redirect_uris)
        UNION
        SELECT 'gothwadstore://oauth/callback'
        UNION
        SELECT 'kiwistore://oauth/callback'
      )
    )
WHERE id = 'kiwi-store';

SELECT id, client_id, redirect_uris, (secret_hash IS NULL) AS public_client
FROM ecosystem_apps
WHERE id = 'kiwi-store';
