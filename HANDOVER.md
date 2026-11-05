# Accounts Handover

Updated 2026-11-05. Current branch: `arena/cc2b6a5f-accounts`.
Read [AGENTS.md](AGENTS.md) for constraints and [TASK.md](TASK.md) for session history.

## Current state

- Baseline: owner's UI commit `6f41d56`, following merged Google PRs #26/#27.
  The owner confirms Google sign-in works after correcting its redirect URI.
  This is owner confirmation, not an independent production security audit.
- Current changes: Create New labels, a collapsed optional birthday disclosure,
  first-step-only Google below Next, password-step-only passkeys, lighter entry
  bundles/system fonts, consistent spacing, and visible-step Enter handling.
- Account creation now uses three steps: name with optional birthday, email and
  one password together, then existing recovery details. No confirmation field or
  strength meter remains. The optional-details chevron reflects open/closed state;
  birthday stays optional and is sent only when filled. It is now one 48px joined
  Day / Month / Year control with internal dividers and numeric entry, no calendar.
- New native/Google usernames allow only 3–24 lowercase letters and numbers.
  Historical punctuated usernames remain valid for sign-in/recovery.
- Google now supports several separate Gothwad accounts per Google identity:
  verified-subject chooser, Add new and explicit selection, never first-match login.
  SQL 12 imports legacy links into canonical `auth_external_account_links` once;
  deploy matching frontend/Worker together with old writes stopped. See the
  [migration and Google pilot](docs/GOOGLE_SIGN_IN.md). No production migration ran.
- Disclosure clicks keep focus on the toggle; top anchoring/stable scrollbar gutter
  prevent threshold recentering. Mobile inputs use 16px text without disabling zoom.
  Existing-account reauthentication now preserves browser account ordering/indices.
- Passwords require at least 8 characters, without composition/strength rules.
  Existing 128-character server safety limits remain unchanged.
- Cleanup removes unused internal UI code and superseded documentation, not
  authentication features, migrations, compatibility APIs, or regression tests.

## Development and verification

```sh
npm run build
npm test
npm exec --no -- tsc --noEmit -p cloudflare-worker/tsconfig.json
```

`npm start` / `npm run dev` builds and starts the preview on port 3000. JavaScript
source changes need another build; there is no watcher. Entry HTML and generated
`web/assets/auth` files must ship together. See [entry performance](docs/AUTH_ENTRY_PERFORMANCE.md).

Optional local browser checks and external Playwright setup are documented in
[tools/README.md](tools/README.md). They cover native entry/keyboard/layout,
synthetic Google onboarding/COOP reauthentication, two-account selection, MFA,
and virtual passkeys. Latest build/types and 256 tests pass; entry and Google
Chromium QA pass, including short-height disclosure geometry in both themes.
Worker deployment dry-run passes. Root and Worker full dependency audits both report
zero vulnerabilities after updating the compatible Worker tooling lock. Build/types,
256 tests and native/Google Chromium checks pass. The owner authorized committing,
pushing and merging the accumulated local work; production migration/deployment is
not manually performed here. Follow the PR for merge/check results.
No synthetic result establishes live provider, email, or physical-device behavior.

## Preserve these boundaries

- Existing parent-domain HttpOnly six-slot cookies, `/u/0..5`, per-tab authuser,
  OAuth/session separation, live revocation, MFA, and explicit Google linking.
- Passwordless Google onboarding and fresh verification for sensitive settings.
- English only; files at most 500 lines; no browser-storage credentials or secrets.
- Accounts only, no paid/card-gated services, no unrelated app changes or rename.
- The owner authorized committing/pushing and merging this work through a PR.
  No manual production deployment, secret/DNS changes or production migration is
  included. Obtain separate authorization before those release actions.

Production readiness is tracked in the [owner checklist](docs/SECURITY_OWNER_CHECKLIST.md)
and [release guide](docs/SECURITY_RELEASE_READINESS.md). Inspect actual Worker
build evidence independently of Pages; see [troubleshooting](docs/WORKER_BUILD_TROUBLESHOOTING.md).
Private credentials and production observations must not be added to this file.
