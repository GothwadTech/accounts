# 📘 GOTHWAD ACCOUNTS — SETUP GUIDE (Step by Step)

> Audience: beginners. Har step explain kiya gaya hai. Koi paid service nahi —
> sab kuch **free tier** mein fit hoga (Cloudflare + Supabase + Resend).
>
> 📱 **Phone / dashboard-only?** Is guide ke steps **Cloudflare Dashboard + Supabase
> Dashboard + GitHub web** se hote hain — koi terminal / `wrangler` CLI zaroori nahi.
> CLI wale steps sirf "Alternative" mein diye hain.

Total time: ~30–40 minutes.

---

## 🗺️ Overview — Kya ban raha hai?

```
[ Browser: accounts.gothwadtech.com ]
      │
      ├── /            /signin  /signup  /me   → web/ (Cloudflare Pages, static)
      │
      └── /api/*       → Cloudflare Worker "accounts"  (Worker ROUTE, same origin)
                              │  Supabase calls (service_role key)
                              ▼
                     [ Supabase: Auth + Postgres DB ]   ← supabase/schema.sql
```

- **Frontend + API ek hi domain** (`accounts.gothwadtech.com`) par hain.
  Isliye browser ko CORS ki problem nahi aati aur cookies first-party rehti hain.
- Frontend **kabhi** Supabase se directly baat nahi karta — sirf Worker se.
  Isliye secret keys safe rehti hain.

---

## STEP 1 — Supabase project banao (Database + Auth) 🗄️ ✅ (DONE)

1. **https://supabase.com** kholo → GitHub se **Sign up** karo (free).
2. **"New project"** dabao:
   - Name: `gothwad` (ya jo mann kare)
   - Database Password: koi strong password **kahin likh lo** (baad mein kaam aayega)
   - Region: `Southeast Asia (Singapore)` — India ke liye fastest
3. Project ready hone do (~2 minutes).
4. Left menu → **SQL Editor** → `supabase/schema.sql` ka poora content
   copy-paste karo → **Run** dabao. ✅ Tables + security ready!
5. Left menu → **Settings → API** → yeh 3 cheezein note karo:
   - `Project URL` → `SUPABASE_URL` (jaise `https://abcdxyz.supabase.co`)
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
>
> ⚠️ **Worker ka naam `accounts` hona chahiye** — `cloudflare-worker/wrangler.toml`
> mein bhi `name = "accounts"` hai. Naam alag hua to Git-deploy (2B) fail hoga.

### 2A. Worker project check karo

Dashboard → **Workers & Pages** → **`accounts`** (already bana hua hai — delete/rename
mat karna). Yeh hi Worker hai jispar deploy hoga.

### 2B. Git se auto-deploy connect karo (Workers Builds) 🔁

Dashboard → **Workers & Pages** → **`accounts`** → **Settings** → **Builds** →
**Connect** → GitHub → repository **`GothwadTech/accounts`** select karo. Phir:

| Field | Value |
|-------|-------|
| **Root directory** | `cloudflare-worker` |
| **Build command** | *(khaali chhodo)* |
| **Deploy command** | `npx wrangler deploy` |

→ **Save** / **Deploy** dabao. Ab har push par Worker apne-aap deploy hoga. ✅

### 2C. Secrets dashboard se daalo (Variables and Secrets) 🔐

Dashboard → **Workers & Pages** → **`accounts`** → **Settings** →
**Variables and Secrets** → **Add**. Har ek ko **Type: Secret** choose karo:

| Name | Value kahan se | Type |
|------|----------------|------|
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** | **Secret** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → **API Keys** → **New secret key** (`sb_secret_...`) | **Secret** ⚠️ |
| `JWT_SECRET` | Koi lambi random string (40+ characters) — password manager ka generator use karo | **Secret** |

> 🔑 **`SUPABASE_SERVICE_ROLE_KEY` — naya format:** Supabase ab **"secret keys"**
> (`sb_secret_...`) deta hai (Settings → API Keys → New secret key). **Yahi naya
> format use karo** — purani `eyJ...` wali legacy `service_role` key purane
> projects mein hi chalti hai. Naya `sb_secret_` key Worker mein sirf `apikey`
> header mein jaati hai (code iske hisaab se bana hai). Agar purani `eyJ` key daal
> di to dono headers bheji jaati hain — dono chalti hain.

> 💡 `SUPABASE_URL`, `APP_DOMAIN`, `AUTH_HUB_URL`, `DEV_MODE` **public** values hain —
> ye `wrangler.toml` ke `[vars]` mein already hain (Text). Inhe dashboard mein
> Text ki tarah rehne do.
>
> ⚠️ Agar koi key pehle **Text** type mein daali thi (galti se), to usko **delete**
> karke **Secret** type se dobara add karo.

### 2D. Worker ROUTE lagao (API ko `/api/*` par) 🛣️ — RECOMMENDED

Dashboard → **Workers & Pages** → **`accounts`** → **Settings** →
**Domains & Routes** → **Add** → **Route**:

```
accounts.gothwadtech.com/api/*
```

- Zone: `gothwadtech.com` (Cloudflare par yeh domain hona chahiye)
- Ab `accounts.gothwadtech.com/api/...` requests Worker par jaati hain.
- Pages wala frontend (`/signin`, `/me`...) same domain par chalta rehta hai.
- `web/js/config.js` mein `API_URL: ''` hi rehne do — **config badalne ki zaroorat NAHI.**

> ✅ Is route ke saath OAuth endpoints ka base URL = `https://accounts.gothwadtech.com/api`
> hota hai (Step 6 dekho).

#### Alternative: alag API domain (`api.gothwadtech.com`)

Agar API ko alag subdomain par chahiye:
Domains & Routes → **Add** → **Custom Domain** → `api.gothwadtech.com`.
Phir `web/js/config.js` mein `API_URL: 'https://api.gothwadtech.com'` set karo
(aur Step 6 ka OAuth base URL = `https://api.gothwadtech.com`).

### 2E. Deploy + test ✅

- Pehle Git push / Workers Builds ka deploy complete hone do (Deployments tab mein green ✅).
- Browser mein kholo: `https://accounts.gothwadtech.com/api/health`
  → `{ "status": "ok", ... }` dikhna chahiye.
  (Route abhi nahi lagaya to `https://accounts.<tumhara-subdomain>.workers.dev/api/health`
  bhi try kar sakte ho — workers.dev URL Worker ke page par dikhta hai.)

> **Alternative (laptop terminal ho to):** `cd cloudflare-worker && npx wrangler login`
> → `npx wrangler secret put SUPABASE_ANON_KEY` → `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
> → `npx wrangler secret put JWT_SECRET` → `npx wrangler deploy`.

---

## STEP 3 — Frontend deploy karo (Cloudflare Pages) 🌐

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → repo `GothwadTech/accounts` select karo.
2. **Build settings** (⚠️ yeh exact rakho):
   - **Framework preset:** **None** ← (Cloudflare "Vite" auto-detect kare to badal do!)
   - **Build command:** *(khaali chhodo — koi `npm run build` NAHI)*
   - **Build output directory:** `web`
3. **Save and Deploy** 🎉
4. Apne domain par lagao: Pages project → **Custom domains** →
   `accounts.gothwadtech.com` add karo.
5. `web/js/config.js` mein `API_URL: ''` hi rehne do (same-origin route ke saath). ✅

### 🔧 Pages build fail ho raha hai? (Framework "Vite" + `npm run build`)

Error aata hai jaise: `Missing script: "build"` / Vite build fail.
Reason: Cloudflare ne repo ko Vite project samajh liya. Is repo mein **build step nahi
hai** (sirf static HTML/CSS/JS hai).

Fix (dashboard se):
1. Pages project → **Settings** → **Build & deployments** → **Build configuration**
2. **Framework preset** → **None**
3. **Build command** → **khaali** (delete karo jo bhi likha ho)
4. **Build output directory** → `web`
5. **Save** → **Deployments** tab → latest deployment par **Retry deployment**.

---

## STEP 4 — Password reset emails (Resend) 📧 [Optional abhi]

> Bina Resend ke bhi reset flow chalta hai (DEV_MODE mein link directly
> response mein milta hai). Production ke liye Resend free hai — 3000 emails/month.

1. **https://resend.com** → GitHub se sign up karo.
2. Dashboard → **API Keys** → **Create API Key** → copy karo.
3. Cloudflare → Worker **`accounts`** → **Settings** → **Variables and Secrets** →
   **Add** → Name `RESEND_API_KEY`, Type **Secret**, value paste karo.
4. `wrangler.toml` (ya dashboard Variables) mein:

```toml
DEV_MODE = "false"    # ⚠️ PRODUCTION SAFE MODE — reset link sirf email par jaayega
```

5. (Optional, baad mein) Resend mein apna domain verify karo taaki emails
   `no-reply@gothwadtech.com` se jaayein — `RESEND_FROM` update kar dena.

---

## STEP 5 — Local development (bina deploy ke test) 💻

> Yeh sirf laptop par development ke liye hai. Phone-only setup mein ise skip karo.

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

## STEP 6 — OAuth: apps ko connect karo ("Sign in with Gothwad") 🔐

Jab GrixChat / ClashDrive / Notes mein Gothwad login lagana ho:

1. `JWT_SECRET` secret set hona chahiye (Step 2C) ✅
2. App register karo (Supabase SQL Editor): `redirect_uris` update karo
3. [docs/OAUTH.md](OAUTH.md) ka copy-paste snippet apni app mein lagao.

**OAuth base URL** (Step 2D route ke hisaab se):
- Route `accounts.gothwadtech.com/api/*` ho → base = `https://accounts.gothwadtech.com/api`
  (endpoints: `/api/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo`)
- Custom domain `api.gothwadtech.com` ho → base = `https://api.gothwadtech.com`

Poora guide: **[docs/OAUTH.md](OAUTH.md)**

---

## 📋 Environment Variables — Quick Reference

| Variable | Kahan set hota hai (dashboard) | Secret? | Kya karta hai |
|----------|-------------------|---------|---------------|
| `APP_DOMAIN` | wrangler.toml `[vars]` | ❌ | Email = username@APP_DOMAIN |
| `AUTH_HUB_URL` | wrangler.toml `[vars]` | ❌ | Password-reset redirect URL |
| `SUPABASE_URL` | wrangler.toml `[vars]` | ❌ | Supabase project URL |
| `SUPABASE_ANON_KEY` | Worker → Variables and Secrets (Secret) | ⚠️ semi | Supabase apikey header |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker → Variables and Secrets (Secret) | ✅ YES | Admin DB/auth operations |
| `JWT_SECRET` | Worker → Variables and Secrets (Secret) | ✅ YES | OAuth access tokens sign (Step 2C) |
| `MAIL_INTERNAL_TOKEN` | Worker → Variables and Secrets (Secret) | ✅ YES | Mail → Accounts internal lookup (`/api/internal/usernames/:username`) — shared secret |
| `RESEND_API_KEY` | Worker → Variables and Secrets (Secret) | ✅ YES | Reset emails bhejne ke liye |
| `RESEND_FROM` | wrangler.toml `[vars]` | ❌ | Email "From" address |
| `DEV_MODE` | wrangler.toml `[vars]` | ❌ | Dev conveniences on/off |
| `ALLOWED_ORIGINS` | wrangler.toml `[vars]` | ❌ | Extra CORS origins |
| `API_URL` | web/js/config.js | ❌ | Frontend → Worker URL (`''` = same origin, recommended) |
| `APP_DOMAIN` (UI) | web/js/config.js | ❌ | Email suffix dikhane ke liye |

---

## ❓ Common Problems (Troubleshooting)

**Pages build fail: `Missing script: "build"` / Vite error**
→ Pages → Settings → Build & deployments → Framework **None**, Build command **khaali**,
  output `web` → Retry deployment. (Upar Step 3 dekho.)

**Workers Builds (Git deploy) fail / "worker name" mismatch**
→ `cloudflare-worker/wrangler.toml` mein `name = "accounts"` hai na? Dashboard mein
  Worker ka naam bhi `accounts` hona chahiye. Root directory `cloudflare-worker` hai na?

**`accounts.gothwadtech.com/api/health` 404 ya HTML dikhata hai**
→ Route `accounts.gothwadtech.com/api/*` add kiya? (Step 2D)
→ Pages par `accounts.gothwadtech.com` custom domain add hai? DNS proxied (orange cloud) hai?

**`/api/health` mein `{"status":"ok"}` aata hai par signup "Could not create account"**
→ Supabase → Authentication → Providers → Email → "Confirm email" OFF hai na?
→ `SUPABASE_SERVICE_ROLE_KEY` **Secret** type mein sahi daala?
→ `SUPABASE_URL` wrangler.toml mein apna asli URL hai (placeholder `YOUR_PROJECT_ID` nahi)?

**"Cannot reach the Gothwad API"**
→ `web/js/config.js` mein `API_URL` check karo (same-origin ke liye `''`), aur Worker route/health OK hai ya nahi.

**Login ke baad dashboard par "redirect loop"**
→ `AUTH_HUB_URL` aur Pages ka actual URL match karte hain?
→ Browser console mein error check karo.

**Username check hamesha "taken" dikhata hai (naya username bhi)**
→ Pehle yeh confirm karo: `https://accounts.gothwadtech.com/api/auth/check-username?username=zzrandomtest9`
  mein `"available":true` aata hai ya nahi. Agar `"error":"Server database error"`
  (503) aata hai to **service key galat hai**:
→ Supabase → **Settings → API Keys** → **New secret key** banao (`sb_secret_...`
  format) → Reveal → Copy.
→ Cloudflare → Worker `accounts` → Settings → Variables and Secrets →
  `SUPABASE_SERVICE_ROLE_KEY` ko **Edit** karo — purana value **poora delete** karke
  naya `sb_secret_` value paste karo (Type: **Secret**, koi extra space/newline nahi).
→ Git push ho gaya (ya Deployments → **Retry deployment**) — green tick ka wait karo.
→ Phir upar wala username check URL dobara test karo — `"available":true` aana chahiye.

> 🔑 **Key note:** Supabase ke naye `sb_secret_` keys JWT nahi hote — ye sirf
> `apikey` header mein jaati hain. Code (Session 7) iske hisaab se bana hai: `eyJ`
> wali purani key dono headers bhejta hai, `sb_secret_` wali sirf `apikey`.
> Agar `Authorization: Bearer sb_secret_...` bheja to Supabase **"Invalid API key"**
> dekar reject karta hai — aur phir har username "taken" dikhta hai.

**Root `/` ya `/signin` (bina slash) par `{"error":"Endpoint not found"}` dikhta hai**
→ Iska matlab Worker `accounts.gothwadtech.com` ke **poore domain** par route ho gaya
  hai aur Pages ke HTML pages ki jagah Worker ka JSON aa raha hai.
→ Cloudflare → Workers & Pages → `accounts` → Settings → **Domains & Routes**:
  koi **Custom Domain** (`accounts.gothwadtech.com`) ya wildcard route
  (`accounts.gothwadtech.com/*`) lagi hui hai to **Delete** karo.
→ **Sirf yeh ek route rehni chahiye:** `accounts.gothwadtech.com/api/*`
→ Iske baad `/` → `/signin` redirect aur `/signin`, `/signup`, `/me` Pages se serve
  hone lagenge.

**Username check hamesha "taken" ya "available"**
→ Schema sahi run hua? (Supabase → Table Editor → `profiles` table dikhni chahiye)

**"Sign in with Gothwad" consent ke "Allow access" par kuch nahi hota / error**
→ Worker latest deploy hua? (Workers Builds → Deployments). OAuth base URL route ke hisaab se hai?
   (Step 6 dekho.)

**CORS error in console** (sirf jab API alag domain par ho)
→ Worker ka `ALLOWED_ORIGINS` mein frontend origin add karo
   (local dev ke liye `http://localhost:3000`). Same-origin route par zaroorat nahi.

---

## ✅ Launch Checklist (LIVE jaane se pehle)

- [ ] Supabase schema.sql run ho gaya (tables + RLS visible)
- [ ] Worker name `accounts` hai + Git (Workers Builds) connect hai
- [ ] `SUPABASE_URL` wrangler.toml mein asli Project URL hai
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` **Secret** type mein hain (Git mein NAHI)
- [ ] Supabase → Email confirmation OFF (jab tak custom mail live nahi)
- [ ] Route `accounts.gothwadtech.com/api/*` lagi hai
- [ ] Pages: Framework None, build command khaali, output `web` — build green hai
- [ ] `accounts.gothwadtech.com/api/health` → `{"status":"ok"}`
- [ ] Signup → auto login → dashboard ka flow test kiya
- [ ] Signout → login → wrong password → forgot password test kiya
- [ ] `DEV_MODE = "false"` kar diya (production) + Resend key (Step 4)

---

Made with 🔥 by Gothwad Tech. Questions? ROADMAP.md padho — poora vision wahan hai!
