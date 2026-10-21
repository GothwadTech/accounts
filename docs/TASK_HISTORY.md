# 📜 TASK_HISTORY.md — Archived Session Logs (Sessions 1 – 28)

> Active live board, current status, and latest sessions (`Session 29+`) live in **[`../TASK.md`](../TASK.md)**.
> Older completed session logs are archived here verbatim so every file in the repository stays cleanly `<= 500` lines (`Rule #8`).

---

## Session 28 — 2026-10-17 — Two repo handoffs + Accounts-side OAuth completion
- Created `docs/STORE_WEB_AUTH_FIX_PROMPT.md` and `docs/STOREAPP_AUTH_FIX_PROMPT.md` separating Store web (`GothwadTech/store`) and Android (`GothwadTech/storeapp`) source findings from live verification.
- Hardened Accounts Worker OAuth 2.0 engine: public-client S256 PKCE enforced at `/oauth/authorize`, `/oauth/decision`, and `/oauth/token`; verifier syntax validated; consent JSON escapes `<` safely; registered callback query params preserved; unsafe schemes/fragments/userinfo rejected; rotated session cookies preserved on consent/decision/error responses; `Cache-Control: no-store` set on OAuth routes; D1 errors return `503 temporarily_unavailable`; atomic conditional `UPDATE ... RETURNING` consumption prevents concurrent code/refresh races.
- Added `tools/generate-store-oauth-sql.mjs` generating idempotent Android + 4 web callback SQL from `APP_DOMAIN`.

## Session 27 — 2026-10-17 — Store Android OAuth redirect + web URL review
- Diagnosed Android `gothwadstore://oauth/callback` 400 (`redirect_uri is not registered for this app`) and web Store `new URL('/oauth/authorize', ...)` `/api`-dropping bug.
- Added idempotent Android callback SQL migration (`sql/05_store_android_oauth.sql`), updated `docs/OAUTH.md` and `docs/STORE_OAUTH.md`, and added `tools/test-oauth-redirects.mjs`.

## Session 26 — 2026-10-11 — Mail Worker naming docs sync (`mail`, not `gothwad-mail-api`)
- Standardized documentation across `docs/MAIL_INTERNAL.md`, `docs/MAIL_BOOTSTRAP_PROMPT.md`, `docs/MAIL_SESSION_FIX_PROMPT.md`, `docs/SETUP.md`, and `docs/ARCHITECTURE.md`: Cloudflare Worker name = **`mail`** (`GothwadTech/mail`), OAuth `client_id` = `gothwad-mail`, internal lookup base = `https://api.<APP_DOMAIN>`, shared secret = `MAIL_INTERNAL_TOKEN` ↔ `ACCOUNTS_INTERNAL_TOKEN`.

## Session 25 — 2026-10-11 — Mail `/api/auth/me` empty-username guard
- Hardened `/api/auth/me` so missing/empty profile usernames fall back safely or return `503 profile_unavailable` instead of returning `200` with an empty username.

## Session 24 — 2026-10-11 — Google-style `/me` UI + `sql/` folder + 4 account features
- Built Google-inspired light/dark `/me` dashboard (topbar search + avatar menu + 6 sections: Home, Personal info, Security, Data & privacy, People & sharing, Connected apps + settings search + modals).
- Added 256×256 client-resized avatar upload (`POST /api/auth/avatar`), security activity feed (`GET /api/auth/activity`), JSON account data export (`GET /api/auth/export`), and password-confirmed account deletion (`POST /api/auth/delete-account`).
- Organized idempotent schema migrations under `sql/01_core_schema.sql` .. `sql/03_avatars_storage.sql`.

## Session 23 — 2026-10-10 — Core Gothwad Services vs Optional Connected Products
- Core Gothwad Services (`Meet`, `Mail`, `Kiwi Store`, `Drive`, `Notes`, `Calendar`, `Contacts`) remain always connected (`403` on `/api/oauth/revoke`); third-party/optional products support one-click Disconnect.

## Sessions 20 – 22 — 2026-10-10 — Account Chooser, Multi-Account UX & Identifier Check
- Added Google-style `/signin` account chooser (`?choose=1`, `?add=1`), OAuth consent "Use another account" link, and `GET/POST /api/auth/check-identifier` pre-validation with distinct username/phone/third-party-suffix error messages.

## Sessions 9 – 19 — 2026-10-10 — Auth Card Design System, Multi-Step Signup, Legal Pages & Brand Logo
- Designed standalone button-styled auth inputs, 4-step signup flow, smart identifier auto-detection, `/privacy` and `/terms` legal screens, original `#0494f4` squircle snowflake brand emblem (`/icon-192.png`), session-aware `/` splash screen, and local preview server (`server.js`).

## Sessions 1 – 8 — 2026-10-09 to 2026-10-10 — Initial Auth Hub, OAuth 2.0 Provider & Deployment Setup
- Built initial Gothwad Accounts Auth Hub (`/signin`, `/signup`, `/me`), full OAuth 2.0 + S256 PKCE provider (`/api/oauth/*`), single-flight parallel refresh protection (`tools/test-singleflight.mjs`), and dashboard-first Cloudflare Workers + Pages deployment guides (`docs/SETUP.md`).
