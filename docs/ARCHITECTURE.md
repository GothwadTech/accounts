# 🏗️ ARCHITECTURE.md — Technical Deep Dive (100% Cloudflare Native v2.0)

> **Updated: 2026-10-20 — Zero Supabase Architecture**
> Gothwad Accounts now runs **100% on Cloudflare (`Pages` + `Workers` + `D1 SQLite` + `Global Edge Cache` + optional `R2`)**.
> Master ecosystem roadmap: [`CLOUDFLARE_NATIVE_PLAN.md`](CLOUDFLARE_NATIVE_PLAN.md) · Setup: [`SETUP.md`](SETUP.md) · OAuth: [`OAUTH.md`](OAUTH.md)

---

## 1. System Topology

```text
┌────────────────────────────────────┐
│  BROWSER (Static Vanilla JS UI)    │
│  accounts.gothwadtech.com          │   Cloudflare Pages (Unlimited Free)
│  Routes: /signin · /signup · /me   │
└─────────────────┬──────────────────┘
                  │  fetch('/api/*') — Hybrid Cookies + Bearer Header
┌─────────────────▼──────────────────┐
│  CLOUDFLARE WORKER (`accounts`)    │
│  cloudflare-worker/src/index.ts    │   ~21 KiB gzipped · 0 NPM runtime deps
│  • WebCrypto PBKDF2-SHA256 Auth    │   Routes: accounts.*/api/* + api.*
│  • HS256 Session & OAuth 2.0 JWTs  │
│  • Auto-Bootstrap D1 Schema Engine │
└────────┬──────────────────┬────────┘
         │ `env.DB` (1-5ms) │ Optional `env.AVATARS_BUCKET` / Edge Cache
┌────────▼────────┐  ┌──────▼────────────────────────┐
│  CLOUDFLARE D1  │  │  AVATAR DELIVERY ENGINE       │
│  SQLite Vault   │  │  D1 `user_avatars` BLOB       │
│  10 Core Tables │  │  + Cloudflare Edge CDN Cache  │
│  Pure Username! │  │  (or R2 drop-in zero change!) │
└─────────────────┘  └───────────────────────────────┘
```

---

## 2. Cryptographic & Security Architecture

| Layer | Algorithm / Design | Security Guarantee |
| :--- | :--- | :--- |
| **Password Storage** | `PBKDF2-HMAC-SHA256` (`100,000` iterations, 16-byte random salt per user) | Stored as `pbkdf2_sha256$100000$<salt>$<hash>`; verified via constant-time `timingSafeBytesEqual`. Compatible with Cloudflare Workers V8 WebCrypto limits. |
| **Account Access JWT (`gothwad_at`)** | `HS256` with `token_use: "session"`, `sub`, `sid`, `username`, `exp` (1h) | Verified against both HMAC signature AND live `users` + `user_sessions` rows in D1 — revoking a device kills access **immediately**! |
| **Account Refresh Token (`gothwad_rt`)** | 256-bit CSPRNG hex token; only `SHA-256` stored in `auth_refresh_tokens` | Single-winner atomic rotation (`UPDATE ... WHERE token_hash = ? AND revoked = 0 AND expires_at > ? RETURNING *`). Cascades on device delete. |
| **Password Recovery Link** | 256-bit CSPRNG token in URL hash `#access_token=...`; `SHA-256` in `password_reset_tokens` | 15-minute TTL, atomic single-use (`RETURNING user_id`), fragment never sent in HTTP `Referer`, invalidates all old sessions on reset. |
| **OAuth 2.0 Access JWT** | `HS256` with `token_use: "oauth_access"`, `aud`, `client_id`, `scope`, `exp` (1h) | Strictly isolated: accepted ONLY by `/oauth/userinfo`; rejected by all `/api/auth/*` account endpoints! |
| **OAuth Code & Refresh Rotation** | Mandatory S256 PKCE for public clients; `SHA-256` refresh hashes in `oauth_refresh_tokens` | Atomic `UPDATE ... RETURNING` guarantees concurrent exchange attempts have strictly one winner (`200` vs `400`). |
| **Internal Mail Lookup** | `GET /api/internal/usernames/:username` with `Bearer MAIL_INTERNAL_TOKEN` | Constant-time SHA-256 digest compare, strict input regex before DB query, `Cache-Control: no-store`, zero CORS/cookies. |

---

## 3. Cloudflare D1 Schema (10 Tables — `sql/01` to `sql/05`)

1. **`users`** — `(id, username UNIQUE COLLATE NOCASE, password_hash, created_at, updated_at)` — **Zero email column (100% Pure Rule #2)!**
2. **`profiles`** — Personal info (`first_name`, `last_name`, `recovery_email`, `phone_number`, `avatar_url`, `date_of_birth`, `gender`, storage quota)
3. **`user_sessions`** — Device sessions shown under `/me → Security → Your devices`
4. **`auth_refresh_tokens`** — Hashed session refresh tokens tied to `user_sessions(id) ON DELETE CASCADE`
5. **`password_reset_tokens`** — Hashed 15-minute one-time password recovery tokens
6. **`ecosystem_apps`** — Registered OAuth 2.0 clients (`id`, `client_id`, JSON `redirect_uris`, `secret_hash`)
7. **`app_authorizations`** — Per-user OAuth consent grants & JSON `scopes`
8. **`oauth_auth_codes`** — 5-minute single-use PKCE authorization codes
9. **`oauth_refresh_tokens`** — Hashed 30-day rotating OAuth refresh tokens
10. **`account_activity` & `user_avatars`** — Security event log (auto-trimmed to latest 100/user) & binary profile photos

---

## 4. Local Development & Automated Testing

- **`npm start`** → Runs `server.js` with `tools/local-d1.mjs` (Node 22 built-in `node:sqlite`) against `.local-d1.sqlite` on `http://0.0.0.0:3000`.
- **`npm test`** → Runs **62 automated security, SQL idempotency, OAuth PKCE, migration, and full account lifecycle tests** against real in-memory SQLite D1 instances in `< 2s`.
- **`cd cloudflare-worker && npx tsc --noEmit && npx wrangler deploy --dry-run`** → Validates strict TypeScript types and compiles the production Worker bundle.
