# ✅ TASK.md — Live Status & Task Board

> **⚠️ HAR AI SESSION KE LIYE MANDATORY RULES:**
> 1. Kaam khatam hone se **PEHLE** yeh file update karo (`✅ DONE` + `🔜 NEXT UP`).
> 2. **🚨 RULE #8 (PERMANENT FILE-SIZE RULE):** Har file (`TS`, `JS`, `HTML`, `CSS`, `SQL`, `Test`, `MD`) ko **`<= 500` lines** rakho (`500–800` lines MAX hard ceiling — enforced automatically by `npm test`!). Jab bhi koi code file ya `TASK.md` 500 lines ke paas pahunche, code ko clean modular files mein split karo (**100% identical logic ke saath, zero regression!**) aur purane session logs **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)** mein archive karo!
>
> Rules & working style: [`AGENTS.md`](AGENTS.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Full session archive (`1–28`): [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)

**Last updated:** 2026-10-20 (Session 31 — Fixed `/me` reload hang + `exportData()` ESM crash + `_headers` ETag revalidation + executed full repo-wide `<= 500`-line modularization with **73/73 automated tests green**)

---

## 📊 STATUS SUMMARY

| Step | Feature | Status |
|------|---------|--------|
| 1 | Gothwad Accounts — UI + sessions + profile + avatars + export/delete | ✅ DONE |
| 2 | OAuth 2.0 + S256 PKCE provider ("Sign in with Gothwad") | ✅ DONE |
| 2.5 | **100% Cloudflare Native Upgrade (`D1` + Worker Native Auth — Zero Supabase!)** | ✅ **DONE (`ab5fa1c`, PR #17)** |
| 2.6 | **Google-Style Multi-Account Cookie Sessions (`a`..`f` `HttpOnly` `.gothwadtech.com` slots)** | ✅ **DONE (`aa6e0d7`, PR #18)** |
| 2.7 | **`accounts.gothwadtech.com` Reload Hang Fix + Repo-Wide `<= 500`-Line Modular Architecture (`v2.2`)** | ✅ **DONE (2026-10-20)** |
| 3 | Merge new PR → auto-deploy `accounts` Worker + Pages & verify live reload + `GothwadTech/mail` switcher | 🔜 NEXT |
| 4 | Cross-app SSO (`Kiwi Store`, `Drive`, `Notes`, `Calendar`) — keep `PlusTube`/`Indogram`/`GrixChat` on Supabase | 📋 Planned |

**Current state in one line:** **v2.2 — 100% Modular Cloudflare Native Auth & Multi-Account SSO (`Pages` + `Worker` + `D1`)**; `/me` reload hang permanently fixed (broken `getTokens` ESM import in `web/me/js/tabs/data.js` fixed + one-time reset token `apiCall(..., { token })` preserved + `/me` error recovery banner & inline watchdog + `web/_headers` `must-revalidate`), **100% of files across the entire repository strictly `<= 500` lines**, and **73/73 automated tests passing** (`npm run build` + `npm test` + `tsc --noEmit` + `wrangler deploy --dry-run` all green).

---

## ✅ DONE (Newest First — Sessions 29 to 31)

### Session 31 — 2026-10-20 — Permanent Fix for `accounts.gothwadtech.com` Reload Hang + Repo-Wide `<= 500`-Line Modularization (`v2.2`)
- **Owner goal:**
  1. Diagnose & permanently fix the production bug where reloading `accounts.gothwadtech.com` gets stuck forever on `"Loading your account…"`.
  2. Permanently document and immediately enforce across the entire repo: **every file must stay `<= 500` lines (`500–800` max hard limit), splitting oversized files cleanly with 100% identical logic & zero broken functionality**.
- **Root Cause & 4-Layer Fix for Reload Hang (`web/`):**
  - **Root cause proven:** In `v2.1`, `getTokens` was removed from `web/js/api.js`, while `web/me/js/tabs/data.js` still statically imported `{ getTokens } from '../../../js/api.js'`. Because ES modules validate all static imports before executing any module code, the browser threw an uncaught link-time `SyntaxError: The requested module '../../../js/api.js' does not provide an export named 'getTokens'` before `boot()` in `web/me/js/me.js` ever executed — leaving `#loading-screen` visible forever on reload! Additionally, `web/signin/js/modules/reset-password.js` passes `{ token: resetToken }` to `apiCall()` for one-time email recovery links.
  - **Fix Layer 1 (`web/js/api.js` + `web/me/js/tabs/data.js`):** Rewrote `exportData()` in `web/me/js/tabs/data.js` to use cookie-authenticated `fetch(..., { credentials: 'include' })` + `refreshOnce()`, restored zero-storage backwards-compatible `export function getTokens()` shim in `web/js/api.js`, AND restored optional `{ token }` `Authorization: Bearer` header support in `apiCall()` for one-time password reset links.
  - **Fix Layer 2 (`web/me/js/me.js` + `web/me/index.html`):** Wrapped `boot()` in defensive `try/catch` with retry UI (`showLoadFailure()`) AND added an inline non-module `<script>` watchdog in `web/me/index.html` (`window.__gothwadModuleError` + 8s `window.__GOTHWAD_ME_BOOTED` check) so even a network-dropped module surfaces a clean Reload/Sign-In UI instead of an infinite spinner.
  - **Fix Layer 3 (`web/_headers`):** Added Cloudflare Pages `Cache-Control: public, max-age=0, must-revalidate` across `/*`, `/js/*`, `/me/*`, `/me/js/*`, `/signin/*`, `/signup/*`, and `/css/*` so browsers always revalidate `ETag` (`304`) and never mix cached pre-deploy ES modules with post-deploy modules.
  - **Fix Layer 4 (`tests/frontend-and-filesize.test.mjs`):** Added automated static + dynamic ESM import/export link verification across every HTML & JS file in `web/**` plus end-to-end `/me` reload, cookie `/api/auth/export`, and one-time `/api/auth/reset-password` regression tests!
- **Repo-Wide `<= 500`-Line Modular Refactor (`100%` Identical Functionality & Byte-Exact CSS):**
  - **Cloudflare Worker (`3,960`-line monolith → 15 clean TS modules, each `89–465` lines):** `index.ts`, `types.ts`, `db.ts`, `http.ts`, `crypto.ts`, `cookies.ts`, `users.ts`, `sessions.ts`, `browser-slots.ts`, `oauth-helpers.ts`, `routes/public-internal.ts`, `routes/auth-entry.ts`, `routes/auth-session.ts`, `routes/auth-accounts.ts`, `routes/auth-profile.ts`, `routes/oauth.ts`.
  - **Stylesheets & HTML (`<= 485` lines every file, 100% byte-identical rules):** Split `styles.css` (`1,772` lines) & `legacy.css` (`1,791` lines) into 15 modular stylesheets (`web/css/*.css` + `web/css/legacy/*.css`), updated `tools/bundle-css.js` + all 6 HTML entrypoints in exact cascade order, and extracted inline `/me` CSS so `web/me/index.html` is `480` lines.
  - **Frontend Modals, Tests & Docs (`<= 490` lines every file):** Split `dialogs.js` → `dialogs.js` + `dialogs-security.js`; split `tests/multi-account.test.mjs` → `helpers/multi-account-harness.mjs` + `multi-account.test.mjs` + `multi-account-security.test.mjs`; documented **Rule #8** in `AGENTS.md`, `docs/ARCHITECTURE.md`, `README.md`, `web/README.md`, `cloudflare-worker/README.md`, and archived older logs into `docs/TASK_HISTORY.md`.

### Session 30 — 2026-10-20 — Merged PR #18 (`aa6e0d7`) — Google-Style Multi-Account Cookie Sessions (`v2.1`)
- Built 6-slot `.gothwadtech.com` `HttpOnly` cookie session engine (`gothwad_sess_a`..`f`, HMAC `gothwad_accounts`, `gothwad_active`), zero client-stored tokens, `/api/auth/accounts`, CSRF-checked `/api/auth/switch`, `/api/auth/accounts/:id/signout`, 10s parallel tab grace window, and live `GothwadTech/mail` compatibility (**69/69** tests green, merged in PR **#18** & deployed live on Cloudflare Workers + Pages).

### Session 29 — 2026-10-20 — Merged PR #17 (`ab5fa1c`) — 100% Cloudflare Native Upgrade (`D1` + Worker WebCrypto Auth)
- Replaced Supabase completely in `GothwadTech/accounts` (and verified `GothwadTech/mail` PR **#8** `a2a8044`) with native Cloudflare D1 (`accounts` DB), WebCrypto `PBKDF2-SHA256` (`100k` iter), `HS256` JWTs, D1/Edge-cached avatars, and `tools/local-d1.mjs` (`node:sqlite`).

> 📜 **Older Completed Sessions (`Sessions 1 – 28`):** Archived verbatim in **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.

---

## 🔜 NEXT UP

1. **Merge PR to `main`** → Cloudflare Workers Builds (`accounts`) + Cloudflare Pages (`gtwdac`) auto-deploy in ~60 seconds.
2. **Verify Live Production Reload on `https://accounts.gothwadtech.com/me`** → Hard refresh (`Ctrl+Shift+R` / mobile reload) confirms instant dashboard render, working account switcher, and working JSON data export.
3. **Wire Multi-Account Switcher UI in `GothwadTech/mail`** against `GET /api/auth/accounts`, `POST /api/auth/switch`, and `POST /api/auth/accounts/:id/signout`.
