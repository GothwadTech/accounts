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
- **PKCE** (S256) — public clients ke liye mandatory at authorize, consent POST and token exchange; verifier 43–128 RFC 7636 characters, challenge 43 base64url characters
- **One-time codes** — 5 min expiry, atomic consumption prevents parallel reuse
- **Refresh token rotation** — atomic consumption; clients must single-flight refresh requests
- **DB mein sirf hashes** — raw refresh tokens kabhi store nahi
- **Exact redirect_uri match** — koi bhi random URL allowed nahi

---

## 📌 Endpoints

Base URL: aapka Worker ka public URL. Recommended setup (Worker route
`accounts.gothwadtech.com/api/*`, see docs/SETUP.md Step 2D):

- **Base URL = `https://accounts.gothwadtech.com/api`**
  → endpoints: `/api/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo`
- Agar custom domain `api.gothwadtech.com` use kiya ho: base = `https://api.gothwadtech.com`
  → endpoints: `/oauth/authorize`, `/oauth/token`, ...

⚠️ Route `/api/*` par hai, isliye `accounts.gothwadtech.com/oauth/...` (bina `/api`)
Worker tak NAHI pahunchta — hamesha `/api` prefix wala base use karo.

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

**Store Android/web:** [STORE_OAUTH.md](STORE_OAUTH.md) mein exact callbacks,
`sql/05_store_android_oauth.sql`, aur web `/api` URL fix hai. Android callback
`gothwadstore://oauth/callback` hai — web `/auth/callback` se alag.

**Accounts** ke Supabase SQL Editor mein (Store/Mail ke project mein nahi;
Supabase Authentication → URL Configuration bhi is registry ko nahi badalta):

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

## 🥝 Kiwi Store client migration

Accounts keeps its own product branding, API hosts, and cookie domain. Only the
Store OAuth client is renamed. The schema in `sql/01_core_schema.sql` defines
`ecosystem_apps.id` as the primary key and `client_id` as the public OAuth ID;
`app_authorizations.app_id` is the only FK to that ID. `oauth_auth_codes.client_id`
and `oauth_refresh_tokens.client_id` are plain text (not FKs). `user_sessions`
stores account-level sessions and has no app/client reference, so cookie SSO
sessions are unaffected.

For an existing production Accounts database, run
`sql/04_kiwi_store_oauth_migration.sql` once in the **Gothwad Accounts Supabase
project**. It is transactional and idempotent. It creates/normalizes
`id=client_id='kiwi-store'`, migrates existing user grants (merging scopes),
removes the old pre-rename app row, deletes pending authorization codes of that
legacy client, and revokes its refresh tokens. Fresh installs get the renamed
seed from `sql/01_core_schema.sql`.

Registered redirect URIs (exact match):

- `https://kiwistore.gothwadtech.com/auth/callback`
- `https://kiwiconsole.gothwadtech.com/auth/callback`
- `https://kiwiadmin.gothwadtech.com/auth/callback`
- `http://localhost:3000/auth/callback`
- `gothwadstore://oauth/callback` (Android APK, current build — same `kiwi-store` client)
- `kiwistore://oauth/callback` (Android APK, planned new scheme — both are accepted during the transition; remove `gothwadstore://` only after every APK uses `kiwistore://`)

`https://kiwiapp.gothwadtech.com/auth/callback` is intentionally not registered
yet; add it only when that app begins sign-in. `ecosystem_apps` has no app-wide
scopes column: scope grants are user-specific in `app_authorizations.scopes`,
and the Store requests `profile email offline_access` as before.

The Store endpoints do not change: browser authorize is
`https://accounts.gothwadtech.com/api/oauth/authorize`; sign-in handoff remains
`https://accounts.gothwadtech.com/signin?choose=1&next=...`; Worker token,
userinfo, and cookie-session calls remain `https://api.gothwadtech.com/oauth/token`,
`/oauth/userinfo`, and `/api/auth/me` (forward the Accounts cookies to `/api/auth/me`).
The existing cookie is dynamically scoped to `Domain=.gothwadtech.com` for any
host under that root, not pinned to a Store hostname. CORS likewise allows
subdomains of `gothwadtech.com`, so the Kiwi hostnames need no per-host CORS
configuration. `accounts.gothwadtech.com`, `api.gothwadtech.com`, and the
Gothwad Accounts branding remain unchanged.

Android and web share the single `kiwi-store` client (public PKCE, no secret in
the APK). The migration does not touch any other client row.

**Token impact:** old refresh tokens are revoked and pending old-client codes
are deleted. Access tokens are stateless JWTs and are not individually revocable
here; any already-issued access JWT may work until its normal one-hour expiry.
After this migration, new authorizations and refreshes use `kiwi-store`.

Post-deploy SQL verification:

```sql
SELECT id, client_id, name, redirect_uris
FROM public.ecosystem_apps
WHERE id = 'kiwi-store';
```

## 🧩 App side integration (copy-paste)

Apni app ke login page mein yeh button + JS copy karo (koi library nahi chahiye):

```html
<button id="btn-signin-gothwad">🔥 Sign in with Gothwad</button>

<script type="module">
  // ⚙️ CONFIG — apni app ke hisaab se badlo
  const GOTHWAD_AUTH_URL = 'https://accounts.gothwadtech.com/api'; // Worker base URL (route wala)
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
    sessionStorage.setItem('oauth_started_at', String(Date.now()));

    // Leading '/' would drop the configured /api path and miss the Worker route.
    const u = new URL('oauth/authorize', GOTHWAD_AUTH_URL.replace(/\/+$/, '') + '/');
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
  const GOTHWAD_AUTH_URL = 'https://accounts.gothwadtech.com/api';
  const CLIENT_ID = 'gothwad-chat';
  const p = new URLSearchParams(location.search);
  const expectedState = sessionStorage.getItem('oauth_state');
  const verifier = sessionStorage.getItem('pkce_verifier');
  const startedAt = Number(sessionStorage.getItem('oauth_started_at'));
  const age = Date.now() - startedAt;

  // Missing state must NEVER match missing state (null === null is not valid).
  // Check errors/denials too; do not consume another request's pending state.
  if (!expectedState || !p.get('state') || p.get('state') !== expectedState ||
      !verifier || !Number.isFinite(startedAt) || startedAt <= 0 || age < 0 || age > 15 * 60 * 1000) {
    alert('Sign-in session is missing, expired or mismatched. Start sign-in again.');
  } else {
    // Consume once before any await. Never leave codes in browser history.
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_started_at');
    history.replaceState({}, '', location.pathname);

    if (p.get('error')) alert('Sign-in cancelled: ' + p.get('error'));
    else if (!p.get('code')) alert('No authorization code returned. Start sign-in again.');
    else {
      try {
        const tokenRes = await fetch(`${GOTHWAD_AUTH_URL}/oauth/token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code', code: p.get('code'),
            redirect_uri: location.origin + '/auth/gothwad/callback',
            client_id: CLIENT_ID, code_verifier: verifier,
          }),
        });
        const tokens = await tokenRes.json();
        if (!tokenRes.ok || !tokens.access_token) throw new Error('Token exchange failed. Start sign-in again.');

        const meRes = await fetch(`${GOTHWAD_AUTH_URL}/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const me = await meRes.json();
        if (!meRes.ok || !me.sub) throw new Error('Profile verification failed.');

        // Demo storage only: a real server-side app should use a secure session.
        // Never reuse an old account's refresh token after a new login.
        sessionStorage.setItem('gothwad_access_token', tokens.access_token);
        if (tokens.refresh_token) sessionStorage.setItem('gothwad_refresh_token', tokens.refresh_token);
        else sessionStorage.removeItem('gothwad_refresh_token');
        console.log('Gothwad sign-in completed');
      } catch (error) {
        alert(error.message || 'Sign-in failed. Please try again.');
      }
    }
  }
</script>
```

For framework apps, put callback exchange behind a shared single-flight promise
(React StrictMode/remounts must not exchange a one-time code twice). Implement
refresh rotation/expiry handling before using the example in a long-lived app.
OAuth refresh tokens use `/oauth/token`, not `/api/auth/refresh` (which is for
Accounts' own Supabase sessions). Keep OAuth tokens, authorization codes and
PKCE verifiers out of logs.

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
| `redirect_uri is not registered` | URI match nahi | `redirect_uris` array check karo; Store: [STORE_OAUTH.md](STORE_OAUTH.md) |
| `temporarily_unavailable` (503) | OAuth database read/write failed | Retry later; check Worker/Supabase configuration, not the callback allowlist |
| `PKCE required` | Public client ne challenge nahi bheja | `code_challenge` add karo |
| `PKCE verification failed` | Galat verifier | Wahi verifier bhejo jo challenge banaya tha |
| `Code is invalid or already used` | Code reuse/expired | Naya login flow karo (code 5 min = 1 baar) |
| `State mismatch` | CSRF / sessionStorage lost | Same tab mein flow complete karo |
