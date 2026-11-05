# Accounts Handover

Updated 2026-11-05. Current branch: `arena/5916479c-accounts`.
Read [AGENTS.md](AGENTS.md) for constraints and [TASK.md](TASK.md) for session history.

## Current state

- Baseline: owner's UI commit `6f41d56`, following merged Google PRs #26/#27.
  PR #28 merged into baseline `1163d90`. Earlier owner confirmation of Google
  sign-in is not an independent production security audit.
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
- Google supports many-to-many access: up to three Google methods per Gothwad
  account, and many Gothwad accounts per Google subject. Security lists/adds/removes
  methods with fresh credential/MFA checks. Passwordless management uses existing
  linked-Google proof; native-password users confirm their password.
- SQL 13 imports SQL 12 links and immutable origins once into `auth_google_methods`
  and companion origin/flow/ticket guards. Both legacy tables remain. Old temporary
  security proofs must be renewed; existing sessions/data stay. Release matching
  frontend/Worker with old writes stopped; do not roll back only the Worker.
- Removal re-salts the same native password or rotates the disabled marker, revokes
  other devices/OAuth credentials and pending proofs. The last Google method needs
  an added password before removal, even with passkeys, until passkey-only security
  reauthentication exists. Recovery email is unchanged; the UI warns about overlap.
- Alerts use existing email configuration and explicitly report failed delivery.
  Google emails are last verified metadata, never identifiers for automatic merging.
- Disclosure clicks keep focus on the toggle; top anchoring/stable scrollbar gutter
  prevent threshold recentering. Mobile inputs use 16px text without disabling zoom.
  Existing-account reauthentication now preserves browser account ordering/indices.
- Passwords require at least 8 characters, without composition/strength rules.
  Existing 128-character server safety limits remain unchanged.
- Cleanup removes unused internal UI code and superseded documentation, not
  authentication features, migrations, compatibility APIs, or regression tests.

## Google callback regression follow-up

The screenshot's "Signing in as undefined" matches the pre-chooser frontend from
before PR #28, attempting automatic finish against the explicit-choice backend.
Actual live HTTP/cache headers were not independently inspected. The local fix adds
hashed Google entry code, a versioned callback UI URL, no-store document/API policy,
and bounded legacy-markup recovery. No auto-selection/security fallback was added.
All 259 tests, native/Google Chromium, strict Worker types and deployment dry-run
pass. Chromium covers poisoned old HTML/JS URLs and old-markup recovery with the
same proof; native entry keeps its two-module request count. This follow-up is local; production needs matching Pages/Worker
release. A new Incognito sign-in is a useful diagnostic without clearing sessions.

## Development and verification

```sh
npm run build
npm test
npm exec --no -- tsc --noEmit -p cloudflare-worker/tsconfig.json
```

`npm start` / `npm run dev` builds and starts the preview on port 3000. JavaScript
source changes need another build; there is no watcher. Entry HTML and generated
`web/assets/auth` files must ship together. See [entry performance](docs/AUTH_ENTRY_PERFORMANCE.md).

Optional browser checks and external Playwright setup are documented in
[tools/README.md](tools/README.md). Current build, strict Worker types, all 275 tests,
native/Google Chromium and Worker dry-run pass. Google QA includes stale-cache
isolation plus passwordless/native backup linking, removal protection and backup
sign-in. Root and Worker full dependency audits report zero vulnerabilities.
These are synthetic checks, not live Google, email, device or cross-app certification.
The owner now authorizes commit/push/merge of this follow-up after clean final
verification. Inspect the PR for `arena/5916479c-accounts` for actual CI/merge
results. No manual production migration/deployment or secret/DNS changes are included.

## Preserve these boundaries

- Existing parent-domain HttpOnly six-slot cookies, `/u/0..5`, per-tab authuser,
  OAuth/session separation, live revocation, MFA, and explicit Google linking.
- Passwordless Google onboarding and fresh verification for sensitive settings.
- English only; files at most 500 lines; no browser-storage credentials or secrets.
- Accounts only, no paid/card-gated services, no unrelated app changes or rename.
- The current request authorizes commit/push/merge after clean verification.
  Production deployment/migration and secret/DNS changes need separate authorization.

Production readiness is tracked in the [owner checklist](docs/SECURITY_OWNER_CHECKLIST.md)
and [release guide](docs/SECURITY_RELEASE_READINESS.md). Inspect actual Worker
build evidence independently of Pages; see [troubleshooting](docs/WORKER_BUILD_TROUBLESHOOTING.md).
Private credentials and production observations must not be added to this file.
