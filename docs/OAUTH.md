# 🔐 GOTHWAD OAUTH 2.0 PROVIDER — Technical Integration Guide

> **Full OAuth 2.0 + S256 PKCE Provider:** First-party native apps (`Kiwi Store Android`) and external web/mobile apps (`GrixChat`, `PlusTube`, `Indogram`, etc.) integrate via standard Authorization Code + PKCE S256 flows. *(Note: First-party `.APP_DOMAIN` web apps such as `Mail` and `Kiwi Store Web` use silent `.APP_DOMAIN` `HttpOnly` cookie SSO instead of OAuth consent screens.)*

---

## 🗺️ End-to-End Authorization Flow

```
[ Client App ]                       [ Gothwad Accounts ]              [ Worker API ]
 "Sign in with Gothwad" tap
        │
        ├─ redirect ──────────────►  /oauth/authorize
        │                                 │  not signed in?
        │                                 ├────────────────────────► /signin
        │                                 │  signed in?
        │                                 ├────────────────────────► Consent screen
        │                                 │  (Worker-rendered HTML: Allow / Deny)
        │  ◄── redirect + code ──────────┤
        │                                │
        ├─ POST /oauth/token (code) ───────────────────────────────►  verify code
        │  ◄── access_token (JWT) + refresh_token ──────────────────  (PKCE S256 check)
        │
        ├─ GET /oauth/userinfo (Bearer token) ────────────────────►  profile JSON
        │  ◄── { name, email, ... } ───────────────────────────────
        ▼
  App signed in! 🎉
```

> Note: The consent screen is rendered directly by the Worker at `/oauth/authorize`.
> The static frontend hosts `/signin`, `/signup`, `/me`, and `/widget/account-menu.js`.

**Built-in Security Guarantees:**
- **PKCE (`S256`)** — Mandatory for public clients at authorization, consent `POST`, and token exchange; verifier length `43–128` RFC 7636 chars, challenge length `43` base64url chars
- **One-time codes** — 5-minute TTL, consumed atomically to prevent concurrent replay
- **Refresh token rotation** — Single-winner atomic rotation; clients must single-flight refresh calls
- **Hashed persistence only** — Raw refresh tokens and secrets are never stored in D1
- **Exact `redirect_uri` allowlist match** — Open redirects are strictly rejected

---

## 📌 Endpoints

Base URL options:
- **Worker Route on Accounts Host:** `https://accounts.gothwadtech.com/api`
  → endpoints: `/api/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo`
- **Dedicated Worker Custom Domain:** `https://api.gothwadtech.com`
  → endpoints: `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`

⚠️ On `accounts.gothwadtech.com`, the Worker route matches `/api/*` — never omit `/api` when calling via `accounts.gothwadtech.com/api/...`!

### 1. `GET /oauth/authorize` — Authorization Endpoint

Redirect the user's browser to:

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

| Parameter | Required | Notes |
|-----------|----------|-------|
| `client_id` | ✅ | Must exist in `ecosystem_apps` |
| `redirect_uri` | ✅ | Exact match against registered `redirect_uris` JSON array |
| `response_type` | ✅ | Must be `code` |
| `scope` | ✅ | Space-separated list (see table below) |
| `state` | Recommended | Random CSRF token echoed back unchanged |
| `code_challenge` | ✅ Public clients | `base64url(sha256(verifier))` |
| `code_challenge_method` | ✅ | Must be `S256` |

### 2. `POST /oauth/token` — Token Exchange & Rotation Endpoint

**Exchange Authorization Code for Tokens:**

```bash
curl -X POST {AUTH}/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "CODE-FROM-REDIRECT",
    "redirect_uri": "https://chat.example.com/auth/gothwad/callback",
    "client_id": "gothwad-chat",
    "code_verifier": "ORIGINAL-PKCE-VERIFIER"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOi...",   // JWT, 1 hour
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile email offline_access",
  "refresh_token": "a1b2c3..."       // included when offline_access scope is granted (30 days)
}
```

**Rotate Refresh Token for a Fresh Access Token:**

```json
{ "grant_type": "refresh_token", "refresh_token": "...", "client_id": "gothwad-chat" }
```

> Both standard `application/x-www-form-urlencoded` and `application/json` request bodies are supported.

### 3. `GET /oauth/userinfo` — UserInfo Endpoint

```bash
curl {AUTH}/oauth/userinfo -H "Authorization: Bearer ACCESS_TOKEN"
```

Response (filtered by granted scopes):

```json
{
  "sub": "user-uuid",
  "name": "Pawan Gothwad",            // scope: profile
  "preferred_username": "pawan",      // scope: profile
  "picture": null,                    // scope: profile
  "email": "pawan@gothwadtech.com",   // scope: email (derived dynamically — username-only DB)
  "email_verified": true,
  "drive": {                          // scope: drive / drive.read
    "used_bytes": 0,
    "limit_bytes": 16106127360,
    "write_access": true
  }
}
```

### 4. `GET /oauth/app-info?client_id=` — Public App Metadata

Returns app name, icon, verification status, and metadata for consent screens.

---

## 🏷️ Supported Scopes

| Scope | Consent Prompt Shown to User | Data Granted to Client |
|-------|------------------------------|------------------------|
| `profile` | "View your basic profile" | Name, username, profile avatar |
| `email` | "View your Gothwad email" | `username@APP_DOMAIN` |
| `drive` | "Read & write Drive files" | Drive read/write + storage quota |
| `drive.read` | "View Drive files" | Read-only Drive access + quota |
| `notes` | "Read & write Notes" | Notes read/write access |
| `chat` | "Access Chat messages" | Messaging access |
| `offline_access` | "Keep you signed in" | Rotating 30-day refresh token |

Always request only the minimal scopes your application requires (principle of least privilege).

---

## 🏢 Client Registration (Cloudflare D1 `ecosystem_apps`)

**Store Android & Web:** See [STORE_OAUTH.md](STORE_OAUTH.md) and `sql/05_store_android_oauth.sql`. Native Android uses custom URI callbacks (`gothwadstore://oauth/callback`, `kiwistore://oauth/callback`).

Run in **Cloudflare Dashboard → D1 → `accounts` → Console**:

```sql
-- Register or update redirect URIs for a public OAuth client (PKCE S256 required)
UPDATE ecosystem_apps
SET redirect_uris = json_array(
  'https://chat.gothwadtech.com/auth/gothwad/callback',
  'http://localhost:3000/auth/gothwad/callback'
)
WHERE id = 'gothwad-chat';
```

**Confidential Client** (server-side backend holding a `client_secret`):
- Store **only** the lowercase hex `SHA-256` digest in `secret_hash` — never store raw client secrets in the database.
- Leave `secret_hash = NULL` for public mobile/SPA clients protected by PKCE S256.

---

## 🥝 Kiwi Store Client Migration Notes

`sql/04_kiwi_store_oauth_migration.sql` registers `id = client_id = 'kiwi-store'`, preserves prior user grants, clears stale legacy authorization codes, and revokes old refresh tokens idempotently:

- `https://kiwistore.gothwadtech.com/auth/callback`
- `https://kiwiconsole.gothwadtech.com/auth/callback`
- `https://kiwiadmin.gothwadtech.com/auth/callback`
- `http://localhost:3000/auth/callback`
- `gothwadstore://oauth/callback` (Android APK)
- `kiwistore://oauth/callback` (Android APK transition scheme)

---

## 🧩 Client Integration Example (Zero Dependencies)

Add this login button and PKCE launcher to your client sign-in page:

```html
<button id="btn-signin-gothwad">🔥 Sign in with Gothwad</button>

<script type="module">
  // ⚙️ Configuration — update for your registered OAuth client
  const GOTHWAD_AUTH_URL = 'https://accounts.gothwadtech.com/api'; // Worker base URL
  const CLIENT_ID = 'gothwad-chat';
  const REDIRECT_URI = location.origin + '/auth/gothwad/callback'; // must match ecosystem_apps.redirect_uris
  const SCOPES = 'profile email offline_access';

  // Generate PKCE S256 challenge using WebCrypto
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

On your callback route (`/auth/gothwad/callback`):

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

For SPA frameworks, guard callback exchange behind a shared single-flight promise so React StrictMode remounts never exchange a single-use authorization code twice. Server-rendered apps should perform token exchange on the backend with `client_secret` rather than exposing secrets to the browser.

---

## 🔒 Access Token JWT Specification

- Algorithm: **HS256** (signed with Worker `JWT_SECRET`, `token_use: "oauth_access"`)
- Claims: `iss` (accounts origin), `sub` (user UUID), `aud` / `client_id`, `username`, `scope`, `iat`, `exp` (`1 hour`), `jti`
- Clients can verify user profiles directly via `GET /oauth/userinfo` with `Authorization: Bearer <access_token>`.

---

## 🛠️ Troubleshooting

| Error | Cause | Resolution |
|-------|-------|------------|
| `Unknown client_id` | Unregistered client ID | Register client in D1 `ecosystem_apps` |
| `redirect_uri is not registered` | Exact URI mismatch | Add exact URI to `ecosystem_apps.redirect_uris` ([STORE_OAUTH.md](STORE_OAUTH.md)) |
| `temporarily_unavailable` (503) | Database read/write failure | Retry shortly and verify Worker `DB` D1 binding |
| `PKCE required` | Missing challenge on public client | Send `code_challenge` + `code_challenge_method=S256` |
| `PKCE verification failed` | Mismatched `code_verifier` | Send exact RFC 7636 verifier matching initial challenge |
| `Code is invalid or already used` | Expired (> 5 min) or replayed code | Restart authorization flow with single-flight exchange |
| `State mismatch` | CSRF or lost `sessionStorage` | Complete callback in the same browser tab |
