# 🚀 Master Prompt for `GothwadTech/drive` — Gothwad Drive v4.0 (Silent `.gothwadtech.com` SSO + Universal Google Account Switcher + AES-256-GCM Encrypted Cloudflare D1 Cross-Device Vault + `<= 500` Line Modular Upgrade)

You are an autonomous Principal Distributed-Systems, Security & Full-Stack Architect working inside **`GothwadTech/drive`**.

---

## ⚠️ 0. CRITICAL STANDING MANDATES — READ EVERY SINGLE RULE FIRST!

1. **RULE #0 — 100% PURE ENGLISH ONLY EVERYWHERE (`ZERO HINDI / HINGLISH`):**
   - Every single UI label, button, modal, empty state, error message, code comment, SQL comment, test, Markdown document (`README.md`, `AGENTS.md`, `TASK.md`, `PLAN.md`, `HANDOVER.md`), AND your chat communication MUST be written in **100% pure, crisp, idiomatic English ONLY**.
   - **NEVER mix Hindi or Hinglish anywhere** (even if the user writes casually in Hinglish in chat), and enforce this permanently via an automated test gate!
2. **ZERO BLIND TRUST — PERFORM YOUR OWN 100% LIVE CODE AUDIT FIRST:**
   - Do **NOT** blindly trust this brief. Before modifying any file, **inspect every live file yourself** in:
     1. **`GothwadTech/drive`** (`package.json`, `vite.config.ts`, `index.html`, `metadata.json`, `public/*`, `src/config/telegram.ts`, `src/lib/*`, `src/hooks/*`, `src/components/**`, `src/App.tsx`, `src/index.css`).
     2. **Live `GothwadTech/accounts` (`main` branch)** (`git clone --depth=1 https://github.com/GothwadTech/accounts.git /tmp/ref-accounts` and clean up `/tmp/ref-accounts` after inspecting): specifically read **`web/widget/account-menu.js`**, **`web/widget/account-menu-styles.js`**, **`cloudflare-worker/src/http.ts`**, **`cloudflare-worker/src/browser-slots.ts`**, and **`docs/MAIL_INTERNAL.md`** so your SSO cookie forwarding, `X-Gothwad-Authuser` multi-account slot handling (`0..5`), and `window.GothwadAccountMenu.open(state, opts)` integration match production **100% verbatim**!
3. **FULL ENGINEERING AUTONOMY — BUILD WHATEVER SOLUTION IS GENUINELY BEST:**
   - Think from first principles, find every edge case across mobile/desktop, multi-tab `/u/0..5` switching, Service Worker media streaming (`sw.js`), public share links, and Telegram reconnects, and build the cleanest, fastest, safest architecture possible.
4. **ZERO CREDIT CARD / ZERO CLOUDFLARE R2 / ZERO SUPABASE:**
   - Strictly **0 paid or card-gated services** (NEVER use Cloudflare R2 or Supabase).
   - File bytes flow **100% serverless browser ↔ Telegram Datacenters (`@mtcute/web` MTProto)** (`$0` storage & bandwidth, unlimited files up to `2 GB` per file!).
   - Account identity, encrypted per-account MTProto session vault (`~350 B`/user), folder cache metadata, and clean short share links run on **Cloudflare Workers (`drive`) + Cloudflare D1 (`database_name = "drive"`, `database_id = "dfefd813-244a-47f1-8f5a-8d5c15ba3162"`)**!
5. **RULE #8 — STRICT `<= 500` LINES PER FILE ACROSS 100% OF FILES:**
   - **Every single file in `GothwadTech/drive`** (`.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.sql`, `.toml`, `.md`) MUST be strictly **`<= 500` lines**, verified automatically by `npm test`, with **ZERO broken features or regressions**!
   - Right now `GothwadTech/drive` has **8 oversized files over 500 lines** (`src/components/drive/PreviewModal.tsx` `2376L`, `src/lib/downloader.ts` `1698L`, `src/components/drive/Dashboard.tsx` `1182L`, `src/App.tsx` `1020L`, `src/index.css` `954L`, `src/hooks/useFiles.ts` `860L`, `src/lib/radar.ts` `552L`, `src/components/drive/FileGrid.tsx` `522L`). Split all of them cleanly into focused, well-typed modules (`<= 500` lines each) preserving 100% of streaming video/audio playback, PDF/Office/EPUB/image previews, chunked uploads, batch ZIP downloads, folder topics, and public sharing!
6. **DOMAIN-AGNOSTIC SINGLE CONFIG POINT (`src/config/brand.ts` + `worker/wrangler.toml`):**
   - Complete the clean rebrand from `Clash Drive` / `tg-cloud-drive` to **`Gothwad Drive`** (`drive.gothwadtech.com`), configured centrally via `APP_DOMAIN` (`default: "gothwadtech.com"`) so rebranding domains is always a 1-line config change.
   - **CRITICAL BACKWARD COMPATIBILITY:** In `src/lib/radar.ts` & `src/config/telegram.ts`, recognize **BOTH** `"#GothwadDrive_v1"` AND legacy `"#TgCloudDrive_v1"` supergroup signatures so existing users' Telegram Drive supergroups and files continue working seamlessly with **zero data loss**!

---

## 🏗️ 1. EXACT CLOUDFLARE WORKER + D1 ARCHITECTURE (`worker/`)

Create a clean, modular TypeScript Cloudflare Worker in `worker/` (`<= 500` lines per file):

### 1.1 `worker/wrangler.toml` (Exact Live Binding & Automatic Custom Route!)
```toml
name = "drive"
main = "src/index.ts"
compatibility_date = "2024-11-01"
keep_vars = true

routes = [
  { pattern = "drive.gothwadtech.com/api/*", zone_name = "gothwadtech.com" }
]

[[d1_databases]]
binding = "DB"
database_name = "drive"
database_id = "dfefd813-244a-47f1-8f5a-8d5c15ba3162"

[vars]
APP_DOMAIN = "gothwadtech.com"
ACCOUNTS_API_URL = "https://api.gothwadtech.com"
ACCOUNTS_WEB_URL = "https://accounts.gothwadtech.com"
```
> **CRITICAL LESSON FROM PRODUCTION:** Defining active `routes = [{ pattern = "drive.gothwadtech.com/api/*", zone_name = "gothwadtech.com" }]` directly inside `worker/wrangler.toml` ensures `wrangler deploy` automatically attaches `/api/*` to the Worker instead of falling back to Cloudflare Pages `index.html` (`200 text/html`)!

### 1.2 Remote-Safe Cloudflare D1 Schema (`sql/00_d1_console_bootstrap.sql` & `sql/01_drive_schema.sql`)
- **NEVER include `PRAGMA` statements** in `sql/00_d1_console_bootstrap.sql` or Worker runtime `ensureSchema(env.DB)` (remote Cloudflare D1 enforces `foreign_keys = ON` natively and throws `SQLITE_AUTH` on `PRAGMA`). Auto-run idempotent `ensureSchema(env.DB)` once per Worker isolate cold start so `drive` D1 (`dfefd813-244a-47f1-8f5a-8d5c15ba3162`) self-initializes automatically on first request!
- Tables to include:
  1. `drive_vaults`:
     - `user_id TEXT PRIMARY KEY` (Gothwad Account UUID from `api.<domain>/api/auth/me`)
     - `username TEXT NOT NULL` (pure lowercase username — zero hardcoded email columns!)
     - `encrypted_session TEXT` (`AES-256-GCM` ciphertext of `@mtcute/web` `exportSession()`, NEVER stored in plaintext!)
     - `session_iv TEXT` (96-bit base64 IV)
     - `key_version INTEGER NOT NULL DEFAULT 1`
     - `tg_user_id TEXT`, `tg_username TEXT`, `tg_display_name TEXT`
     - `drive_chat_id TEXT`, `drive_access_hash TEXT`, `drive_title TEXT`
     - `folders_json TEXT NOT NULL DEFAULT '[]'` (instant cached folder tree before MTProto finishes connecting!)
     - `storage_used_bytes INTEGER NOT NULL DEFAULT 0`, `file_count INTEGER NOT NULL DEFAULT 0`
     - `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`
  2. `drive_shares`:
     - `id TEXT PRIMARY KEY` (`10`-char URL-safe nano-id for clean `https://drive.<domain>/s/:id` public share links!)
     - `owner_user_id TEXT NOT NULL`, `owner_username TEXT NOT NULL`
     - `file_name TEXT NOT NULL`, `mime_type TEXT NOT NULL DEFAULT 'application/octet-stream'`, `size_bytes INTEGER NOT NULL DEFAULT 0`
     - `share_payload TEXT NOT NULL` (encoded share descriptor compatible with `ReceiveShareModal` / bot streaming)
     - `downloads INTEGER NOT NULL DEFAULT 0`, `expires_at TEXT`, `created_at TEXT NOT NULL`
  3. `system_keys` *(zero-config encryption resilience)*:
     - Prefer `env.DRIVE_ENCRYPTION_KEY` Worker Secret (`HKDF-SHA256` with `salt = user_id` + `AES-256-GCM`). If the founder hasn't set `DRIVE_ENCRYPTION_KEY` in Cloudflare Secrets yet, generate and store a CSPRNG 256-bit wrapping seed once in `system_keys` so cross-device encryption works **out of the box on deploy #1 with zero 500 crashes**, while still supporting seamless key rotation via `key_version`!

### 1.3 Worker Endpoints (`worker/src/`)
- **Session Verification Helper (`worker/src/auth.ts`):**
  - Verifies `.gothwadtech.com` `HttpOnly` slot cookies against `GET ${env.ACCOUNTS_API_URL}/api/auth/me` (forwarding incoming `Cookie` and `X-Gothwad-Authuser` headers; **NEVER calling same-zone `accounts.gothwadtech.com/api/...` from a Worker**), and **forwards every upstream `Set-Cookie` (`/^gothwad_[a-z_]+=/`) back to the browser as individual headers** so refresh token rotation never drops sessions!
- **API Routes:**
  - `GET /api/health` -> `{ ok: true, service: "gothwad-drive", engine: "cloudflare-d1-mtproto" }`
  - `GET /api/me` -> Returns `{ authenticated, activeId, authuser, user, accounts, telegramApi: { apiId, apiHash } }` (supporting optional Worker `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` vars/secrets alongside build-time `VITE_TELEGRAM_API_ID` / `VITE_TELEGRAM_API_HASH` so Telegram credentials work reliably from either place!).
  - `POST /api/auth/switch` & `POST /api/auth/accounts/:id/signout` & `POST /api/auth/signout` -> Proxies cleanly to `${env.ACCOUNTS_API_URL}` forwarding all `Set-Cookie` headers cleanly.
  - `GET /api/drive/vault` -> Returns decrypted MTProto `session` + cached `driveConfig` + `folders` + `stats` for ONLY the authenticated Gothwad `user.id`!
  - `PUT /api/drive/vault` (CSRF origin checked) -> Encrypts & upserts `{ session, tgProfile, driveConfig, folders, storageUsedBytes, fileCount }` for `user.id`.
  - `DELETE /api/drive/vault` (CSRF origin checked) -> Unlinks the connected Telegram session from this Gothwad Account cleanly without deleting the Gothwad Account itself.
  - `POST /api/drive/shares` & `GET /api/drive/shares/:id` -> Creates & resolves clean `https://drive.<domain>/s/:id` public share links (with legacy `?share=...` hash links remaining 100% supported!).

---

## 🎨 2. GOOGLE-DRIVE-GRADE UX, AUTOMATIC SILENT SSO & UNIVERSAL ACCOUNT SWITCHER

1. **Zero `"Sign in with..."` Consent Screens — Automatic Silent `.gothwadtech.com` SSO:**
   - On page load (`/`, `/u/0/`, `/u/1/`, `?authuser=0..5`, `/s/:shareId`), query `/api/me` with automatic direct browser CORS fallback to `https://api.<domain>/api/auth/me` (`credentials: 'include'`, `X-Gothwad-Authuser`).
   - **Public Share Links (`/s/:shareId` or `?share=...`):** Render cleanly immediately even if the visitor is signed out!
   - **Signed-Out Visitor on `/`:** Render a crisp, fast **Gothwad Drive** landing/sign-in state with a clean Google-style **`Sign in`** button pointing directly to `https://accounts.<domain>/signin?next=${encodeURIComponent(window.location.href)}` (and header **`Sign in`** pill).
2. **One-Time Cloud Vault Activation + Instant Cross-Device Auto-Connect:**
   - Once signed into a Gothwad Account (`e.g. pawan@gothwadtech.com`):
     - **If `GET /api/drive/vault` already has a saved session:** Automatically hydrate `@mtcute/web` `MemoryStorage` in memory (`ZERO` raw `tgcd_session` left in `localStorage`!), paint cached `folders` immediately in `< 30ms` while MTProto connects in the background, and sync live files automatically — **ZERO phone/OTP prompts across any laptop, phone, or browser ever again!**
     - **If `GET /api/drive/vault` is empty, check legacy `localStorage.getItem("tgcd_session")` once:** If a valid local session already exists in this browser, offer a **1-click `"Link Existing Drive Session to @username"`** (or auto-migrate on first connect), upload encrypted to D1, and scrub raw session secrets from `localStorage`!
     - **Brand-New Gothwad User:** Show a clean, welcoming step inside the authenticated shell: **"Hi Pawan — Connect your unlimited cloud storage engine once"** (`Phone -> Code -> Optional 2FA`), saving straight to `PUT /api/drive/vault` on completion!
3. **Central Universal Google-Style Account Switcher (`https://accounts.<domain>/widget/account-menu.js`):**
   - Preload `${accountsWebOrigin}/widget/account-menu.js` (`window.GothwadAccountMenu`) on boot so clicking the top-right profile photo opens in **`0ms`**.
   - Pass `user`, `accounts` (all real `avatarUrl` photos across slots `0..5`), `activeId`, `authuser`, `theme`, `anchorEl`, `nextUrl`, `manageAccountHref`, `accountHref: (a) => "/u/" + a.authuser + "/"`, `onSwitchAccount`, `onSignOutAccount`, and `onSignOutAll` (plus an optional `extraActions` item `"Storage engine settings"` opening Drive's `SettingsModal`).
   - **Zero Cross-Account Leak Guarantee on Switch (`Slot 0` ↔ `Slot 1`):** Switching accounts MUST immediately call `destroyClient()`, abort/clear any in-memory thumbnails/files/uploads from the previous user, update URL to `/u/<n>/`, and load the target account's D1 vault!

---

## 🧪 3. MANDATORY VERIFICATION & DOCUMENTATION GATE

1. Build a real Node 22 `node:sqlite` local D1 test suite (`npm test` via `package.json`) testing:
   - Idempotent SQL bootstrap (`0` `PRAGMA` statements), `AES-256-GCM` encryption/decryption round-trips (verifying raw MTProto session strings NEVER appear in D1 rows!), strict user isolation (`User A` can never read `User B`'s vault), cookie `Set-Cookie` rotation forwarding, `/s/:id` public share creation/lookup, `worker/wrangler.toml` `routes` + D1 `dfefd813-244a-47f1-8f5a-8d5c15ba3162` verification, **100% of files `<= 500` lines (`Rule #8`)**, and **100% Pure English across all files (`Rule #0`)**!
2. Ensure `npm run build` (`tsc -b && vite build`), `npm run lint`, `npx wrangler deploy --dry-run`, AND `npm test` pass **100% with zero errors** (using standard `npm` + `bun` compatibility and adding `public/_redirects` for `/s/*`, `/u/*`, SPA fallback).
3. Update **`README.md`**, **`AGENTS.md`**, **`TASK.md`**, and **`HANDOVER.md`** cleanly in 100% pure English documenting the architecture and any optional Cloudflare Secrets (`DRIVE_ENCRYPTION_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`).
