# 🛠️ tools/ — Local Dev Helpers (NEVER DEPLOY!)

Yeh scripts sirf development/testing ke liye hain. Production mein kabhi
mat chalao.

## dev-server.js — Website + API proxy

```bash
node tools/dev-server.js          # → http://localhost:3000
```

- `web/` folder serve karta hai (pretty URLs: `/signin` → `web/signin/index.html`)
- `/api/*` aur `/oauth/*` ko Worker (`http://127.0.0.1:8787`) par proxy karta
  hai — same origin, koi CORS issue nahi
- Env vars (optional): `PORT=3000`, `WORKER_URL=http://127.0.0.1:8787`

## mock-supabase.js — FAKE Supabase (offline testing)

> NOTE: dono tools ab ES modules hain (repo ka `package.json` `"type": "module"`
> hai). Mock mein ab Storage API (avatars), admin user-delete aur
> `account_activity` table bhi supported hai — naye features offline test
> karne ke liye.

```bash
node tools/mock-supabase.js       # → http://127.0.0.1:8788
```

> ⚠️ **YEH REAL AUTH NAHI HAI.** Passwords plain text file mein rehte hain
> (`tools/.mock-data.json` — gitignored). Sirf isliye hai taaki bina Supabase
> project ke poora signup/login/OAuth flow test ho sake.
> **Production = hamesha asli Supabase** (docs/SETUP.md).

- Worker `.dev.vars` mein `SUPABASE_URL=http://127.0.0.1:8788` set hota hai
  (`.dev.vars.example` mein commented Option B dekho)
- Data: `tools/.mock-data.json` mein save — reset karna ho to file delete karo
- Kya emulate karta hai: auth (signup/login/refresh/logout/admin generate_link),
  profiles, user_sessions, ecosystem_apps (seeded), oauth tables, grants

## OAuth regression tests — offline, no production services

```bash
npm test
# equivalent: node --experimental-strip-types --test tools/test-oauth-*.mjs
```

Node 22+; no extra packages or running servers needed. Tests call the actual
Worker against in-memory REST fixtures and execute the documented callback
example. Coverage: redirect allowlists, PKCE bypass rejection, consent escaping,
cookie refresh, code/refresh races, failed DB writes, state expiry/reuse and URL
construction. Configuration tests cover the SQL generator and production DEV_MODE.
These tests do not update or verify the live database.

## generate-store-oauth-sql.mjs — owner-reviewed setup packet

```bash
node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
```

Prints safe, transactional registration SQL for Android + the four standard web
sites, using the domain from Worker config. No network/database calls. Run the
result manually in **Accounts** Supabase, not Store's project. Keeps existing
callbacks; never resets confidential client secrets. The generated file is a
local deployment artifact, not source code. Full steps:
[docs/STORE_OAUTH.md](../docs/STORE_OAUTH.md).

## Local dev poora setup

```bash
# Terminal 1
node tools/mock-supabase.js

# Terminal 2
cd cloudflare-worker && cp .dev.vars.example .dev.vars && npx wrangler dev

# Terminal 3
node tools/dev-server.js
```

Test flow: `/signup` → `/me` → signout → `/signin` → forgot password →
OAuth decision/token/userinfo (curl examples: AGENTS.md §7)
