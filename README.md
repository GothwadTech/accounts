# 🔥 GOTHWAD ACCOUNTS (v2.2 — Modular 100% Cloudflare Native + Multi-Account SSO)

**Central Identity, Multi-Account Subdomain SSO & OAuth 2.0 Hub for the Gothwad Ecosystem** — ek hi account se Mail, Kiwi Store, Meet, Drive, Chat, Notes, Calendar sab mein instant sign-in & 1-click account switching! *(Google Account jaisa, 100% Gothwad!)*

> **⚡ Architecture Highlights (v2.2 — Zero Supabase, 100% Modular `<= 500` Lines/File!):**
> - **♾️ Unlimited Users ($0 MAU Forever)** — Native Worker WebCrypto `PBKDF2-SHA256` + `HS256` JWT engine
> - **👥 Google-Style Multi-Account Sessions (`a`..`f`)** — Stay signed into up to 6 Gothwad accounts simultaneously across `.gothwadtech.com` with **zero client storage tokens**
> - **🚫 Never Sleeps / Zero 7-Day Pause** — Native Cloudflare D1 binding (`1–5ms` SQL)
> - **🧬 100% Pure Username-Only DB (`Rule #2`)** — Zero email columns anywhere; domain change (`gothwad.in`) = 1-line config edit
> - **🧩 Strictly Modular Codebase (`Rule #8`)** — Every Worker TS file, CSS module, HTML page, JS module, SQL file, and test is strictly `<= 500` lines and verified automatically on every `npm test`!

---

## 📚 Documentation Map

| File | Audience | Kya Milega |
|------|----------|------------|
| **[AGENTS.md](AGENTS.md)** | 🤖 AI Agents | **Mandatory 8 Hard Rules (including `Rule #8: <= 500 lines/file`)** & commands (**Read First!**) |
| **[TASK.md](TASK.md)** | 📋 Everyone | Live status board + recent session summary (older sessions archived in **[docs/TASK_HISTORY.md](docs/TASK_HISTORY.md)**) |
| **[docs/SETUP.md](docs/SETUP.md)** | 👤 Founder / Beginners | Step-by-Step Cloudflare Dashboard Deploy Guide |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | 🏗️ Tech Deep Dive | Full Worker module map, crypto primitives, multi-account cookies & D1 schema |
| **[docs/MAIL_INTERNAL.md](docs/MAIL_INTERNAL.md)** | 📧 Mail Integration | `.gothwadtech.com` cookie contract + `/api/internal/usernames/:username` |
| **[docs/OAUTH.md](docs/OAUTH.md)** | 🧩 App Developers | `"Sign in with Gothwad"` OAuth 2.0 + S256 PKCE integration guide |
| **[docs/CLOUDFLARE_NATIVE_PLAN.md](docs/CLOUDFLARE_NATIVE_PLAN.md)** | 🧭 Master Plan | Hybrid ecosystem architecture (`Accounts` & `Mail` on Cloudflare D1) |

---

## 🚀 Quick Start & Full Verification

```bash
npm install
npm run build                                                    # Verify all 15 modular CSS stylesheets (`<= 500` lines each)
npm test                                                         # Run all 73 security, E2E, ESM-link & file-size ceiling tests
npm start                                                        # Start UI + Worker + real local SQLite D1 on http://localhost:3000
```

Verify strict TypeScript & Cloudflare Worker production bundle:

```bash
cd cloudflare-worker
npx --yes --package=typescript tsc --noEmit
npx wrangler deploy --dry-run
```

---

## 🛡️ Hard Engineering Rules

1. **Domain-Agnostic (`Rule #1`):** Never hardcode domains in runtime code — read `APP_DOMAIN` from config/env.
2. **100% Pure Username DB (`Rule #2`):** `users` & `profiles` store **only `username`** — `email = username@APP_DOMAIN` is always computed dynamically.
3. **Zero Secrets or Tokens in Frontend (`Rule #3`):** Secrets live only in Cloudflare Worker Secrets; sessions live only in `HttpOnly` `.APP_DOMAIN` cookies.
4. **Modular File Size Ceiling (`Rule #8`):** Keep **every file `<= 500` lines** (`500–800` max hard limit). Whenever any file exceeds this size, split it into cohesive modules with **100% identical behavior and zero broken functionality** — verified automatically by `npm test`.

© 2026 Gothwad Tech · Built with 🔥
