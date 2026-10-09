# ✅ TASK.md — Live Status & Task Board

> **⚠️ HAR AI SESSION: kaam khatam hone se PEHLE yeh file update karo!**
> Yeh file hi continuity hai — agli AI yahi padhkar sab samajhegi.
> Update kaise karna hai: section "WORK LOG" mein nayi entry + "✅ DONE"
> mein tick + "🔜 NEXT UP" refresh.
>
> Rules & working style: [`AGENTS.md`](AGENTS.md) · Master plan: [`PLAN.md`](PLAN.md)

**Last updated:** 2026-10-09 (Session 3)

---

## 📊 STATUS SUMMARY

| Step | Feature | Status |
|------|---------|--------|
| 1 | Gothwad Accounts — real auth (signup/login/reset/sessions/profile) | ✅ DONE |
| 2 | OAuth 2.0 provider ("Sign in with Gothwad") | ✅ DONE |
| 3 | Gothwad Mail — `username@gothwadtech.com` inbox | 🔜 NEXT |
| 4 | Cross-app SSO (ClashDrive, GrixChat integration) | 📋 Planned |

**Current state in one line:** Auth system ready & tested; ab Supabase project
banana hai + deploy karna hai (docs/SETUP.md), phir Step 3 (Mail) shuru.

---

## ✅ DONE (completed work — newest first)

### Session 3 — 2026-10-09 — Cleanup + 3-route UI + Continuity docs
- User feedback: sirf 3 routes chahiye, faltu files delete, real icons use karo
- Site restructured → **`/signin` · `/signup` · `/me`** (pretty URLs, folder-based)
  - `/signin` = 3 modes: login + forgot-password + reset-password (email link)
  - `/me` = dashboard (Overview/Profile/Security/Connected apps tabs)
  - Root `/` = smart redirect (logged-in → /me, else /signin)
- **Real brand logo** (`web/icon-192.png` — blue snowflake) used as logo mark
- **Accent color switched to brand blue `#2f80ed`** (logo se match; pehle crimson tha)
- OAuth consent screen → **Worker-rendered HTML** (site par extra route nahi)
- Password reset link → `/signin#access_token=...` (mode 3)
- Deleted faltu: `legacy-react-demo/`, `examples/`, old pages (login.html,
  dashboard.html, reset-password.html, authorize.html, landing), dead CSS
- dev-server: pretty URLs + Host passthrough proxy
- Docs: README, SETUP, OAUTH updated
- Yeh continuity docs (AGENTS.md, TASK.md, PLAN.md, ARCHITECTURE.md, folder READMEs)

### Session 2 — 2026-10-09 — Step 2: OAuth 2.0 Provider
- Worker: `/oauth/authorize` + `/oauth/token` + `/oauth/userinfo` + `/oauth/app-info`
  - Authorization Code grant + **PKCE (S256)**, one-time codes (5 min),
    **refresh token rotation** (30d, SHA-256 hashed in DB), HS256 JWT access
    tokens (1h, `JWT_SECRET`), scope management
  - Scopes: `profile`, `email`, `drive`, `drive.read`, `notes`, `chat`, `offline_access`
  - `/oauth/decision` (consent allow/deny), `/oauth/authorizations`,
    `/oauth/revoke` (dashboard disconnect)
- Schema: `oauth_auth_codes`, `oauth_refresh_tokens` tables (RLS: worker-only),
  `ecosystem_apps.client_id/secret_hash`, `get_my_app_grants()`
- Dashboard "Connected apps" tab → real OAuth grants + Disconnect
- docs/OAUTH.md integration guide
- Tested E2E: authorize redirects, consent, token exchange, PKCE fail/reuse
  rejection, refresh rotation, userinfo scoping, revoke, evil redirect_uri block

### Session 1 — 2026-10-09 — Step 1: Real Auth System (from scratch)
- Reviewed old repo (React demo with FAKE auth — all mock)
- `supabase/schema.sql`: profiles (username-only!), user_sessions,
  ecosystem_apps + app_authorizations, auto-profile trigger, updated_at
  trigger, full RLS, `is_username_available()`
- Worker `/api/auth/*`: signup (admin create + auto-login), signin
  (username OR email + remember-me), signout (token revoke), me (JWT
  auto-refresh), forgot-password (Resend email + DEV_MODE link),
  reset-password, change-password, update-profile, sessions + revoke
- Frontend (vanilla HTML/CSS/JS, dark theme): landing, login, signup,
  dashboard, reset-password (ab sirf 3 routes hain — Session 3 mein simplify)
- HttpOnly cookies: `gothwad_at` (JWT), `gothwad_rt` (refresh), `gothwad_sid`
- tools/dev-server.js + tools/mock-supabase.js (local test harness)
- docs/SETUP.md step-by-step deploy guide
- 15/15 API tests passed

---

## 🔜 NEXT UP (priority order)

### 1. Supabase project + Deploy (USER ko karna hai — docs/SETUP.md)
- [ ] Supabase free project banao → schema.sql run karo
- [ ] Keys → wrangler secrets (SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET)
- [ ] Worker deploy (api.gothwadtech.com) + Pages deploy (accounts.gothwadtech.com)
- [ ] `web/js/config.js` mein production API_URL
- [ ] DEV_MODE=false + Resend setup (password reset emails)
- [ ] Live test: signup → me → reset → OAuth

### 2. STEP 3 — GOTHWAD MAIL 🔜 (agla major feature)
- [ ] Cloudflare Email Routing: `*@gothwadtech.com` → Email Worker
- [ ] Email Worker (naya worker ya existing mein): inbound email parse →
      Supabase DB (mail_messages table — username ke hisaab se)
- [ ] Outgoing mail via Resend API (from: `username@gothwadtech.com`)
- [ ] Webmail UI — **yeh NAYI app hogi: `mail.gothwadtech.com`** (accounts ki
      3-route rule sirf accounts site ke liye hai!)
      - Inbox (real-time via Supabase realtime), Sent, Compose, Trash
- [ ] OAuth se login ("Sign in with Gothwad" — scope: `email`, `mail.read/write`?)
- Docs/plan detail: PLAN.md § Step 3

### 3. STEP 4 — CROSS-APP SSO
- [ ] ClashDrive (Drive) ko Gothwad Auth se connect
- [ ] GrixChat (Chat) ko Gothwad Auth se connect
- [ ] Wildcard cookie SSO test across subdomains
- [ ] Shared profile & contacts

---

## 📋 BACKLOG / IDEAS (abhi priority nahi)

- [ ] 2FA (TOTP) — schema mein `two_factor_enabled` ready hai, flow nahi
- [ ] Avatar upload (Supabase Storage)
- [ ] Account deletion (GDPR-style)
- [ ] Gothwad Notes / Calendar / Browser apps (separate subdomains)
- [ ] `gothwad.in` domain (jab budget aaye) — sirf config change!
- [ ] Email verification recovery_email par (jab Resend domain verified ho)
- [ ] Rate limiting on auth endpoints (Workers KV / Durable Objects)

---

## ❓ OPEN QUESTIONS / DECISIONS

**Decided (decision log):**
- ✅ Accent color = **brand blue `#2f80ed`** (asli logo blue hai) — Session 3
- ✅ Site routes = sirf `/signin`, `/signup`, `/me` — Session 3 (user instruction)
- ✅ OAuth consent = Worker-rendered HTML (extra page nahi) — Session 3
- ✅ Frontend = vanilla JS (no React) — user explicitly asked HTML/CSS/JS
- ✅ Future apps (Mail, Drive...) = **alag subdomains/alag repos** — accounts
  site hamesha 3-route rahegi
- ✅ Supabase email confirm OFF (custom mail abhi live nahi; Worker
  `email_confirm: true` karta hai)

**Open (user se poochna jab aaye):**
- ❓ Mail ka webmail UI kaisa chahiye (Gmail-jaisa minimal?) — Step 3 start par
- ❓ Kya GrixChat web app hai ya mobile/Telegram? (Step 4 integration approach)
- ❓ Resend domain verification kab karoge (emails `no-reply@gothwadtech.com` se)?

---

## 📖 WORK LOG (session history — har session ek entry)

| # | Date | Kya hua |
|---|------|---------|
| 1 | 2026-10-09 | **Step 1 — Real auth from scratch.** Purana fake React demo review kiya; schema + worker + frontend banaya; 15/15 tests pass. |
| 2 | 2026-10-09 | **Step 2 — OAuth 2.0 provider.** authorize/token/userinfo + PKCE + rotation + consent + scopes; E2E tested. |
| 3 | 2026-10-09 | **Cleanup + 3-route UI.** User feedback par: sirf /signin /signup /me; real logo; brand blue; OAuth consent Worker-rendered; faltu files delete; continuity docs (yeh files). |
| 4 | YYYY-MM-DD | _agli AI yahan likhegi..._ |

---

> **Nayi AI ke liye 30-second summary:**
> Gothwad Accounts = real auth system (Supabase + Cloudflare Worker + static
> site). Step 1 & 2 done & tested. Ab user deploy karega (docs/SETUP.md),
> phir **Step 3 = Gothwad Mail** banana hai. Rules `AGENTS.md` mein hain,
> plan `PLAN.md` mein. Yeh file session end par update karna MAT BHULNA.
