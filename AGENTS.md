# 🤖 AGENTS.md — AI Engineering Guide (READ THIS FIRST!)

> **If you are an AI agent working in this repository:**
> Read this guide completely before changing code, alongside [`TASK.md`](TASK.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
> **Never delete or move this file.** Always update `TASK.md` cleanly before ending any session.

---

## 🚨 PERMANENT RULE #0 — 100% PURE ENGLISH ONLY EVERYWHERE (ZERO HINDI / HINGLISH!)

> **STRICT PERMANENT MANDATE FROM FOUNDER (ENFORCED AUTOMATICALLY BY `npm test`):**
> - **100% Pure, Crisp English Across Every Single File & UI Screen:** Even if the founder occasionally writes a quick note or question in casual Hinglish in chat, **EVERY SINGLE UI string, button label, modal subtitle, toast, error message, HTML element, TypeScript/JavaScript/CSS/SQL comment, test, and Markdown document in the repository MUST be written in 100% pure, idiomatic English ONLY.**
> - **NEVER mix Hindi or Hinglish anywhere** inside `web/**`, `cloudflare-worker/**`, `sql/**`, `tools/**`, `tests/**`, or `*.md` / `docs/*.md` — enforced automatically by [`tests/frontend-and-filesize.test.mjs`](tests/frontend-and-filesize.test.mjs)!

---

## 🚨 PERMANENT CODEBASE HYGIENE RULE — FILE SIZE & MODULARITY (`RULE #8` — MANDATORY FOR EVERY AI SESSION!)

> **HARD MANDATE FROM FOUNDER (ENFORCED AUTOMATICALLY BY `npm test`):**
> 1. **Target `<= 500` lines per file (`500–800` lines MAX hard ceiling):** No source, stylesheet, HTML, SQL, test, or Markdown file (`TypeScript`, `JavaScript`, `HTML`, `CSS`, `SQL`, `Test`, `Markdown`) may grow past `500` lines (`TASK.md` archives older completed sessions into [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)).
> 2. **Split Immediately With 100% Identical Logic:** Whenever any file approaches `500` lines, split it immediately into clean, cohesive modules with **100% identical behavior, API status codes, CSS cascade order, cookie contract, and zero regressions**.
> 3. **Verify Static ESM Imports & CSS Cascade:** Always run `npm run build && npm test` before committing — [`tests/frontend-and-filesize.test.mjs`](tests/frontend-and-filesize.test.mjs) checks line counts, HTML `<script type="module">` / `<link rel="stylesheet">` paths, JS named imports/exports, and 100% pure-English compliance automatically!

---

## 🔥 TECH STACK (v2.4 — 100% CLOUDFLARE NATIVE, MODULAR, ZERO SUPABASE!)

> ⚠️ **IMPORTANT:** Supabase has been **100% removed** from `GothwadTech/accounts`, `GothwadTech/mail`, and `GothwadTech/store`. (`PlusTube`, `Indogram`, and `GrixChat` remain on their own separate Supabase projects — never touch those three repos.)

| Layer | Technology | Free Tier / Design |
|-------|------------|--------------------|
| **Frontend & Universal Widget** | Modular Vanilla HTML/CSS/ESM JS (`web/`, `web/widget/account-menu.js`, `web/_headers`) → Cloudflare Pages | Unlimited free bandwidth; zero framework bloat |
| **Backend API** | Modular Cloudflare Worker (`cloudflare-worker/src/` — `<= 490` lines/file) | 100K req/day free |
| **Database** | **Cloudflare D1** (`env.DB` SQLite — `accounts` DB `392aacf8-1b43-490a-9519-ced4daf5a40f`) | Dedicated D1 DB; **never auto-pauses** |
| **Multi-Account SSO** | `HttpOnly; Secure; SameSite=Lax; Domain=.APP_DOMAIN` cookies (`gothwad_sess_a`..`f`) + `/u/0..5` (`X-Gothwad-Authuser`) | **Zero client storage tokens!** |
| **Password Auth** | **Worker WebCrypto `PBKDF2-HMAC-SHA256`** (`100,000` iterations + 16B random salt) | **$0 Unlimited MAU!** |
| **Avatars** | **D1 `user_avatars` + Cloudflare Edge Cache** (`0` credit card required) + optional drop-in **R2** (`env.AVATARS_BUCKET`) | Free |
| **Outbound Email** | Resend API (`RESEND_API_KEY`, optional) | 3,000 emails/month free |
| **Local Dev D1** | `tools/local-d1.mjs` (Node 22 built-in `node:sqlite`) | Zero external NPM dependencies |

---

## 📏 ALL 9 HARD ARCHITECTURAL RULES (NEVER VIOLATE!)

0. **100% Pure English Everywhere (`RULE #0`):** Zero Hindi / Hinglish anywhere in UI strings, errors, code comments, SQL comments, tests, or documentation.
1. **Domain-Agnostic Code (`RULE #1`):** Never hardcode `gothwadtech.com` in runtime logic. Read `APP_DOMAIN` solely from `web/js/config.js` and `cloudflare-worker/wrangler.toml` `[vars]`.
2. **100% Pure Username DB (`RULE #2`):** `users` and `profiles` contain **zero `email` columns**. Primary email is always derived dynamically as `username + "@" + APP_DOMAIN`.
3. **Zero Secrets or Auth Tokens in Browser Storage (`RULE #3`):** `JWT_SECRET`, `MAIL_INTERNAL_TOKEN`, and `RESEND_API_KEY` live strictly in Cloudflare Worker Secrets; browsers never store session/OAuth tokens in `localStorage` or `sessionStorage` (`gothwad-theme` only).
4. **Strict Token & Cookie Contract (`RULE #4`):**
   - Separate account session JWTs (`token_use: "session"`) strictly from OAuth access JWTs (`token_use: "oauth_access"`).
   - Every Worker cookie matches `^gothwad_[a-z_]+=` with slot cookies `^gothwad_sess_[a-z]$` (`a`..`f`), emitted via individual `Set-Cookie` headers.
5. **Cloudflare Workers PBKDF2 Ceiling (`RULE #5`):** Never raise `PBKDF2_ITERATIONS` above `100_000` (Workers WebCrypto runtime limit).
6. **Core Frontend Routes + Preserved CSS Cascade (`RULE #6`):** Core routes remain `/signin`, `/signup`, `/me` (+ `/privacy`, `/terms`, `/widget/account-menu.js`). Never reorder stylesheet links in `web/css/*.css` or `web/css/legacy/*.css`.
7. **Idempotent SQLite/D1 Migrations (`RULE #7`):** Keep `sql/00_d1_console_bootstrap.sql` through `sql/05_store_android_oauth.sql` 100% idempotent, with **zero `PRAGMA` statements** in `sql/00_d1_console_bootstrap.sql` or Worker runtime SQL.
8. **File Size `<= 500` Lines (`RULE #8`):** Every file across the repo stays strictly `<= 500` lines.

---

## 💻 ESSENTIAL VERIFICATION COMMANDS (RUN BEFORE EVERY COMMIT/PR!)

```bash
npm run build                                                                    # Validate all modular CSS stylesheets & shims
npm test                                                                         # Run all 80+ security, E2E, widget, ESM-link, English & <=500-line gates
node tools/test-singleflight.mjs                                                 # Parallel refresh race verification against live server
cd cloudflare-worker && npx --yes --package=typescript tsc --noEmit              # Strict TypeScript check across all Worker modules
cd cloudflare-worker && npx wrangler deploy --dry-run                            # Verify production Cloudflare Worker bundle
```
