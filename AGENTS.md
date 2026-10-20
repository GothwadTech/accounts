# 🤖 AGENTS.md — AI Working Guide (READ THIS FIRST!)

> **Agar tum ek AI agent ho jo is repo mein kaam karne aaye ho:**
> Yeh file pehle padho, phir `TASK.md` aur `docs/CLOUDFLARE_NATIVE_PLAN.md` padho.
> **Yeh file kabhi delete/move mat karna.** Har session ke end mein `TASK.md` update karna mandatory hai.

---

## 1. 👤 CLIENT KON HAI

- **Pawan** (solo founder, **Gothwad Tech**) — baat-cheet **simple English / Hinglish** mein rakho, har step aur reason clear explain karo.
- Code **clean, modular, well-commented** hona chahiye.

## 2. 🔥 TECH STACK (v2.0 — 100% CLOUDFLARE NATIVE, ZERO SUPABASE!)

> ⚠️ **IMPORTANT:** Is repo se **Supabase 100% HATA DIYA GAYA HAI!** Kabhi bhi `@supabase/supabase-js`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ya Postgres-only syntax wapas mat daalna!

| Layer | Tech | Free Limit |
|-------|------|------------|
| **Frontend** | Vanilla HTML/CSS/JS (`web/`) → Cloudflare Pages | Unlimited bandwidth |
| **Backend API** | Cloudflare Worker (`cloudflare-worker/src/index.ts`, TypeScript) | 100K req/day |
| **Database** | **Cloudflare D1** (`env.DB` SQLite — `accounts` DB `392aacf8-1b43-490a-9519-ced4daf5a40f`) | 5 GB / 10 DBs free, **NEVER auto-pauses!** |
| **Password Auth** | **Worker WebCrypto `PBKDF2-HMAC-SHA256`** (`100,000` iter + 16B random salt) | **$0 Unlimited MAU!** |
| **Avatars** | **D1 `user_avatars` + Cloudflare Edge Cache** (`0` card required) + drop-in **R2** (`env.AVATARS_BUCKET`) | Free |
| **Email Out** | Resend API (`RESEND_API_KEY`, optional) | 3,000 emails/month |
| **Local Dev D1** | `tools/local-d1.mjs` (Node 22 built-in `node:sqlite`) | Zero NPM dependencies |

## 3. 📏 HARD RULES (KABHI MAT TODO!)

1. **Domain-agnostic code (`RULE #1`):** Kahin bhi `gothwadtech.com` runtime code mein hardcode mat karo. Sirf `web/js/config.js` aur `cloudflare-worker/wrangler.toml` `[vars]` se aata hai.
2. **100% Pure Username DB (`RULE #2`):** `users` aur `profiles` mein **koi `email` column NAHI hota**! Email hamesha API/UI layer par `username + "@" + APP_DOMAIN` calculate hota hai.
3. **Secrets sirf Worker mein (`RULE #3`):** `JWT_SECRET`, `MAIL_INTERNAL_TOKEN`, `RESEND_API_KEY` sirf Worker Secrets mein rehte hain. `.dev.vars` aur `.local-d1.sqlite` gitignored hain.
4. **Strict Token Separation:** Account session JWTs (`token_use: "session"`) aur OAuth app JWTs (`token_use: "oauth_access"`) hamesha separate rakho.
5. **Cloudflare Workers PBKDF2 Limit:** Cloudflare Workers V8 WebCrypto max `100,000` PBKDF2 iterations support karta hai (`PBKDF2_ITERATIONS = 100_000`) — isse upar value mat badhana warna Workers edge par `NotSupportedError` aayega!
6. **3 Frontend Routes Only:** `/signin`, `/signup`, `/me` + Google Account Light/Dark UI design system (`web/css/` → bundle via `npm run build`).
7. **Idempotent SQLite/D1 Files:** `sql/01_core_schema.sql` → `sql/05_store_android_oauth.sql` hamesha re-run safe (`IF NOT EXISTS` / `ON CONFLICT`) rakho aur `npm test` se real SQLite par verify karo!

## 4. 💻 ESSENTIAL COMMANDS

```bash
npm start                                                      # Local UI + Worker + real SQLite D1 on :3000
npm test                                                       # Run all 62 security, SQL & E2E tests
node tools/test-singleflight.mjs                               # Live parallel refresh race test against :3000
cd cloudflare-worker && npx tsc --noEmit                       # Strict TS typecheck
cd cloudflare-worker && npx wrangler deploy --dry-run          # Verify production Worker bundle
```
