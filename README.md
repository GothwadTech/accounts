# Gothwad Accounts

Central identity, multi-account SSO and OAuth/PKCE provider for Gothwad apps.
Vanilla HTML/CSS/JavaScript runs on Cloudflare Pages; the API runs on a Cloudflare
Worker with a dedicated D1 database. No frontend framework or paid/card-gated
service is required by the core stack. Provider quotas still apply.

## Features and boundaries

- Native password authentication and passwordless Google onboarding with explicit
  identity linking; one Google identity may authorize multiple separate accounts.
  Returning users choose an existing account or Add new; no implicit sign-in or
  automatic email-based merge. Each Gothwad account can also connect up to three
  Google accounts, with verified add/remove controls in Security. SQL 12/13 preserve
  existing links; removal protects the last method and signs out other devices.
- Optional authenticator MFA, recovery codes and user-verified passkeys.
- Six HttpOnly parent-domain account slots, `/u/0..5` per-tab routing and the
  shared Universal Account Menu in `web/widget/`.
- Username-only primary identities, profile/avatars, device revocation, export,
  account deletion and OAuth 2.0 with S256 PKCE.
- No session/OAuth credentials in browser storage. Secrets remain server-side.
- New usernames use 3–24 lowercase letters and numbers only; no dots, dashes or
  underscores. Historical usernames still work for sign-in/recovery. The optional
  birthday is one joined Day / Month / Year field, without a calendar picker.
- Passwords need at least 8 characters with no composition/strength requirement;
  the existing server safety cap is 128. Create New has no strength meter.

Google sign-in was merged in PR #26 and is owner-confirmed working after redirect
configuration. Source verification of the current changes is not proof of a
production deployment.
Synthetic tests do not establish live email delivery, provider approval, backup
recovery or physical-device security. Use the owner checklist before release.

## Start locally

Use Node 22 or newer with built-in SQLite support.

```sh
npm ci
npm run build
npm test
npm start
```

For **visual login/dashboard review**, use **`npm run preview:ui`** (port 3002).
This is an explicitly simulated backend serving the same shared UI files, with no
extra preview strip/buttons. It uses private `.env.preview` settings for the visual
identifier/password flow, fabricated profile/activity data and a single in-memory
display state. No cookies, real sessions, database or production API are involved.
It is not authentication or account-isolation testing; changes affect sample data only.
Use the authorized Arena preview panel, not a raw external sandbox link.

Keep configured credentials private and out of code, committed docs and Cloudflare.
`npm run preview:local` remains separate for actual Worker/local-database testing;
the previous Arena cookie-transport problem is not a prerequisite for visual review.
All 110 scoped UI review items are addressed after explicit approval of all five
phases, including Phases 3–5 together. 309 automated tests, build/types, extended
visual/race checks and scoped automated accessibility scans pass. Stop for owner review;
production authentication/security and manual accessibility validation remain separate. See [preview instructions](tools/README.md) and the
[full UI plan and acceptance checks](docs/UI_REVIEW_PHASES.md).
The first 12 improvements are implemented. Stop for owner review before any remaining
phase; real Cloudflare/provider/security validation remains a separate pilot.
The server binds to `0.0.0.0:3000`, serves `web/` and runs the Worker against an
ignored local SQLite database. Dev/start builds once; rebuild after source edits.
Do not hand-edit generated `web/assets/auth` bundles; ship entry HTML and bundles
together, including the Google callback chooser. Google returns to a versioned
UI URL to avoid old automatic-sign-in code. See [entry performance](docs/AUTH_ENTRY_PERFORMANCE.md).

Check Worker types and, with Worker dependencies installed, the production bundle:

```sh
npm exec --no -- tsc --noEmit -p cloudflare-worker/tsconfig.json
cd cloudflare-worker
npm ci
npm run check
```

Build checks verify CSS and entry bundles. Tests cover authentication, OAuth,
SSO/cookies, regression behavior, module links, English-only text and file sizes.
See [local tools](tools/README.md) for optional local-only Chromium, MFA/passkey
Worker checks, and the standalone widget preview (`npm run preview:menu`, port 3010).

## Documentation

| Start here | Responsibility |
|---|---|
| [AGENTS.md](AGENTS.md) | Mandatory engineering rules |
| [TASK.md](TASK.md) | Current status and recent changes |
| [HANDOVER.md](HANDOVER.md) | Working-tree handoff and verification boundaries |
| [PLAN.md](PLAN.md) | Next work and scope decisions |
| [Documentation index](docs/README.md) | Setup, architecture, security and sibling-app handoffs |
| [Owner checklist](docs/SECURITY_OWNER_CHECKLIST.md) | Production approval and operational checks |
| [Setup](docs/SETUP.md) | Accounts Pages, Worker, D1 and private configuration |
| [Google sign-in](docs/GOOGLE_SIGN_IN.md) | Provider setup, linking and recovery limitations |
| [Mail contract](docs/MAIL_INTERNAL.md) / [OAuth](docs/OAUTH.md) | Consumer integration contracts |

Pages and Worker deployments must be checked independently. A successful Pages
build or merge does not prove that API endpoints were released; see
[Worker troubleshooting](docs/WORKER_BUILD_TROUBLESHOOTING.md).

The source-controlled recovery sender is
`Gothwad Accounts <security@noreply.gothwadtech.com>`. Verify the sending subdomain
and configure RESEND_API_KEY privately before testing real delivery. Repository
configuration alone does not establish delivery.

## Engineering rules

English only; files at most 500 lines; APP_DOMAIN-driven configuration; dedicated
Accounts data; no browser-storage credentials; additive idempotent migrations;
PBKDF2 at most 100,000 iterations; preserve OAuth/session and six-slot cookie
contracts. Do not change sibling applications or deploy without authorization.
