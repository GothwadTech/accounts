# 🏗️ ARCHITECTURE.md — Technical Deep Dive

> Gothwad Accounts ka poora technical design. Naya AI yahan se flows samjhe.
> Setup: [`SETUP.md`](SETUP.md) · OAuth integration: [`OAUTH.md`](OAUTH.md)

**Last updated:** 2026-10-09

---

## 1. System Overview

```
┌──────────────────────────────┐
│   BROWSER (user)             │
│   accounts.gothwadtech.com   │
│   web/ — static HTML/CSS/JS  │        Cloudflare Pages (free)
└──────────────┬───────────────┘
               │  fetch /api/*  (same-origin in dev via proxy;
               │                 in prod: cross-origin, CORS + credentials)
┌──────────────▼───────────────┐
│   CLOUDFLARE WORKER          │
│   cloudflare-worker/         │        accounts.gothwadtech.com/api/*
│   /api/auth/*  /api/oauth/*  │        (route; alt: api.gothwadtech.com)
└──────────────┬───────────────┘
               │  REST (PostgREST) + Auth Admin API
┌──────────────▼───────────────┐
│   SUPABASE                   │
│   • GoTrue Auth (users/JWT)  │        passwords hash, tokens
│   • Postgres (profiles,      │        RLS ON everywhere
│     sessions, oauth tables)  │
└──────────────────────────────┘
```

**Key idea:** Frontend **kabhi** Supabase se directly baat nahi karta —
sirf Worker se. Isliye service_role key safe rehti hai (Rule #3).

---

## 2. Auth Flow (signup/login)

### Signup
```
POST /api/auth/signup {first_name, last_name, username, password, recovery_email}
  1. Validate (username regex, reserved list, password >= 8)
  2. Check username free (profiles?username=eq.X)
  3. POST /auth/v1/admin/users  (service_role)
       email = username@APP_DOMAIN   ← derived! DB mein username only (Rule #2)
       email_confirm: true           ← custom mail abhi live nahi, isliye skip
       user_metadata: {username, first_name, last_name, recovery_email}
  4. Trigger handle_new_gothwad_user() → profiles row auto-create
  5. Password grant → session tokens
  6. user_sessions row insert (device info from User-Agent)
  7. Set cookies → response {user} (user.email derived in presentUser())
```

### Signin
```
POST /api/auth/signin {identifier, password, remember}
  identifier "pawan" → pawan@APP_DOMAIN ; "pawan@x.com" → as-is
  → POST /auth/v1/token?grant_type=password (apikey = anon key)
  → session row + cookies
```

### Session check (page load par)
```
GET /api/auth/me
  cookie gothwad_at → GET /auth/v1/user
  401 + gothwad_rt → POST /auth/v1/token?grant_type=refresh_token
                     (rotation: naya refresh token cookie mein)
  → {authenticated: true, user}  (profile fresh from DB)
```

---

## 3. Auth Model — HYBRID (cookies + tokens)

Session **2 tarike se** chalta hain (dono ek saath active):

| Channel | Kaise | Kyun |
|---------|-------|------|
| **Tokens** (sessionStorage + `Authorization: Bearer` header + `X-Gothwad-Refresh`) | signin/signup/me ke response body mein tokens aate hain; frontend save karke HAR request par bhejta hai | **Iframe/webview environments** (jaise Arena preview) mein browsers third-party cookies BLOCK karte hain — header auth wahan kaam karta hai |
| **HttpOnly cookies** (`gothwad_at` / `gothwad_rt` / `gothwad_sid`) | fetch `credentials: 'include'` — automatic | **Production SSO** ke liye best (Domain=.APP_DOMAIN share across subdomains) |

Worker `resolveSession()` pehle headers padhta hai, phir cookies. Refresh
rotation par DONO update hote hain (Set-Cookie + body tokens).

**Refresh = SINGLE FLIGHT (rotation race protection):** frontend access token
dead hone par SIRF EK dafa `POST /api/auth/refresh` karta hai — jitni bhi
parallel requests hon, sab uske poore hone ka intezaar karti hain phir naye
token se retry karti hain. (Warna parallel refresh race mein 1 request jeetti
thi, baaki 401 → header "logged-in" + dashboard bounce!). Mock/Supabase mein
~60s ka refresh-reuse grace window bhi hai (Supabase
`refresh_token_reuse_interval` jaisa) — true simultaneity bhi safe.

### Cookies

| Cookie | Kya hai | Lifetime |
|--------|---------|----------|
| `gothwad_at` | Supabase access token (JWT, ~1h) | remember? 1h : session |
| `gothwad_rt` | Supabase refresh token (rotation) | remember? 30d : session |
| `gothwad_sid` | user_sessions row id (device mgmt) | remember? 30d : session |

- **HttpOnly + Secure + SameSite=Lax** — JS cookies nahi padh sakta
- **Domain:** `.APP_DOMAIN` (subdomains share — SSO!). Localhost/preview par host-only
- **Remember me:** false = browser-session cookies (band karo to logout)
- **Signout:** token family revoke (Supabase logout) + session row delete
  (body `session_id` ya cookie) + cookies clear + frontend sessionStorage clear

## 4. JWT Access Tokens (OAuth ke liye)

- HS256, signed with `JWT_SECRET` (fallback: service_role key)
- Claims: `iss` (AUTH_HUB_URL), `sub` (user id), `aud`/`client_id`, `username`,
  `scope`, `iat`, `exp` (1h), `jti`
- `/oauth/userinfo` signature verify karke profile deta hai (scopes ke hisaab se)
- Apps ko JWT verify karne ki zaroorat nahi — userinfo call karo

## 5. OAuth 2.0 Flow (Step 2)

Standard **Authorization Code + PKCE (S256)**:

1. `GET /oauth/authorize?client_id&redirect_uri&scope&state&code_challenge`
   - Validate: client registered, redirect_uri EXACT match (DEV_MODE: localhost ok),
     scopes valid, PKCE required for public clients
   - Not logged in → 302 `/signin?next=<full authorize URL>`
   - Logged in → **consent HTML (Worker-rendered)** → Allow/Deny
2. `POST /oauth/decision` (session cookie) → one-time code (5 min) stored in
   `oauth_auth_codes` + grant in `app_authorizations`
3. `POST /oauth/token` (grant_type=authorization_code):
   - Checks: code unused/expired/client/redirect + PKCE verifier + client_secret
   - Code burn (used=true) → JWT access_token (+ refresh_token if `offline_access`)
4. `GET /oauth/userinfo` (Bearer JWT) → scoped profile
5. Refresh: `grant_type=refresh_token` → **rotation** (purana revoke, naya)

**Security properties:** one-time codes, PKCE (public clients mandatory),
refresh rotation, hashes-only in DB, exact redirect match, anti-enumeration
forgot-password, reserved usernames.

## 6. Database Schema (supabase/schema.sql)

| Table | Purpose | RLS |
|-------|---------|-----|
| `profiles` | User profile (username UNIQUE, no email column!) | select/update own |
| `user_sessions` | Device sessions (dashboard security tab) | own rows |
| `ecosystem_apps` | Registered OAuth clients (client_id, secret_hash, redirect_uris) | public read |
| `app_authorizations` | User ↔ app grants + scopes | own rows |
| `oauth_auth_codes` | One-time auth codes | **none** (worker-only) |
| `oauth_refresh_tokens` | Hashed refresh tokens | **none** (worker-only) |

- **Trigger:** `on_auth_user_created` → profile auto-create (SECURITY DEFINER)
- **Helpers:** `is_username_available()` (anon-callable), `get_my_app_grants()`
- Username CHECK regex: `^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$`

## 7. API Endpoints (Worker)

| Method | Route | Auth | Kya |
|--------|-------|------|-----|
| GET | `/api/health` | — | Health check |
| GET | `/api/auth/check-username` | — | Username availability |
| POST | `/api/auth/signup` | — | Create account + auto-login |
| POST | `/api/auth/signin` | — | Login (remember me) |
| POST | `/api/auth/signout` | cookie | Logout + revoke |
| GET | `/api/auth/me` | cookie | Current session (auto-refresh) |
| POST | `/api/auth/forgot-password` | — | Reset link → recovery email |
| POST | `/api/auth/reset-password` | reset token | Set new password |
| POST | `/api/auth/change-password` | cookie | Change password |
| POST | `/api/auth/update-profile` | cookie | Profile edit |
| GET | `/api/auth/sessions` | cookie | Device list |
| POST | `/api/auth/sessions/revoke` | cookie | Remote sign-out |
| POST | `/api/auth/sessions/revoke-others` | cookie | Sign out others |
| GET | `/oauth/app-info` | — | App name/icon (consent ke liye) |
| GET | `/oauth/authorize` | cookie* | Consent screen (HTML) |
| POST | `/oauth/decision` | cookie | Allow/Deny → code |
| POST | `/oauth/token` | client | Code/refresh → tokens |
| GET | `/oauth/userinfo` | Bearer | Profile (scoped) |
| GET | `/oauth/authorizations` | cookie | Connected apps (dashboard) |
| POST | `/oauth/revoke` | cookie | Disconnect app |
| GET | `/api/internal/usernames/:username` | Bearer `MAIL_INTERNAL_TOKEN` | **Internal** — Mail → Accounts username existence check (no CORS, no cookies, `{"exists": bool}`) |

Route matching: `/api/x` aur `/x` dono chalte hain (frontend `/api` prefix
use karta hai; external OAuth apps `/oauth/*`). Internal endpoint `/api/internal/*`
is server-to-server only — no CORS, no cookies, `Cache-Control: no-store`, constant-time token compare.

## 8. Frontend Design System

- **CSS variables** (`web/css/styles.css` `:root`): colors, radius, fonts
- Dark: bg `#0d1117`, panel `#161b22`, border `#2a3140`, text `#e6edf3`
- **Accent: brand blue `#2f80ed`** (asli logo `icon-192.png` se match)
- Font: Inter (Google Fonts) + system-ui fallback
- JS modules: `config.js` (env) → `api.js` (fetch) → `common.js` (session/toasts)
  → page scripts (`signin.js`, `signup.js`, `me.js`)

## 9. Deployment Topology (production)

| Kahan | Kya | Kaise |
|-------|-----|-------|
| `accounts.gothwadtech.com` | Pages → `web/` folder | Connect Git, output=`web` |
| `accounts.gothwadtech.com/api/*` | Worker route `accounts` (recommended, same-origin) | Worker → Settings → Domains & Routes → Add Route |
| `api.gothwadtech.com` | Worker custom domain (alternative) | Worker → Domains & Routes → Custom Domain |
| Supabase | DB + Auth | schema.sql in SQL Editor |

Dev mein: `tools/dev-server.js` (port 3000) `/api`+`/oauth` ko
`wrangler dev` (8787) par proxy karta hai — same-origin, CORS-free.

## 10. Testing Strategy

- **Offline:** `tools/mock-supabase.js` (fake auth/DB — NEVER deploy)
- **API smoke:** signup → me → signout → signin → forgot → reset →
  sessions → OAuth decision/token/userinfo (curl scripts in TASK.md history)
- **UI:** pages load, form validation, redirect guards, tabs
- Worker compile: `npx wrangler deploy --dry-run`
- JS syntax: `node --check web/js/*.js tools/*.js`

---

> **Future steps ke liye:** Mail (Step 3) ka design `PLAN.md` aur `docs/MAIL_INTERNAL.md` mein hai.
> **Updated plan (2026-10-11):** Mail uses its **OWN Supabase project** — it does NOT read Accounts DB.
> Inbound mail validation is done via `GET /api/internal/usernames/:username` (Bearer `MAIL_INTERNAL_TOKEN`).
> Old docs that said Mail shares Accounts Supabase are superseded.
> Architecture patterns (username-derived email, RLS, worker-only secrets) wahi rahenge.
