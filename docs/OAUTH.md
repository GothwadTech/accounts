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
        │                                 ├────────────────────────► /signin
        │                                 │  login hai?
        │                                 ├────────────────────────► Consent screen
        │                                 │  (Worker-rendered HTML: Allow / Deny)
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

> Note: Consent screen Worker khud render karta hai (`/oauth/authorize` par).
> Accounts site ke sirf 3 routes hain: `/signin`, `/signup`, `/me`.

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
  'http://localhost:3000/auth/gothwad/callback'  -- dev
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

## 🧩 App side integration (copy-paste)

Apni app ke login page mein yeh button + JS copy karo (koi library nahi chahiye):

```html
<button id="btn-signin-gothwad">🔥 Sign in with Gothwad</button>

<script type="module">
  // ⚙️ CONFIG — apni app ke hisaab se badlo
  const GOTHWAD_AUTH_URL = 'https://accounts-api.gothwadtech.com'; // Worker URL
  const CLIENT_ID = 'gothwad-chat';
  const REDIRECT_URI = location.origin + '/auth/gothwad/callback'; // registered hona chahiye
  const SCOPES = 'profile email offline_access';

  // PKCE generate (bina kisi library ke)
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  document.getElementById('btn-signin-gothwad').addEventListener('click', async () => {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));

    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('oauth_state', state);

    const u = new URL('/oauth/authorize', GOTHWAD_AUTH_URL);
    u.searchParams.set('client_id', CLIENT_ID);
    u.searchParams.set('redirect_uri', REDIRECT_URI);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES);
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
    location.href = u.toString();
  });
</script>
```

Callback page (`/auth/gothwad/callback`) par:

```html
<script type="module">
  const GOTHWAD_AUTH_URL = 'https://accounts-api.gothwadtech.com';
  const CLIENT_ID = 'gothwad-chat';
  const p = new URLSearchParams(location.search);

  if (p.get('error')) alert('Denied: ' + p.get('error'));
  else {
    // 1) Code → token (PKCE verifier ke saath)
    const tokens = await (await fetch(`${GOTHWAD_AUTH_URL}/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: p.get('code'),
        redirect_uri: location.origin + '/auth/gothwad/callback',
        client_id: CLIENT_ID,
        code_verifier: sessionStorage.getItem('pkce_verifier'),
      }),
    })).json();

    // 2) Token save (asli app ise secure storage mein rakhega)
    sessionStorage.setItem('gothwad_access_token', tokens.access_token);

    // 3) UserInfo — user ka profile
    const me = await (await fetch(`${GOTHWAD_AUTH_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })).json();
    console.log('Logged in as:', me.name, me.email);
  }
</script>
```

**Server-side app hai?** (Node/PHP/etc.) To token exchange apne SERVER par karo
(client_secret ke saath) — browser mein secret mat rakho. Flow same hai.

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
