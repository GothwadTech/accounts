# 🔥 GOTHWAD ACCOUNTS

**Central auth system for the Gothwad ecosystem** — ek hi account se Mail, Drive,
Chat, Notes, Calendar sab mein sign-in. (Google Account jaisa, but Gothwad!)

> Status: **Step 1 ✅ + Step 2 ✅** — real auth (Supabase), JWT sessions, remember-me,
> password reset, device management, dark UI + **OAuth 2.0 provider**
> ("Sign in with Gothwad" — authorization/token/userinfo endpoints, PKCE, scopes).
> Next: Step 3 = Gothwad Mail.

---

## 📁 Project Structure

```
accounts/
├── web/                     🌐 Frontend (HTML/CSS/JS — no build step!)
│   ├── index.html           Landing page
│   ├── login.html           Sign in
│   ├── signup.html          Create account (live username check)
│   ├── dashboard.html       Profile, security, devices, apps
│   ├── reset-password.html  Forgot / reset password
│   ├── css/styles.css       Dark theme design system (accent #e94560)
│   └── js/                  config.js (THE 1 file to edit), api.js, common.js
│
├── cloudflare-worker/       ⚡ Auth API (Cloudflare Worker)
│   ├── src/index.ts         All /api/auth/* routes (well commented)
│   ├── wrangler.toml        Config + env vars (APP_DOMAIN yahan badlo)
│   └── .dev.vars.example    Local development secrets template
│
├── supabase/schema.sql      🗄️ Database schema + RLS (copy-paste in Supabase)
│
├── examples/
│   └── sign-in-with-gothwad/ 🔘 Drop-in OAuth client template (GrixChat ke liye!)
│
├── tools/                   🛠️ Local dev helpers (never deploy!)
│   ├── dev-server.js        Static server + /api + /oauth proxy for local dev
│   └── mock-supabase.js     Fake Supabase for offline testing only
│
├── docs/
│   ├── SETUP.md             📘 STEP-BY-STEP setup guide (start here!)
│   └── OAUTH.md             🔐 OAuth 2.0 provider integration guide
├── legacy-react-demo/       📦 Old placeholder demo (kept for reference)
└── .env.example             📋 All environment variables listed
```

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

Browser mein `http://localhost:3000` kholo — signup/login/dashboard sab chalega!

**OAuth demo try karo:** `http://localhost:3000/examples/sign-in-with-gothwad/`
— "Sign in with Gothwad" button → consent screen → app login. 🎉

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
