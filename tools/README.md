# 🛠️ `tools/` — Local Dev, Local D1 Engine & Security Tests (NEVER DEPLOY!)

This directory provides local development servers, SQL migration generators, and automated security & hygiene test suites.

## Canonical visual preview — simulated login and shared UI

Run **`npm run preview:ui`** with the background process tool. The label is
**Accounts visual preview — login and dashboard**, on port **3002**. The owner's
latest instruction explicitly requires visuals, not real sandbox authentication.
The separate tool serves the shared sign-in/dashboard/styles/dialogs with simulated
API responses. Do not inject preview strips, extra buttons, alternate UI or banners.
Use the authorized Arena panel; a raw sandbox link can be blocked by its traffic gateway.

The simulator privately reads `.env.preview` for the configured username/password.
It performs a visual-only input comparison, not password-hash/Worker authentication.
Never hardcode or commit those credentials. Profile, sessions, security metadata and
activity are invented review fixtures. A single **server-memory display flag** allows
the normal-looking identifier/password/dashboard flow without cookies or browser
storage. It is shared across the review process, resets on restart/sign-out, and is
not an identity, credential, real session or security boundary. No tokens are issued.
Simulated profile edits affect only in-memory sample data. External/security actions
are unavailable; no Worker, account database or production API is used or changed.
The simulator refuses production/CI and is not imported by the deployed application.

All 110 scoped UI items are addressed in shared production UI files after explicit
approval of Phases 1–2 together and Phases 3–5 together. This is not a preview-only
redesign. See [completed IDs, scope and evidence](../docs/UI_REVIEW_PHASES.md).
Stop for owner visual review. Real Cloudflare/provider/security and manual accessibility
checks remain separate; never describe visual simulation as production authentication.

Optional browser QA: `node --experimental-strip-types tools/test-visual-preview-browser.mjs`
with external Playwright/Chromium/OpenSSL installed (use `BROWSER_TOOLS_PATH` if outside
the checkout). Test-only `jsqr` and `axe-core` are installed by `npm ci`. It uses loopback
HTTPS without production/provider requests: zero-cookie simulated sign-in/reload, no
strip, all six sections in both themes at 1280/800/390/320px, contrast/touch/keyboard,
forms/dirty/pending/retry, software-keyboard viewport, history/scroll/long values/zero use,
photo framing, method states, session/app confirmations and retained-history filters.
It independently decodes the actual displayed MFA QR and exercises synthetic account
switch/race UI. Scoped axe-core A/AA scans supplement the manual checks; none of these
fixtures certify real authentication/MFA/provider/revocation or full accessibility.
QA restores fictional profile edits and signs out at the end. Sign-out resets the shared
sign-in flag; restarting resets all fictional process-memory edits.

`npm run build` also bundles the pinned, MIT-licensed `qrcode-generator` locally into
`web/vendor/qrcode.js`; attribution is in `web/vendor/QR_LICENSE.txt`. Authenticator
setup keys never go to a QR service. Decoder/accessibility tools are test-only and do
not enter the deployed UI or Worker bundle.

## Actual local authentication testing (separate from UI-only review)

```sh
npm ci
npm run preview:local
```

This explicit development-only command reads **`.env.preview`**, prepares the
account in ignored `.local-d1.sqlite`, then starts the preview on `0.0.0.0:3000`.
It never connects to production D1. Normal `npm start`, `npm run dev`, frontend
builds and deployed Workers do not seed an account or read this private file.

The owner's current local username/password live only in `.env.preview`, already
created in this workspace. **Read that file privately; never print it, commit it,
copy it into docs/examples/frontend, or upload it to Cloudflare.** Preserve both it
and the local database when continuing in another chat. The password in the local
DB is hashed by normal signup; login uses normal authentication, not a bypass.

If a completely fresh workspace lacks the ignored file, ask the owner for local
credentials and create it privately with owner-only permissions (`chmod 600`).
Do not guess them or introduce a public default. Required keys are `DEV_MODE=true`,
`LOCAL_PREVIEW_USERNAME` and `LOCAL_PREVIEW_PASSWORD`; optional keys are
`LOCAL_PREVIEW_FIRST_NAME` and `LOCAL_PREVIEW_LAST_NAME`. No provider secrets belong
in this file. Ignored files do not travel through GitHub into a fresh checkout.

The launcher reuses an existing matching account without resetting profile data,
password, MFA or sessions. If the password was changed while reviewing UI, update
its private configuration to match; a mismatch stops setup rather than silently
resetting credentials. If the local account/database was intentionally deleted,
the next explicit launch recreates the configured account. Setup refuses
production/CI, missing credentials and a non-default database path. No credentials
are logged. Do not use this local-only account for real data.

For Arena, use the background process tool for `npm run preview:local`. Use the
forwarded preview URL and relative `/api` requests; never direct the user's browser
to sandbox localhost. The opt-in launcher pins the exact HTTPS public origin from
`E2B_SANDBOX_ID` and `PORT` for the local server, because the preview proxy may
rewrite Host/protocol. It does not trust arbitrary Origin/X-Forwarded-Host headers
or allow all `.e2b.app` origins. Production Worker CSRF rules are unchanged.
If login fails with `csrf_rejected`, restart with this launcher instead of relaxing
CSRF checks or adding wildcard/`null` origins. Local signup/sign-in/profile flows and UI can be tested;
Google/email/physical-device/cross-app behavior still needs its configured pilot.

**Dashboard access:** use Arena's authorized embedded preview panel. A raw public
preview link/new tab can return E2B's **403 Missing traffic access token** before
Accounts runs. Do not copy traffic tokens into links, frontend code or browser
storage, or disable the gateway. The previous standalone-tab prompt was removed.

In this explicit local Arena mode only, the Node transport adapts the Worker's
host-only authentication cookies to **SameSite=None; Secure; HttpOnly; Partitioned**
(CHIPS). This allows native login inside the cross-site preview while isolating its
cookies by top-level site. The adapter refuses parent-domain or weakened cookies,
retains values/lifetimes and applies equally to refresh/signout clearing cookies.
The exact-origin CSRF checks still apply. Regular localhost and production Worker
cookies stay unchanged; production retains SameSite=Lax and parent-domain SSO.
This is not a browser-storage token fallback or a synthetic authenticated dashboard.

Optional browser regression (requires external Playwright/Chromium and OpenSSL):
`node --experimental-strip-types tools/test-preview-browser.mjs`. It privately
reads local configuration, uses temporary loopback HTTPS with browser DNS mapped
to loopback, and forwards only real browser cookies to the local server. No
outbound provider/production requests, shared API cookie jar or route-fulfilled
Set-Cookie responses are used; those shortcuts can mask blocked cookies or lose
partition keys. Temporary self-signed TLS certificates are deleted after testing.
The check enables third-party cookie restrictions, verifies embedded native login,
authenticated reload, six desktop/mobile sections, actual browser partition keys,
isolation from another top-level site, partitioned signout, and a modeled gateway
that rejects standalone tabs. It does not certify the live Arena/E2B gateway;
the owner must still check the actual preview panel.

Historical owner checks on port 3000 failed after dashboard loading. Do not claim the live
preview is fixed based on simulated checks. The Arena launcher now enables
local-only redacted auth diagnostics (`LOCAL_PREVIEW_TRACE=false` disables them).
Inspect actual owner signin, dashboard-document and auth/me entries: known cookie
names/counts, status and sanitized selector/origin classification only. Never
log bodies, cookie values, traffic tokens, arbitrary headers or account identity.
Use this evidence to distinguish gateway/browser cookie loss from session/selector
failure before making another authentication change. The captured live owner retry
returned signin 200 with six outgoing cookies, but subsequent auth/me requests had
no Cookie header and returned 401. The missing-cookie transport is confirmed;
browser blocking vs platform forwarding is not yet determined. Do not claim a
platform cause from this evidence alone or keep requesting password retries.


## 1. `local-d1.mjs` — Real SQLite D1 Adapter (Zero External Packages!)

Wraps Node 22's built-in `node:sqlite` (`DatabaseSync`) with the exact Cloudflare `D1Database` interface (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`).
- **Zero fake plain-text mocks!** Both `npm start` and all automated tests execute real SQLite constraints, Foreign Keys, `ON DELETE CASCADE`, `UNIQUE` indexes, binary `BLOB` storage, and `PBKDF2-SHA256` hashing!

## 2. Automated Test Suite (`npm test`)

```bash
npm test
```

Runs the authentication, integration and repository hygiene suites, including:
- `tests/d1-native-auth.test.mjs` — Full account lifecycle, SQL `01–05` idempotency, pure username DB rule, dynamic domain change, phone/username signin, real-time session revoke, D1 + R2 avatar upload/ETag `304`, forgot/reset password, internal Mail lookup, `session` vs `oauth_access` JWT isolation, export & cascade account delete
- `tests/kiwi-store-migration.test.mjs` — Store migration, grants preservation, cookies & CORS
- `tests/browser-multi-account-slots.test.mjs` — `a`..`f` `HttpOnly` browser slots, `/u/0..5`, `X-Gothwad-Authuser`, single-slot sign-out
- `tests/universal-account-widget.test.mjs` — Universal Google-style Shadow-DOM account menu (`web/widget/account-menu.js`), secondary account `avatarUrl` slots, cross-subdomain `X-Gothwad-Authuser` CORS
- `tests/frontend-and-filesize.test.mjs` — Frontend integrity, file limits, English-only text and local documentation links
- `tests/password-policy.test.mjs` — Length-only password acceptance across signup/signin/change/reset; no strength/composition gate
- `tools/test-oauth-redirects.mjs` — Native & web redirect allowlist exact-match enforcement
- `tools/test-oauth-security.mjs` — PKCE S256 checks, `<script>` escaping, cookie rotation preservation on 503, single-winner atomic race tests
- `tools/test-oauth-docs.mjs` — Executes the literal client JS snippet in `docs/OAUTH.md`
- `tools/test-oauth-setup.mjs` — Executes `generateStoreOAuthSql()` twice in real SQLite & audits production `wrangler.toml`

## 3. `generate-store-oauth-sql.mjs` — D1 OAuth Callback Generator

```bash
node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
```

Reads `APP_DOMAIN` from `cloudflare-worker/wrangler.toml` and prints ready-to-run, idempotent Cloudflare D1 SQL for `kiwi-store` (web + Android `gothwadstore://` & `kiwistore://`), `gothwad-mail`, `gothwad-meet`, `gothwad-chat`, and `gothwad-drive`.

## 4. `dev-server.js` — Standalone Static + Proxy Dev Server

- Quick single-process preview: `npm start` (`node --experimental-strip-types server.js` on port `3000`)
- Split Wrangler preview: `cd cloudflare-worker && npx wrangler dev` (`:8787`) + `node tools/dev-server.js` (`:3000`)

## Entry UI browser regression

`node tools/test-auth-entry-browser.mjs` checks the local preview at port 3000 on a
390px viewport: Create New labels, collapsed optional birthday, combined email/password, first-step-only Google,
Back navigation and password/MFA method visibility, plus 390px/1280px keyboard
regressions in `auth-keyboard-checks.mjs`: visible-step Enter/focus, held Enter,
implicit submission, hidden-form rejection, pending/terminal locks, recovery,
reset and Google consent/chooser/MFA, plus short-height disclosure geometry in both themes. It creates a synthetic local
account only. Set `BROWSER_TOOLS_PATH` for an external Playwright installation and
`SERVERLESS_CHROMIUM=true` when using `@sparticuz/chromium`. No production URL is
accepted. Google provider integration has its separate synthetic browser QA:
`node --experimental-strip-types tools/test-google-browser.mjs`. It runs an isolated
local server/database with a mock provider and covers chooser/COOP/cache isolation,
passwordless/native backup linking, removal/final-method protection, account-change
response rejection, alert-failure notices and backup Google sign-in. It never uses
production, real provider tokens or actual email delivery.

## Lightweight entry bundles

`npm run build` also runs `tools/bundle-auth.mjs`. Edit modular sources, then rebuild;
do not hand-edit `web/assets/auth` outputs. See [entry performance](../docs/AUTH_ENTRY_PERFORMANCE.md)
for hashed assets, shared preloading, local cache policy and measurement limits.
