# 🤖 AGENTS.md — AI Working Guide (READ THIS FIRST!)

> **Agar tum ek AI agent ho jo is repo mein kaam karne aaye ho:**
> Yeh file sabse pehle padho, phir `TASK.md` aur `docs/ARCHITECTURE.md` padho.
> **Yeh file kabhi delete/move mat karna.** Har session ke end mein `TASK.md` update karna mandatory hai.

---

## 1. 👤 CLIENT KON HAI

- **Pawan** (solo founder, **Gothwad Tech**) — baat-cheet **simple English / Hinglish** mein rakho, har step aur reason clear explain karo.
- Code **clean, modular, well-commented** hona chahiye.

---

## 🚨 PERMANENT CODEBASE HYGIENE RULE — FILE SIZE & MODULARITY (`RULE #8` — MANDATORY FOR EVERY AI SESSION!)

> **HARD MANDATE FROM FOUNDER (ENFORCED AUTOMATICALLY BY `npm test`):**
> 1. **Target `<= 500` lines per file (`500–800` lines MAX hard ceiling):** Koi bhi file (`TypeScript`, `JavaScript`, `HTML`, `CSS`, `SQL`, `Test`, ya `Markdown`) **500–800 lines se upar NAHI jaani chahiye** — aur har file ko **500 lines ke andar (`<= 500`)** rakhne ki koshish karo (`TASK.md` ke purane entries `docs/TASK_HISTORY.md` mein archive karo).
> 2. **Split Immediately With 100% Identical Logic:** Jab bhi koi nayi ya existing file `500` lines cross kare, use **turant clean, logical, cohesive modules mein break/split karo** — **BINA kisi bhi API status code, UI look, CSS cascade order, cookie contract, ya business logic ko badle ya tode (`100% zero regression`)!**
> 3. **Verify Static ESM Imports & CSS Cascade:** Frontend (`web/**`) mein koi bhi export rename/remove karne ya file split karne ke baad **hamesha `npm run build && npm test` run karo** — `tests/frontend-and-filesize.test.mjs` har file ki line count, har HTML `<script type="module">` / `<link rel="stylesheet">`, aur har JS named export (`import { ... }`) ko automatically check karke link-time `SyntaxError` aur oversized files ko PR merge hone se pehle block kar deta hai!

---

## 2. 🔥 TECH STACK (v2.2 — 100% CLOUDFLARE NATIVE, MODULAR, ZERO SUPABASE!)

> ⚠️ **IMPORTANT:** Is repo se **Supabase 100% HATA DIYA GAYA HAI!** (`PlusTube`, `Indogram`, `GrixChat` apne alag Supabase par rehte hain — unhe mat chhedo; `Accounts` aur `Mail` 100% Cloudflare `Workers + D1` par hain.)

| Layer | Tech | Free Limit |
|-------|------|------------|
| **Frontend** | Modular Vanilla HTML/CSS/ESM JS (`web/` + `web/_headers`) → Cloudflare Pages | Unlimited bandwidth |
| **Backend API** | Modular Cloudflare Worker (`cloudflare-worker/src/` — 14 TS modules, `<= 490` lines each) | 100K req/day |
| **Database** | **Cloudflare D1** (`env.DB` SQLite — `accounts` DB `392aacf8-1b43-490a-9509...` in `wrangler.toml`) | 5 GB / 10 DBs free, **NEVER auto-pauses!** |
| **Multi-Account SSO** | `HttpOnly; Secure; SameSite=Lax; Domain=.APP_DOMAIN` cookies (`gothwad_sess_a`..`f`) | **Zero client storage tokens!** |
| **Password Auth** | **Worker WebCrypto `PBKDF2-HMAC-SHA256`** (`100,000` iter + 16B random salt) | **$0 Unlimited MAU!** |
| **Avatars** | **D1 `user_avatars` + Cloudflare Edge Cache** (`0` card required) + drop-in **R2** (`env.AVATARS_BUCKET`) | Free |
| **Email Out** | Resend API (`RESEND_API_KEY`, optional) | 3,000 emails/month |
| **Local Dev D1** | `tools/local-d1.mjs` (Node 22 built-in `node:sqlite`) | Zero NPM dependencies |

---

## 3. 📏 ALL 8 HARD RULES (KABHI MAT TODO!)

1. **Domain-Agnostic Code (`RULE #1`):** Kahin bhi `gothwadtech.com` runtime code mein hardcode mat karo. Sirf `web/js/config.js` aur `cloudflare-worker/wrangler.toml` `[vars]` se aata hai.
2. **100% Pure Username DB (`RULE #2`):** `users` aur `profiles` mein **koi `email` column NAHI hota**! Email hamesha API/UI layer par `username + "@" + APP_DOMAIN` calculate hota hai.
3. **Secrets Sirf Worker Mein (`RULE #3`):** `JWT_SECRET`, `MAIL_INTERNAL_TOKEN`, `RESEND_API_KEY` sirf Worker Secrets mein rehte hain, aur browser `localStorage` / `sessionStorage` mein **kabhi bhi auth tokens store nahi hote** (sirf `gothwad-theme`).
4. **Strict Token & Cookie Contract (`RULE #4`):**
   - Account session JWTs (`token_use: "session"`) aur OAuth app JWTs (`token_use: "oauth_access"`) hamesha separate rakho.
   - Har Worker cookie `^gothwad_[a-z_]+=` aur slot cookies `^gothwad_sess_[a-z]$` (`a`..`f`) follow karein, individual `Set-Cookie` headers ke saath (`GothwadTech/mail` SSO compatibility).
5. **Cloudflare Workers PBKDF2 Limit (`RULE #5`):** `PBKDF2_ITERATIONS = 100_000` se upar value mat badhana warna Workers edge par `NotSupportedError` aayega.
6. **3 Frontend Routes + Frozen Legacy Visuals (`RULE #6`):** Routes sirf `/signin`, `/signup`, `/me` (+ legal `/privacy`, `/terms`). CSS modular hai (`web/css/*.css` aur `web/css/legacy/*.css` — cascade order kabhi mat badalna!).
7. **Idempotent SQLite/D1 Files (`RULE #7`):** `sql/01_core_schema.sql` → `sql/05_store_android_oauth.sql` hamesha re-run safe rakho.
8. **File Size <= 500 Lines (`RULE #8`):** Har file `<= 500` lines target (`500–800` max hard limit). Badi file ko turant clean parts mein split karo bina kisi functionality ya logic ko badle!

---

## 4. 💻 ESSENTIAL VERIFICATION COMMANDS (RUN BEFORE EVERY COMMIT/PR!)

```bash
npm run build                                                                    # Validate all 15 modular CSS files & shims
npm test                                                                         # Run all 73 security, E2E, ESM-link & <=500-line checks
node tools/test-singleflight.mjs                                                 # Parallel refresh race verification against live server
cd cloudflare-worker && npx --yes --package=typescript tsc --noEmit              # Strict TypeScript check across all 14 Worker modules
cd cloudflare-worker && npx wrangler deploy --dry-run                            # Verify production Cloudflare Worker bundle (~28 KiB gzip)
```
