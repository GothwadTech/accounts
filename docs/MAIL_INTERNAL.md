# 📧 MAIL_INTERNAL.md — Gothwad Mail ↔ Gothwad Accounts Contract (v2.0 — 100% Cloudflare D1 Native)

> **Architecture Status (2026-10-20 — Final Locked Architecture):**
> - **`GothwadTech/accounts` (`accounts.gothwadtech.com` / `api.gothwadtech.com`):** **LIVE on 100% Cloudflare Workers + Cloudflare D1 (`accounts` DB — Zero Supabase!)**
> - **`GothwadTech/mail` (`mail.gothwadtech.com`):** Runs on **100% Cloudflare Pages + Cloudflare Worker (`mail`) + Cloudflare D1 (`mail` DB — Zero Supabase!)**
> - **Strict Isolation Rule:** Mail **NEVER** queries Accounts' `accounts` D1 database directly. Mail validates usernames, sessions, and OAuth tokens exclusively over HTTP against **`AUTH_HUB_URL = "https://api.gothwadtech.com"`**.

---

## ⚠️ Exact Naming Table (DO NOT RENAME ANY OF THESE!)

| Component | Exact Name | Where Configured |
|---|---|---|
| Accounts Cloudflare Worker | **`accounts`** | `GothwadTech/accounts/cloudflare-worker/wrangler.toml` → `name = "accounts"` |
| Accounts Cloudflare D1 DB | **`accounts`** | `binding = "DB"`, `database_id = "392aacf8-1b43-490a-9519-ced4daf5a40f"` |
| Mail Cloudflare Worker | **`mail`** | `GothwadTech/mail/worker/wrangler.toml` → `name = "mail"` *(NEVER `gothwad-mail-api`!)* |
| Mail Cloudflare D1 DB | **`mail`** | `GothwadTech/mail/worker/wrangler.toml` → `[[d1_databases]] binding = "DB", database_name = "mail"` |
| Mail OAuth `client_id` in Accounts | **`gothwad-mail`** | Registered in Accounts' `ecosystem_apps` table |
| Server-to-Server Accounts Base URL | **`https://api.gothwadtech.com`** | `AUTH_HUB_URL` in `GothwadTech/mail/worker/wrangler.toml` |
| Browser-Facing Accounts Sign-in URL | **`https://accounts.gothwadtech.com`** | `AUTH_SIGNIN_URL` in `GothwadTech/mail/worker/wrangler.toml` |
| Shared Internal Lookup Secret | Same value, **2 env names**:<br>• Accounts Worker: **`MAIL_INTERNAL_TOKEN`**<br>• Mail Worker: **`ACCOUNTS_INTERNAL_TOKEN`** | Cloudflare Worker Encrypted Secrets (`Type: Secret`) |

> 🚨 **CRITICAL SAME-ZONE WORKER RULE (Already bit production once — never break this!):**
> - Inside `GothwadTech/mail` Worker (`server-to-server fetch()`), **ALWAYS** call **`AUTH_HUB_URL = "https://api.gothwadtech.com"`** (Accounts Worker's Custom Domain).
> - **NEVER** call `https://accounts.gothwadtech.com/api/...` from another Cloudflare Worker in the same zone — Cloudflare routes same-zone subrequests to Pages (`200 text/html`), causing `503 accounts_unexpected_response`!
> - Browser redirects (`Sign in`, `Manage your Gothwad Account`) use **`AUTH_SIGNIN_URL = "https://accounts.gothwadtech.com"`**.

---

## 🔌 All 3 Accounts Endpoints Used by `GothwadTech/mail`

### 1. Inbound Recipient Existence Check (`worker/src/inbound.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/internal/usernames/:username`
- **Auth Header:** `Authorization: Bearer <ACCOUNTS_INTERNAL_TOKEN>` *(must match `MAIL_INTERNAL_TOKEN` set on `accounts` Worker; compared in constant time via SHA-256)*
- **Path normalization:** `username.trim().toLowerCase()`, regex `^[a-z0-9][a-z0-9._-]{0,63}$`
- **Responses (`Cache-Control: no-store`, no CORS headers, no cookies):**
  - `200 {"exists": true}` — valid registered Gothwad account (`users` / `profiles` in `accounts` D1)
  - `200 {"exists": false}` — no such user (Mail Worker rejects SMTP with `550 5.1.1 Unknown recipient`)
  - `400 {"error": "bad_username"}` — malformed username shape
  - `401 {"error": "unauthorized"}` — missing or mismatched token (`451` temp failure in SMTP so legitimate mail retries)
  - `500 {"error": "server_not_configured"}` / `{"error": "internal_error"}`

### 2. First-Party Cookie Session Resolution (`worker/src/session.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/auth/me`
- **Forwarded Header:** `Cookie: <incoming gothwad_at / gothwad_rt / gothwad_sid cookies>` (scoped to `Domain=.gothwadtech.com`, `HttpOnly; Secure; SameSite=Lax`)
- **Cookie Rotation Forwarding (IMPORTANT):** If `gothwad_at` expired and `accounts` rotated `gothwad_at` + `gothwad_rt` via `Set-Cookie`, `GothwadTech/mail` **MUST forward all upstream `Set-Cookie` headers back to the browser** (`takeUpstreamCookies(request)` in `worker/src/session.ts` already does this — preserve it!).
- **Authenticated Response (`200`):**
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "uuid",
      "username": "pawan",
      "email": "pawan@gothwadtech.com",
      "first_name": "Pawan",
      "last_name": "Gothwad",
      "avatar_url": "https://accounts.gothwadtech.com/api/avatars/uuid?v=etag"
    }
  }
  ```
- **Signed-Out Response:** `200 {"authenticated": false}` or `401` → Mail returns `401 {"error": "unauthenticated", "signinUrl": "https://accounts.gothwadtech.com/signin"}`.

### 3. OAuth 2.0 Bearer Token Verification (`worker/src/session.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/oauth/userinfo`
- **Header:** `Authorization: Bearer <oauth_access_token>`
- **Pre-registered Callbacks in Accounts D1 (`ecosystem_apps` where `id = 'gothwad-mail'`):**
  - `https://mail.gothwadtech.com/auth/callback`
  - `https://mail.gothwadtech.com/oauth/callback`

---

## 📋 Full Migration Prompt & D1 Blueprint for `GothwadTech/mail`

See **[`docs/MAIL_D1_MIGRATION_PROMPT.md`](MAIL_D1_MIGRATION_PROMPT.md)** and **[`docs/CLOUDFLARE_NATIVE_PLAN.md`](CLOUDFLARE_NATIVE_PLAN.md)** in this repository for the complete file-by-file `GothwadTech/mail` Cloudflare D1 migration specification, retention SQL, compression helpers, `SettingsModal.tsx` spec, and Cloudflare Dashboard setup guide.
