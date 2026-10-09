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
