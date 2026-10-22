# 🔥 GOTHWAD ACCOUNTS (v2.4 — Modular 100% Cloudflare Native + Universal Multi-Account SSO)

**Central Identity, Subdomain Multi-Account Single Sign-On & OAuth 2.0 Hub for the Gothwad Ecosystem** — sign in once to access Mail, Kiwi Store, Kiwi Console, Meet, Drive, Notes, Calendar, and connected apps with instant `< 16ms` multi-account switching and a unified Google-style account menu across every app.

> **⚡ Architecture Highlights (v2.4 — Zero Supabase, Zero Credit Card, 100% Pure English, `<= 500` Lines/File):**
> - **♾️ Unlimited Users ($0 MAU Forever)** — Native Worker WebCrypto `PBKDF2-SHA256` + `HS256` JWT engine
> - **👥 Universal Google-Style Multi-Account Switcher (`a`..`f` + `/u/0..5`)** — Central Shadow-DOM widget (`web/widget/account-menu.js`) shared across `Accounts`, `Mail`, and `Kiwi Store` with **zero client storage tokens**
> - **🚫 Never Sleeps / Zero 7-Day Pause** — Native Cloudflare D1 binding (`1–5ms` SQL) + D1 `BLOB` Edge-Cached Avatars (`0` card required)
> - **🧬 100% Pure Username-Only DB (`Rule #2`)** — Zero email columns anywhere; changing `APP_DOMAIN` is a 1-line config edit
> - **🧩 Strictly Modular & Clean Codebase (`Rule #0` + `Rule #8`)** — 100% pure English across all UI/code/docs and every file strictly `<= 500` lines, enforced automatically by `npm test`!

---

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
