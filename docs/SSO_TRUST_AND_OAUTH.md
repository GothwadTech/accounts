# SSO Trust and OAuth Revocation

Updated: 2026-10-29. Implemented locally, **not deployed**. This is a compatibility
migration requiring a reviewed release, not a claim that every ecosystem app has
already been updated or production-tested.

## Read-only consumer audit

Reviewed current GitHub source on 2026-10-29 without editing other repositories:

| Consumer | Revision | Observed contract |
|---|---|---|
| `GothwadTech/mail` | `7764dcea7eadab1cb1d1e7beef977f3700664f81` | `worker/src/accounts.ts` forwards an explicit browser/configured Mail origin for switch/signout and preserves separate `gothwad_*` Set-Cookie headers. `worker/src/session.ts` reads cookie identity via GET `/auth/me`, preserves rotated cookies, and resolves bearer OAuth identity via `/oauth/userinfo`. |
| `GothwadTech/store` | `c41d95ae2a6c11c40f697852c5ef3d30cfbec300` | `worker/src/auth.ts` supports GET `/auth/me` cookie identity and OAuth code exchange/userinfo. Native OAuth tokens remain part of the OAuth response contract. |
| Accounts frontend/widget | Current working tree | Cookie-based identity and six-slot selectors; no need for session credentials in response JSON. |

Mail's current source differs from the older headerless-`Accept` reproduction test.
That regression now reflects the explicit Origin actually forwarded by Mail.
Store's source exposes an OAuth-token response to its own consumer; that downstream
storage/transport policy is outside this Accounts-only change. No cross-app browser
pilot, deployed-revision proof, or full audit of Drive/Meet/native app versions was
performed. Unknown/older adapters must be checked before release.

## Exact trust policy

Credentialed browser access and redirects trust only:

- Exact `AUTH_HUB_URL` origin.
- Explicit HTTPS hosts derived from `APP_DOMAIN`: apex, `accounts`, `api`, `mail`,
  `meet`, `drive`, `notes`, `calendar`, `contacts`, `kiwistore`, `kiwiconsole`,
  `kiwiadmin`, and `kiwiapp`.
- Exact additional HTTPS origins listed in Worker `ALLOWED_ORIGINS`. No wildcard
  sibling/preview matching. Configure frontend `SSO_REDIRECT_ORIGINS` for any
  additional destination that the account UI should redirect to.
- Loopback development origins only under the existing local/development policy.

An origin is scheme + host + port, not a service name. Unknown/nested sibling hosts,
credential-bearing URLs, unexpected ports, insecure remote origins, backslash/control
character redirects, malformed values, and opaque `null` origins are refused.
Passkey origin policy is stricter: only the exact identity origin.

Writes require trusted Origin/Referer or explicit authenticated proxy transport.
`Accept: application/json`, `Sec-Fetch-Site`, and forwarding headers are not proxy
credentials. Headerless OAuth `/token` exchange remains supported because it uses
PKCE/client authentication and does not authorize from browser cookies.
Cookie identity GETs remain available to existing server proxies.

### Authenticated legacy server transport

An optional Worker secret `SSO_PROXY_TOKEN` (at least 32 unpredictable characters)
authenticates headerless server requests through `X-Gothwad-Proxy-Token`, compared
without an early-exit byte comparison. Configure it only in approved backend secret
stores, never in frontend variables, JavaScript, Web Storage, logs, or URLs.

Explicit hostile Origin/Referer evidence still rejects the write even when the
proxy header is correct. The header is not allowed by browser CORS. Forwarded
trusted Origin alone preserves ordinary cookie-proxy compatibility; it is **not**
a cryptographic claim identifying a particular backend. Treat every service holding
parent-domain cookies as trusted within the current architecture.

Signup/sign-in/refresh responses are cookie-only unless the caller proves server
transport and supplies no browser Origin, Referer, or fetch-metadata header.
The legacy credential response remains only for this authenticated server case.
OAuth `/token` access/refresh responses are unchanged and separate from account
session credentials. No token is moved into browser storage by Accounts.

## Durable OAuth credentials

Migration `sql/10_oauth_credential_bindings.sql` adds a hash-only credential ledger.
Each authorization code, OAuth access token, and refresh token is bound to:

- credential kind and expiry;
- the user and client;
- the current consent grant ID;
- the account password-hash snapshot.

Consent grant/code/ledger persistence is atomic. Code or refresh consumption and
replacement access/refresh records are one D1 batch with live grant/password/scope
checks. Concurrent consumption has one winner; storage failure rolls back issuance.

`/oauth/userinfo` verifies signature, token type, exact issuer, client/audience,
required expiry/issue-time claims, current credential binding, live user/password,
consent grant, and scope inclusion. Missing/removed bindings fail closed.

Disconnecting a non-core app removes its grant, ledger, pending codes, and revokes
refresh credentials together. Existing OAuth access fails the next userinfo check;
new consent uses a different grant ID and cannot resurrect old tokens. Password
change/reset invalidates OAuth credentials through the password snapshot. Enabling
or disabling authenticator MFA removes existing credential bindings. In-flight
requests authorized before a revocation may finish.

**Release impact:** previously issued OAuth tokens/codes lack ledger records and
will be rejected. Consumers must handle `invalid_grant`/`invalid_token` by requesting
fresh authorization. Do not backfill legacy tokens as trusted merely to avoid this
re-consent. Offline JWT verification alone cannot observe this ledger; downstream
services must use authoritative userinfo/introspection-equivalent checks rather
than claim immediate revocation from signature verification alone.

Core-service disconnect restrictions are unchanged. Signing-key rotation is not a
substitute for per-app revocation and must not be used as an automatic migration.

## Shared-cookie residual risk and future design

Parent-domain HttpOnly cookie names, domain, six slots, separate Set-Cookie headers,
and `/u/0..5` / `authuser` contracts are intentionally preserved. Exact CORS does not
prevent a compromised sibling backend receiving a parent-domain cookie or injecting
conflicting cookies. This residual trust is not fixed by claiming cookies are host-only.

A future coordinated protocol would keep identity cookies on the identity host,
redirect each app using state + S256 PKCE + exact registered callbacks, exchange
codes server-side, and give each app its own host-only session. Silent selection
would use the Accounts top-level chooser rather than sharing raw identity cookies.
All consumers need deployment, account-selector, logout/revocation, expiry, rollback,
and transition tests before retiring parent-domain cookies. No such cross-repository
migration is authorized or applied here.
