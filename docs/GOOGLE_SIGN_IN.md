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
  Each Gothwad account has at most one Google link. The six-slot limit applies to
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
- Existing native users may explicitly Connect Google after confirming their
  password and local MFA. The same Google identity may authorize another account
  without transferring/merging the original. A different Google identity cannot
  replace an account's existing link. Matching recovery emails never link users.
- Google unlinking, provider replacement and provider-loss account recovery are not
  implemented. A registered passkey can sign in independently; Google-only
  **security reauthentication currently still uses the linked Google account**.
  Adding an optional native password while Google remains accessible provides an
  additional credential for those actions. Never promise recovery from every
  provider-loss scenario just because an email or MFA recovery code is stored.

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
Using the same Google mailbox is not an independent fallback when Google access
is lost. Local MFA recovery codes replace the **second factor**, not Google itself.

## Protocol and storage

Modules: `google-oidc.ts`, `google-proofs.ts`, `google-schema.ts`,
`google-signin.ts`, `routes/auth-google.ts`, and the small frontend Google helpers.
Migrations: `sql/11_google_identities.sql` then `sql/12_google_account_links.sql`,
additive/idempotent and mirrored by Worker cold-start bootstrap after core tables.
The canonical `auth_external_account_links` table has a unique `(issuer,user_id)`
and nonunique indexed `(issuer,subject)`. SQL 12 preserves the legacy table and
copies every existing link with its metadata. A transactional schema-version marker
makes that import one-time, avoiding full legacy scans and resurrected removed links.
New code reads/writes only the canonical table. Use a coordinated Worker/frontend
release: old Worker writes after migration are not imported again. Rolling back
only the Worker is not supported; preserve/back up both tables and roll forward.
Existing users, profiles, sessions and recovery metadata are not rebuilt or merged. No runtime PRAGMA, user-table rebuild or primary-email
column is introduced. `created_passwordless` is immutable identity-origin metadata,
not the current password state (which always comes from the credential column).

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
6. Back up D1 and review/apply SQL 11 then SQL 12 (after existing migrations), or
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
  accounts; reject replacing an existing link or using email alone to merge users.
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
mock page. It covers Add new, two-account selection and actual UI/cookies, not a real Google account. No QA bypass exists
in production routes. Do not install QA dependencies into production dependencies.
