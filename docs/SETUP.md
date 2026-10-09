# 📘 GOTHWAD ACCOUNTS — SETUP GUIDE (Step by Step)

> Audience: beginners. Har step explain kiya gaya hai. Koi paid service nahi —
> sab kuch **free tier** mein fit hoga (Cloudflare + Supabase + Resend).

Total time: ~30–40 minutes.

---

## 🗺️ Overview — Kya ban raha hai?

```
[ Browser: accounts.gothwadtech.com ]     ← web/ (Cloudflare Pages)
              │  fetch /api/auth/*
              ▼
[ Cloudflare Worker: api.gothwadtech.com ] ← cloudflare-worker/ (Auth API)
              │  Supabase calls (service_role key)
              ▼
[ Supabase: Auth + Postgres DB ]          ← supabase/schema.sql
```

Frontend **kabhi** Supabase se directly baat nahi karta — sirf Worker se.
Isliye secret keys safe rehti hain.

---

## STEP 1 — Supabase project banao (Database + Auth) 🗄️

1. **https://supabase.com** kholo → GitHub se **Sign up** karo (free).
2. **"New project"** dabao:
   - Name: `gothwad` (ya jo mann kare)
   - Database Password: koi strong password **kahin likh lo** (baad mein kaam aayega)
   - Region: `Southeast Asia (Singapore)` — India ke liye fastest
3. Project ready hone do (~2 minutes).
4. Left menu → **SQL Editor** → `supabase/schema.sql` ka poora content
   copy-paste karo → **Run** dabao. ✅ Tables + security ready!
5. Left menu → **Settings → API** → yeh 3 cheezein note karo:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **SECRET — kabhi share mat karo!**

6. **Email confirmation OFF karo** (hamara custom email `username@gothwadtech.com`
   abhi mail receive nahi kar sakta — isliye Worker khud email confirm kar deta hai):
   - Left menu → **Authentication → Sign In / Providers → Email**
   - **"Confirm email"** toggle → OFF
   - Save.

---

## STEP 2 — Cloudflare Worker deploy karo (Auth API) ⚡

> Cloudflare account chahiye (free). https://dash.cloudflare.com

### 2a. Wrangler CLI login

```bash
cd cloudflare-worker
npm install
npx wrangler login        # Browser khulega → "Allow" dabao
```

### 2b. Secrets set karo (terminal mein ek-ek karke)

```bash
npx wrangler secret put SUPABASE_ANON_KEY
# ↑ paste karo: Supabase → Settings → API → anon public

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# ↑ paste karo: Supabase → Settings → API → service_role
```

### 2c. wrangler.toml edit karo

`cloudflare-worker/wrangler.toml` mein apne values daalo:

```toml
[vars]
APP_DOMAIN = "gothwadtech.com"          # ← apna domain
AUTH_HUB_URL = "https://accounts.gothwadtech.com"
SUPABASE_URL = "https://abcdxyz.supabase.co"   # ← apna Project URL
```

### 2d. Deploy!

```bash
npx wrangler deploy
```

Output mein worker ka URL dikhega, jaise:
`https://gothwad-auth.YOUR-SUBDOMAIN.workers.dev`

Test karo: us URL mein `/api/health` add karo —
`{ "status": "ok", ... }` dikhna chahiye. ✅

### 2e. Custom domain lagao (api.gothwadtech.com)

Cloudflare Dashboard → **Workers & Pages** → `gothwad-auth` →
**Settings → Domains & Routes** → **Add** → Custom Domain:

```
api.gothwadtech.com
```

(DNS record Cloudflare khud bana deta hai.)

---

## STEP 3 — Frontend deploy karo (Cloudflare Pages) 🌐

1. GitHub par is repo ko push karo (Arena mein: `git push`).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → ye repo select karo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(khaali chhodo)*
   - **Build output directory:** `web`
4. **Save and Deploy**. 🎉
5. Apne domain par lagao: Pages project → **Custom domains** →
   `accounts.gothwadtech.com` add karo.
6. `web/js/config.js` mein Worker ka URL set karo:

```js
API_URL: 'https://api.gothwadtech.com',
```

(Fir se deploy karo — Pages auto-deploy hota hai push par.)

---

## STEP 4 — Password reset emails (Resend) 📧 [Optional abhi]

> Bina Resend ke bhi reset flow chalta hai (DEV_MODE mein link directly
> response mein milta hai). Production ke liye Resend free hai — 3000 emails/month.

1. **https://resend.com** → GitHub se sign up karo.
2. Dashboard → **API Keys** → **Create API Key** → copy karo.
3. Worker mein secret set karo:

```bash
npx wrangler secret put RESEND_API_KEY
```

4. `wrangler.toml` mein:

```toml
DEV_MODE = "false"    # ⚠️ PRODUCTION SAFE MODE — reset link sirf email par jaayega
```

5. (Optional, baad mein) Resend mein apna domain verify karo taaki emails
   `no-reply@gothwadtech.com` se jaayein — `RESEND_FROM` update kar dena.

---

## STEP 5 — Local development (bina deploy ke test) 💻

```bash
# Terminal 1 — API server (with fake Supabase for offline testing)
node tools/mock-supabase.js         # → http://127.0.0.1:8788 (fake Supabase)

cd cloudflare-worker
cp .dev.vars.example .dev.vars      # default mock values theek hain
npx wrangler dev                    # → http://127.0.0.1:8787 (Auth API)

# Terminal 2 — Website
node tools/dev-server.js            # → http://localhost:3000
```

`http://localhost:3000` kholo → signup → dashboard → signout → login →
forgot password — sab test kar sakte ho. 🧪

> ⚠️ `tools/mock-supabase.js` sirf local testing ke liye hai —
> **production mein kabhi deploy mat karna.** Real auth ke liye Step 1-3 karo.

---

## 📋 Environment Variables — Quick Reference

| Variable | Kahan set hota hai | Secret? | Kya karta hai |
|----------|-------------------|---------|---------------|
| `APP_DOMAIN` | wrangler.toml [vars] | ❌ | Email = username@APP_DOMAIN |
| `AUTH_HUB_URL` | wrangler.toml [vars] | ❌ | Password-reset redirect URL |
| `SUPABASE_URL` | wrangler.toml [vars] | ❌ | Supabase project URL |
| `SUPABASE_ANON_KEY` | `wrangler secret put` | ⚠️ semi | Supabase apikey header |
| `SUPABASE_SERVICE_ROLE_KEY` | `wrangler secret put` | ✅ YES | Admin DB/auth operations |
| `RESEND_API_KEY` | `wrangler secret put` | ✅ YES | Reset emails bhejne ke liye |
| `RESEND_FROM` | wrangler.toml [vars] | ❌ | Email "From" address |
| `DEV_MODE` | wrangler.toml [vars] | ❌ | Dev conveniences on/off |
| `ALLOWED_ORIGINS` | wrangler.toml [vars] | ❌ | Extra CORS origins |
| `API_URL` | web/js/config.js | ❌ | Frontend → Worker URL |
| `APP_DOMAIN` (UI) | web/js/config.js | ❌ | Email suffix dikhane ke liye |

---

## ❓ Common Problems (Troubleshooting)

**"Cannot reach the Gothwad API"**
→ `web/js/config.js` mein `API_URL` check karo, aur Worker live hai ya nahi.

**Signup par "Could not create account"**
→ Supabase → Authentication → Providers → Email → "Confirm email" OFF hai na?
→ `SUPABASE_SERVICE_ROLE_KEY` sahi daala?

**Login ke baad dashboard par "redirect loop"**
→ `AUTH_HUB_URL` aur Pages ka actual URL match karte hain?
→ Browser console mein error check karo.

**Username check hamesha "taken" ya "available"**
→ Schema sahi run hua? (Supabase → Table Editor → `profiles` table dikhni chahiye)

**CORS error in console**
→ Worker ka `ALLOWED_ORIGINS` mein frontend origin add karo
   (local dev ke liye `http://localhost:3000`).

---

## ✅ Launch Checklist (LIVE jaane se pehle)

- [ ] Supabase schema.sql run ho gaya (tables + RLS visible)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` sirf Worker secrets mein hai (Git mein NAHI)
- [ ] Supabase → Email confirmation OFF (jab tak custom mail live nahi)
- [ ] Worker `/api/health` OK dikhata hai
- [ ] Signup → auto login → dashboard ka flow test kiya
- [ ] Password reset (recovery email) test kiya
- [ ] `DEV_MODE = "false"` kar diya (production)
- [ ] `web/js/config.js` mein production `API_URL` set hai

---

Made with 🔥 by Gothwad Tech. Questions? ROADMAP.md padho — poora vision wahan hai!
