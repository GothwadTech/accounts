# ✅ TASK.md — Live Status & Task Board

> **⚠️ HAR AI SESSION: kaam khatam hone se PEHLE yeh file update karo!**
> Yeh file hi continuity hai — agli AI yahi padhkar sab samajhegi.
> Update kaise karna hai: section "WORK LOG" mein nayi entry + "✅ DONE"
> mein tick + "🔜 NEXT UP" refresh.
>
> Rules & working style: [`AGENTS.md`](AGENTS.md) · Master plan: [`PLAN.md`](PLAN.md)

**Last updated:** 2026-10-09 (Session 6 — deployment fix)

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

### Session 6 — 2026-10-09 — DEPLOYMENT FIX (phone/dashboard-only setup)
- **Context:** user phone se kaam kar raha hai — terminal/wrangler CLI nahi. Cloudflare
  Worker project dashboard mein already hai, naam **`accounts`** (delete/rename nahi).
  Pages build pehle "Vite" auto-detect se fail hua tha.
- **wrangler.toml:** `name = "gothwad-auth"` → **`name = "accounts"`** (Workers Builds
  Git-deploy dashboard ke Worker naam se match karna zaroori). Routes ka recommended
  pattern comment mein likha: `accounts.gothwadtech.com/api/*`.
- **SUPABASE_URL:** wrangler.toml mein abhi placeholder `YOUR_PROJECT_ID` hai —
  user ka real Project URL pending (user se maanga hai).
- **Worker route approach (recommended):** frontend + API same origin
  (`accounts.gothwadtech.com`), `web/js/config.js` `API_URL: ''` unchanged.
  - **BUG PREVENTED:** consent screen (Worker-rendered HTML) `fetch('/oauth/decision')`
    route `/api/*` ke saath Worker tak nahi pahunchta → ab `fetch('/api/oauth/decision')`
    (router `/api` prefix strip karta hai, api.* domain par bhi chalta hai).
  - OAuth base URL route ke saath = `https://accounts.gothwadtech.com/api` (docs/OAUTH.md updated).
- **docs/SETUP.md rewrite (dashboard-first):** Workers Builds connect (root `cloudflare-worker`,
  deploy `npx wrangler deploy`), secrets dashboard se (Type: Secret), Route add, Pages
  settings (Framework None, build khaali, output `web`), troubleshooting
  ("Missing script: build" fix), checklist. CLI sirf "Alternative" mein.
- **Docs cleanup:** `gothwad-auth` naam hatao (SETUP), ARCHITECTURE topology table update.
- **Tested:** `wrangler deploy --dry-run` → name `accounts` OK; local `wrangler dev` +
  mock Supabase: `/api/health` 200, `/api/oauth/authorize` (no login) 302, login →
  consent HTML ka fetch `/api/oauth/decision` → 200 redirect_url (code mila).
  (Note: `.dev.vars.example` ka SUPABASE_URL placeholder hai, mock URL nahi — pre-existing;
  local test ke liye manually `http://127.0.0.1:8788` daalna pada.)
- **Pending (user ke dashboard steps):** Workers Builds connect · Variables → Secrets ·
  Route `accounts.gothwadtech.com/api/*` · Pages Framework None + Retry · test `/api/health`.

### Session 5 — 2026-10-09 — BUG FIX #2: refresh-token rotation RACE (dashboard bounce)
- **Bug report (user):** login ke baad header "My Account + Sign out" dikhata hai
  PAR /me dashboard 2 sec baad /signin bounce! (Header logged-in, page logged-out.)
- **Root cause — REFRESH ROTATION RACE (reproduced!):** jab access token dead
  hota, to page ke PARALLEL requests (topbar + requireAuth + apps tab) EK HI
  refresh token se rotate karne jaati the → mock/Supabase rotation ke baad
  purana refresh revoke → **1 request jeetti (header: My Account), baaki
  haarti (requireAuth: bounce)**. Test: `3 parallel /auth/me` with dead access
  + valid refresh → True, False, False!
- **Fix (3 layers):**
  1. **Client single-flight refresh** (`web/js/api.js`): X-Gothwad-Refresh ab
     har request par NAHI jaata. Token dead → SIRF EK refresh (shared promise)
     → sab requests naye token se retry. Race impossible.
  2. **`POST /api/auth/refresh`** endpoint (worker) — explicit rotation.
  3. **Mock grace window** (60s, Supabase `refresh_token_reuse_interval` jaisa):
     rotated refresh dobara aaye to fail nahi — current pair milta hai.
  4. Pages ab EK hi session check share karte hain (renderTopbar(session)).
- **Tested:** tools/test-singleflight.mjs — 7/7 (parallel race, rotation,
  consistency, logged-out case). Manual: 8-call pressure race ALL TRUE.
- **Production impact (user ka sawal):** HAAN, ye race REAL Supabase mein bhi
  hoti (1h access expiry + parallel requests) — ab fix ke baad NAHI hogi.

### Session 4 — 2026-10-09 — BUG FIX: dashboard se /signin bounce (hybrid auth)
- **Bug report (user):** signup/signin ke baad `/me` par 2-3 second dikhta hai,
  phir wapas `/signin` par bounce ho jaata hai.
- **Root cause:** Arena preview ek **iframe** hai → browsers third-party
  cookies BLOCK karte hain → Set-Cookie drop → agli request bina session →
  `/auth/me` = unauthenticated → redirect. (Logs se prove: signin 200 ke
  turant baad me() + authorizations 401.)
- **Fix — HYBRID AUTH:**
  - Worker: signin/signup/me responses mein `access_token` + `refresh_token`
    + `session_id` body mein bhi (cookies ke saath)
  - `resolveSession()` ab headers accept karta hai: `Authorization: Bearer`
    + `X-Gothwad-Refresh` (pehle sirf cookies)
  - Frontend `api.js`: tokens sessionStorage mein → har request par headers
    (iframe/webview safe) — cookies bhi chalti hain (production SSO intact)
  - Signout fix: header token se bhi Supabase logout + session row delete
    (body `session_id`) — pehle sirf cookie se hota tha
  - `/me` loading gate — dashboard ka 2-3s flash nahi dikhta ab
- **Tested:** headers-only auth ✅, refresh rotation via header ✅, old-refresh
  rejection ✅, cookie regression ✅, signout revokes token ✅
- Docs: ARCHITECTURE.md §3 hybrid auth model

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

### 1. Deploy (USER ko dashboard se karna hai — docs/SETUP.md, phone-friendly)
- [x] Supabase project + schema.sql run + keys mil gaye (Phase 1 DONE)
- [ ] `wrangler.toml` → `SUPABASE_URL` mein user ka real Project URL (PENDING — user se maanga)
- [ ] Worker `accounts` → Settings → Builds → Git connect (root `cloudflare-worker`, deploy `npx wrangler deploy`)
- [ ] Worker → Variables and Secrets: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (Type Secret)
- [ ] Worker → Domains & Routes → Route `accounts.gothwadtech.com/api/*`
- [ ] Pages: Framework None, build command khaali, output `web` → Retry deployment
- [ ] Test: `/api/health` → `{"status":"ok"}` → signup → me → signout → login
- [ ] DEV_MODE=false + Resend setup (password reset emails)

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
| 4–5 | 2026-10-09 | **Bug fixes:** dashboard `/signin` bounce (hybrid auth: headers + cookies) · refresh-rotation race (single-flight refresh). |
| 6 | 2026-10-09 | **Deployment fix (dashboard-only).** Worker name → `accounts`; Worker route `/api/*` (same-origin) recommended; consent `fetch` → `/api/oauth/decision`; SETUP.md dashboard-first rewrite; Pages build-fix docs; tested via wrangler dev. |
| 7 | YYYY-MM-DD | _agli AI yahan likhegi..._ |

---

> **Nayi AI ke liye 30-second summary:**
> Gothwad Accounts = real auth system (Supabase + Cloudflare Worker + static
> site). Step 1 & 2 done & tested. Ab user deploy karega (docs/SETUP.md —
> dashboard-only, phone se; terminal/wrangler CLI user ko mat bolna),
> phir **Step 3 = Gothwad Mail** banana hai. Rules `AGENTS.md` mein hain,
> plan `PLAN.md` mein. Yeh file session end par update karna MAT BHULNA.
