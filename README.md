# 🔥 GOTHWAD ACCOUNTS (v2.4 — Modular 100% Cloudflare Native + Universal Multi-Account SSO)

**Central Identity, Subdomain Multi-Account Single Sign-On & OAuth 2.0 Hub for the Gothwad Ecosystem** — sign in once to access Mail, Kiwi Store, Kiwi Console, Meet, Drive, Notes, Calendar, and connected apps with instant `< 16ms` multi-account switching and a unified Google-style account menu across every app.

> **⚡ Architecture Highlights (v2.4 — Zero Supabase, Zero Credit Card, 100% Pure English, `<= 500` Lines/File):**
> - **♾️ Unlimited Users ($0 MAU Forever)** — Native Worker WebCrypto `PBKDF2-SHA256` + `HS256` JWT engine
> - **👥 Universal Google-Style Multi-Account Switcher (`a`..`f` + `/u/0..5`)** — Central Shadow-DOM widget (`web/widget/account-menu.js`) shared across `Accounts`, `Mail`, and `Kiwi Store` with **zero client storage tokens**
> - **🚫 Never Sleeps / Zero 7-Day Pause** — Native Cloudflare D1 binding (`1–5ms` SQL) + D1 `BLOB` Edge-Cached Avatars (`0` card required)
> - **🧬 100% Pure Username-Only DB (`Rule #2`)** — Zero email columns anywhere; changing `APP_DOMAIN` is a 1-line config edit
> - **🧩 Strictly Modular & Clean Codebase (`Rule #0` + `Rule #8`)** — 100% pure English across all UI/code/docs and every file strictly `<= 500` lines, enforced automatically by `npm test`!

---

## Security status — 2026-10-29

All planned security **coding** phases are implemented locally: abuse controls,
verified recovery, authenticator MFA/recovery codes, optional passkeys, exact
origin/proxy policy, cookie-only browser responses, and durable OAuth revocation.
The release gate covers **194 tests**, build/types/bundle/audits, plus separate
actual local Worker and Chromium checks and a synthetic restore rehearsal.

**Nothing has been deployed or configured in production.** Real email delivery,
backup restoration, deployed consumer compatibility/re-consent, live security
headers, quotas, and physical/mobile passkeys still need controlled verification.
Shared parent-domain SSO cookies are preserved; host-only isolation is not claimed.
This is not certification, a penetration test, or Google equivalence.

Start with [release readiness](docs/SECURITY_RELEASE_READINESS.md) and the single
[final owner checklist](docs/SECURITY_OWNER_CHECKLIST.md). Technical details:
[A–F findings](docs/ACCOUNTS_SECURITY_HARDENING.md), [MFA](docs/AUTHENTICATOR_MFA.md),
[passkeys](docs/PASSKEYS.md), [SSO/OAuth](docs/SSO_TRUST_AND_OAUTH.md).
Free-tier operation remains subject to provider quotas; no paid service is enabled.

## 📚 Documentation Map

| File | Audience | Contents |
|------|----------|----------|
| **[AGENTS.md](AGENTS.md)** | 🤖 AI Agents | **Mandatory 9 Architectural Rules (`Rule #0: Pure English` & `Rule #8: <= 500 lines/file`)** (**Read First!**) |
| **[TASK.md](TASK.md)** | 📋 Everyone | Live status board + recent session changelog (historical logs archived in **[docs/TASK_HISTORY.md](docs/TASK_HISTORY.md)**) |
| **[docs/SETUP.md](docs/SETUP.md)** | 👤 Maintainers | Step-by-Step Cloudflare Dashboard & D1 Setup Guide |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | 🏗️ Engineers | Worker module map, WebCrypto primitives, multi-account cookies & D1 schema |
| **[docs/MAIL_INTERNAL.md](docs/MAIL_INTERNAL.md)** | 📧 Mail Integration | `.gothwadtech.com` cookie contract + `/api/internal/usernames/:username` |
| **[docs/OAUTH.md](docs/OAUTH.md)** | 🧩 App Developers | `"Sign in with Gothwad"` OAuth 2.0 + S256 PKCE integration guide |
| **[docs/CLOUDFLARE_NATIVE_PLAN.md](docs/CLOUDFLARE_NATIVE_PLAN.md)** | 🧭 Ecosystem Plan | Cloudflare Workers + D1 ecosystem architecture |

---

## 🚀 Quick Start & Full Verification

```bash
npm install
npm run build                                                    # Verify all modular CSS stylesheets (`<= 500` lines each)
npm test                                                         # Run all 80+ security, E2E, widget, English & file-size tests
npm start                                                        # Start UI + Worker + real local SQLite D1 on http://localhost:3000
```

Verify strict TypeScript & Cloudflare Worker production bundle:

```bash
cd cloudflare-worker
npx --yes --package=typescript tsc --noEmit
npx wrangler deploy --dry-run
```

---

## 🛡️ Core Engineering Rules

0. **100% Pure English Everywhere (`Rule #0`):** Zero Hindi / Hinglish in any UI screen, dialog, error message, comment, or document.
1. **Domain-Agnostic (`Rule #1`):** Never hardcode domains in runtime code — read `APP_DOMAIN` strictly from config/env.
2. **100% Pure Username DB (`Rule #2`):** `users` & `profiles` store **only `username`** — `email = username@APP_DOMAIN` is computed dynamically.
3. **Zero Secrets or Tokens in Frontend (`Rule #3`):** Secrets live solely in Cloudflare Worker Secrets; web sessions live solely in `HttpOnly` `.APP_DOMAIN` cookies.
4. **Modular File Size Ceiling (`Rule #8`):** Every file stays strictly **`<= 500` lines**, verified automatically by `npm test`.

© 2026 Gothwad Tech

## Session startup performance

The homepage opens the dashboard shell directly; only a confirmed anonymous
session redirects to Sign in. Identity discovery starts independently of the
larger dashboard module tree, and `/api/auth/me` validates browser accounts once
per request with concurrent slot checks and live D1 revocation checks.

See [Session startup performance](docs/SESSION_STARTUP_PERFORMANCE.md) for the
root cause, regression coverage, deployment requirements, and remaining Mail /
Store loading gates. These changes require both Pages and Worker deployment.


Standalone follow-up implementation prompts:
[Mail startup](docs/MAIL_STARTUP_PERFORMANCE_PROMPT.md),
[Store / Console startup](docs/STORE_STARTUP_PERFORMANCE_PROMPT.md), and
[Drive repair](docs/DRIVE_STARTUP_REPAIR_PROMPT.md).
The [Drive audit](docs/DRIVE_STARTUP_AUDIT.md) distinguishes reproduced local
failures from production checks that remain unverified.


## Universal Account Menu

Use **Universal Account Menu** (or **Account Switcher**) to refer to the shared
profile popup shown across apps. Its source is `web/widget/`.

To review its design without signing in or touching real accounts:

```sh
npm run preview:menu
```

Open the live preview on port 3010. It uses the actual widget with synthetic
accounts, light/dark appearance, and 1/3/6-account controls. Close the menu to
change preview controls. Preview files live in `tools/widget-preview/`, outside
the production `web/` deployment. Review and approve before deploying changes.

### Local Worker MFA smoke test

After installing Worker dependencies, start a configured **local-only** Worker on
port 3012 and run `npm run test:mfa:worker`. It creates synthetic local accounts
and refuses remote targets. See the MFA document for test scope and limitations.
Production configuration requires the final combined owner checklist and separate approval.
