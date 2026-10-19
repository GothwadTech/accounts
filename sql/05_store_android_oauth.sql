-- =============================================================================
-- 04 — Register the Gothwad Store Android OAuth callback
-- =============================================================================
-- Run in the ACCOUNTS Supabase project, NOT the Store project's database.
-- Prerequisite: 01_core_schema.sql (creates/seeds ecosystem_apps).
-- Android's BuildConfig and manifest use this exact domain-independent URI.
-- Keep the web/console/admin callbacks already registered on the shared client.
-- Re-running is safe: the native callback is appended only when absent.

UPDATE public.ecosystem_apps
SET client_id = COALESCE(client_id, id),
    redirect_uris = CASE
      WHEN array_position(redirect_uris, 'gothwadstore://oauth/callback') IS NULL
        THEN array_append(redirect_uris, 'gothwadstore://oauth/callback')
      ELSE redirect_uris
    END
WHERE id = 'gothwad-store';

-- Expect ONE row, the native callback in redirect_uris, and public_client=true.
-- No row? Run 01_core_schema.sql in the Accounts project first.
-- public_client=false? See docs/STORE_OAUTH.md; never put a secret in the APK
-- or silently clear an existing confidential client's secret_hash.
SELECT id, client_id, redirect_uris, (secret_hash IS NULL) AS public_client
FROM public.ecosystem_apps
WHERE id = 'gothwad-store';
