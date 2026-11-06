# Accounts Handover

Updated 2026-11-06. Current branch: `arena/1be12b88-accounts`.
Read [AGENTS.md](AGENTS.md) for constraints and [TASK.md](TASK.md) for session history.

## Current state

- **Latest merge authorization:** the owner permits committing, pushing and merging
  the reviewed UI batch if checks are clean. Remote CI must be inspected first;
  this is not permission to bypass failures or run manual production operations.

- **Latest owner direction: visuals only; stop trying to prove real login in Arena.**
  Run **`npm run preview:ui`**, labelled **Accounts visual preview — login and dashboard**,
  on port **3002**. This separate simulator serves shared real UI files with no strip,
  preview buttons or alternate page design. It privately reads local credentials for
  a simulated input comparison, uses invented profile/activity data and a shared
  server-memory display flag. No database, cookies, tokens, browser-storage session or
  production API is involved. This is NOT real authentication or isolation testing.
  Real Cloudflare/provider/security verification stays separate; do not keep asking
  for browser details/password retries before visual work.
- **Initial twelve completed:** IDs 1, 2, 3, 9, 11, 13, 21, 26, 31, 52, 54, 99.
  Shared UI has local SVGs, stacked/unified rows, balanced shortcuts, truthful Home,
  account-preserving section URLs, method search, mobile search layout, recorded-event
  password dates, verified-address recovery state and failed-data/Retry UI.
  Password history is labelled Last recorded change, not a guarantee of the latest
  actual change if audit delivery failed. Recovery metadata matches the current address.
  Read [the completed 98-item phase allocation](docs/UI_REVIEW_PHASES.md): five phases of 20/20/20/20/18.
  **Earlier approval combined UI Phases 1 and 2; both are implemented.**
  Home/mobile/contrast polish, honest storage, keyboard search/drawer, account-preserving
  history/scroll, profile clarity/optional editing and explicit photo framing are complete.
  At that earlier checkpoint, 300/300 tests and extended browser QA passed.
  **Latest owner approval also combined Phases 3–5; those 58 items are now implemented.**
  All 110 scoped UI IDs are addressed. Shared safe dialogs, truthful method metadata,
  local MFA QR/manual setup, session/activity/grant/data clarity, lazy loading and stale
  account guards pass **309/309 tests**, build, Worker types and extended browser QA.
  Displayed QR decoding, synthetic account-switch races and scoped axe-core A/AA scans
  pass. Stop for owner visual review; no further phase approval is needed for this batch.

- Baseline now includes PR #29, merged as `408481e`. Its Worker build failure was
  not resolved by merging; successful production rollout remains unverified.
- Actual authentication testing only (not needed for UI review): run `npm ci`, then **`npm run preview:local`** using the
  background process tool. See [local preview instructions](tools/README.md).
  The private ignored `.env.preview` contains current local credentials; never
  echo, commit or copy it to production. The opt-in tool creates/reuses an account
  only in ignored `.local-d1.sqlite`; normal start/build/Worker paths do not seed.
  Preserve these ignored files across chats; a fresh checkout needs the owner's
  private configuration again. A changed password must be reflected in that file,
  not silently reset. The launcher now pins this sandbox's exact HTTPS public
  origin to survive proxy Host/protocol rewriting; never weaken Worker CSRF.
  Use Arena's authorized embedded preview, not raw new-tab links: the private
  E2B gateway requires a platform header before the app runs. The obsolete new-tab
  prompt has been removed. The Node transport now adapts only explicit local Arena
  host-only cookies to SameSite=None/Secure/HttpOnly/Partitioned (CHIPS), allowing
  embedded native login without leaking traffic/session tokens. Production Worker
  SameSite=Lax/parent-domain SSO and exact-origin CSRF remain unchanged.
  Browser checks cover actual partition keys, third-party restrictions, dashboard
  reload, six sections at desktop/mobile sizes, cross-top-site isolation and logout.
  Owner verification FAILED: dashboard loading still returns to sign-in. The actual
  preview remains unresolved despite loopback tests. Local-only redacted auth trace
  is enabled; inspect the next owner retry before another speculative fix. Logs
  include known cookie names/counts only, never values or traffic/account secrets.
  Actual owner retry captured: signin 200/emitted six cookies, then auth/me 401 with
  NO Cookie header at all. Browser blocking vs proxy stripping remains undetermined.
  Temporary marker probe did not execute in the real panel and was removed; no
  frontend diagnostic loader remains. Do not keep asking for password retries.
- Current gate: owner reviews all 110 scoped UI improvements in the visual preview.
  Phases 3–5 were explicitly approved together and are implemented. Further feature
  work or any production release requires new owner direction.

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
