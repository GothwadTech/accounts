# ⚡ GOTHWAD ACCOUNTS WORKER (v2.2 — Modular 100% Cloudflare Native Auth + D1)

> **Zero Supabase · Zero Third-Party Auth · Multi-Account Subdomain SSO (`a`..`f`) · `<= 500` Lines Per Module**
> Overview: [README.md](../README.md) · Architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · Setup: [docs/SETUP.md](../docs/SETUP.md)

Central Identity, Multi-Account Session & OAuth 2.0 server for the Gothwad Ecosystem, organized cleanly into **15 focused TypeScript modules** (`<= 490` lines each, ~28 KiB gzipped total bundle with zero runtime NPM dependencies):

- **Core Layer (`src/*.ts`):** `index.ts` (router + public re-exports), `types.ts`, `db.ts`, `http.ts`, `crypto.ts`, `cookies.ts`, `users.ts`, `sessions.ts`, `browser-slots.ts`, `oauth-helpers.ts`.
- **Route Layer (`src/routes/*.ts`):** `public-internal.ts`, `auth-entry.ts`, `auth-session.ts`, `auth-accounts.ts`, `auth-profile.ts`, `oauth.ts`.
- **Permanent Rule (`Rule #8`):** Every module in `src/` must stay `<= 500` lines (`500–800` hard ceiling). Split new features cleanly across modules while preserving 100% identical HTTP/cookie contracts.

## Bindings & Secrets Summary

| Name | Type | Required? | Purpose |
|------|------|-----------|---------|
| `DB` | **D1 Database** (`accounts`) | ✅ Yes | Users, profiles, sessions, avatars, OAuth clients/codes/tokens |
| `AVATARS_BUCKET` | **R2 Bucket** (`gothwad-avatars`) | ⭕ Optional | Drop-in avatar bucket (falls back seamlessly to D1 `user_avatars` + Edge CDN cache) |
| `MFA_ENCRYPTION_KEY` | **Secret** | For authenticator enrollment | Independent 32-byte key in canonical base64url; preserve offline backup |
| `SSO_PROXY_TOKEN` | **Secret** | Optional backend transport | Authenticates headerless writes/legacy server credential responses; never browser-visible |
| `WEBAUTHN_RP_ID` | **Variable** | Optional | Must equal AUTH_HUB_URL hostname; hostname is the default |
| `JWT_SECRET` | **Secret** | ✅ Yes | Signs HS256 `session` & `oauth_access` JWTs + HMAC `gothwad_accounts` cookie |
| `MAIL_INTERNAL_TOKEN` | **Secret** | ✅ For Mail | Shared secret matching Mail Worker `mail`'s `ACCOUNTS_INTERNAL_TOKEN` |
| `RESEND_API_KEY` | **Secret** | ⭕ Optional | Sends password recovery emails via Resend (3,000 free/month) |

## Verification Commands

```bash
npx --yes --package=typescript tsc --noEmit   # Strict TypeScript check across all 15 modules
npx wrangler deploy --dry-run                 # Verify Cloudflare Worker production bundle
```


## Authenticator MFA and deployment entrypoint

Deployment starts at `src/worker.ts` (default handler only). `src/index.ts` retains
library/test exports that must not be exposed as Worker RPC entrypoints.

Authenticator MFA requires the separate `MFA_ENCRYPTION_KEY` secret for encrypted
seed operations; no signing-key fallback exists. Missing configuration leaves
unenrolled accounts unchanged and blocks enrollment. Additive migration 08 matches
runtime bootstrap. Real configuration requires the final release checklist and approval.
See [MFA details](../docs/AUTHENTICATOR_MFA.md) and the local-only smoke command
`npm run test:mfa:worker` from the repository root. No production MFA is enabled by
editing these files.

## Passkeys, SSO/OAuth, and release checks

Passkeys use pinned SimpleWebAuthn, exact identity origin/hostname, required user
verification, and additive migration 09. Durable OAuth credential bindings use
migration 10. Old unbound OAuth credentials require fresh authorization.
Unknown sibling origins and unauthenticated headerless writes are rejected;
current explicit-origin Mail proxies and cookie-only GET identity remain supported.
Do not restore the Accept-only bypass or move session credentials into frontend code.

From the repository root, `npm run security:check` runs the complete local release
gate without deploying. `npm run test:passkeys:worker` checks a separately running
local Worker; actual browser QA is documented in the runbook. See
[passkeys](../docs/PASSKEYS.md), [SSO contracts](../docs/SSO_TRUST_AND_OAUTH.md),
[release readiness](../docs/SECURITY_RELEASE_READINESS.md), and the single
[final owner checklist](../docs/SECURITY_OWNER_CHECKLIST.md).
