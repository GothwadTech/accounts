# Store Sign-In: Android + Web Callback Setup (Cloudflare D1 Native)

> **100% Cloudflare D1 Native:** OAuth client registry (`ecosystem_apps`) lives inside the **`gothwad-accounts-db`** D1 SQLite database on Cloudflare Workers (NOT in Kiwi Store's database, and NO Supabase is used anywhere).

**Handoff prompts for sibling repos:**
[Web Store prompt](STORE_WEB_AUTH_FIX_PROMPT.md) ·
[Android Store prompt](STOREAPP_AUTH_FIX_PROMPT.md)

---

## 1. Why Exact Callback Registration Matters

`storeapp/app/build.gradle.kts` configures:
- `OAUTH_CLIENT_ID = kiwi-store`
- `OAUTH_REDIRECT_URI = gothwadstore://oauth/callback` (transitioning to `kiwistore://oauth/callback`)
- Accounts API base = `https://accounts.<APP_DOMAIN>/api/`

`isRedirectUriAllowed()` in `cloudflare-worker/src/index.ts` enforces **exact callback matching** against `ecosystem_apps.redirect_uris` (JSON array in D1) + mandatory S256 PKCE for public clients (`secret_hash IS NULL`).

---

## 2. One-Command D1 SQL Generator (Android + All Web Subdomains)

Generate ready-to-run Cloudflare D1 SQL automatically from `[vars].APP_DOMAIN` in `cloudflare-worker/wrangler.toml`:

```bash
node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
```

Paste the output into **Cloudflare Dashboard → Storage & Databases → D1 → `gothwad-accounts-db` → Console** and click **Execute**!

Or replace `YOUR_APP_DOMAIN` directly in the idempotent D1 SQL template below:

```sql
UPDATE ecosystem_apps
SET client_id = COALESCE(client_id, id),
    redirect_uris = (
      SELECT json_group_array(uri)
      FROM (
        SELECT DISTINCT value AS uri
        FROM json_each(ecosystem_apps.redirect_uris)
        UNION
        SELECT 'https://kiwistore.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://kiwiconsole.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://kiwiadmin.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://mail.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://meet.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://grixchat.YOUR_APP_DOMAIN/auth/callback'
        UNION
        SELECT 'https://drive.YOUR_APP_DOMAIN/auth/callback'
      )
    )
WHERE id = 'kiwi-store';

-- Register Mail, Meet, GrixChat & Drive web callbacks cleanly too:
UPDATE ecosystem_apps SET redirect_uris = json_array('https://mail.YOUR_APP_DOMAIN/auth/callback') WHERE id = 'gothwad-mail';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://meet.YOUR_APP_DOMAIN/auth/callback') WHERE id = 'gothwad-meet';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://grixchat.YOUR_APP_DOMAIN/auth/callback') WHERE id = 'gothwad-chat';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://drive.YOUR_APP_DOMAIN/auth/callback') WHERE id = 'gothwad-drive';

SELECT id, client_id, redirect_uris, (secret_hash IS NULL) AS public_client
FROM ecosystem_apps
WHERE id IN ('kiwi-store', 'gothwad-mail', 'gothwad-meet', 'gothwad-chat', 'gothwad-drive');
```

---

## 3. Store Web `/api` Base Path Rule

In `GothwadTech/store/src/lib/auth.ts`, always construct the authorize URL with a relative path so `/api` is preserved when using `AUTH_BASE = 'https://accounts.<APP_DOMAIN>/api'`:

```ts
// Relative path keeps /api; normalise the trailing slash for either API host.
const u = new URL('oauth/authorize', AUTH_BASE.replace(/\/+$/, '') + '/');
```

Server-to-server calls (`Store Worker → Accounts Worker`) must use `https://api.<APP_DOMAIN>` (`API_DOMAIN`), whereas browser redirects use `https://accounts.<APP_DOMAIN>`.
