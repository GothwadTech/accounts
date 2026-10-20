# 📧 MAIL_INTERNAL.md — Gothwad Mail ↔ Gothwad Accounts Contract (v2.1 — Multi-Account Sessions on 100% Cloudflare D1)

> **Architecture Status (2026-10-20 — Final Locked Architecture):**
> - **`GothwadTech/accounts` (`accounts.gothwadtech.com` / `api.gothwadtech.com`):** **LIVE on 100% Cloudflare Workers + Cloudflare D1 (`accounts` DB — Zero Supabase!)**
> - **`GothwadTech/mail` (`mail.gothwadtech.com`):** Runs on **100% Cloudflare Pages + Cloudflare Worker (`mail`) + Cloudflare D1 (`mail` DB — Zero Supabase!)**
> - **Strict Isolation Rule:** Mail **NEVER** queries Accounts' `accounts` D1 database directly. Mail validates usernames, multi-account sessions, and OAuth tokens exclusively over HTTP against **`AUTH_HUB_URL = "https://api.gothwadtech.com"`**.

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
> - Browser redirects (`Sign in`, `Use another account`, `Manage your Gothwad Account`) use **`AUTH_SIGNIN_URL = "https://accounts.gothwadtech.com"`**.

---

## 🍪 Final SSO & Multi-Account Cookie Naming Table

Every cookie emitted by `GothwadTech/accounts`:
- Strictly matches Mail's upstream cookie allowlist regex **`/^gothwad_[a-z_]+=/`** (lowercase ASCII letters + underscores only; **never** `__Host-` or `__Secure-`, never digits or dots in cookie names).
- Uses slot cookies strictly matching **`/^gothwad_sess_[a-z]$/`** (`gothwad_sess_a` .. `gothwad_sess_f`, up to **6** signed-in accounts per browser).
- Is emitted as an **individual `Set-Cookie` header** (`headers.append('Set-Cookie', ...)` — never comma-joined) so `res.headers.getSetCookie()` in Mail's `worker/src/session.ts` forwards every cookie cleanly.
- Carries flags **`Path=/; HttpOnly; SameSite=Lax; Secure; Domain=.gothwadtech.com`** in production (host-only without `Secure` on plain `http://localhost` / `127.0.0.1` local dev).
- Never stores tokens or account lists in `localStorage` or `sessionStorage`.

| Cookie Name | Format / Value | Max-Age | Purpose |
|---|---|---|---|
| **`gothwad_sess_a`** .. **`gothwad_sess_f`** | `s1~<session_jwt>~<refresh_token>~<session_id>~<1\|0>` | `2592000` (30d) or session | Per-slot server-verifiable session credentials (`^gothwad_sess_[a-z]$`, ~360 B per slot). Validated live against D1 `users` + `user_sessions` + `auth_refresh_tokens`. |
| **`gothwad_active`** | `"a"` .. `"f"` | `2592000` (30d) | Active slot letter read first on `GET /api/auth/me` and all session-protected endpoints. If absent or revoked, Accounts seamlessly falls back to legacy cookies. |
| **`gothwad_accounts`** | `v1.<base64url(json)>.<hmac_sha256>` | `2592000` (30d) | Signed display index (`[{ slot, username, firstName, lastName, addedAt, lastUsedAt }]`) — **zero tokens/secrets**, signed with `JWT_SECRET` using constant-time HMAC verification. Any tampered/corrupted byte is treated as absent (`null`) with zero `500` errors. |
| **`gothwad_at`** | `<session_jwt>` | `3600` (1h) or session | Active account access JWT mirror — preserves 100% backward compatibility with single-account / legacy consumers. |
| **`gothwad_rt`** | `<refresh_token>` | `2592000` (30d) or session | Active account refresh token mirror — rotated atomically in lockstep with `gothwad_sess_<active>`. |
| **`gothwad_sid`** | `<uuid>` | `2592000` (30d) or session | Active account device session UUID (`user_sessions.id`). |

---

## 🔀 Multi-Account Session Endpoints Contract

All multi-account endpoints enable CORS (`Access-Control-Allow-Credentials: true`, `Vary: Origin`) for `https://*.gothwadtech.com` and return JSON only (`503` on D1/upstream failure — **never** a false `401` and **never** `Max-Age=0` cookies during transient DB errors).

### 1. List Signed-In Accounts — `GET /api/auth/accounts`
- Validates every candidate slot against live D1 `users` + `user_sessions` (auto-promoting pre-existing single-account legacy cookies into slot `a` on first use, rotating expired 1h slot JWTs seamlessly, and pruning any remotely revoked slots via `Set-Cookie`).
- **`200 OK`:**
  ```json
  {
    "activeId": "a",
    "accounts": [
      {
        "id": "a",
        "username": "pawan",
        "firstName": "Pawan",
        "lastName": "Gothwad",
        "email": "pawan@gothwadtech.com",
        "lastUsedAt": "2026-10-20T13:12:15.407Z"
      },
      {
        "id": "b",
        "username": "work",
        "firstName": "Pawan",
        "lastName": "Work",
        "email": "work@gothwadtech.com",
        "lastUsedAt": "2026-10-20T13:12:15.437Z"
      }
    ]
  }
  ```
- **`401 Unauthorized`** *(no valid signed-in accounts)*:
  ```json
  { "authenticated": false }
  ```

### 2. Instant Zero-Password Switch — `POST /api/auth/switch`
- **CSRF Required:** Must include a trusted Gothwad `Origin` (e.g. `Origin: https://mail.gothwadtech.com`) or `Referer`; missing/untrusted/null/HTTP origin returns **`403` `{"error": "csrf_rejected", "message": "Cross-site request rejected"}`**.
- **Request Body:** `{ "id": "b" }` (`"a"` .. `"f"`). Idempotent if `"id"` is already active.
- **`200 OK`:** Rotates slot `b`'s session token, sets `gothwad_active=b`, updates `lastUsedAt` in `gothwad_accounts`, updates active mirror cookies, and returns:
  ```json
  {
    "ok": true,
    "activeId": "b",
    "user": {
      "id": "uuid",
      "username": "work",
      "email": "work@gothwadtech.com",
      "first_name": "Pawan",
      "last_name": "Work",
      "recovery_email": "work@personal.example",
      "phone_number": "",
      "avatar_url": null,
      "date_of_birth": null,
      "gender": null,
      "two_factor_enabled": false,
      "storage_used_bytes": 0,
      "storage_limit_bytes": 16106127360,
      "created_at": "2026-10-20T13:12:15.000Z"
    }
  }
  ```
- **`409 Conflict`** *(target slot session was revoked/expired)*: Keeps the current active account untouched, clears `gothwad_sess_b`, prunes `"b"` from `gothwad_accounts`, and returns:
  ```json
  { "error": "account_not_signed_in" }
  ```
  Mail / caller should route the browser to `https://accounts.gothwadtech.com/signin?choose=1&add=1&next=<encoded_return_url>`.

### 3. Per-Slot Sign-Out — `POST /api/auth/accounts/:id/signout`
- **CSRF Required:** Trusted Gothwad `Origin` / `Referer` required (`403` otherwise).
- Revokes ONLY slot `:id`'s D1 `auth_refresh_tokens` + `user_sessions` row and clears `gothwad_sess_<id>`.
- If other valid accounts remain: promotes the most recently used remaining slot (`activeId`) and keeps the browser signed in (`signedOutAll: false`).
- If `:id` was the last account: clears all `gothwad_*` cookies (`signedOutAll: true`, `activeId: null`, `accounts: []`), after which `GET /api/auth/me` returns `401 {"authenticated": false}`.
- **`200 OK`:**
  ```json
  {
    "ok": true,
    "signedOutAll": false,
    "activeId": "a",
    "accounts": [
      {
        "id": "a",
        "username": "pawan",
        "firstName": "Pawan",
        "lastName": "Gothwad",
        "email": "pawan@gothwadtech.com",
        "lastUsedAt": "2026-10-20T13:12:15.567Z"
      }
    ]
  }
  ```

### 4. Browser Chooser & Add-Account Flows (`accounts.gothwadtech.com`)
- **`GET https://accounts.gothwadtech.com/signin?choose=1&next=<url>`**: Lists all server-verified signed-in accounts plus **"Use another account"**; clicking an account runs `POST /api/auth/switch` in 1 request and redirects straight to `next`.
- **`GET https://accounts.gothwadtech.com/signin?choose=1&add=1&next=<url>`**: Signs in an additional account (`POST /api/auth/signin?add=1` / `{ add: true }`), allocating the next free slot (`a`..`f`) without replacing already signed-in slots, then redirects to `next`. Signing in without `add=1` keeps replace behavior.

---

## 🔌 Core Existing Accounts Endpoints Used by `GothwadTech/mail`

### 1. Inbound Recipient Existence Check (`worker/src/inbound.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/internal/usernames/:username`
- **Auth Header:** `Authorization: Bearer <ACCOUNTS_INTERNAL_TOKEN>` *(must match `MAIL_INTERNAL_TOKEN` set on `accounts` Worker; compared in constant time via SHA-256)*
- **Responses (`Cache-Control: no-store`, no CORS headers, no cookies):**
  - `200 {"exists": true}` / `200 {"exists": false}` / `400 {"error": "bad_username"}` / `401 {"error": "unauthorized"}` / `500`

### 2. First-Party Cookie Session Resolution (`worker/src/session.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/auth/me`
- **Forwarded Header:** `Cookie: <incoming gothwad_* cookies>`
- **Cookie Rotation Forwarding:** Mail forwards every upstream `Set-Cookie` matching `/^gothwad_[a-z_]+=/` back to the browser as individual headers.
- **Authenticated Response (`200`):** Byte-compatible single-account user object `{ "authenticated": true, "user": { ... } }`.
- **Signed-Out Response (`401`):** `401 {"authenticated": false}` → Mail redirects unauthenticated browsers to `https://accounts.gothwadtech.com/signin?choose=1`.

### 3. OAuth 2.0 Bearer Token Verification (`worker/src/session.ts`)
- **Method & URL:** `GET https://api.gothwadtech.com/api/oauth/userinfo`
- **Header:** `Authorization: Bearer <oauth_access_token>`
- **Pre-registered Callbacks in Accounts D1 (`ecosystem_apps` where `id = 'gothwad-mail'`):**
  - `https://mail.gothwadtech.com/auth/callback`
  - `https://mail.gothwadtech.com/oauth/callback`
