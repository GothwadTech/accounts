# ⚡ GOTHWAD AUTH WORKER (Cloudflare Worker)

> Part of Gothwad Accounts — overview: [README.md](../README.md) ·
> AI guide: [AGENTS.md](../AGENTS.md) · Architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

Yeh Worker Gothwad Accounts ka **real backend** hai — saare `/api/auth/*`
aur `/oauth/*` routes. Ek hi file: `src/index.ts` (well-commented TypeScript).

## API Routes

| Method | Route | Kya karta hai |
|--------|-------|---------------|
| GET | `/api/health` | Health check |
| GET | `/api/auth/check-username?username=` | Username available hai? |
| POST | `/api/auth/signup` | Naya account + auto-login |
| POST | `/api/auth/signin` | Login (username ya email) |
| POST | `/api/auth/signout` | Logout (cookies clear + token revoke) |
| GET | `/api/auth/me` | Current session (auto-refresh JWT) |
| POST | `/api/auth/forgot-password` | Reset link → recovery email |
| POST | `/api/auth/reset-password` | Naya password (email link token se) |
| POST | `/api/auth/change-password` | Logged-in password change |
| POST | `/api/auth/update-profile` | Profile update |
| GET | `/api/auth/sessions` | Device sessions list |
| POST | `/api/auth/sessions/revoke` | Ek device sign-out |
| POST | `/api/auth/sessions/revoke-others` | Other devices sign-out |

## Local Development

```bash
cp .dev.vars.example .dev.vars   # apni keys daalo (mock values already included)
npm install
npx wrangler dev                 # → http://127.0.0.1:8787
```

## Deploy

```bash
npx wrangler login               # pehli baar
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Config (`wrangler.toml`) aur env vars ki poori list:
[docs/SETUP.md](../docs/SETUP.md) + [.env.example](../.env.example)

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` sirf yahan rehti hai (secret) — frontend kabhi nahi.
- Session tokens **HttpOnly cookies** mein (JS access nahi kar sakta).
- CORS sirf `*.APP_DOMAIN` + configured origins ke liye enabled.
- Passwords kabhi store nahi hote — Supabase Auth hash sambhalta hai.
