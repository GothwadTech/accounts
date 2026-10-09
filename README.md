# 🔥 GOTHWAD ACCOUNTS

**Central auth system for the Gothwad ecosystem** — ek hi account se Mail, Drive,
Chat, Notes, Calendar sab mein sign-in. (Google Account jaisa, but Gothwad!)

> Status: **Step 1 ✅ + Step 2 ✅** — real auth (Supabase), JWT sessions, remember-me,
> password reset, device management, dark UI + **OAuth 2.0 provider**
> ("Sign in with Gothwad" — authorization/token/userinfo endpoints, PKCE, scopes).
> Next: Step 3 = Gothwad Mail.

---

## 📚 Documentation Map (naye log/AI ke liye)

| File | Kiske liye | Kya milega |
|------|-----------|------------|
| **[AGENTS.md](AGENTS.md)** | 🤖 AI agents | Working guide — rules, style, commands, workflow. **PEHLE YEH PADHO** |
| **[TASK.md](TASK.md)** | 🤖 Everyone | Live status board + poora kaam ka itihaas (work log) |
| **[PLAN.md](PLAN.md)** | 🤖 Everyone | Master plan — Steps 3-6 + infrastructure decisions |
| **[docs/SETUP.md](docs/SETUP.md)** | 👤 Humans | Step-by-step deploy (Supabase → Worker → Pages) |
| **[docs/OAUTH.md](docs/OAUTH.md)** | 👤 App developers | "Sign in with Gothwad" integration guide |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | 🤖 Tech | Flows, cookies, JWT, schema, endpoints |
| **[ROADMAP.md](ROADMAP.md)** | 📖 Historical | User ka original vision doc |

---

## 📁 Project Structure

```
accounts/
├── web/                     🌐 Frontend (HTML/CSS/JS — no build step!)
│   ├── signin/              /signin   — Login + forgot/reset password
│   ├── signup/              /signup   — Create account (live username check)
│   ├── me/                  /me       — Account dashboard (profile, security, devices, apps)
│   ├── index.html           Root → smart redirect (/me ya /signin)
│   ├── css/styles.css       Dark theme design system (brand blue #2f80ed)
│   └── js/                  config.js (THE 1 file to edit), api.js, common.js + page scripts
│
├── cloudflare-worker/       ⚡ Auth + OAuth API (Cloudflare Worker)
│   ├── src/index.ts         /api/auth/* + /oauth/* routes (well commented)
│   ├── wrangler.toml        Config + env vars (APP_DOMAIN yahan badlo)
│   └── .dev.vars.example    Local development secrets template
│
├── supabase/schema.sql      🗄️ Database schema + RLS (copy-paste in Supabase)
│
├── tools/                   🛠️ Local dev helpers (never deploy!)
│   ├── dev-server.js        Static server + /api + /oauth proxy (pretty URLs)
│   └── mock-supabase.js     Fake Supabase for offline testing only
│
├── docs/
│   ├── SETUP.md             📘 STEP-BY-STEP setup guide (start here!)
│   └── OAUTH.md             🔐 OAuth 2.0 provider integration guide
├── ROADMAP.md               🗺️ Poora ecosystem vision & architecture
└── .env.example             📋 All environment variables listed
```

> **Site ke sirf 3 routes hain:** `/signin` · `/signup` · `/me`
> (OAuth consent screen Worker khud render karta hai — extra page nahi.)

---

## 🚀 Quick Start (Local Dev)

```bash
# 1. Worker start karo (Terminal 1)
cd cloudflare-worker
cp .dev.vars.example .dev.vars   # apni Supabase keys daalo (ya mock chalne do)
npm install
npx wrangler dev                 # → http://127.0.0.1:8787

# 2. Frontend start karo (Terminal 2)
node tools/dev-server.js         # → http://localhost:3000
```

Browser mein `http://localhost:3000` kholo — `/signin`, `/signup`, `/me` sab chalega!

> **Full setup (Supabase + Cloudflare deploy):** [docs/SETUP.md](docs/SETUP.md)
> **Apps ko connect karna:** [docs/OAUTH.md](docs/OAUTH.md)

---

## 🧭 Roadmap

| Step | Kya hai | Status |
|------|---------|--------|
| **1** | Gothwad Accounts (signup, login, sessions, reset) | ✅ Done |
| **2** | OAuth 2.0 provider ("Sign in with Gothwad") | ✅ Done |
| **3** | Gothwad Mail (Cloudflare Email Routing + Resend) | 🔜 Next |
| **4** | Cross-app SSO (ClashDrive, GrixChat connect) | 📋 Planned |

Full architecture & vision: [ROADMAP.md](ROADMAP.md)

---

## 🛡️ Security Rules (hamesha yaad rakho)

1. **Domain hardcode mat karo** — `APP_DOMAIN` env var use karo (Rule #1)
2. **DB mein sirf username** — email = `username@APP_DOMAIN` calculate hota hai (Rule #2)
3. `SUPABASE_SERVICE_ROLE_KEY` = sirf Worker (secret) — frontend mein kabhi nahi
4. Har Supabase table par **RLS ON** (schema.sql already does this)

© 2026 Gothwad Tech · Built with 🔥
