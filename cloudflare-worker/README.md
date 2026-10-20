# ⚡ GOTHWAD ACCOUNTS WORKER (100% Cloudflare Native — D1 + WebCrypto Auth)

> **Zero Supabase · Zero Third-Party Auth · Unlimited Users ($0 MAU) · Never Sleeps**
> Overview: [README.md](../README.md) · Master Plan: [docs/CLOUDFLARE_NATIVE_PLAN.md](../docs/CLOUDFLARE_NATIVE_PLAN.md) · Setup: [docs/SETUP.md](../docs/SETUP.md)

Yeh single Cloudflare Worker (`src/index.ts`, ~21 KB gzipped!) poore Gothwad Ecosystem ka central Auth & OAuth 2.0 server hai.

## Bindings & Secrets Summary

| Name | Type | Required? | Purpose |
|------|------|-----------|---------|
| `DB` | **D1 Database** (`gothwad-accounts-db`) | ✅ Yes | Users, profiles, sessions, avatars, OAuth clients/codes/tokens |
| `AVATARS_BUCKET` | **R2 Bucket** (`gothwad-avatars`) | ⭕ Optional | Drop-in avatar bucket (if unbound, uses D1 `user_avatars` + Edge CDN cache with 0 card required!) |
| `JWT_SECRET` | **Secret** | ✅ Yes | Signs HS256 Session (`token_use="session"`) & OAuth (`token_use="oauth_access"`) JWTs |
| `MAIL_INTERNAL_TOKEN` | **Secret** | ✅ For Mail | Shared secret matching `GothwadTech/mail` Worker's `ACCOUNTS_INTERNAL_TOKEN` |
| `RESEND_API_KEY` | **Secret** | ⭕ Optional | Sends password recovery emails via Resend (3,000 free/month) |

## Local Development & Verification

```bash
cp .dev.vars.example .dev.vars
npm install
npx tsc --noEmit               # Strict TypeScript check
npx wrangler deploy --dry-run  # Verify Cloudflare Worker bundle (~21 KiB gzip)
npx wrangler dev               # Local Worker + local SQLite D1 on http://127.0.0.1:8787
```
