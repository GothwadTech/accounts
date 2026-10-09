# 🤖 AGENTS.md — AI Working Guide (READ THIS FIRST!)

> **Agar tum ek AI agent ho jo abhi is repo mein kaam karne aaya ho:**
> Yeh file tumhare liye hai. Ise poora padho, phir `TASK.md` padho.
> Iske baad tumhe aur kuch dhoondne ki zaroorat nahi — poora context yahin hai.
>
> **Yeh file kabhi delete/move mat karna.** Har session ke END mein `TASK.md`
> update karna zaroori hai (neeche "WORKFLOW" section dekho).

---

## 1. 👤 CLIENT KON HAI

- **Pawan** (solo founder, "Gothwad Tech") + chhoti team (dost, beginners).
- Baat-cheet: **simple English / Hinglish**. Technical jargon use karo but
  hamesha **explain** karo ki kya ho raha hai aur kyun.
- Team beginners hain → code **simple, well-commented** rakho. Har comment
  "why" bataye, sirf "kya" nahi.
- User ko har step pe samjhana hai — summary, test results, next steps.

## 2. 🔥 PROJECT KYA HAI

**Gothwad Accounts** = Google Account jaisa central auth system for the
**Gothwad ecosystem** (Mail, Drive, Chat, Notes, Calendar, Browser...).

- Consumer brand: **GOTHWAD** · Company: **Gothwad Tech**
- Domain: `gothwadtech.com` (Cloudflare) — future: `gothwad.in`
- Live site: `accounts.gothwadtech.com`
- Repo: `GothwadTech/accounts`
- Vision doc: `ROADMAP.md` (user ka original plan) · Active plan: `PLAN.md`

Har Gothwad app mein user ek baar "Gothwad Account" banayega aur ek hi
login se sab apps use karega (SSO). Jaise Google: Gmail + Drive + YouTube
ek account se.

## 3. 📍 CURRENT STATUS (last updated: 2026-10-09)

| Step | Kya | Status |
|------|-----|--------|
| 1 | Gothwad Accounts — real auth (signup/login/reset/sessions) | ✅ DONE |
| 2 | OAuth 2.0 provider ("Sign in with Gothwad") | ✅ DONE |
| 3 | Gothwad Mail (`username@gothwadtech.com`) | 🔜 NEXT |
| 4 | Cross-app SSO (ClashDrive, GrixChat connect) | 📋 Planned |

**Live status detail + task board: `TASK.md`** (usse padho — yahan stale ho sakta hai).

### Kya ban chuka hai (summary)

**Website (`web/`) — sirf 3 routes:**
- `/signin` — login + forgot password + reset password (3 modes, ek page)
- `/signup` — account creation (live username check, password strength)
- `/me` — dashboard (Overview · Profile · Security · Connected apps)
- Root `/` sirf smart redirect hai. Koi aur page NAHI banana bina user ki
  permission ke.

**API (`cloudflare-worker/`) — Cloudflare Worker:**
- `/api/auth/*` — signup, signin, signout, me (auto-refresh JWT),
  forgot/reset/change password, profile update, device sessions + revoke
- `/oauth/*` — authorize (consent screen Worker-rendered HTML), token
  (authorization_code + PKCE + refresh rotation), userinfo, app-info,
  decision, authorizations, revoke

**Database (`supabase/schema.sql`):**
- `profiles` (username-only!), `user_sessions`, `ecosystem_apps`,
  `app_authorizations`, `oauth_auth_codes`, `oauth_refresh_tokens`
- RLS ON everywhere. Profile auto-create trigger on auth.users.

## 4. 🛠️ TECH STACK (100% FREE TIER — ZERO BUDGET!)

| Layer | Tech | Free limit (yaad rakho!) |
|-------|------|--------------------------|
| Frontend | Static HTML/CSS/JS → Cloudflare Pages | Unlimited bandwidth |
| API | Cloudflare Worker (TypeScript, 1 file) | 100K req/day |
| DB + Auth | Supabase (Postgres + GoTrue) | 500MB DB, 50K MAU, 7-day inactivity pause |
| Email out | Resend | 3000 emails/month |
| Email in (future Mail) | Cloudflare Email Routing → Worker | Free |
| Storage (future Drive) | Telegram API (api_id/api_hash, "ClashDrive hack") | Unlimited-ish |
| DNS/CDN/SSL | Cloudflare | Free |

**Paid service kabhi suggest mat karo.** Sab kuch free tier mein fit hona chahiye.

## 5. 📏 HARD RULES (KABHI MAT TODO!)

1. **Domain-agnostic code (RULE #1):** Kahin bhi `gothwadtech.com` hardcode
   mat karo. Sirf 2 jagah config hota hai:
   - `web/js/config.js` → `API_URL`, `APP_DOMAIN`
   - `cloudflare-worker/wrangler.toml` → `[vars]` (APP_DOMAIN, AUTH_HUB_URL...)
2. **Username-only DB (RULE #2):** `profiles` table mein sirf `username`.
   Email kabhi store nahi hota — API layer par calculate hota hai:
   `username + "@" + APP_DOMAIN` (helpers: `presentUser()` worker mein,
   `gothwadEmail()` frontend mein).
3. **Secrets sirf Worker mein:** `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`,
   `RESEND_API_KEY`, (future: `TELEGRAM_API_HASH`). Frontend mein sirf
   public config. Git mein kabhi secrets nahi (`.dev.vars` gitignored hai).
4. **RLS ON** — har nayi Supabase table par RLS + policies zaroor.
5. **3 routes only:** `/signin`, `/signup`, `/me`. Naya page/route bina user
   ke explicit kehne ke mat banao. (OAuth consent Worker-rendered hai isliye
   extra page nahi chahiye.)
6. **Design system:** Dark theme (GitHub-style `#0d1117` bg), **brand blue
   `#2f80ed`** accent (asli logo se match), font **Inter**, real logo
   `web/icon-192.png` (blue snowflake). CSS variables `web/css/styles.css`
   mein hain — naya color inline mat likho.
7. **Simple code:** Vanilla JS modules (frontend, NO framework/build step),
   single-file TypeScript (worker). Comments simple English/Hinglish mein.
8. **Clean repo:** Junk files, build artifacts (`.wrangler/`, `node_modules/`,
   `dist/`) kabhi commit mat karo. Faltu demo files mat banao.
9. **`tools/mock-supabase.js` = LOCAL TEST HARNESS ONLY.** Yeh fake auth hai
   (passwords plain text!). Production mein kabhi nahi. Real auth = Supabase.
10. **Free tier limits** respect karo — unnecessary DB reads/writes, heavy
    polling, etc. avoid karo.

## 6. 📁 FILE MAP (kahan kya hai)

```
accounts/
├── AGENTS.md                 ← TUM PADH RAHE HO (AI guide)
├── TASK.md                   ← Live task board + work log (HAR SESSION UPDATE KARO)
├── PLAN.md                   ← Master plan (Steps 1-6 + future)
├── README.md                 ← Project overview (humans ke liye)
├── ROADMAP.md                ← User ka original vision doc (mat badlo)
├── .env.example              ← Saare env vars ki list
│
├── web/                      🌐 Frontend (Cloudflare Pages, no build)
│   ├── signin/ signup/ me/   ← 3 routes (folder = pretty URL)
│   ├── index.html            ← root smart redirect
│   ├── css/styles.css        ← design system (CSS variables)
│   ├── js/config.js          ← ⚙️ THE 1 FILE to edit for domain
│   ├── js/api.js             ← fetch wrapper (credentials: include)
│   ├── js/common.js          ← session, toasts, topbar, helpers
│   └── js/signin.js signup.js me.js  ← page logic
│
├── cloudflare-worker/        ⚡ API (wrangler deploy)
│   ├── src/index.ts          ← POORA backend ek file mein (~1200 lines, commented)
│   ├── wrangler.toml         ← config [vars] + secrets list
│   └── .dev.vars.example     ← local dev secrets template
│
├── supabase/schema.sql       🗄️ Copy-paste in Supabase SQL Editor
│
├── tools/                    🛠️ Local dev (NEVER deploy)
│   ├── dev-server.js         ← static + /api + /oauth proxy (node tools/dev-server.js)
│   └── mock-supabase.js      ← fake Supabase for offline testing
│
└── docs/
    ├── SETUP.md              📘 Step-by-step deploy guide (Supabase → Worker → Pages)
    ├── OAUTH.md              🔐 OAuth 2.0 integration guide (apps ke liye)
    └── ARCHITECTURE.md       🏗️ Technical deep dive (flows, cookies, JWT, schema)
```

## 7. 💻 LOCAL DEV COMMANDS

```bash
# Terminal 1 — fake Supabase (offline testing ke liye)
node tools/mock-supabase.js              # → :8788

# Terminal 2 — Worker API
cd cloudflare-worker
cp .dev.vars.example .dev.vars           # mock values already correct hain
npm install
npx wrangler dev                         # → :8787

# Terminal 3 — Website
node tools/dev-server.js                 # → :3000  (signin/signup/me)

# Real Supabase use karna ho to .dev.vars mein asli keys daalo
# (mock Supabase band kar do)
```

**Test flow (hamesha yeh chalao):**
1. `/signup` → account banao (live username check)
2. Auto-login → `/me` dashboard
3. `/me` → Profile edit, Change password, Devices, Connected apps
4. Sign out → `/signin` login → wrong password (401) → forgot password
5. OAuth: `POST /oauth/decision` (curl se) → token → userinfo (docs/OAUTH.md examples)

## 8. 🔄 WORKFLOW — HAR SESSION KE LIYE (ZAROORI!)

```
1. PADHO:  AGENTS.md (yeh) → TASK.md → PLAN.md (jo relevant ho)
2. SAMJHO: user se kya pucha hai — TASK.md ke "Next up" se match karta hai?
3. KAAM KARO: chhote commits, clear messages (feat:/fix:/docs:/chore:)
4. TEST KARO: upar wala test flow + jo bhi naya feature hai
5. LIKHO: TASK.md UPDATE KARO (⚠️ sabse zaroori step!):
          - "✅ DONE" mein naya kaam + date + session summary
          - "🔜 NEXT UP" refresh karo
          - "Work log" mein entry add karo (kis session mein kya hua)
6. COMMIT + PUSH karo
```

**Kyun?** Kyunki user alag-alag AI sessions use karta hai. Agar tum TASK.md
update nahi karoge, to agli AI ko pata bhi nahi chalega ki tumne kya kiya.
**Continuity ka poora bharosa TASK.md + is file par hai.**

## 9. 🚫 KYA NAHI KARNA

- `AGENTS.md`, `TASK.md`, `PLAN.md`, `ROADMAP.md` delete/rename mat karo
- `web/icon-*.png`, `favicon.ico` (asli brand assets) mat hatao/todo
- Secrets, `.env`, `.dev.vars` commit mat karo
- Bina bataye architecture mat badlo (e.g. React wapas mat lao, routes mat badlo)
- Mock auth ko "real" batate hue mat deploy karo
- Ek hi commit mein poora system rewrite mat karo — chhote logical commits

## 10. 📞 AGAR CONFUSION HO TO

1. `TASK.md` → "Open questions / decisions" section dekho
2. `PLAN.md` → kya planned hai, kya nahi
3. `docs/ARCHITECTURE.md` → technical flows
4. User se seedha poochho (Hinglish mein, simple words)

---

> **Yaad rakho:** Tumhare pehle bhi AI is repo par kaam kar chuke hain.
> Unka kaam `TASK.md` ke Work log mein documented hai. Usse padho, respect
> karo, aur usi style mein aage badho. 🤝
