# Google sign-in: implementation and owner setup

## Status — 2026-11-05

Implemented locally in Accounts only. Google is **disabled until both client
credentials are configured**. No Google project, consent screen, production secret,
DNS, Worker route, migration, deployment or real-provider login was changed or
verified during this implementation. Other apps continue using Gothwad sessions
or Accounts' OAuth provider; they do not need their own Google integrations.
Microsoft, Apple, a domain purchase and a future rebrand are out of scope.

## Account behavior

- Native signup/signin remains available.
- Continue with Google identifies a Google account by canonical issuer plus stable
  `sub`, never by email. Each linked Gothwad account keeps its own ID and data.
- One Google identity may create/link multiple Gothwad accounts. Returning users
  see every linked account plus **Add new account**; none is automatically selected.
  Add new opens passwordless onboarding, with Back to accounts when links exist.
  Each Gothwad account may connect up to three Google accounts in Security settings.
  This is an Accounts product limit, not a Google restriction. The six-slot limit applies to
  simultaneous browser sessions, not the total number of Google-linked accounts.
- New users choose an available 3–24-character Gothwad username, enter names,
  optionally supply gender, confirm the suggested Google recovery email,
  and accept the terms. Date of birth is not requested during signup.
  **No password is requested, generated or hashed.**
- The Gothwad address is derived from username and APP_DOMAIN. This is not mailbox
  provisioning. Google's email is secondary authentication/recovery metadata.
- The existing NOT NULL credential column contains a unique `!no-password:`
  disabled-credential marker, not a random password or usable password hash.
  Native password verification always rejects it. Keeping the non-null snapshot
  preserves existing MFA/passkey/session race guards without rebuilding users.
- `/auth/me` and auth responses expose `has_password` and `google_linked`, never
  credential hashes. Security shows **No password added / Add password** until a
  password is actually added; then it shows **Change password**.
- Add password requires a live selected-account session, fresh linked-Google proof
  and local MFA when enabled. It uses the same atomic snapshot/version gates and
  other-device revocation as Change password. One session alone is insufficient.
- Google-only users can enroll/manage MFA, register/remove passkeys, change phone
  or recovery details, and delete their account with fresh Google verification;
  existing local MFA and email-confirmation requirements still apply.
- Existing native users confirm their current password and local MFA to connect
  Google. Passwordless users instead freshly verify an already linked Google
  account, plus local MFA. Only then may they authenticate the new Google identity.
  Matching email addresses never link, transfer, replace or merge Gothwad accounts.
- Security → Google accounts lists last verified Google emails and connection dates,
  and offers Add Google account / Remove. One Google identity can still belong to
  several separate Gothwad accounts. Connecting another Google identity does not
  copy profiles or modify recovery details. Keep linked Google accounts private;
  they grant access to the same identity, not separate collaborator permissions.
- Removal requires the account's current credential and MFA. The last Google method
  cannot be removed until a usable native password is added, **even with a passkey**:
  passkeys can sign in, but passkey-only security reauthentication is not implemented.
- Removal atomically rotates the credential snapshot (a new disabled marker, or a
  re-salted hash of the same native password), removes only the chosen method and
  revokes other devices/refresh credentials. Pending Google/MFA/passkey proofs,
  pending recovery changes/reset tokens and existing OAuth credential bindings are
  invalidated. The current device keeps its session; other accounts are unaffected.
- Adding a method invalidates older Google security proofs/flows through a snapshot
  of the full link set, without signing out live devices. Removing then relinking
  the same Google subject cannot resurrect an old proof. Duplicate, concurrent,
  expired or changed-account/security-state callbacks fail closed.
- Add/remove activity is recorded, and best-effort security alerts use the existing
  Resend transport to linked Google addresses and a separately verified current
  recovery address. Missing configuration/delivery failures are explicitly reported;
  they do not silently roll back a completed security mutation. No tokens or codes
  are included in alerts. Live email delivery is still an owner pilot requirement.
- Provider-loss recovery is not guaranteed. An independently accessible backup
  Google account helps; MFA recovery codes replace only the second factor. A stored
  email alone does not prove mailbox ownership or restore a lost Google account.

## Recovery email truth

A confirmed Google Gmail/Googlemail or verified matching Workspace hosted-domain
address is recorded as verified. A Google account using a third-party email is
**not** assumed to prove current control of that mailbox. Its address must pass
separate email confirmation before password recovery is eligible.

For a Google-created account, email password recovery requires both an added
password and a verified current recovery email. Forgot/reset password cannot
silently install the first password, bypass Add password, or trust an unverified
third-party Google mailbox. Explicitly linking an existing native user preserves
that user's pre-existing password-recovery behavior. Recovery replacement still
requires confirming a mailed link; delivery requires the existing Resend setup.
Unlinking Google does **not** change the recovery address. If the removed Google
email remains the recovery address, it may still receive password-reset messages.
The UI identifies this overlap and warns explicitly. Change/confirm the recovery
address separately if that mailbox is compromised; do not assume unlinking alone
removes email-recovery access. New Google methods do not automatically become
recovery addresses or verify/replace an existing recovery address.

Using the same Google mailbox is not an independent fallback when Google access
is lost. Local MFA recovery codes replace the **second factor**, not Google itself.

## Protocol and storage

Modules: `google-oidc.ts`, `google-proofs.ts`, `google-signin.ts`,
`google-method-schema.ts`, `google-methods.ts`, `google-method-management.ts`,
`routes/auth-google.ts` and the frontend helpers/settings.
Run SQL 11 → 12 → **13_google_signin_methods.sql** after the core migrations.
Runtime bootstrap mirrors these additive/idempotent migrations after core tables.
SQL 13 imports SQL 12 links once into `auth_google_methods`, uniquely keyed by
`(issuer,subject,user_id)`, with opaque generation-specific IDs and indexed user
and subject lookups. Both legacy tables remain intact. `auth_google_account_origins`
preserves immutable `created_passwordless` classification even if the original
method is removed. New code reads/writes only these current tables.
Security flow/ticket guard rows bind proofs to the ordered method-ID set, user,
session, credential snapshot, factor version and expiry. Pre-migration temporary
security proofs have no matching guard and require fresh verification; existing
users, profiles, data, browser sessions and passwords are not rebuilt or merged.
One-time schema markers prevent recurring legacy scans and removed-link resurrection.
Stop legacy Worker writes and release matching frontend/backend together. A
Worker-only rollback to the old link tables is unsupported; back up and roll forward.
No runtime PRAGMA or primary-email column is introduced.

`GET /auth/google/links` is authenticated, selected-account-only and no-store; it
returns only opaque IDs, emails, dates, recovery overlap and management limits.
`POST /auth/google/unlink` enforces same-origin CSRF, explicit owned ID, fresh
credential/MFA, live session, current credential state and the last-method guard.
Failed delivery is returned as `notification_sent: false` or a public callback
notice flag; it never changes authorization. Unlink has its own persistent rate limit.

`POST /auth/google/start` creates a five-minute authorization flow with independent
random state, browser binding, PKCE verifier and nonce. State/browser secrets are
hashed for lookup; verifier and nonce remain server-side. Only `openid email
profile` is requested. The GET callback atomically consumes the bound state before
exchanging its code at Google's fixed token endpoint. RS256 signature/JWKS, issuer,
audience/authorized party, fresh issuance, expiry, nonce, stable subject and verified
email are checked server-side. No Google access/refresh/ID token is sent to a browser
or persisted. Unknown or invalid keys/claims and provider failures fail closed.

The callback creates a separate one-use, five-minute onboarding or security ticket
in an HttpOnly cookie. Sign-in finishes through a same-origin CSRF-protected POST.
`GET /auth/google/status` exposes only safe linked-account IDs, usernames and names
for the verified ticket's subject. `POST /auth/google/finish` requires explicit
`action: "select", account_id` or `action: "create"` with onboarding details. Missing,
foreign and expired selections fail closed. Selection and final issuance both check
subject membership; an absent new status contract also fails closed in the UI.
The callback uses a versioned UI document URL, and Google HTML loads content-hashed
bundled code. Callback documents and API requests use no-store. This prevents the
pre-chooser script from reading an absent username or attempting implicit finish;
an outdated deployment must be updated, not accommodated by server auto-selection.
New-user/profile/link writes are atomic; one proof has one winner and cannot create
or select twice. Distinct fresh proofs may create distinct usernames for the same
Google identity. Duplicate usernames leave no orphan rows. The selected account's
own local MFA is required before shared Gothwad session issuance. Shared Google
first-factor access never shares MFA, passwords or account-bound security proofs. A factor-change race fails closed.
Existing six-slot/add-mode/authuser, parent-domain SSO and OAuth contracts remain.

**Only transient Google handshake/proof cookies are host-only.** They are NOT SSO
session cookies and do not change the parent-domain `gothwad_sess_a`–`f` contract.
Proofs are single-use and bound to the user, requesting session, credential snapshot,
MFA version and expiry. Their raw values live only in HttpOnly cookies, not JS or
WebStorage. Settings use a popup with its opener removed; polling tolerates Google
COOP isolation. Allow popups; a cancelled window may need the five-minute timeout
before retry. Only one Google flow per browser should be active at a time; conflicting
flows fail closed. Expired rows are cleaned in bounded batches when flows start.

## Owner setup — do not paste secrets in chat

1. Confirm the Accounts Worker is actually serving the current source at
   `AUTH_HUB_URL/api/*`. Existing deployed MFA/passkey 404 reports are not fixed by
   adding Google configuration. Check independent Pages/Worker deployment results.
2. Keep the frontend on its **same-origin `/api/*` route**, with no redirect to a
   separate API hostname. Google cookies must be set/read on the Accounts host.
   The Google frontend helpers deliberately use that origin, even if other API
   calls use an explicit API_URL. Any proxy must forward Cookie, selected authuser,
   Origin, redirects and each individual Set-Cookie header without caching.
3. In Google Cloud / Google Auth Platform, use a project and configure the app's
   branding, support/developer contacts, authorized domain, home page, privacy and
   terms URLs. Use testing/test-user restrictions until the pilot is reviewed.
   Create an **OAuth client of type Web application**, not Android or an API key.
   No Gmail/Drive permissions, SDK, paid storage or billing-enabled service is needed.
   Do not enable paid services or provide a payment card for this feature.
4. Register this **exact** authorized redirect URI (substitute configured hub):
   `AUTH_HUB_URL/api/auth/google/callback`.
   The hub must be a bare HTTPS origin, optionally with a trailing slash. Production
   HTTP, embedded credentials, query strings and subpaths fail closed. Local HTTP
   is allowed only for localhost/127.0.0.1 with DEV_MODE=true. For local development,
   register a separate localhost redirect URI/client; do not weaken production.
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` privately on the Accounts Worker
   through Cloudflare's secret controls, or run these **only when authorized**:
   ```sh
   cd cloudflare-worker
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   These commands change production configuration; none were run here. Client ID is
   public by design, but both are read server-side. Never commit the client secret.
   Local `server.js` reads the same environment names. Do not commit local values.
6. Back up D1 and review/apply SQL 11, SQL 12 then SQL 13 (after existing migrations), or
   verify the reviewed Worker bootstrap creates/imports them. Stop old Worker writes
   during the migration and deploy matching reviewed backend/frontend together.
   Verify preserved links and Google config returns enabled; complete the pilot below.

## Required live pilot

- New Google signup: unique username, explicit confirmations, no password field or
  usable password hash, correct address and No password added / Add password state.
- Returning chooser with one account, Add new, then both entries; select each and
  verify separate IDs/data/password state, no implicit session and per-account MFA.
- Google email changes, six-slot add/switch and stable authuser indices after repeat
  selection, native login, signout/revocation and cross-app Gothwad SSO.
- Fresh Google reauth for Add password and other settings; deny a different Google
  subject, expired/replayed proof, revoked session and changed MFA/password state.
- Explicit password/MFA-verified linking of the same Google identity to two native
  accounts, and three Google methods on one Gothwad account. Test native-password
  and passwordless management, duplicate/fourth-link rejection, removal/last-method
  protection, pending-proof invalidation, other-device/OAuth revocation and alerts.
  Reject automatic link replacement or email-only merge.
- Google consent cancellation, provider outage, popup blocking, mobile browser
  navigation, actual Google COOP behavior and exact callback routing/cookie scope.
- Separate-email verification and recovery delivery where configured. Confirm that
  provider tokens and credentials never appear in URL fragments, WebStorage or logs.

## Local verification and limits

Run `npm run build`, `npm test`, Worker `tsc --noEmit`, and
`wrangler deploy --dry-run`. Tests use real SQLite constraints/transactions, real
RSA signatures and only a simulated Google HTTP provider. They do not prove Google
console configuration, live JWKS/network access, app branding approval or delivery.

Optional Chromium QA: `node --experimental-strip-types tools/test-google-browser.mjs`
with Playwright installed separately. `BROWSER_TOOLS_PATH` can select an external
QA installation; `SERVERLESS_CHROMIUM=true` enables `@sparticuz/chromium`. This uses
an isolated temporary database, synthetic credentials/provider and a COOP-isolated
mock page. It covers the chooser, passwordless/native backup-method settings,
removal protection and backup Google sign-in with actual UI/cookies, not real Google. No QA bypass exists
in production routes. Do not install QA dependencies into production dependencies.
