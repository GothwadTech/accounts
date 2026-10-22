# 🚀 Master Engineering Prompt for `GothwadTech/store` (100% Zero-Card Cloudflare D1 Migration + Production Audit)

You are an autonomous Principal Full-Stack, Security, & Cloudflare Edge Architect working inside **`GothwadTech/store`**.

Communicate with founder **Pawan** in **clear, friendly Hinglish (simple Hindi + English)**, keeping explanations crisp, honest, and easy to act on. Pawan is **17 years old (Class 12 + NEET preparation for the next 6 months)** operating on a strict **₹0/month, ZERO-credit-card** budget with very limited time for manual debugging — build everything end-to-end cleanly in ONE complete shot so production runs smoothly with zero hidden traps.

---

## ⚠️ 0. CRITICAL MANDATE — DO NOT BLINDLY TRUST THIS PROMPT! AUDIT & BUILD WHAT IS GENUINELY BEST!

**READ THIS BEFORE DOING ANYTHING ELSE:**

1. **Zero Blind Trust (`Andha Bharosa Mat Karna`):**
   - Treat every bug report, line reference, schema detail, and design suggestion in this document as an **initial engineering brief — NOT blind dogma**.
   - Codebases evolve. Line numbers, helper names, edge cases, or subtle interactions in `GothwadTech/store`, `GothwadTech/accounts`, or `GothwadTech/storeapp` may have details beyond or slightly different from what is written here.
2. **Mandatory Independent Audit First (`Khudka 100% Best Effort Lagana`):**
   - Before writing code, **inspect EVERY relevant file yourself** in:
     1. **This repo (`GothwadTech/store`)**: `package.json`, `worker/wrangler.toml`, `worker/src/*`, `shared/*`, `src/*`, `sql/*`, and all `.md` documentation files.
     2. **Live Accounts repo (`https://github.com/GothwadTech/accounts`, `main` branch)**: specifically `cloudflare-worker/src/` (`routes/auth-profile.ts`, `routes/oauth.ts`, `cookies.ts`, `index.ts`), `web/js/authuser.js`, `sql/00_d1_console_bootstrap.sql`, `sql/03_avatars_storage.sql`, `sql/04_kiwi_store_oauth_migration.sql`, `sql/05_store_android_oauth.sql`, `tests/kiwi-store-migration.test.mjs`, and `tools/local-d1.mjs`.
     3. **Live Android Store client (`https://github.com/GothwadTech/storeapp`)**: specifically `StoreApi.kt`, `StoreModels.kt`, and OAuth callback/deep-link handling so you verify every JSON property name, HTTP status code, and auth header expected by the live Android APK!
3. **Engineering Autonomy (`Jo Sabse Best Ho Vahi Karna`):**
   - If your independent audit uncovers **additional bugs, race conditions, security flaws, UI/UX rough edges, missing indexes, or a cleaner technical solution** than suggested below — **FIX THEM AND IMPLEMENT THE SUPERIOR SOLUTION!**
   - Never leave a real bug unfixed just because this prompt didn't mention it, and never force an awkward pattern if live code reveals a cleaner, safer, faster architecture — **as long as you strictly honor Section 1's Hard Non-Negotiable Constraints**.
4. **World-Class Documentation (`Aache Se Docs Maintain Karna`):**
   - Do **NOT** treat docs as an afterthought. Clean up all stale Supabase/ImgBB references across every `.md` file and maintain crystal-clear, honest, up-to-date documentation (`README.md`, `TASK.md`, `HANDOVER.md`, `PLAN.md`, `sql/README.md` / `sql/01_store_schema.sql`) so Pawan or any future AI engineer understands the whole system in **2 minutes**.

---

## 🔒 1. NON-NEGOTIABLE HARD CONSTRAINTS (NEVER VIOLATE THESE!)

1. **ZERO Credit Card / ZERO R2 Requirement (STRICT HARD RULE):**
   - Pawan **DOES NOT HAVE A CREDIT CARD**. Enabling Cloudflare R2 requires a payment card on Cloudflare Dashboard, so **R2 CANNOT BE REQUIRED anywhere!**
   - **ZERO Supabase** (`@supabase/supabase-js`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` completely removed).
   - **ZERO ImgBB** (`IMGBB_API_KEY` completely removed).
   - **ZERO external paid or card-gated services.** Everything must run **100% Free Forever with ZERO card**:
     - **Structured Store Data + Native App Icons/Screenshots Binary Storage:** **Cloudflare D1 (`BLOB` table `store_images`) + Cloudflare Edge CDN Cache (`caches.default`)** — exact proven pattern running in production on `GothwadTech/accounts` (`sql/03_avatars_storage.sql` + `routes/auth-profile.ts`).
     - **APK Binary Storage (`1 MB – 100 MB+`):** Existing **`GothwadTech/storefiles`** GitHub Releases / Contents storage via `worker/src/apk.ts` (`GITHUB_STOREFILES_TOKEN` + optional non-breaking future R2 fallback ONLY if `env.APK_BUCKET` is bound in the future, never required).
2. **Exact Live Cloudflare D1 Database Binding (Already Created by Pawan):**
   - Wire this exact production D1 database directly into `worker/wrangler.toml`:
     ```toml
     keep_vars = true

     [[d1_databases]]
     binding = "DB"
     database_name = "store"
     database_id = "a3dc3e71-cf89-4e0a-89d1-693fcf6f227a"
     ```
3. **Single Unified Codebase Across All 4 Web Domains + 1 API Worker + Android `storeapp`:**
   - **1 Cloudflare Pages project** (custom domains: `kiwistore.gothwadtech.com`, `kiwiconsole.gothwadtech.com`, `kiwiadmin.gothwadtech.com`, `kiwiapp.gothwadtech.com`) + **1 Cloudflare Worker** (`worker/wrangler.toml`, preserving existing production Worker name, routes, and secrets!).
   - Verify host-based routing in `shared/brand.ts` and `src/` so all 4 web hosts + local dev (`?surface=store|console|admin|app`) resolve cleanly and remain **domain-agnostic** (`APP_DOMAIN`, never hardcoded outside defaults).
   - Preserve **100% JSON wire compatibility** with live Android `GothwadTech/storeapp` (`StoreApi.kt` & `StoreModels.kt`) so existing installed APKs keep working without forced breaking changes.
4. ** ecosystem Security & Hygiene Rules:**
   - **Zero secrets committed to Git** (never commit tokens/keys; keep `.env.example` / `.dev.vars.example` clean).
   - **Zero auth tokens stored in `localStorage` or `sessionStorage` on web** (rely on `HttpOnly; Secure` `.gothwadtech.com` SSO slot cookies + `/api/auth/me` & `/api/auth/signout`, while STILL accepting `Authorization: Bearer <oauth_access_token>` on the Worker for Android `storeapp`!).
   - **Pure lowercase `username` identity in D1** (derive `username@${appDomain}` dynamically; never store hardcoded domain emails as identity keys).
   - **Strict File-Size Ceiling (`<= 500` lines target per file across ALL code, SQL, test, and `.md` files!):** Split large files into clean, cohesive modules and enforce this with an automated test gate!

---

## 🔍 2. VERIFIED AUDIT FINDINGS TO CHECK & FIX (PLUS ANYTHING ELSE YOU DISCOVER!)

Verify each of these against the actual files in `GothwadTech/store` and fix all of them cleanly:

### Bug #1 — Broken OAuth Authorize Base URL (`404` on Sign-In!)
- **What we found in `shared/brand.ts`:** `BRAND_DEFAULTS.accountsApiUrl` was set to `'https://accounts.gothwadtech.com/api'`.
- When `src/lib/auth.ts` executes `new URL('/oauth/authorize', AUTH_BASE + '/')`, URL resolution drops `/api` and points the browser to `https://accounts.gothwadtech.com/oauth/authorize` (**static Pages `404`**!), whereas OAuth lives on **`https://api.gothwadtech.com/oauth/authorize`** (and token exchange on `https://api.gothwadtech.com/api/oauth/token`)!
- **Verify against `GothwadTech/accounts`:**
  - `AUTH_API_BASE` / `accountsApiUrl` default MUST be **`https://api.gothwadtech.com`** (used for `/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo`, `/api/auth/me`, `/api/auth/signout`).
  - `ACCOUNTS_WEB_URL` (`https://accounts.gothwadtech.com`) is ONLY for browser UI navigation links (`/me`, `/signin`, account switcher add-account flow).
  - **CRITICAL CHECK ON `kiwiapp`:** Verify `GothwadTech/accounts/tests/kiwi-store-migration.test.mjs`! Registered OAuth web redirect URIs on `kiwi-store` are:
    - `https://kiwistore.gothwadtech.com/auth/callback`
    - `https://kiwiconsole.gothwadtech.com/auth/callback`
    - `https://kiwiadmin.gothwadtech.com/auth/callback`
    - `http://localhost:3000/auth/callback`
    - Android deep links: `gothwadstore://oauth/callback` & `kiwistore://oauth/callback`
    - `https://kiwiapp.gothwadtech.com/auth/callback` is **intentionally NOT registered** because `kiwiapp` is the public Store APK download landing page (`StoreAppLanding.tsx`) — keep `kiwiapp` fast and public, routing any sign-in CTA to `kiwistore` instead of triggering an unregistered `redirect_uri` error!

### Bug #2 — Cookie SSO Field Mismatch, Cookie Rotation Loss & Multi-Account `/u/0..5` Support
- **What we found in `worker/src/index.ts` (`verifyUser`):**
  1. When authenticating via `.gothwadtech.com` SSO cookies against `GET https://api.gothwadtech.com/api/auth/me`, the Worker looked for `d.user.name` and `d.user.picture`, whereas live `GothwadTech/accounts` `/api/auth/me` actually returns `first_name`, `last_name`, `avatar_url`, `username`, `activeId`, `authuser`, and `accounts` (`0..5` slots)! Because of that mismatch, web users lost their real full name and avatar!
  2. When `api.gothwadtech.com/api/auth/me` transparently refreshes/rotates an expiring slot cookie via `Set-Cookie`, the Store Worker discarded those `Set-Cookie` headers instead of forwarding them back to the browser (`headers.append('Set-Cookie', ...)`).
  3. Forward `X-Gothwad-Authuser` from browser requests to `api.gothwadtech.com/api/auth/me`, allow `X-Gothwad-Authuser` in CORS `Access-Control-Allow-Headers` (with `Access-Control-Allow-Credentials: true` on allowed `*.${appDomain}` + localhost origins), and expose multi-account `accounts` + `activeSlot` cleanly so users switching accounts (`/u/0`..`/u/5` or `?authuser=0..5` or in-app Google-style account switcher menu) switch **instantly with zero token leaks in `localStorage`/`sessionStorage`**!
  4. **Keep `Authorization: Bearer <token>` 100% intact** alongside cookie SSO! Android `GothwadTech/storeapp` sends `Authorization: Bearer <oauth_access_token>`, which validates via `GET https://api.gothwadtech.com/api/oauth/userinfo` (returning standard OIDC `{ sub, preferred_username, username, name, given_name, family_name, email, picture }`). Support BOTH paths normalized into one clean `VerifiedSession` object!

### Bug #3 — Fake No-Op `POST /api/auth/signout` & Frontend Stale Error Banners
- **What we found:** `POST /api/auth/signout` simply returned `{ ok: true }` without notifying `api.gothwadtech.com/api/auth/signout` or forwarding cookie-clearing `Set-Cookie` headers, so clicking Sign Out left the user logged right back in on refresh! Fix real sign-out properly (supporting single-slot / active session sign-out cleanly).
- Also inspect `src/shared/BackendNotice.tsx`, health checks, and error states across `StoreApp`, `ConsoleApp`, and `AdminApp` — remove stale `"Supabase is not configured"` / `"ImgBB"` notices and replace them with clean, accurate diagnostics only if truly offline.

### Bug #4 — `reports` Table Column Mismatch & SQLite Type Pitfalls
- Verify every column written/read across ALL routes in `worker/` against your SQL schema! For example, the existing Worker code inserted `reporter_username` into `reports` even though old SQL schemas had drift, and Postgres booleans/arrays (`is_verified`, `verified_safety`, `tags`, `permissions`) come back from SQLite/D1 as `0 | 1` integers and JSON strings (`'["tools"]'`) unless cleanly mapped with `Boolean(Number(row.col))` and safe `parseJsonArray(row.col)` helpers in `worker/src/mappers.ts`!
- Make download tracking atomic (`env.DB.batch([...])` inserting into `downloads`, upserting `library`, and incrementing `apps.downloads_count = downloads_count + 1` in one round-trip instead of counting all historical rows on every download).
- In `GET /api/health`, return clear status including `configured: { d1: true, images: true, github: Boolean(...), auth: true, supabase: true }` (keeping `supabase: true` alias ONLY if older Android/web clients inspect that field, alongside real `d1: true`!).

---

## 🖼️ 3. ZERO-CARD NATIVE IMAGE CDN (`store_images` D1 `BLOB` + `caches.default`)

Replace `ImgBB` completely across `ConsoleApp` (app icon upload, screenshots upload, banner upload) AND any profile/developer assets using **100% Free Cloudflare D1 + Edge CDN Cache** (zero R2, zero card):

1. **Client-Side WebP/PNG Optimization Helper (`src/lib/imageUpload.ts`):**
   - Before uploading from `kiwiconsole` / web UI, resize & compress cleanly on HTML5 `<canvas>`:
     - **App Icons:** crisp `512×512` (WebP quality `0.86`, preserving alpha transparency smoothly; typically `20–45 KB`!).
     - **App Screenshots & Feature Banners:** max dimension `1280px` (`720p/1080p`-class clarity, WebP quality `0.82`; typically `45–95 KB`!).
   - With `~40 KB` icons and `~70 KB` screenshots deduplicated by SHA-256, a free `500 MB` D1 database comfortably holds **thousands of apps and tens of thousands of screenshots for ₹0**, while serving **99%+ of traffic directly from Cloudflare's Edge Cache (`caches.default`) with ZERO D1 row reads on cache hits**!
2. **D1 Table `store_images`:**
   - `id TEXT PRIMARY KEY` (`crypto.randomUUID()` or clean slug ID)
   - `sha256 TEXT NOT NULL UNIQUE` (automatic binary deduplication — re-uploading the same icon/screenshot returns the existing image instantly with zero duplicate bytes!)
   - `owner_username TEXT NOT NULL`
   - `kind TEXT NOT NULL DEFAULT 'screenshot'` (`'icon' | 'screenshot' | 'banner'`)
   - `mime_type TEXT NOT NULL` (`image/webp`, `image/png`, `image/jpeg`)
   - `byte_size INTEGER NOT NULL` (hard guard `<= 400000` bytes post-compression so no single upload bloats D1; accept larger raw files in browser because client canvas compresses first, plus server validation!)
   - `width INTEGER`, `height INTEGER`
   - `data BLOB NOT NULL` (`Uint8Array` / `ArrayBuffer` bound directly in D1 prepared statement)
   - `created_at TEXT NOT NULL`
3. **Worker Endpoints (`POST /api/uploads/image` & `GET /api/images/:id`):**
   - **`POST /api/uploads/image`** (authenticated user):
     - Supports BOTH `multipart/form-data` (`file`) AND raw binary/base64 JSON if currently used by `ConsoleApp` — check existing `ConsoleApp` call signature so nothing breaks!
     - Validates magic bytes (`WEBP`, `PNG`, `JPEG` — block SVGs/HTML to prevent stored XSS!).
     - Computes WebCrypto `SHA-256` digest -> if `sha256` already exists in `store_images`, returns existing URL immediately without storing duplicate bytes!
     - **CRITICAL CROSS-DOMAIN + ANDROID URL RULE:** Return a **canonical absolute HTTPS URL** (`https://<apiOrStoreOrigin>/api/images/<id>?v=<sha256_slice12>`), NOT a bare relative `/api/images/...` string! Why? Because an image uploaded on `kiwiconsole.<domain>` MUST render directly inside:
       1. `kiwistore.<domain>`
       2. `kiwiadmin.<domain>`
       3. `kiwiapp.<domain>`
       4. **Android `GothwadTech/storeapp` (`Coil` / native image loader, where relative `/api/...` URLs fail if not absolute!)**
   - **`GET /api/images/:id`** (public fast edge CDN route):
     - First check `caches.default.match(cacheKey)`.
     - Supporting `If-None-Match` -> instant `304 Not Modified`.
     - On cache miss, read `{ mime_type, byte_size, sha256, data }` from `store_images`, build response with:
       - `Content-Type: <mime_type>`
       - `Cache-Control: public, max-age=31536000, immutable`
       - `ETag: "<sha256>"`
       - `Cross-Origin-Resource-Policy: cross-origin`
       - `Access-Control-Allow-Origin: *`
       - `X-Content-Type-Options: nosniff`
     - Store in `ctx.waitUntil(caches.default.put(cacheKey, response.clone()))` and return!

---

## 🗄️ 4. CLOUDFLARE D1 SCHEMA & ZERO-FRICTION AUTO-BOOTSTRAP (`worker/src/db.ts` + `sql/`)

1. **CRITICAL REMOTE CLOUDFLARE D1 SQL RULES (DO NOT VIOLATE!):**
   - **NEVER put `PRAGMA` statements** inside runtime D1 SQL or `sql/00_d1_console_bootstrap.sql`! Remote Cloudflare D1 already enforces `foreign_keys = ON` natively and throws **`SQLITE_AUTH`** if a batch contains `PRAGMA`! (Enable `PRAGMA foreign_keys = ON` ONLY inside your local `node:sqlite` test harness JS wrapper, just like `GothwadTech/accounts/tools/local-d1.mjs`.)
   - Keep **`sql/00_d1_console_bootstrap.sql` 100% pure, idempotent SQL with ZERO `--` or `/* */` comments** so pasting the entire file into Cloudflare Dashboard -> D1 -> `store` -> Console executes with **zero parser hiccups**!
   - Put human documentation and architectural notes cleanly inside **`sql/01_store_schema.sql`** and **`sql/README.md`**.
2. **Cold-Start Auto-Bootstrap (`ensureStoreSchema(env.DB)` in `worker/src/db.ts`):**
   - Using a `WeakMap<object, Promise<void>>`, automatically execute all idempotent `CREATE TABLE IF NOT EXISTS ...`, `CREATE INDEX IF NOT EXISTS ...`, and default `categories` `INSERT OR IGNORE` statements via `env.DB.batch(...)` once per isolate cold start.
   - That means **the moment `wrangler deploy` runs against `database_id = "a3dc3e71-cf89-4e0a-89d1-693fcf6f227a"`, the live `"store"` database initializes ALL tables, indexes, and categories automatically on first request** — zero manual step failure possible!
3. **Complete Table Coverage (Verify Every Column Against Live Worker + UI + Android `storeapp`):**
   - Cover all store entities cleanly (`developers`, `categories`, `apps`, `app_releases`, `app_screenshots`, `store_images`, `reviews`, `wishlists`, `downloads`, `library`, `review_submissions`, `reports`, `featured` — plus any additional table or column your audit of `GothwadTech/store` and `GothwadTech/storeapp` reveals is needed!).

---

## 🧩 5. MODULAR ARCHITECTURE (`<= 500` LINES PER FILE EVERYWHERE!)

Audit every file's line count across the entire repo (`worker/`, `shared/`, `src/`, `sql/`, `tests/`, `*.md`). Split oversized monoliths (`worker/src/index.ts`, `src/console/ConsoleApp.tsx`, `src/store/StoreApp.tsx`, `src/lib/AppContext.tsx`, and any `.md` files over 500 lines) cleanly into focused modules where **EVERY single file in the repository is `<= 500` lines**:
- `worker/src/`: e.g. `index.ts` (slim router + middleware), `db.ts` (D1 helpers + auto-bootstrap), `mappers.ts` (SQLite -> wire JSON boolean/array mappers), `auth.ts` (cookie SSO + `/u/0..5` + Bearer token + cookie passthrough), `apk.ts` (GitHub `storefiles` storage), and modular route files (`routes/apps.ts`, `routes/console.ts`, `routes/admin.ts`, `routes/user.ts`, `routes/images.ts`).
- `src/`: clean split of `StoreApp`, `ConsoleApp`, `AdminApp`, `StoreAppLanding`, `AppContext`, multi-account switcher UI (`/u/0..5`), and client image compression/upload utilities — zero broken imports, clean TypeScript `tsc --noEmit` + production `vite build`.

---

## 🧪 6. REAL `node:sqlite` AUTOMATED TEST SUITE (PROVE EVERYTHING WORKS!)

Build a comprehensive automated test suite (using Node 22 built-in `node:sqlite` `DatabaseSync` mimicking Cloudflare D1 `.prepare().bind().first()/.all()/.run()` + `.batch()`, modeled after `GothwadTech/accounts/tools/local-d1.mjs` — zero extra native packages needed!) verifying:
1. **Cold-start schema auto-bootstrap & `sql/00_d1_console_bootstrap.sql`** execute cleanly with zero errors and no `PRAGMA` statements.
2. **Auth & Multi-Account `/u/0..5`:**
   - Web `.gothwadtech.com` SSO cookie verification via mocked `api.gothwadtech.com/api/auth/me` (`first_name`, `last_name`, `avatar_url`, `activeId`, `authuser`, `accounts`), `X-Gothwad-Authuser` forwarding, and upstream `Set-Cookie` rotation passthrough!
   - Android `Authorization: Bearer <token>` verification via `/api/oauth/userinfo`!
   - Real `POST /api/auth/signout` clearing session cleanly!
   - OAuth authorize URL points to `https://api.gothwadtech.com/oauth/authorize` (NEVER `accounts.gothwadtech.com/oauth/authorize`) and `kiwiapp` does NOT register/use `/auth/callback`.
3. **Zero-Card Image Upload & Edge Cache CDN:**
   - `POST /api/uploads/image` magic-byte check, SVG XSS rejection, SHA-256 deduplication in `store_images`, canonical absolute HTTPS URL output, and `GET /api/images/:id` `200` + `ETag` `304` + `caches.default` hit behavior!
4. **Full End-to-End Store Lifecycle & Android Wire Contract:**
   - Developer registration -> app publish (`Console`) -> admin review approval (`Admin`) -> public catalog, search, category filtering, featured list (`Store`) -> APK release & atomic download counter increment + library save -> ratings/reviews aggregate recalculation -> wishlists -> abuse report (`reporter_username`) -> exact JSON shape expected by Android `StoreModels.kt`!
5. **Repo Hygiene Gate Test:**
   - Automated check scanning every `.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.sql`, and `.md` file in the repo confirming **100% of files are `<= 500` lines**, zero `@supabase/supabase-js` or `IMGBB` references remain in active code, and both `npm test` + `npm run build` pass 100%!

---

## 📚 7. DOCUMENTATION EXCELLENCE CHECKLIST (`AACHE SE DOCS MAINTAIN KARNA`)

Before finishing, write clean, accurate, well-structured documentation (every file strictly `<= 500` lines, zero stale Supabase/ImgBB mentions):
1. **`README.md`** — Crisp overview of Kiwi Store ecosystem (all 4 web domains + Worker + D1 `"store"` + `storefiles` GitHub APK storage + Android `storeapp`), local dev & test commands, and a **super simple 2-minute Cloudflare deploy guide** for Pawan.
2. **`TASK.md`** — Clear record of everything audited, fixed, migrated, and tested, plus exact human steps remaining (if any).
3. **`HANDOVER.md`** — Deep, crystal-clear engineering guide covering SSO + `/u/0..5` multi-account flow, Bearer token flow for Android, D1 schema & mappers, Zero-Card `store_images` D1 `BLOB` + `caches.default` CDN architecture, and quick debugging tips.
4. **`PLAN.md` & `sql/README.md` (plus `sql/00_d1_console_bootstrap.sql` & `sql/01_store_schema.sql`)** — Cleanly updated to match the real v2 Cloudflare D1 architecture 100%.

Now start by running your full independent audit of `GothwadTech/store`, `GothwadTech/accounts`, and `GothwadTech/storeapp`, and execute the complete migration, testing, build verification, and documentation upgrade end-to-end!
