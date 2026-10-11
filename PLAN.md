# 🗺️ PLAN.md — Gothwad Master Plan (Active Roadmap)

> Yeh **active plan** hai — isko follow karo. (User ka original vision doc
> [`ROADMAP.md`](ROADMAP.md) mein hai — woh historical reference hai.)
> Live status: [`TASK.md`](TASK.md) · Working rules: [`AGENTS.md`](AGENTS.md)

**Last updated:** 2026-10-09

---

## 🎯 BADA PICTURE (end goal)

Google jaisa ecosystem — **GOTHWAD**:

| App | Kya hai | Status |
|-----|---------|--------|
| **Gothwad Accounts** | Central auth + SSO (yeh repo) | ✅ Steps 1-2 done |
| **Gothwad Mail** | `username@gothwadtech.com` email + webmail | 🔜 Step 3 |
| **Gothwad Drive** | Unlimited storage (Telegram-backed, "ClashDrive") | 📋 |
| **Gothwad Chat** | Messaging (GrixChat) | 📋 |
| **Gothwad Notes** | Synced notes | 📋 |
| **Gothwad Calendar** | Events/reminders | 📋 |
| **Gothwad Browser** | Private browser + sync | 📋 |

Ek Gothwad Account → sab apps mein "Sign in with Gothwad" (OAuth 2.0).

---

## ✅ STEP 1 — GOTHWAD ACCOUNTS (DONE — 2026-10-09)

Signup/login/reset/sessions/profile + dark UI + Supabase auth + JWT cookies.
Detail: [`TASK.md`](TASK.md) work log Session 1 · Code: `web/` + `cloudflare-worker/`

## ✅ STEP 2 — OAUTH 2.0 PROVIDER (DONE — 2026-10-09)

`/oauth/authorize|token|userinfo` + PKCE + refresh rotation + scopes +
Worker-rendered consent + dashboard Connected apps.
Detail: [`TASK.md`](TASK.md) work log Session 2 · Integration: [`docs/OAUTH.md`](docs/OAUTH.md)

---

## 🔜 STEP 3 — GOTHWAD MAIL (AGLA KAAM) — UPDATED PLAN 2026-10-11

**Goal:** Har user ko mile `username@gothwadtech.com` — receive + send emails.

> **UPDATE (2026-10-11) — supersedes old plan:**
> Gothwad Mail (GothwadTech/mail — alag repo, yahan `mail-web/` NAHI banega) now uses its
> **OWN Supabase project**. It does **NOT** read Accounts DB (`public.profiles`).
> Accounts stays source of truth.
> Mail validates recipients via Accounts internal endpoint:
> `GET /api/internal/usernames/:username` with `Authorization: Bearer MAIL_INTERNAL_TOKEN`
> → `{"exists": true/false}`. See `docs/MAIL_INTERNAL.md`.
> Old references to shared Supabase are outdated — Mail has its own DB.
>
> **NAMING (2026-10-11) — yadd rakho, yeh confusion already ek baar hui hai:**
> - Mail ka Cloudflare Worker = **`mail`** (dashboard; `GothwadTech/mail` ka
>   `worker/wrangler.toml` → `name = "mail"`). **`gothwad-mail-api` NAHI** — `/api/health`
>   ka `service` field sirf cosmetic label hai. Worker rename mat karo.
> - Accounts ka OAuth `client_id` = **`gothwad-mail`** (wohi rahega — Worker naam se alag cheez).
> - Mail → Accounts server calls base = **`https://api.gothwadtech.com`**
>   (`AUTH_HUB_URL`); browser links ke liye alag var `AUTH_SIGNIN_URL =
>   https://accounts.gothwadtech.com`. `accounts.gothwadtech.com/api` sirf browser traffic ke liye.

### Architecture (free tier!)

```
INCOMING:
  Someone emails pawan@gothwadtech.com
      → Cloudflare Email Routing (MX record, free)
      → Email Worker "mail" (route: *@gothwadtech.com)   ← Mail repo worker (OWN Supabase)
      → parse to local-part = username
      → CALL Accounts: GET /api/internal/usernames/:username (Bearer MAIL_INTERNAL_TOKEN)
      → if exists=false → drop (not a real Accounts user)
      → if exists=true  → Supabase table mail_messages (to_username = "pawan") in MAIL's own Supabase
      → webmail realtime mein dikhata hai (Supabase Realtime on Mail project)

OUTGOING:
  User compose kare webmail mein
      → API call (Mail worker)
      → Resend API (from: pawan@gothwadtech.com, free 3000/month)
      → copy mail_messages (folder='sent') in Mail's own Supabase
```

### Tasks (execution order)

1. **Schema** (`supabase/schema.sql` mein append — ya `supabase/mail.sql`):
   ```sql
   mail_messages (
     id, to_username, from_email, from_name, subject, body_html, body_text,
     attachments JSONB, folder ('inbox'|'sent'|'trash'), is_read, is_starred,
     received_at
   )
   + RLS: user sirf apni mails (to_username = apna username via JWT claim
     ya profiles join) — service_role se Email Worker insert karega.
   ```
2. **Email Worker** (`GothwadTech/mail` repo → `worker/` — Accounts mein naya folder NAHI):
   - Deployed Worker ka naam **`mail`** hai (wrangler.toml `name = "mail"`; rename mat karo)
   - `email(message, env)` handler (Cloudflare Email Workers API)
   - `message.to` se username nikalo (part before @)
   - Accounts internal lookup se username verify karo (`AUTH_HUB_URL=https://api.gothwadtech.com`,
     secret `ACCOUNTS_INTERNAL_TOKEN` — same value as Accounts' `MAIL_INTERNAL_TOKEN`)
   - Supabase mein insert (service_role — is worker ka apna secret)
   - Attachments: chhote files base64 JSONB mein, bade → skip/reject (500MB DB limit!)
3. **DNS:** Cloudflare Email Routing enable → catch-all `*@gothwadtech.com`
   → Email Worker. (User ko dashboard mein karna padega — SETUP.md mein steps.)
4. **Outgoing API:** Mail ke apne worker mein `POST /api/mail/send` (session required)
   → Resend se bhejo + `mail_messages` (folder='sent') mein save. Rate limit basic
   lagao (free tier protection). Accounts worker mein mail bhejne ka koi endpoint
   nahi banega — Accounts sirf identity deta hai.
5. **Webmail UI** — **`mail.gothwadtech.com`** — ✅ decided: **alag repo
   `GothwadTech/mail`** (Vite + React + TSX; is accounts repo mein koi `mail-web/`
   folder nahi):
   - Pages: Inbox, Sent, Trash, Compose, Read mail
   - Auth: "Sign in with Gothwad" (OAuth + cookie session)
     — accounts ke worker ka `/oauth/*` use hoga. `ecosystem_apps` mein
     `gothwad-mail` client_id already registered hai! (client_id `gothwad-mail`,
     Worker ka naam `mail` — dono alag hain, confuse mat karo.)
   - Realtime: Supabase Realtime subscription on mail_messages
   - Dark theme + brand blue (same design system — `web/css/styles.css`
     copy karke variables reuse karo)
6. **Docs:** `docs/MAIL.md` + TASK.md update.

### ⚠️ Free-tier constraints (yaad rakho)
- Supabase 500MB → attachments carefully; older mails purge policy socho
- Resend 3000/month → outgoing limit per user dikhao UI mein
- Cloudflare Email Routing free hai ✓
- DB inactivity pause (7 days) → SETUP.md mein "keep alive" tip already hai?

---

## 📋 STEP 4 — CROSS-APP SSO (Step 3 ke baad)

**Goal:** ClashDrive + GrixChat mein asli "Sign in with Gothwad" + SSO.

1. **ClashDrive (Drive)** = Telegram-backed storage app:
   - Auth: OAuth (client_id `gothwad-drive`, scopes `profile drive`)
   - Telegram api_id/api_hash (user ke paas hai, "Indogram" app) sirf
     Worker/server-side secrets mein
   - Files Telegram channel mein store, metadata Supabase mein
2. **GrixChat (Chat)** = messaging app:
   - Auth: OAuth (client_id `gothwad-chat`, scopes `profile chat`)
3. **SSO polish:**
   - Wildcard cookie `Domain=.gothwadtech.com` already set hota hai —
     subdomains par live test
   - "Sign in with Gothwad" button component standard banao (HTML snippet
     docs/OAUTH.md mein already hai — use as source of truth)
4. **Shared profile & contacts:** `profiles` + future `contacts` table
   (scope `profile` se profile mil jaata hai — userinfo endpoint).

## 📋 STEP 5+ (future — abhi detail mat likho)

- Gothwad Notes / Calendar / Browser (OAuth se connect, alag subdomains)
- `gothwad.in` domain migration (sirf config change — Rule #1 ka fayda!)
- 2FA, avatar upload, account deletion
- Custom SMTP (Resend domain verify) → email verification flows

---

## 🏗️ INFRASTRUCTURE DECISIONS (locked in)

| Decision | Kya | Kyun |
|----------|-----|------|
| Frontend | Vanilla HTML/CSS/JS, no build | Beginners samajh sakein; zero-config deploy |
| Backend | Cloudflare Worker (TS, single file) | Free 100K/day, edge fast |
| DB/Auth | Supabase | Free tier + RLS + Auth built-in |
| Session | HttpOnly cookies (gothwad_at/rt/sid) | XSS-safe, SSO via Domain=.APP_DOMAIN |
| OAuth | Auth code + PKCE + rotation | Industry standard, mobile/SPA safe |
| Apps structure | Har app = alag subdomain (mail., drive.) | Accounts = sirf auth hub (3 routes) |
| Domain | APP_DOMAIN env var | gothwad.in migration = 1-line change |
| Email in | Cloudflare Email Routing | Free, Worker se direct DB |
| Email out | Resend | Free 3000/month |
| Storage | Telegram API (ClashDrive) | "Unlimited" free storage |
| DB identity | username only (no email column) | Rule #2 — domain change safe |

## 💰 FREE-TIER BUDGET (hamesha yaad rakho)

| Service | Limit | Kaise bachayenge |
|---------|-------|------------------|
| Workers | 100K req/day | No polling; realtime via Supabase |
| Supabase DB | 500MB | Attachments limited; purge policy (Mail step) |
| Supabase MAU | 50K | Kaafi hai |
| Supabase inactivity | 7-day pause | SETUP.md tip: monthly health check |
| KV (if used) | 100K reads/day | Minimize; prefer DB |
| Resend | 3000 emails/month | Per-user soft limit in Mail UI |
| Pages | Unlimited | — |

---

> **Nayi AI:** Plan yahin hai. Agar Step 3 shuru kar rahe ho to TASK.md ke
> "NEXT UP" ke tasks tick karte jao aur TASK.md work log mein likho. 🚀
