# 🔘 "Sign in with Gothwad" — Integration Guide

Yeh folder ek **copy-paste ready demo** hai. GrixChat, ClashDrive, Notes —
kisi bhi app mein Gothwad login lagana ho, bas yeh 2 files copy karo aur
config badlo. Koi library/framework nahi chahiye!

## Files

| File | Kya hai |
|------|---------|
| `index.html` | Demo app + **"Sign in with Gothwad" button** (PKCE generate karta hai) |
| `callback.html` | OAuth callback — code → token → user profile |

## Apni app mein lagane ke liye (3 steps)

### 1. Button + login JS copy karo

`index.html` mein `<!-- SIGN IN WITH GOTHWAD BUTTON -->` section aur
`<script>` block copy karo. Do values badlo:

```js
const GOTHWAD_AUTH_URL = 'https://accounts.gothwadtech.com'; // apna accounts URL
const CLIENT_ID = 'gothwad-chat';   // apni app ki id (schema.sql mein registered)
const SCOPES = 'profile email';     // jitna access chahiye
```

### 2. Callback page banao

`callback.html` copy karo → same `CLIENT_ID` / `GOTHWAD_AUTH_URL` set karo.
Callback URL app mein register karna hoga — Supabase SQL Editor mein:

```sql
UPDATE public.ecosystem_apps
SET redirect_uris = ARRAY[
  'https://aap-ki-app.com/auth/gothwad/callback',   -- production
  'http://localhost:3000/examples/sign-in-with-gothwad/callback.html' -- dev
]
WHERE id = 'gothwad-chat';
```

### 3. Token use karo

Callback mein `sessionStorage` mein token save hota hai. API calls mein:

```js
fetch('https://accounts-api.gothwadtech.com/oauth/userinfo', {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

**Server-side app hai?** (Node/PHP/etc.) To token exchange apne SERVER par karo
(client_secret ke saath) — browser mein secret mat rakho. Flow same hai.

## Scopes (Scope management)

| Scope | Kya milta hai |
|-------|---------------|
| `profile` | Name, username, avatar |
| `email` | `username@gothwadtech.com` address |
| `drive` / `drive.read` | Drive files read/write ya sirf read |
| `notes` | Notes access |
| `chat` | Chat access |
| `offline_access` | Refresh token (30 din login) |

## OAuth endpoints (standard 2.0)

| Endpoint | URL |
|----------|-----|
| Authorize | `GET  {accounts}/oauth/authorize` |
| Token | `POST {accounts}/oauth/token` |
| UserInfo | `GET  {accounts}/oauth/userinfo` |
| App info | `GET  {accounts}/oauth/app-info` |

Full technical docs: [../../docs/OAUTH.md](../../docs/OAUTH.md)
