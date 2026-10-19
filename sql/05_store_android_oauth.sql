-- =============================================================================
-- 05 — Register the Kiwi Store Android OAuth callbacks
-- =============================================================================
-- Run in the ACCOUNTS Supabase project, NOT the Store project's database.
-- Prerequisite: 01_core_schema.sql (creates/seeds ecosystem_apps) and
-- 04_kiwi_store_oauth_migration.sql (creates the kiwi-store row).
-- Android native callbacks (same kiwi-store client):
--   gothwadstore://oauth/callback  — current APK (storeapp main), keep until the
--                                    kiwistore:// build is released everywhere
--   kiwistore://oauth/callback     — new scheme planned for the Android app
-- Keep the web/console/admin callbacks already registered on the shared client.
-- Re-running is safe: each native callback is appended only when absent.

UPDATE public.ecosystem_apps
SET client_id = COALESCE(client_id, id),
    redirect_uris = redirect_uris || ARRAY(
      SELECT wanted.uri
        FROM unnest(ARRAY[
               'gothwadstore://oauth/callback',
               'kiwistore://oauth/callback'
             ]::TEXT[]) AS wanted(uri)
       WHERE NOT (wanted.uri = ANY (redirect_uris))
    )
WHERE id = 'kiwi-store';

-- Expect ONE row, both native callbacks in redirect_uris, and public_client=true.
-- No row? Run 01_core_schema.sql in the Accounts project first.
-- public_client=false? See docs/STORE_OAUTH.md; never put a secret in the APK
-- or silently clear an existing confidential client's secret_hash.
SELECT id, client_id, redirect_uris, (secret_hash IS NULL) AS public_client
FROM public.ecosystem_apps
WHERE id = 'kiwi-store';
