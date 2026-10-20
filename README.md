# 🔥 GOTHWAD ACCOUNTS (v2.0 — 100% Cloudflare Native)

**Central Identity, SSO & OAuth 2.0 Hub for the Gothwad Ecosystem** — ek hi account se Mail, Kiwi Store, Meet, Drive, Chat, Notes, Calendar sab mein sign-in. *(Google Account jaisa, 100% Gothwad!)*

> **⚡ Architecture Upgrade (v2.0 — Zero Supabase!):**
> Gothwad Accounts ab **100% Cloudflare Native (`Pages` + `Workers` + `Cloudflare D1 SQLite` + `Global Edge Cache` + optional `R2`)** par chalta hai:
> - **♾️ Unlimited Users ($0 MAU Forever)** — WebCrypto `PBKDF2-SHA256` + `HS256` JWT engine
> - **🚫 Never Sleeps / Zero 7-Day Pause** — Native Cloudflare D1 binding (`1–5ms` SQL)
> - **🧬 100% Pure Username-Only DB (`Rule #2`)** — Zero email columns anywhere; domain change (`gothwad.in`) = 1-line config edit!
> - **🖼️ Built-in Edge-Cached Avatars** — Works out of the box on free D1 (`0` card required) + drop-in R2 ready!

---

## 📚 Documentation Map

| File | Audience | Kya Milega |
|------|----------|------------|
| **[docs/SETUP.md](docs/SETUP.md)** | 👤 Founder / Beginners | **Step-by-Step Cloudflare Dashboard Deploy Guide** (Phone/Browser se 10 min mein live!) |
| **[docs/CLOUDFLARE_NATIVE_PLAN.md](docs/CLOUDFLARE_NATIVE_PLAN.md)** | 🧭 Master Plan | Full Cloudflare Native architecture (`Accounts` ✅ + `Mail`, `Store`, `GrixChat` D1 blueprint) |
| **[AGENTS.md](AGENTS.md)** | 🤖 AI Agents | Working rules, design constraints, test commands (**Read First!**) |
| **[TASK.md](TASK.md)** | 📋 Everyone | Live status board + session-by-session work history |
| **[docs/OAUTH.md](docs/OAUTH.md)** | 🧩 App Developers | `"Sign in with Gothwad"` OAuth 2.0 + S256 PKCE integration guide |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | 🏗️ Tech Deep Dive | Crypto primitives, `session` vs `oauth_access` JWTs, D1 schema & avatars |

---

## 🚀 Quick Start (1 Command — Zero External Services!)

```bash
npm install
npm start
# → Opens http://localhost:3000 (/signin · /signup · /me + real local SQLite D1!)
```

Run the full automated security & end-to-end test suite (**62 tests**):

```bash
npm test
```

Verify strict TypeScript & Cloudflare Worker production bundle:

```bash
cd cloudflare-worker
npx tsc --noEmit
npx wrangler deploy --dry-run
```

---

## 🛡️ Hard Security & Design Rules

1. **Domain-Agnostic (`Rule #1`):** Never hardcode domains in code — use `APP_DOMAIN` (`wrangler.toml` & `web/js/config.js`).
2. **100% Pure Username DB (`Rule #2`):** `users` & `profiles` store **only `username`** — `email = username@APP_DOMAIN` is always computed at the API layer.
3. **Secrets Stay in Worker Only (`Rule #3`):** Only `JWT_SECRET`, `MAIL_INTERNAL_TOKEN`, and optional `RESEND_API_KEY` live as Cloudflare Worker Secrets — never in frontend or Git.
4. **3 Routes Only:** `/signin` · `/signup` · `/me` (OAuth consent screen renders directly inside the Worker).

© 2026 Gothwad Tech · Built with 🔥
