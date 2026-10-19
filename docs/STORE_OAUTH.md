# Store sign-in: Android + web callback setup

Reviewed 2026-10-17: Accounts checkout `a00407a`,
[`storeapp` main `ec3d799`](https://github.com/GothwadTech/storeapp/tree/ec3d7995610330f342883923dabf79308fa95b38),
[`store` main `eb3147a`](https://github.com/GothwadTech/store/tree/eb3147adb0f2217fe9b6cef96aec569636b057ce).
This is a source-code review, **not a live database inspection or device test**.
Only the Accounts repository is changed here; the Store web fix below is a handoff.

**Follow-up (2026-10-17):** Accounts provider hardening is now included in this
branch: PKCE checks at every grant step, safe consent-script serialization,
refreshed session cookies, atomic code/refresh consumption, no-store responses
and 503 on OAuth storage failures. Production config now sets `DEV_MODE=false`.
These runtime changes need a Worker deployment; the SQL still needs a separate
Accounts database run. Do not confuse local tests with live deployment.

**Give the other repositories' AIs these prompts:**
[Web Store prompt](STORE_WEB_AUTH_FIX_PROMPT.md) ·
[Android Store prompt](STOREAPP_AUTH_FIX_PROMPT.md).
They include the additional callback/session bugs found during the follow-up.

## 1. Why Android shows a redirect error

`storeapp/app/build.gradle.kts` configures:

- `OAUTH_CLIENT_ID = gothwad-store`
- `OAUTH_REDIRECT_URI = gothwadstore://oauth/callback`
- Accounts API base = `https://accounts.<APP_DOMAIN>/api/`

`AuthManager.kt` sends that callback to `/api/oauth/authorize` and again to
`/api/oauth/token`. `AndroidManifest.xml` receives the same deep link.
The native callback is **not** `https://storeapp.<APP_DOMAIN>/auth/callback`;
that HTTPS address belongs to the web landing site, not the Android app.

Accounts' `isRedirectUriAllowed()` requires an **exact match** in
`public.ecosystem_apps.redirect_uris`. Otherwise `/oauth/authorize` returns
`redirect_uri is not registered for this app` before checking login.
`01_core_schema.sql` seeds `gothwad-store` with an empty callback list; the
reviewed Store setup instructions list web URLs but omit the native callback.
So an empty list, or a web-only list, reproduces the reported Android failure.
The production row still needs checking to confirm its current values.

## 2. Fix Android from the Supabase dashboard

1. Open **the Accounts Supabase project** → **SQL Editor**.
   This is **not** the Store database and **not** Supabase Authentication → URL
   Configuration. Gothwad's own OAuth provider reads `ecosystem_apps`.
2. Run the complete file [`sql/05_store_android_oauth.sql`](../sql/05_store_android_oauth.sql).
   The core schema (`01_core_schema.sql`) must already exist.
3. Its result should show one row:
   - `id` / `client_id`: `gothwad-store` for the default configuration;
   - `redirect_uris` includes **exactly** `gothwadstore://oauth/callback`
     (no trailing slash);
   - `public_client = true` (`secret_hash IS NULL`, because the APK uses PKCE,
     not a client secret).
4. If there is **no row**, check that this is the Accounts project and run the
   core schema first, then run 04 again. If `public_client = false`, review the
   existing registration before proceeding: the shared Store client is intended
   to be public. Do not ship its secret in Android or automatically remove a
   secret used by another deployment; separate confidential clients if needed.
5. Close the old error tab. Open Android Store and tap **Sign in with Gothwad**
   again so it creates a new state/PKCE request.

The SQL preserves all existing web callbacks and client secrets, fills a missing
`client_id`, and does not duplicate the native URI on re-run. It adds **only** the
Android callback; web registrations are separate below. No Worker redeploy or
APK rebuild is needed **for this registration change**, provided the installed
APK uses the defaults above. Accounts reads the registry on each request.
Simply merging a SQL file into Git does **not** execute it in Supabase.

Do not disable redirect validation or use `DEV_MODE=true` as a workaround.

### One generated SQL packet for Android + all four web sites

For the standard deployment, a developer can generate the complete, transactional
setup directly from `[vars].APP_DOMAIN` in `cloudflare-worker/wrangler.toml`:

```bash
node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
```

The owner can copy that generated file into the **Accounts SQL Editor**; no domain
placeholder editing is needed. Review the four owned web sites before running it.
The generator only prints SQL: it does not connect to or alter any live service.
It preserves existing callbacks, aborts for a missing seed/conflicting client ID/
confidential Store client, and never clears a secret automatically. Generated
SQL is a deployment artifact; keep it out of Git (the source stays domain-agnostic).
File 04 alone remains the smaller Android-only fix.

## 3. Keep the web callbacks too

Android and web currently share `client_id=gothwad-store`. The web repo uses
`window.location.origin + '/auth/callback'`. Register each deployed, owned site:

| Client/site | Exact callback |
|---|---|
| Android APK | `gothwadstore://oauth/callback` |
| Web Store | `https://store.<APP_DOMAIN>/auth/callback` |
| Developer Console | `https://console.<APP_DOMAIN>/auth/callback` |
| Store Admin | `https://storeadmin.<APP_DOMAIN>/auth/callback` |
| Store App landing site | `https://storeapp.<APP_DOMAIN>/auth/callback` |

For the four standard web domains, run this **in Accounts** after replacing
`YOUR_APP_DOMAIN` with the value of `[vars].APP_DOMAIN` from
`cloudflare-worker/wrangler.toml` (domain only, no `https://` or slash).
Keep only sites you actually control and deploy. Existing callbacks, including
Android's, are preserved; no wildcard or localhost access is added.

```sql
DO $$
DECLARE
  app_domain text := 'YOUR_APP_DOMAIN';
BEGIN
  IF app_domain = 'YOUR_APP_DOMAIN' THEN
    RAISE EXCEPTION 'Replace YOUR_APP_DOMAIN with the configured APP_DOMAIN first';
  END IF;

  UPDATE public.ecosystem_apps AS app
  SET redirect_uris = ARRAY(
    SELECT DISTINCT uri
    FROM unnest(app.redirect_uris || ARRAY[
      'https://store.' || app_domain || '/auth/callback',
      'https://console.' || app_domain || '/auth/callback',
      'https://storeadmin.' || app_domain || '/auth/callback',
      'https://storeapp.' || app_domain || '/auth/callback'
    ]) AS callbacks(uri)
    ORDER BY uri
  )
  WHERE app.id = 'gothwad-store';
END $$;

SELECT id, client_id, redirect_uris, (secret_hash IS NULL) AS public_client
FROM public.ecosystem_apps
WHERE id = 'gothwad-store';
```

## 4. Separate bug in the Store web repo: `/api` is dropped

In `GothwadTech/store/src/lib/auth.ts`, the reviewed code is:

```ts
const u = new URL('/oauth/authorize', AUTH_BASE + '/');
```

A leading `/` replaces the base path. With the default
`AUTH_BASE=https://accounts.<APP_DOMAIN>/api`, that produces
`https://accounts.<APP_DOMAIN>/oauth/authorize`, **without `/api`**. It misses the
configured Accounts Worker route (`/api/*`). This is separate from Android's
registration error: Android already builds the `/api/oauth/authorize` URL correctly.

**Required change in the Store repo** (not applied to that repo in this session):

```ts
// Relative path keeps /api; normalise the trailing slash for either API host.
const u = new URL('oauth/authorize', AUTH_BASE.replace(/\/+$/, '') + '/');
```

Then rebuild/deploy the Store Pages frontend. Keep the Store Worker's
`AUTH_HUB_URL=https://api.<APP_DOMAIN>` for server-to-server token/userinfo calls;
do not replace that with the browser Route host. Accounts' own example in
[`OAUTH.md`](OAUTH.md) had the same URL construction bug and is corrected here.

## 5. Verification / remaining work

- Local regression suite (Node 22+):
  `npm test` (or `node --experimental-strip-types --test tools/test-oauth-*.mjs`).
  Tests use mocked registry reads, not production accounts.
- Live Android: new sign-in → account chooser/sign-in → consent → Allow →
  return to the APK → profile loads. Deny should return an OAuth cancellation,
  not a successful sign-in. Test a signed-out browser as well as an existing login.
- Live web, after applying the Store source change: the first authorization URL
  must contain **`/api/oauth/authorize`**, then return to that site's exact
  `/auth/callback` and complete token exchange.
- If the redirect error persists, compare the failing request's `client_id` and
  decoded `redirect_uri` with the database row. Installed APK build overrides
  may differ from current source. Do not share cookies, tokens, authorization
  codes, PKCE verifiers, or secret keys while diagnosing.

Full Android device and production web login remain owner verification steps;
local tests are not evidence that the live database has been updated.
