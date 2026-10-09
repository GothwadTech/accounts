# 🔐 GOTHWAD OAUTH 2.0 PROVIDER — Technical Guide

> **Step 2 complete** — Gothwad ab ek OAuth 2.0 provider hai.
> Koi bhi app (GrixChat, ClashDrive, Notes, ya koi third-party) "Sign in with
 Gothwad" button laga sakta hai.

---

## 🗺️ Flow (poora cycle)

```
[ App: GrixChat ]                    [ Gothwad Accounts ]              [ Worker API ]
 "Sign in with Gothwad" tap
        │
        ├─ redirect ──────────────►  /oauth/authorize
        │                                 │  login nahi hai?
        │                                 ├────────────────────────► login.html
        │                                 │  login hai?
        │                                 ├────────────────────────► authorize.html
        │                                 │  (Consent screen: Allow / Deny)
        │  ◄── redirect + code ──────────┤
        │                                │
        ├─ POST /oauth/token (code) ───────────────────────────────►  code verify
        │  ◄── access_token (JWT) + refresh_token ──────────────────  (PKCE check)
        │
        ├─ GET /oauth/userinfo (Bearer token) ────────────────────►  profile JSON
        │  ◄── { name, email, ... } ───────────────────────────────
        ▼
  App logged in! 🎉
```

**Security built-in:**
- **PKCE** (S256) — public clients ke liye mandatory (mobile/SPA safe)
- **One-time codes** — 5 min expiry, reuse impossible
- **Refresh token rotation** — leak par purana token bekaar
- **DB mein sirf hashes** — raw refresh tokens kabhi store nahi
- **Exact redirect_uri match** — koi bhi random URL allowed nahi

---

## 📌 Endpoints

Base URL: aapka Worker (e.g. `https://api.gothwadtech.com`)
(Frontend `https://accounts.gothwadtech.com` par hosted hai. Dono ke liye
`/oauth/*` aur `/api/oauth/*` dono paths kaam karte hain.)

### 1. `GET /oauth/authorize` — Authorization endpoint

User ko browser mein redirect karo:

```
{AUTH}/oauth/authorize
  ?client_id=gothwad-chat
  &redirect_uri=https://chat.example.com/auth/gothwad/callback
  &response_type=code
  &scope=profile%20email%20offline_access
  &state=RANDOM-CSRF-TOKEN
  &code_challenge=BASE64URL-SHA256-OF-VERIFIER
  &code_challenge_method=S256
```

| Param | Required | Notes |
|-------|----------|-------|
| `client_id` | ✅ | `ecosystem_apps` mein registered hona chahiye |
| `redirect_uri` | ✅ | Registered list mein EXACT match |
| `response_type` | ✅ | sirf `code` |
| `scope` | ✅ | space-separated (neeche list) |
| `state` | recommended | CSRF protection — app ko wapas milta hai |
| `code_challenge` | ✅ public clients | PKCE: `base64url(sha256(verifier))` |
| `code_challenge_method` | ✅ | sirf `S256` |

### 2. `POST /oauth/token` — Token endpoint

**Authorization Code → Tokens:**

```bash
curl -X POST {AUTH}/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "CODE-FROM-REDIRECT",
    "redirect_uri": "https://chat.example.com/auth/gothwad/callback",
    "client_id": "gothwad-chat",
    "code_verifier": "WOOHOO-ORIGINAL-VERIFIER"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOi...",   // JWT, 1 hour
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile email offline_access",
  "refresh_token": "a1b2c3..."       // sirf offline_access scope par (30 days)
}
```

**Refresh Token → naya Access Token (rotation):**

```json
{ "grant_type": "refresh_token", "refresh_token": "...", "client_id": "gothwad-chat" }
```

> Form-encoding (`application/x-www-form-urlencoded`) standard hai —
> JSON bhi accept hota hai (beginner-friendly).

### 3. `GET /oauth/userinfo` — UserInfo endpoint

```bash
curl {AUTH}/oauth/userinfo -H "Authorization: Bearer ACCESS_TOKEN"
```

Response (scopes par depend karta hai):

```json
{
  "sub": "user-uuid",
  "name": "Pawan Gothwad",            // scope: profile
  "preferred_username": "pawan",      // scope: profile
  "picture": null,                    // scope: profile
  "email": "pawan@gothwadtech.com",   // scope: email (derived — DB mein username only)
  "email_verified": true,
  "drive": {                          // scope: drive / drive.read
    "used_bytes": 0,
    "limit_bytes": 16106127360,
    "write_access": true
  }
}
```

### 4. `GET /oauth/app-info?client_id=` — Public app details

Consent screen ke liye (name, icon, supported scopes).

---

## 🏷️ Scopes (Scope management)

| Scope | User ko consent screen par | App ko kya milta hai |
|-------|---------------------------|----------------------|
| `profile` | "View your basic profile" | name, username, avatar |
| `email` | "View your Gothwad email" | `username@APP_DOMAIN` |
| `drive` | "Read & write Drive files" | Drive read+write + quota |
| `drive.read` | "View Drive files" | Drive read + quota |
| `notes` | "Read & write Notes" | Notes access |
| `chat` | "Access Chat messages" | Chat access |
| `offline_access` | "Keep you signed in" | Refresh token (30 days) |

Apps sirf wohi scopes maangti hain jinhe unhe chahiye (least privilege!).

---

## 🏢 Client registration (apps ko register karo)

Supabase SQL Editor mein:

```sql
-- Example: GrixChat ko register karo
UPDATE public.ecosystem_apps
SET redirect_uris = ARRAY[
  'https://chat.gothwadtech.com/auth/gothwad/callback',
  'http://localhost:3000/examples/sign-in-with-gothwad/callback.html'  -- dev
]
WHERE id = 'gothwad-chat';
```

**Confidential client** (server-side app, client_secret ke saath):

```sql
-- secret ka SHA-256 hash store karo (raw secret KABHI nahi)
UPDATE public.ecosystem_apps
SET secret_hash = encode(sha256('YOUR-SUPER-SECRET'::bytea), 'hex')
WHERE id = 'gothwad-drive';
```

Public clients (mobile/SPA) ke liye `secret_hash` NULL chhodo —
PKCE unhe protect karta hai.

---

## 🧩 App side integration (quick version)

Pura copy-paste example: [`examples/sign-in-with-gothwad/`](../examples/sign-in-with-gothwad/)

```js
// 1. PKCE pair banao
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

// 2. User ko bhejo
location.href = `${AUTH}/oauth/authorize?client_id=gothwad-chat&redirect_uri=${encodeURIComponent(cb)}&response_type=code&scope=profile email&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

// 3. Callback par: code → token → userinfo (callback.html dekho)
```

---

## 🔒 JWT Access Token

- Algorithm: **HS256** (Worker ke `JWT_SECRET` se sign)
- Claims: `iss` (accounts URL), `sub` (user id), `aud`/`client_id`,
  `username`, `scope`, `iat`, `exp` (1 hour), `jti`
- Apps ko token verify karne ki zaroorat nahi — bas `/oauth/userinfo`
  par Bearer bhejo. (Advanced: apna secret share karke direct verify bhi kar sakte ho.)

---

## 🛠️ Troubleshooting

| Error | Matlab | Fix |
|-------|--------|-----|
| `Unknown client_id` | App register nahi | SQL UPDATE chalao (upar) |
| `redirect_uri is not registered` | URI match nahi | `redirect_uris` array check karo |
| `PKCE required` | Public client ne challenge nahi bheja | `code_challenge` add karo |
| `PKCE verification failed` | Galat verifier | Wahi verifier bhejo jo challenge banaya tha |
| `Code is invalid or already used` | Code reuse/expired | Naya login flow karo (code 5 min = 1 baar) |
| `State mismatch` | CSRF / sessionStorage lost | Same tab mein flow complete karo |
