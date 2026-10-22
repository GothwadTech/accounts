# ✅ TASK.md — Live Status & Task Board

> **⚠️ MANDATORY RULES FOR EVERY AI SESSION:**
> 1. Always update this file (`✅ DONE` + `🔜 NEXT UP`) cleanly **before** finishing work.
> 2. **🚨 RULE #0 (100% PURE ENGLISH ONLY):** Every UI string, button, modal, error message, code comment, SQL comment, test, and Markdown file across the entire repository MUST be in **100% pure, idiomatic English** (zero Hindi / Hinglish anywhere — enforced automatically by `npm test`!).
> 3. **🚨 RULE #8 (STRICT `<= 500` LINES PER FILE):** Keep every file (`TS`, `JS`, `HTML`, `CSS`, `SQL`, `Test`, `MD`) **`<= 500` lines** (enforced automatically by `npm test`!). Archive older completed session logs into **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.
>
> Engineering guide: [`AGENTS.md`](AGENTS.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Session archive (`1–30`): [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)

**Last updated:** 2026-10-22 (Session 35 — Universal Google-Style Shadow-DOM Account Widget `web/widget/account-menu.js` + `X-Gothwad-Authuser` CORS fix + 100% Pure-English Repository Overhaul & Automated Hygiene Gate — **82/82 tests green**)

---

## 📊 STATUS SUMMARY

| Step | Feature | Status |
|------|---------|--------|
| 1 | Gothwad Accounts — UI + sessions + profile + avatars + export/delete | ✅ DONE |
| 2 | OAuth 2.0 + S256 PKCE provider ("Sign in with Gothwad") | ✅ DONE |
| 2.5 | **100% Cloudflare Native Upgrade (`D1` + Worker Native Auth — Zero Supabase!)** | ✅ **DONE (`ab5fa1c`, PR #17)** |
| 2.6 | **Google-Style Multi-Account Cookie Sessions (`a`..`f` `HttpOnly` `.gothwadtech.com` slots)** | ✅ **DONE (`aa6e0d7`, PR #18)** |
| 2.7 | **Modular `<= 500`-Line Architecture + Google `/u/0..5` · `authuser` Switcher + `GothwadTech/mail` Proxy Fix (`v2.3`)** | ✅ **DONE (`bf06daad`, PR #20)** |
| 2.8 | **Universal Google-Style Shadow-DOM Account Menu (`v2.4`) + 100% Pure-English Codebase & Hygiene Gate** | ✅ **DONE (2026-10-22)** |
| 3 | Roll out central `account-menu.js` + automatic silent SSO in `GothwadTech/store` & `GothwadTech/mail` | 🔜 NEXT |

**Current state in one line:** **v2.4 — Universal Shadow-DOM Google Account Switcher (`web/widget/account-menu.js`), Cross-Subdomain `X-Gothwad-Authuser` Silent SSO CORS, 100% Pure-English UI/Code/Docs, `100%` of files `<= 500` lines, and `82/82` automated tests passing.**

---

## ✅ DONE (Newest First — Sessions 31 to 35)

### Session 35 — 2026-10-22 — 100% Pure-English Repository Overhaul + Permanent Automated Language Gate
- Audited every single `.html`, `.js`, `.mjs`, `.ts`, `.css`, `.sql`, `.toml`, and `.md` file across the repository and converted **all 39 previously mixed Hinglish files** (`web/me/index.html`, `web/me/js/dialogs.js`, `web/me/js/dialogs-security.js`, `web/signin/js/signin.js`, `web/signin/js/modules/forgot-password.js`, all `web/css/*.css` & `web/**` comments, `sql/*`, `tools/*`, `cloudflare-worker/wrangler.toml`, `AGENTS.md`, `README.md`, `ROADMAP.md`, `TASK.md`, and `docs/*.md`) into crisp, idiomatic Google-grade English.
- Added **Permanent Rule #0 (`100% Pure English Only — Zero Hindi/Hinglish`)** in `AGENTS.md`, both cross-repo prompts (`docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md` & `docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`), and automated test coverage in `tests/frontend-and-filesize.test.mjs`.

### Session 34 — 2026-10-22 — Universal Google-Style Shadow-DOM Account Widget (`v2.4`) + Cross-Subdomain Silent SSO
- Built Google `OneGoogleBar`-style Shadow-DOM account switcher (`web/widget/account-menu.js`, `web/widget/account-menu-template.js`, `web/widget/account-menu-styles.js`) with Material 3 Expressive segmented card groups, Light + Dark modes, mobile full-screen sheet + desktop `396px` anchored popover, `68px` hero avatar + camera badge, real `avatarUrl` photos across all secondary slots `0..5`, collapse chevron, `+ Add another account`, inline `Manage accounts` slot/all sign-out, standalone `Manage your Account` pill, and `Privacy policy • Terms of Service` footer.
- Integrated `GothwadAccountMenu` into `/me` (`web/me/js/me.js`), added `X-Gothwad-Authuser` to `Access-Control-Allow-Headers` in `cloudflare-worker/src/http.ts`, enriched `toPublicAccountSummary()` (`name`, `avatarUrl`, `avatar_url`), exposed CORS headers on `/widget/*` in `web/_headers`, and authored standalone prompts [`docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md) & [`docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md).

### Session 33 — 2026-10-22 — `GothwadTech/store` Zero-Card Cloudflare D1 Migration Specification (`docs/STORE_D1_MIGRATION_PROMPT.md`)
- Audited `GothwadTech/store` + Android `GothwadTech/storeapp` end-to-end and authored [`docs/STORE_D1_MIGRATION_PROMPT.md`](docs/STORE_D1_MIGRATION_PROMPT.md) covering live D1 `store` (`a3dc3e71-cf89-4e0a-89d1-693fcf6f227a`), D1 `BLOB` + Edge Cache image deduplication, `GothwadTech/storefiles` APKs, and `<= 500`-line modularity.

### Session 32 — 2026-10-20 — Google-Grade `/u/0..5` · `authuser` Engine + Cross-Repo `GothwadTech/mail` Switch Fix (`v2.3`)
- Fixed Worker-to-Worker CSRF origin check (`verifyCsrfOrigin`), enriched `POST /api/auth/switch` payload (`{ ok, activeId, authuser, user, accounts }`), added persistent `remember` sessions + self-healing slot fallback, and added `/u/0/me`..`/u/5/me` edge rewrites & multi-tab isolation (`bf06daad`, PR #20).

### Session 31 — 2026-10-20 — Repo-Wide `<= 500`-Line Modular Refactor & Reload Hang Protections (`v2.2`)
- Split Worker (`3,960` lines → modular `<= 465`-line TS files), CSS (`15` modular files), dialogs, and tests (`8d53127`, PR #19).

> 📜 **Older Completed Sessions (`Sessions 1 – 30`):** Archived verbatim in **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.

---

## 🔜 NEXT UP

1. **Merge & Deploy `GothwadTech/accounts` (`v2.4`) to `main`** → Publishes `/widget/account-menu.js`, `X-Gothwad-Authuser` CORS, secondary account `avatarUrl` summaries, and 100% pure-English `/signin`, `/signup`, & `/me` UI live at `accounts.gothwadtech.com` & `api.gothwadtech.com`.
2. **Apply Standalone Prompts in `GothwadTech/store` & `GothwadTech/mail`:**
   - **Store:** [`docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md) (enables active `wrangler.toml` `routes`, instant automatic silent SSO with zero `"Sign in with..."` web prompts, universal Google-style account drawer, and 100% pure-English cleanup).
   - **Mail:** [`docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md) (wires the exact same central Google-style `account-menu.js` sheet + 100% pure-English cleanup).
