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
| `JWT_SECRET` | **Secret** | ✅ Yes | Signs HS256 `session` & `oauth_access` JWTs + HMAC `gothwad_accounts` cookie |
| `MAIL_INTERNAL_TOKEN` | **Secret** | ✅ For Mail | Shared secret matching Mail Worker `mail`'s `ACCOUNTS_INTERNAL_TOKEN` |
| `RESEND_API_KEY` | **Secret** | ⭕ Optional | Sends password recovery emails via Resend (3,000 free/month) |

## Verification Commands

```bash
npx --yes --package=typescript tsc --noEmit   # Strict TypeScript check across all 15 modules
npx wrangler deploy --dry-run                 # Verify Cloudflare Worker production bundle
```
