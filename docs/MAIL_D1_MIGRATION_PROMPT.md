# 🚀 Copy-Paste Master Prompt for `GothwadTech/mail` AI Agent (100% Cloudflare D1 Migration)

> **Pawan ke liye instructions:**
> 1. Arena.ai par **nayi chat** kholo aur repository **`GothwadTech/mail`** select karo.
> 2. Apne Cloudflare Dashboard (`Storage & Databases` ➔ `D1 SQL Database` ➔ **`mail`**) se **`mail` database ka `Database ID` (UUID)** copy kar lo.
> 3. Neeche **`PROMPT START`** se lekar **`PROMPT END`** tak poora prompt copy karke `GothwadTech/mail` chat mein paste kar do *(aur agar `mail` D1 `Database ID` haath mein hai toh prompt ke aakhir mein wo UUID bhi चिपका dena — warna AI agent khud maang lega aur `worker/wrangler.toml` mein daal dega!)*
> 4. ⚠️ **Koi bhi secret key (`RESEND_API_KEY`, `ACCOUNTS_INTERNAL_TOKEN`) chat mein kabhi paste mat karna!**

---

## PROMPT START

You are an autonomous senior full-stack + Cloudflare Workers engineer on Arena.ai working inside **`GothwadTech/mail`** (`mail.gothwadtech.com`).

### 0. MANDATORY FIRST STEP — READ PUBLIC `GothwadTech/accounts` REPO DOCS FIRST!
Before writing any code, inspect BOTH:
1. All files in this repository (`GothwadTech/mail`: `AGENTS.md`, `PLAN.md`, `TASK.md`, `docs/SETUP.md`, `docs/MAIL.md`, `package.json`, `worker/wrangler.toml`, `worker/src/*`, `worker/test/worker.test.ts`, `supabase/mail.sql`, `src/*`, `tests/*`).
2. The live public sibling repository **`https://github.com/GothwadTech/accounts`** (`main` branch — already migrated to **v2.0 100% Cloudflare D1 Native with ZERO Supabase**!), specifically:
   - `GothwadTech/accounts/docs/MAIL_INTERNAL.md`
   - `GothwadTech/accounts/docs/CLOUDFLARE_NATIVE_PLAN.md`
   - `GothwadTech/accounts/docs/SETUP.md`
   - `GothwadTech/accounts/cloudflare-worker/wrangler.toml`
   - `GothwadTech/accounts/tools/local-d1.mjs` (clean pattern using Node 22 built-in `node:sqlite` `DatabaseSync` to test real SQLite D1 locally with zero NPM packages!)

Communicate with founder **Pawan** in **clear, friendly Hinglish (simple Hindi + English)**, explaining every architectural decision and *why* from basics. Update `TASK.md`, `PLAN.md`, `AGENTS.md`, `docs/MAIL.md`, and `docs/SETUP.md` thoroughly before finishing.

---

### 1. MISSION OVERVIEW (DO EVERYTHING END-TO-END, VERIFY 100%, DO NOT STOP AT A PLAN!)

Gothwad Tech follows a locked **Hybrid Cloud Free-Tier Architecture ($0 cost)**:
- **`PlusTube`, `Indogram`, `GrixChat`** stay on Supabase permanently (saving both free Supabase projects for heavy social/realtime apps).
- **`Gothwad Accounts` (`GothwadTech/accounts`)** is ALREADY **100% LIVE on Cloudflare Workers + Cloudflare D1 (`accounts` DB)** with zero Supabase.
- **YOUR JOB NOW:** Completely remove **ALL Supabase dependencies** from **`GothwadTech/mail`** (`@supabase/supabase-js`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, PostgREST HTTP calls, `supabase/mail.sql` Postgres-only RLS) and upgrade `GothwadTech/mail` to **100% Native Cloudflare Workers + Cloudflare D1 (`mail` DB)** WITH **Smart Per-User Retention & Compression (`Default: Latest 500 emails`, user-configurable in Settings up to `Store All` within fair-use quota)**!

---

### 2. HARD ARCHITECTURAL & NAMING RULES (NEVER VIOLATE!)

1. **Exact Cloudflare Names (DO NOT RENAME!):**
   - Worker name in `worker/wrangler.toml`: **`name = "mail"`** *(NEVER `gothwad-mail-api`! Production route `mail.gothwadtech.com/api/*`, Email Routing `*@gothwadtech.com`, and Worker secrets `ACCOUNTS_INTERNAL_TOKEN` + `RESEND_API_KEY` live on Worker `mail`!)*
   - Cloudflare D1 Database name created on Cloudflare Dashboard: **`database_name = "mail"`** with binding **`binding = "DB"`** in `worker/wrangler.toml`:
     ```toml
     keep_vars = true

     [[d1_databases]]
     binding = "DB"
     database_name = "mail"
     database_id = "<ASK_USER_OR_USE_PROVIDED_UUID>"
     ```
   - Accounts OAuth `client_id`: **`gothwad-mail`**
2. **Domain-Agnostic (`Rule #1`) & Pure Username DB (`Rule #2`):**
   - Never hardcode `gothwadtech.com` inside application logic — always read from `config.appDomain` (`APP_DOMAIN` in `worker/wrangler.toml`).
   - Store **only lowercase `username`** (`to_username` / `username`) in D1 — derive `username@${config.appDomain}` at runtime.
3. **Same-Zone Accounts URL Split (CRITICAL — DO NOT BREAK!):**
   - `AUTH_HUB_URL = "https://api.gothwadtech.com"` → used for **ALL server-to-server Worker calls** (`/api/auth/me`, `/api/oauth/userinfo`, `/api/internal/usernames/:username`). NEVER use `accounts.gothwadtech.com` for Worker-to-Worker `fetch()`!
   - `AUTH_SIGNIN_URL = "https://accounts.gothwadtech.com"` → used ONLY for browser-facing sign-in & `/me` links.
   - Preserve upstream cookie rotation forwarding (`takeUpstreamCookies(request)` in `worker/src/session.ts` & `worker/src/index.ts`)!
4. **Zero Secrets in Code or Git:**
   - Remove `SUPABASE_URL` from `worker/wrangler.toml` and `SUPABASE_SERVICE_ROLE_KEY` from `worker/src/config.ts`, `.dev.vars.example`, `.env.example`, and `package.json` scripts (`worker:secrets`).
   - Only 2 Worker Secrets remain on `mail`:
     1. **`ACCOUNTS_INTERNAL_TOKEN`** *(must equal `MAIL_INTERNAL_TOKEN` on Worker `accounts`)*
     2. **`RESEND_API_KEY`** *(Resend outbound API key)*
   - Also clean up unused dependencies in `package.json` (`@supabase/supabase-js` and any unused SDKs not referenced anywhere in `src/` or `worker/`).

---

### 3. EXACT DATABASE, COMPRESSION & RETENTION ARCHITECTURE (`sql/01_mail_schema.sql` + Auto-Bootstrap in `worker/src/db.ts`)

1. **Auto-Bootstrap Schema on Cold Start (`WeakMap<object, Promise<void>>`):**
   - Just like `GothwadTech/accounts/cloudflare-worker/src/index.ts`, make `worker/src/db.ts` run idempotent `CREATE TABLE IF NOT EXISTS ...` + `CREATE INDEX IF NOT EXISTS ...` via `env.DB.batch(...)` once per D1 instance on cold start so **even a brand-new empty `"mail"` D1 database works automatically with zero manual SQL errors**!
   - **IMPORTANT CLOUDFLARE D1 RULE:** Do **NOT** put `PRAGMA` statements in D1 runtime/remote SQL (remote D1 already enforces `foreign_keys = ON` and rejects `PRAGMA` with `SQLITE_AUTH`). Also provide a clean, comment-free `sql/00_d1_console_bootstrap.sql` + documented `sql/01_mail_schema.sql` (and remove obsolete `supabase/mail.sql`).

2. **Tables in `mail` D1 Database:**
   - **`mail_settings`** (per-user mailbox preferences):
     - `username TEXT PRIMARY KEY` (lowercase `1..64` chars)
     - `retention_limit INTEGER NOT NULL DEFAULT 500` — allowed values:
       - **`500`** *(Default — keeps latest 500 unstarred inbox/sent emails)*
       - **`1500`** *(Extended — keeps latest 1,500 unstarred emails)*
       - **`0`** *(`Store All Emails` — keeps ALL emails up to the user's generous `quota_bytes` fair-use cap!)*
     - `quota_bytes INTEGER NOT NULL DEFAULT 52428800` *(`50 MB` per-user compressed mailbox quota ≈ **~25,000 compressed emails**, protecting the shared free `500 MB` D1 DB so 1 spam-flooded account can never exhaust storage for everyone else!)*
     - `updated_at TEXT NOT NULL`
   - **`mail_messages`**:
     - `id TEXT PRIMARY KEY` (`crypto.randomUUID()`)
     - `to_username TEXT NOT NULL` (lowercase mailbox owner)
     - `from_email TEXT NOT NULL`
     - `from_name TEXT`
     - `to_email TEXT`
     - `cc_emails TEXT NOT NULL DEFAULT '[]'` (JSON array string in SQLite, parsed back to `string[]` in `db.ts`/`mail.ts`)
     - `bcc_emails TEXT NOT NULL DEFAULT '[]'` (JSON array string)
     - `subject TEXT`
     - `snippet TEXT`
     - `body_text TEXT`
     - `body_html TEXT`
     - `body_gzip BLOB` *(Compressed payload via built-in Web Streams `CompressionStream('gzip')` / `DecompressionStream('gzip')`! Compress message bodies before D1 storage so a `12 KB` HTML newsletter takes only **`~2 KB`** in D1 → **~250,000 emails fit inside one free `500 MB` D1 database**, while keeping backward compatibility if plain `body_text`/`body_html` columns are populated!)*
     - `size_bytes INTEGER NOT NULL DEFAULT 0` *(actual stored byte footprint of the message row so per-user storage usage is instant via `SELECT COALESCE(SUM(size_bytes), 0), COUNT(*) FROM mail_messages WHERE to_username = ?`!)*
     - `attachments TEXT NOT NULL DEFAULT '[]'` (JSON array of `{name, type, size}` metadata only — never store raw attachment bytes)
     - `folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'drafts', 'trash'))`
     - `is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1))`
     - `is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1))`
     - `provider_id TEXT`
     - `received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
   - Indexes:
     - `idx_mail_user_folder ON mail_messages (to_username, folder, received_at DESC)`
     - `idx_mail_user_starred ON mail_messages (to_username, is_starred, received_at DESC) WHERE is_starred = 1`
   - **D1 Row Size Guard:** Always cap raw `bodyText` (`<= 100_000` chars) and `bodyHtml` (`<= 250_000` chars) before compression so no single email ever approaches Cloudflare D1's `2 MB` row ceiling.

3. **Smart Automatic Retention Enforcement (Runs Cleanly on Inbound/Send & When Saving Settings!):**
   - **Rule A — 30-Day Trash Auto-Purge:** Automatically delete items in `folder = 'trash'` older than 30 days (`received_at < iso30DaysAgo`).
   - **Rule B — `⭐ Starred` Protection (CRITICAL UX RULE!):** Automatic retention cleanup **NEVER deletes starred messages (`is_starred = 1`)** or `drafts`! Important starred emails stay safe forever!
   - **Rule C — Count Cap (`retention_limit > 0`, Default `500`):** Keep the newest `retention_limit` unstarred non-draft messages for `to_username` and delete older overflow rows automatically in a single fast indexed SQL query!
   - **Rule D — Fair-Use Quota Cap (`retention_limit = 0` "Store All"):** Keep **all** messages as long as total `SUM(size_bytes) <= quota_bytes` (`50 MB` compressed ≈ ~25,000 emails); if exceeded, trim oldest unstarred `trash` first, then oldest unstarred messages until back under `quota_bytes`.

---

### 4. BACKEND API & FRONTEND SETTINGS UI UPGRADES

1. **New Endpoints in `worker/src/index.ts`:**
   - `GET /api/mail/settings` → returns `{ retentionLimit, storageUsedBytes, storageQuotaBytes, totalMessages, starredMessages }` (plus include storage summary in `GET /api/session` if helpful).
   - `PATCH /api/mail/settings` (CSRF-protected via `assertSafeWrite`) → updates `{ retentionLimit: 500 | 1500 | 0 }`, immediately runs retention cleanup if user lowered the limit, and returns updated usage stats!
   - Update `GET /api/health` to verify live D1 readiness (`SELECT COUNT(*) FROM sqlite_master ...`) and report `"engine": "cloudflare-d1-native"` with zero Supabase fields.
2. **Frontend `src/components/SettingsModal.tsx` + `src/services/mailApi.ts` + `src/context/MailContext.tsx`:**
   - Add a sleek **Mailbox Storage & Email Retention** card right inside `SettingsModal.tsx` matching the exact existing `#0494f4` light/dark aesthetic:
     - Live storage progress bar: e.g. **`Used: 0.4 MB of 50 MB (42 emails · 3 starred)`**
     - Clean selector with clear descriptions:
       1. **`Latest 500 emails (Default)`** — *"Automatically clears oldest unstarred emails beyond 500"*
       2. **`Latest 1,500 emails`** — *"Keep up to 1,500 recent emails"*
       3. **`Store All Emails`** — *"Keep all emails (up to 50 MB / ~25,000 emails)"*
     - Helpful reassurance badge: *"⭐ Starred emails & Drafts are never auto-deleted. Trash empties after 30 days."*

---

### 5. TESTING, LOCAL DEV & VERIFICATION REQUIREMENTS

1. Add a real local SQLite D1 adapter using Node 22 built-in `node:sqlite` (`DatabaseSync`) — zero fake mocks — and write comprehensive automated tests covering:
   - Schema auto-bootstrap & SQL idempotency
   - Gzip body compression + decompression round-trip (including Unicode Hindi/emojis & large HTML newsletters)
   - Inbound `handleInbound()` email parsing + `ACCOUNTS_INTERNAL_TOKEN` lookup + automatic `500`-email trimming + **`⭐ Starred` immunity** + **30-day `Trash` purge** + **`Store All` (`retention_limit = 0`) mode**
   - Full CRUD endpoints (`list`, `get`, `patch`, `drafts`, `send`, `delete`, `GET/PATCH /api/mail/settings`) + CSRF & CORS checks + cookie forwarding
   - Frontend build (`npm run build`), strict TypeScript (`npm run lint`), full test suite (`npm test`), and Worker dry-run (`npx wrangler deploy --config worker/wrangler.toml --dry-run`) — **ALL MUST PASS WITH 0 ERRORS!**
2. Ask Pawan for his **`mail` D1 `Database ID`** (if not pasted below) or insert it directly into `worker/wrangler.toml`, and explain the final Cloudflare Dashboard check step-by-step in super-simple Hinglish!

My `mail` D1 Database ID (paste below if ready):
`PASTE_MAIL_DATABASE_ID_HERE_OR_ASK_ME`

## PROMPT END
