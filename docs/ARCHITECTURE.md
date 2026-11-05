# 🏗️ ARCHITECTURE.md — Technical Deep Dive (v2.3 — Google-Grade `u/0..5` Multi-Account Cloudflare Native)

> **Updated: 2026-11-05 — module map and documentation consolidation**
> Gothwad Accounts runs **100% on Cloudflare (`Pages` + `Workers` + `D1 SQLite` + `Global Edge Cache` + optional `R2`)**.
> Master roadmap: [`PLAN.md`](../PLAN.md) · Setup: [`SETUP.md`](SETUP.md) · OAuth: [`OAUTH.md`](OAUTH.md) · Mail Contract: [`MAIL_INTERNAL.md`](MAIL_INTERNAL.md)

---

## 1. System Topology

```text
┌────────────────────────────────────────────────────────┐
│  BROWSER (Modular Static Vanilla HTML + CSS + ESM JS)  │
│  accounts.gothwadtech.com  (Cloudflare Pages + ETag)   │
│  Routes: /u/0/me .. /u/5/me · /signin · /signup        │
│  web/_redirects (`200` rewrite) + web/_headers (`304`) │
└───────────────────────────┬────────────────────────────┘
                            │ fetch('/api/*') — HttpOnly `.gothwadtech.com` Slots (`a`..`f`) + `X-Gothwad-Authuser`
┌───────────────────────────▼────────────────────────────┐
│  CLOUDFLARE WORKER (`accounts` — Modular TypeScript)  │
│  cloudflare-worker/src/worker.ts → index.ts router  │
│  • types · db · http · crypto · cookies · users        │
│  • sessions · browser-slots · oauth-helpers            │
│  • routes/{public-internal,auth-entry,auth-session,    │
│            auth-switch,auth-accounts,auth-profile,     │
│            oauth}.ts                                   │
└─────────────┬──────────────────────────┬───────────────┘
              │ `env.DB` (1–5ms SQLite)  │ Optional `env.AVATARS_BUCKET` / Edge Cache
┌─────────────▼─────────────┐  ┌─────────▼─────────────────────────────┐
│  CLOUDFLARE D1 (`accounts`)│  │  AVATAR DELIVERY ENGINE               │
│  Pure Username Identities│  │  D1 `user_avatars` BLOB + ETag 304    │
│  0 Auto-Pause · $0 MAU    │  │  + Cloudflare Edge Cache / Drop-in R2 │
└───────────────────────────┘  └───────────────────────────────────────┘
```

---

## 2. Modular Codebase Standard (`Rule #8` — Enforced by CI / `npm test`)

Every source, stylesheet, SQL migration, test, and active documentation file across the repository follows a strict permanent modular ceiling enforced automatically by [`tests/frontend-and-filesize.test.mjs`](../tests/frontend-and-filesize.test.mjs):

- **Target limit:** **`<= 500` lines per file** (every file in the repo satisfies `<= 500` lines).
- **Hard ceiling:** **`500–800` lines absolute maximum** — whenever any new or existing file grows past `500` lines, split it cleanly by responsibility **without altering any API contract, status code, SQL query, cookie behavior, or visual styling**.
- **Static ESM Link Verification:** Every `<script type="module">` and static/dynamic `import` across `web/**` has its target file and exported symbols verified automatically in `npm test`, and `web/_headers` sets `Cache-Control: public, max-age=0, must-revalidate` so Cloudflare Pages never mixes stale cached ES modules with newly deployed ones across releases.

### Worker Module Map (`cloudflare-worker/src/`)
| File | Responsibility |
| :--- | :--- |
| `worker.ts` / `index.ts` | Fetch-only deployment entrypoint / router, CORS wrapper, error boundary and compatibility re-exports |
| `types.ts` | `Env`, D1/R2 interfaces, `AccountSlot` (`a`..`f`), cookie & session data models |
| `db.ts` | WeakMap-memoized cold-start D1 schema bootstrap & `DatabaseUnavailableError` (`503`) wrappers |
| `http.ts` | JSON/form body readers, username/email/phone validators, dynamic subdomain CORS |
| `crypto.ts` | `PBKDF2-HMAC-SHA256` (`100k` iter), `SHA-256` digests, `HS256` JWT sign/verify |
| `cookies.ts` | `.APP_DOMAIN` cookies, `gothwad_sess_a`..`f` codecs, HMAC `gothwad_accounts`, CSRF origin check |
| `users.ts` | Identifier lookup (username/email/phone), profile formatting, `account_activity`, Resend mail |
| `sessions.ts` | Atomic `auth_refresh_tokens` rotation, 10s parallel tab grace window, active session resolution |
| `browser-slots.ts` | Multi-account browser inspection, dead-slot pruning, seamless legacy cookie promotion |
| `oauth-helpers.ts` | Scope registry, `ecosystem_apps` lookup, S256 PKCE validation, consent HTML renderer |
| `routes/public-internal.ts` | `/api/internal/usernames/:username` (Mail Worker `mail`), `/api/avatars/:id`, `/api/health` |
| `routes/auth-entry.ts` | `/api/auth/check-username`, `/api/auth/check-identifier`, `/api/auth/signup` |
| `routes/auth-session.ts` | `/api/auth/signin`, `/api/auth/signout`, `/api/auth/refresh` |
| `routes/auth-accounts.ts` | `/api/auth/accounts`, `/api/auth/switch`, `/api/auth/accounts/:id/signout`, `/api/auth/me`, recovery |
| `routes/auth-profile.ts` | `/api/auth/update-profile`, `/api/auth/sessions*`, `/api/auth/avatar`, `/api/auth/export`, `/api/auth/delete-account` |
| `routes/auth-password-change.ts` | Add/change password, fresh credential/MFA checks and device revocation |
| `routes/auth-google.ts`, `routes/auth-mfa.ts`, `routes/auth-passkeys.ts` | Provider identities and optional MFA/passkey endpoints |
| `routes/auth-recovery-change.ts` | Verified recovery-address changes |
| `routes/oauth.ts` | `/api/oauth/{app-info,authorize,decision,token,userinfo,authorizations,revoke}` |

---

## 3. Cryptographic & Multi-Account Cookie Security

| Layer | Algorithm / Design | Security Guarantee |
| :--- | :--- | :--- |
| **Password Storage** | `PBKDF2-HMAC-SHA256` (`100,000` iter, 16B random salt) | Stored as `pbkdf2_sha256$100000$<salt>$<hash>`; constant-time compare. |
| **Multi-Account Slots (`a`..`f`)** | `gothwad_sess_a`..`f` + `gothwad_active` + HMAC `gothwad_accounts` | Up to 6 simultaneous accounts per browser across `*.gothwadtech.com`; **zero tokens in `localStorage`/`sessionStorage`**; CSRF-checked `/auth/switch` & per-slot signout. |
| **Account Access & Refresh** | `HS256` (`token_use: "session"`, 1h) + `SHA-256` refresh hash in D1 | Live session check in D1 + atomic single-winner rotation + 10s parallel tab grace window. |
| **OAuth 2.0 + S256 PKCE** | `HS256` (`token_use: "oauth_access"`) + atomic `UPDATE ... RETURNING` | Public clients require S256 PKCE; OAuth tokens strictly rejected on `/api/auth/*`. |
| **Internal Mail Lookup** | `GET https://api.<APP_DOMAIN>/api/internal/usernames/:username` | Called by Mail Worker **`mail`** (`client_id = gothwad-mail`) using constant-time `Bearer MAIL_INTERNAL_TOKEN`. |

## Upstream Google authentication

Accounts can also act as an OIDC client for Google, separately from its Gothwad
OAuth-provider routes. `google-oidc.ts` verifies authorization-code/PKCE/nonce/RSA
claims; `routes/auth-google.ts`, `google-signin.ts`, `google-proofs.ts` and SQL 11/12
manage browser-bound single-use proofs, explicit identity links and passwordless
onboarding. Canonical account links support many users per verified Google subject
but one Google link per user. Returning users explicitly select an account or Add
new; legacy links are preserved/imported once. Internal user IDs, account-specific
local MFA and shared session issuance are reused.
Missing passwords use a disabled non-hash marker and a derived `has_password` flag;
no fake password is generated. Only transient Google proof cookies are host-only;
existing parent-domain SSO slot cookies are untouched. Fresh Google proof supports
security actions without requiring a first password. Full design and owner setup:
[Google sign-in](GOOGLE_SIGN_IN.md).
