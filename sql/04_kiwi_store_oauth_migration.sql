-- Kiwi Store OAuth client migration (Accounts project only).
-- Safe to run repeatedly. Existing authorization grants are preserved; pending
-- legacy auth codes are discarded and legacy refresh tokens are revoked.
-- Access JWTs are stateless and may remain valid until their normal expiry (1h).
-- This intentionally does not touch any other client_id (including Android).

BEGIN;

LOCK TABLE public.ecosystem_apps IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  old_app_id TEXT;
BEGIN
  -- The current schema seeds id=client_id='gothwad-store'. This also catches a
  -- row where only its client_id still has the legacy value.
  SELECT id
    INTO old_app_id
    FROM public.ecosystem_apps
   WHERE id = 'gothwad-store' OR client_id = 'gothwad-store'
   ORDER BY (id = 'gothwad-store') DESC
   LIMIT 1
   FOR UPDATE;

  -- Avoid a unique(client_id) collision if a previous/manual change already
  -- renamed the legacy row's client_id but not its primary key.
  IF old_app_id IS NOT NULL AND old_app_id <> 'kiwi-store' THEN
    UPDATE public.ecosystem_apps
       SET client_id = NULL
     WHERE id = old_app_id AND client_id = 'kiwi-store';
  END IF;

  -- Create/normalize the canonical client. These are the only production
  -- redirect URIs plus the Android native callback (the Android app uses this
  -- same client_id, so re-running this file must not drop it); localhost is the
  -- one local development callback.
  INSERT INTO public.ecosystem_apps
    (id, name, description, icon, redirect_uris, is_verified, client_id)
  VALUES
    ('kiwi-store', 'Kiwi Store', 'Apps and add-ons for Kiwi Store', 'store',
     ARRAY[
       'https://kiwistore.gothwadtech.com/auth/callback',
       'https://kiwiconsole.gothwadtech.com/auth/callback',
       'https://kiwiadmin.gothwadtech.com/auth/callback',
       'http://localhost:3000/auth/callback',
       'gothwadstore://oauth/callback'
     ]::TEXT[], FALSE, 'kiwi-store')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        redirect_uris = EXCLUDED.redirect_uris,
        client_id = EXCLUDED.client_id;

  -- Preserve legacy verification/client-secret settings if the canonical row
  -- did not exist already. The Store is currently a public PKCE client.
  IF old_app_id IS NOT NULL AND old_app_id <> 'kiwi-store' THEN
    UPDATE public.ecosystem_apps AS target
       SET is_verified = legacy.is_verified,
           secret_hash = legacy.secret_hash
      FROM public.ecosystem_apps AS legacy
     WHERE target.id = 'kiwi-store' AND legacy.id = old_app_id;
  END IF;

  -- Keep existing per-user consent, merging scopes if a Kiwi grant already
  -- exists for the same user. app_authorizations.app_id is the only FK to
  -- ecosystem_apps(id) in this repository's schema.
  IF old_app_id IS NOT NULL AND old_app_id <> 'kiwi-store' THEN
    INSERT INTO public.app_authorizations AS existing
      (user_id, app_id, scopes, granted_at, last_used_at)
    SELECT user_id, 'kiwi-store', scopes, granted_at, last_used_at
      FROM public.app_authorizations
     WHERE app_id = old_app_id
    ON CONFLICT (user_id, app_id) DO UPDATE
      SET scopes = ARRAY(
            SELECT DISTINCT scope_name
              FROM unnest(existing.scopes || EXCLUDED.scopes) AS u(scope_name)
             ORDER BY scope_name
          ),
          granted_at = LEAST(existing.granted_at, EXCLUDED.granted_at),
          last_used_at = GREATEST(existing.last_used_at, EXCLUDED.last_used_at);
  END IF;

  -- Authorization codes and refresh-token client_id columns are not foreign
  -- keys. Codes cannot safely survive a client_id/redirect change; revoke the
  -- legacy refresh-token family. New kiwi-store tokens are not affected by a
  -- later rerun of this migration.
  DELETE FROM public.oauth_auth_codes WHERE client_id = 'gothwad-store';
  UPDATE public.oauth_refresh_tokens
     SET revoked = TRUE
   WHERE client_id = 'gothwad-store' AND revoked = FALSE;

  -- Removing the old app row cascades only any already-migrated old grants.
  IF old_app_id IS NOT NULL AND old_app_id <> 'kiwi-store' THEN
    DELETE FROM public.ecosystem_apps WHERE id = old_app_id;
  END IF;
END;
$migration$;

COMMIT;
