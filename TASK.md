# ✅ TASK.md — Live Status & Task Board

> **⚠️ MANDATORY RULES FOR EVERY AI SESSION:**
> 1. Always update this file (`✅ DONE` + `🔜 NEXT UP`) cleanly **before** finishing work.
> 2. **🚨 RULE #0 (100% PURE ENGLISH ONLY):** Every UI string, button, modal, error message, code comment, SQL comment, test, and Markdown file across the entire repository MUST be in **100% pure, idiomatic English** (zero Hindi / Hinglish anywhere — enforced automatically by `npm test`!).
> 3. **🚨 RULE #8 (STRICT `<= 500` LINES PER FILE):** Keep every file (`TS`, `JS`, `HTML`, `CSS`, `SQL`, `Test`, `MD`) **`<= 500` lines** (enforced automatically by `npm test`!). Archive older completed session logs into **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.
>
> Engineering guide: [`AGENTS.md`](AGENTS.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Session archive (`1–30`): [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)

**Last updated:** 2026-10-24 (Session 39 — Pull request preparation)

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

**Current state in one line:** Startup fixes and the Universal Account Menu redesign are prepared on this branch, not deployed. **105/105 tests pass.** An interactive, synthetic-data preview runs via `npm run preview:menu` for design approval.

---

## ✅ DONE (Newest First — Sessions 31 to 39)

### Session 39 — 2026-10-24 — Pull Request Preparation
- User requested a pull request for all changes on `arena/d34d0d2c-accounts`.
- Reverified `npm run build`, **105/105 tests**, and `git diff --check` before committing and pushing this branch.
- PR scope includes startup fixes, Universal Account Menu redesign and local preview, regression tests, and Mail / Store / Drive audit and implementation prompts.
- This operation opens the changes for review only; no merge or production deployment is requested.


### Session 38 — 2026-10-24 — Universal Account Menu Redesign and Live Preview
- Established the shared component name: **Universal Account Menu** (also Account Switcher), source `web/widget/`.
- Changed dark surface to `#212121` and neutral account cards; every account uses the same row/avatar size with rounded first/last corners and no collapse or avatar-edit controls.
- Added the aligned Gothwad Accounts heading; replaced the Google mark with the existing Gothwad logo.
- Removed Manage accounts; moved Add another account into a standalone pill matching Manage your Gothwad Account.
- Kept per-slot sign-out as sibling icon buttons (no nested interactive elements), all-account sign-out, badges, extra actions, and existing callback contracts.
- Added a local-only interactive preview using the real widget, synthetic 1/3/6-account fixtures, themes, and host-app controls. Start with `npm run preview:menu` (port 3010).
- Verified `npm run build`, **105/105 tests**, and real Chromium interaction/layout checks: equal 68px rows, switching, sign-out, add account, themes, Escape, and 390px mobile viewport without horizontal overflow.
- No production deployment or merge: await the user's design review.


### Session 37 — 2026-10-24 — App Startup Prompts and Drive Audit
- Created independent ready-to-copy prompts for Mail, Store / Console / Admin, and Drive, with fresh-code audit, security, account isolation, failure-path tests, and deployment requirements.
- Rechecked main commits: Mail `84aeab0`, Store `a0ed0ba`, Drive `1e8c397`. These repositories were audited read-only; no remote app source changes or deployments were made.
- Drive locally passes 9 tests and a build; lint exits 0 with 33 warnings. Build warns about browser-externalized crypto and a large main bundle.
- Reproduced Drive frontend misclassification: identity 503 becomes signed-out; vault 503 or HTML becomes missing vault. Documented sequential boot, unbounded operations, migration/save, sign-out deletion, and identity-scoping concerns.
- Corrected earlier operational advice: current Drive source reads `DRIVE_ENCRYPTION_KEY`, not `VAULT_MASTER_KEY`. Missing Worker GitHub checks do not prove an absent Worker; production signed-in checks remain unverified.
- Audit: [`docs/DRIVE_STARTUP_AUDIT.md`](docs/DRIVE_STARTUP_AUDIT.md). Prompts: [`Mail`](docs/MAIL_STARTUP_PERFORMANCE_PROMPT.md), [`Store`](docs/STORE_STARTUP_PERFORMANCE_PROMPT.md), [`Drive`](docs/DRIVE_STARTUP_REPAIR_PROMPT.md).


### Session 36 — 2026-10-24 — Session Startup and False Sign-in Redirect Fix
- Removed the root 1.2-second false-anonymous timer; Pages and local dev open the dashboard shell directly.
- Added early memory-only session discovery with single-flight sharing and selector isolation.
- Reused one browser inspection in `/auth/me`, validated slots concurrently in stable order, and joined live user/session validation reads.
- Removed redundant browser refresh after `/auth/me` 401; network/server failures preserve the dashboard retry state.
- Marked auth responses `no-store`; added client and real-SQLite startup regression tests.
- Read-only Mail / Store audit found additional application-specific loading gates; see [`docs/SESSION_STARTUP_PERFORMANCE.md`](docs/SESSION_STARTUP_PERFORMANCE.md) and [`HANDOVER.md`](HANDOVER.md).
- Verified: `npm run build`, `npm test` (**98/98 passing**), strict Worker TypeScript checks, Wrangler deployment dry-run, and `git diff --check`.
- Deployment remains pending: both Pages and Worker must deploy. Production latency has not been measured.


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

0. Review the live Universal Account Menu preview and wait for design approval before deploying the redesign.
1. Review and deploy the session-startup fix to Accounts Pages and Worker.
2. Verify existing login, signed-out, expired-token, revoked-session, multi-tab, and throttled-network flows in production; compare browser Network timings before making speed claims.
3. Address Mail's optional quota/unread bootstrap work and Store's catalog/library/developer/admin loading gates in their own repositories. The central widget cannot change those app-specific gates.
4. Existing migration and widget-integration prompts remain in `docs/` for reference; audit live code before applying them again.
