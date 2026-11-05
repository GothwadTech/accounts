# ✅ TASK.md — Live Status & Task Board

> **⚠️ MANDATORY RULES FOR EVERY AI SESSION:**
> 1. Always update this file (`✅ DONE` + `🔜 NEXT UP`) cleanly **before** finishing work.
> 2. **🚨 RULE #0 (100% PURE ENGLISH ONLY):** Every UI string, button, modal, error message, code comment, SQL comment, test, and Markdown file across the entire repository MUST be in **100% pure, idiomatic English** (zero Hindi / Hinglish anywhere — enforced automatically by `npm test`!).
> 3. **🚨 RULE #8 (STRICT `<= 500` LINES PER FILE):** Keep every file (`TS`, `JS`, `HTML`, `CSS`, `SQL`, `Test`, `MD`) **`<= 500` lines** (enforced automatically by `npm test`!). Archive older completed session logs into **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.
>
> Engineering guide: [`AGENTS.md`](AGENTS.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Session archive (`1–30`): [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)

**Last updated:** 2026-11-05 (Session 63 — Username policy, segmented birthday and dependency fixes)

---

## 📊 STATUS SUMMARY

| Step | Feature | Status |
|------|---------|--------|
| 1 | Gothwad Accounts — UI + sessions + profile + avatars + export/delete | ✅ DONE |
| 2 | OAuth 2.0 + S256 PKCE provider ("Sign in with Gothwad") | ✅ DONE |
| 2.5 | **100% Cloudflare Native Upgrade (`D1` + Worker Native Auth — Zero Supabase!)** | ✅ **DONE (`ab5fa1c`, PR #17)** |
| 2.6 | **Google-Style Multi-Account Cookie Sessions (`a`..`f` `HttpOnly` `.gothwadtech.com` slots)** | ✅ **DONE (`aa6e0d7`, PR #18)** |
| 2.7 | **Modular `<= 500`-Line Architecture + Google `/u/0..5` · `authuser` Switcher + `GothwadTech/mail` Proxy Fix (`v2.3`)** | ✅ **DONE (`bf06daad`, PR #20)** |
| 2.8 | **Universal Google-Style Shadow-DOM Account Menu (`v2.4`) + 100% Pure-English Codebase & Hygiene Gate** | ✅ **DONE (2026-10-22)** |
| 3 | Roll out central `account-menu.js` + automatic silent SSO in `GothwadTech/store` & `GothwadTech/mail` | 🔜 NEXT |

**Current state in one line:** Google sign-in implementation is merged in PR #26, and the owner confirms it is working after resolving the redirect URI mismatch. Google setup/sign-in is marked DONE based on that confirmation. Public audience/branding approval and the remaining security/cross-app pilot checks are not independently verified.

---

## ✅ DONE (Newest First — Sessions 31 to 63)

### Session 63 — 2026-11-05 — Username Policy, Segmented Birthday and Dependency Fixes
- **DONE:** new usernames in native signup, availability checks and Google signup accept only 3–24 lowercase letters/numbers; dots, underscores and dashes are rejected server-side and removed from native entry. Updated hints/patterns. Historical usernames remain supported for sign-in, recovery and internal lookup; no renaming or destructive migration.
- Replaced the native birthday calendar with one same-width, 48px joined control, split horizontally into Day / Month / Year with internal dividers and numeric keyboards. Optional disclosure, retained values/Back, past-date/leap-day validation, ISO payload and blank omission remain intact. Partial or impossible dates reveal/focus visible segments; no calendar picker.
- Updated the Worker lock within its existing compatible ranges to fix Wrangler/Miniflare/Undici advisories. Root and Worker full dependency audits now report **zero vulnerabilities**. No forced/major upgrades or added runtime dependencies.
- Verification: build, **256/256 tests**, strict Worker types, deployment dry-run, whitespace checks and native/Google Chromium QA pass. Added server/Google username and historical-login regressions; browser checks verify joined segment geometry, disclosure stability and ISO birthday persistence. Actual iOS/live Google remain separate device/provider pilots.
- Owner authorized committing, pushing and merging all accumulated local changes on this branch. No manual production deployment, secret/DNS changes or production migration. PR/check results accompany the merge.

### Session 62 — 2026-11-05 — Google Account Choice and Stable Disclosure
- **DONE:** one verified Google identity can create/link multiple independent Gothwad accounts. Returning Google sign-in shows all linked accounts above Add new account; no account/session is selected implicitly. New onboarding supports Back to accounts.
- Added canonical `auth_external_account_links` with one Google link per Gothwad account and many accounts per Google subject. Additive/idempotent SQL 12 and runtime bootstrap preserve/backfill legacy metadata once with a migration marker; no destructive rebuild or recurring legacy scan. Coordinate frontend/Worker release with old writes stopped; legacy-only Worker rollback is unsupported.
- Finish requires explicit select/account ID or create. Verified-subject membership gates both selection and final issuance. Proof replay/concurrency, username rollback, local MFA, account/session-bound security reauthentication and the six-browser-slot cap remain enforced. Explicit password/MFA-verified native linking can share Google without transfer, merge or account replacement.
- Fixed existing-account sign-in reordering browser slots: build the replacement before revoking its old session and replace its metadata in place, retaining stable authuser indices.
- Optional-details clicks no longer force date-field focus. Top-anchored signup, stable scrollbar gutter and 16px mobile input text avoid recentering/width shifts/focus zoom without disabling pinch zoom. Validation still reveals/focuses invalid optional input.
- Verification: build, **253/253 tests**, strict Worker types and whitespace checks pass. Chromium verifies one/two-account chooser, Add new/Back, independent selection/data/password state, repeat-Enter/MFA locks and stale-backend failure; native mobile/desktop/light/dark QA includes crossing the disclosure scroll threshold with stable header/width/scroll/viewport scale. Actual iOS and real Google/provider approval remain unverified.
- Worker deployment dry-run passes. Existing Worker dev-tool dependencies report three audit findings (two moderate, one high); production dependencies report zero. No automatic dependency upgrades.
- Updated setup/schema/architecture/README/HANDOVER/PLAN; refreshed preview. No production migration/deployment, commit, push or PR.

### Session 61 — 2026-11-05 — Shorter Create New Flow
- **DONE:** added a left-aligned Fill optional details text button between Last name and Next, matching Sign In's recovery-action rhythm. An accessible down/up chevron reflects disclosure state; opening reveals an optional date-of-birth field, closing hides it without discarding its value. Back navigation preserves entered details.
- Combined Gothwad email/username and password into one screen; removed password confirmation and the redundant password-only step. Flow is now name → email/password → existing recovery details. Google remains first-step-only below Next; sign-in/Google authentication contracts are untouched.
- Removed the signup strength meter, weak/strong labels, composition advice and their unused module/scoring helper/styles. Passwords still need at least 8 characters without composition rules; existing server safety cap is unchanged.
- Optional birthday validates only when filled (including invalid/partial date input), is omitted from signup JSON when blank, and uses the existing backend/profile field when filled. Invalid earlier details are revealed/focused rather than producing hidden-step errors. No backend/schema change.
- Preserved the single visible-step submit dispatcher, held-Enter protection, pending/terminal locks, input spacing, lower Google styling, password visibility control and existing recovery requirements.
- Verification: build, **246/246 tests**, strict Worker types and whitespace checks pass. Real Chromium at 390px/1280px in light/dark themes verifies optional disclosure/spacing, three-step navigation, weak single password, birthday persistence, Back/Enter behavior and existing Sign In/MFA/Google visibility. Separate synthetic Google onboarding/COOP reauth/Add password QA also passes.
- Preview bundles rebuilt. No production deployment, commit, push or pull request.

### Session 60 — 2026-11-05 — Code and Documentation Cleanup
- **DONE:** audited frontend module references/DOM hooks and Worker unused-symbol diagnostics. Removed the uncalled legacy topbar/account-menu renderer and its private bindings, three unreferenced frontend forwarding entries, nonexistent suffix/forgot-button hooks, duplicate recovery handlers, unused imports/variables, unused `tsx` dev dependency and unrelated AI Studio metadata. Kept the real shared widget, dashboard fallback, CSS compatibility shims, API compatibility exports, migrations and regression tools.
- Removed four superseded/redundant Markdown files: founding ROADMAP, duplicate CLOUDFLARE_NATIVE_PLAN, obsolete MAIL_BOOTSTRAP redirect and completed legacy MAIL_SESSION_FIX instructions. Retained distinct sibling migration/audit specifications; they are dated references, not current bug claims or permission to edit other repos.
- Consolidated README, HANDOVER and PLAN, refreshed architecture/frontend documentation and the documentation index, and repaired local links without creating another cleanup/report document. Archived session history remains available.
- Enabled Worker `noUnusedLocals`/`noUnusedParameters` and added a local Markdown-link regression gate to prevent dead imports and broken documentation from accumulating again.
- **Password policy verified, not changed:** exactly eight repeated letters or digits work for signup/signin; weak eight-character change/reset passwords work too. Shorter and oversized inputs remain rejected. No composition/strength requirement exists; existing 128-character server safety cap remains. Added two policy regressions. **The shorter Create New flow and strength guidance are intentionally untouched pending owner instructions.**
- Verification: build, **242/242 tests**, strict Worker types, whitespace checks, mobile/desktop entry/keyboard/light-dark spacing QA and separate synthetic Google onboarding/COOP reauth/Add password QA pass. Root dependency audit reports zero vulnerabilities after removing `tsx`.
- No backend authentication behavior, database/cookie contract, production configuration, deployment, commit, push or pull request was changed/performed. Preview bundles rebuilt.

### Session 59 — 2026-11-05 — Visible-Step Enter and Submission Guards
- **DONE:** unified Create New's Next clicks and form submissions behind one current-step dispatcher. Enter validates/advances only the visible step; final account creation is reachable only from recovery. Hidden steps are hidden/inert, focus follows visible transitions, and final revalidation brings an invalid earlier field back on screen.
- Added a small shared form guard for native sign-in, signup, forgot/reset and Google onboarding/MFA: repeated Enter cannot skip steps, IME/textareas/normal button activation retain native behavior, hidden forms cannot submit, pending actions share a lock, and terminal success stays locked during delayed navigation. Password and passkey sign-in share the pending-action guard.
- Fixed one-character usernames incorrectly passing the existing 3–24-character UI rule, stale username availability hints, and identifier lookup responses advancing after the identifier was edited. Google entry rejects activation while hidden or while its native form is busy.
- Audited the other dashboard/menu key handlers: they are scoped to search, Escape/menu navigation or photo activation, not hidden account-entry submissions. No new global Enter listener or destructive dialog shortcut was introduced.
- Verification: build and **239/239 tests** pass; real Chromium keyboard checks at 390px/1280px cover missing fields, visible-step focus, held Enter with autofilled hidden values, implicit submit, pending/retry/terminal locks, hidden forms, sign-in/MFA/recovery/reset and Google consent/MFA. Existing native signup, navigation, method visibility and light/dark spacing QA pass. Separate synthetic-provider Google onboarding/COOP reauth/Add password browser QA also passes.
- Updated the running local preview bundles; refresh Latest Accounts UI to load them. Existing spacing/layout preserved. No backend/API/cookie/security contract change, production deployment, commit, push or pull request.

### Session 58 — 2026-11-05 — Consistent Sign In / Create New Spacing
- **DONE:** reused shared 6px label-to-input and 12px row-gap tokens. Kept Create New's name-field layout and matching 48px input boxes, padding and corner radii.
- Replaced both Sign In Forgot password wrapper inline margins with a consistent recovery-action row. Removed the extra accumulated gap before Next/Sign In; Create New primary actions use the same 12px final-field gap.
- Preserved the existing lower separator/Google/passkey styling, step visibility, routes and authentication logic. Forgot password remains left-aligned with a minimum 24px target height.
- Verification: build and **231/231 tests** pass. Chromium checks actual 6px/12px geometry, matching box sizes/padding/alignment at 390px and 1280px in light/dark themes, plus existing entry navigation, native signup and MFA UI regressions.
- Preview remains running with the updated CSS. No backend/authentication changes, production deployment, commit, push or pull request was performed.
- **NEXT UP:** owner refreshes Latest Accounts UI and reviews the form spacing before further UI-only refinements.

### Session 57 — 2026-11-05 — Reduce Sign In / Create New Switching Delay
- **DONE:** removed render-blocking external font CSS and the repeated 300ms entry-screen fade; both screens use system fonts and keep the owner's existing layout and step-specific methods.
- Added a build-time-only esbuild entry bundler with one small entry per screen, a shared preloaded module and content-hashed filenames. Observed Create New JS requests fall from 13 to 2; no runtime framework, client router, skipped session check or token storage was added.
- Local preview caches only hashed static entry bundles; API/HTML cache policies and production Pages security/revalidation headers remain unchanged. Dev/start now build before serving; later source JS edits require rebuilding.
- Verification: CSS/bundle build, **230/230 tests**, mobile Chromium tab switching/native signup/Back/MFA UI, and synthetic-provider Google onboarding/COOP/Add password browser QA. A controlled slowed-network diagnostic improved from about 2.13s to 1.21s DOMContentLoaded; this is not a production speed guarantee.
- Preview restarted on port 3000. No Worker auth/backend changes, production deployment, commit, push or pull request was performed. See [entry performance and build instructions](docs/AUTH_ENTRY_PERFORMANCE.md).
- **NEXT UP:** owner refreshes Latest Accounts UI and checks switching on their device; continue UI-only refinements as requested.

### Session 56 — 2026-11-05 — Create New and First-Step Google Entry
- **DONE:** renamed Sign Up tabs to Create New on both entry screens, preserving existing routes and the owner's latest UI design from `6f41d56`.
- Removed date-of-birth fields, introductory copy and request references from native and Google onboarding. Existing optional profile data/settings and all backend contracts are unchanged.
- Moved Create New's Google option below Next with a matching separator, inside first-step actions only. Sign-in now scopes Google to the identifier step, passkeys to the password step, and neither to MFA. Returning with Back/Start again restores the correct options.
- Verification: CSS build and **227/227 tests** pass, including four new UI regressions. Real Chromium at 390px verifies native signup without birthday, button placement, Google visibility across steps/Back and MFA; separate simulated-provider Google onboarding/COOP/Add password browser QA also passes.
- Preview remains running on port 3000 with the updated files. No backend/security changes, production deployment, commit, push or pull request were performed.
- **NEXT UP:** owner reviews the refreshed Latest Accounts UI preview and requests further UI-only polish.

### Session 55 — 2026-11-05 — Preview the Latest Pushed UI
- **DONE:** fetched the owner's latest main commit `6f41d56` (`feat: refactor sign-in UI and improve CSP`) and fast-forwarded the active `arena/cc2b6a5f-accounts` branch without switching branches or overwriting local task notes.
- Restarted the port-3000 preview with the newly pushed sign-in/signup styling, Google/passkey buttons, forgot-password controls and local iframe-preview server changes. Verified the current HTML is served and the CSS build passes.
- No additional UI, authentication or production configuration changes were made. No commit, push, deployment or pull request was performed.
- **NEXT UP:** owner refreshes the Latest Accounts UI preview and requests UI-only refinements against this version, not the older checkout.

### Session 54 — 2026-11-05 — Current UI Preview
- **DONE:** started the current repository UI and local Worker/SQLite preview on port 3000, bound to 0.0.0.0. Preserved the existing UI; no styling, authentication or application logic was changed.
- Installed locked dependencies and ran the CSS build successfully. Sign-in, signup and dashboard HTML return 200; an unauthenticated account API request correctly returns 401.
- Preview uses isolated local SQLite, not production accounts/data. Production Google credentials were not copied into this environment. No deployment, commit or pull request was requested or performed.
- **NEXT UP:** owner reviews the preview and identifies the first UI-only refinements. Preserve the existing Google AI Studio changes and authentication/session contracts.

### Session 53 — 2026-11-05 — Google Sign-In Working; Owner Requests Merge
- **DONE:** owner confirms Google sign-in is working after the reported `redirect_uri_mismatch` configuration issue. This is owner-reported live success, not an independently executed production test.
- The Google implementation is already merged in [PR #26](https://github.com/GothwadTech/accounts/pull/26). The active `arena/0ec43cc7-accounts` branch contains only this task/status follow-up; no authentication code or production settings are changed.
- Owner explicitly authorizes merging this status update. Preserve the distinction between working sign-in and unverified public-audience/branding approval, recovery delivery, mobile, MFA and cross-app pilot coverage.
- **NEXT UP:** merge this documentation follow-up; carry out any remaining release checks before claiming complete production verification. No secret values are recorded.

### Session 52 — 2026-11-05 — Continue With Google Console and Worker Setup
- Verified with GitHub that [PR #26](https://github.com/GothwadTech/accounts/pull/26) is already merged at `184b4e56ef85e1b92dd5ef877de330979cdc6872`. The active `arena/0ec43cc7-accounts` branch starts at that merge with no implementation difference; no duplicate PR is needed.
- Prepared owner instructions from repository configuration for the Accounts-host callback, Google OAuth web client, private Worker credentials, same-origin routing, public policy URLs, test audience and distinct domain/brand verification steps. Public landing-page suitability and live branding approval must not be assumed.
- No production configuration, secret, DNS, deployment, commit or pull-request operation was performed. Only this handoff record changed; implementation verification remains the previously recorded 223-test gate, not a newly executed test run.
- **NEXT UP:** owner verifies deployed API routing and public homepage/privacy/terms accessibility, configures Google and Worker values privately, and runs a controlled test-user pilot before public release. Google controls the exact app-name/domain display on its screens.

### Session 51 — 2026-11-05 — Requested Google Authentication Pull Request
- Owner explicitly requested a pull request for the Google authentication changes on `arena/220dd98f-accounts`. Commit, push and PR publication are authorized; merging, deployment and production configuration are not.
- Prepared the existing implementation, regression tests and setup/handover documentation for publication. No additional feature or production changes are included in this follow-up.
- Re-ran verification before publication: **223/223 tests**, frontend build, strict Worker types, Worker deploy dry-run, live local single-flight cookie rotation, and whitespace checks pass. The temporary in-memory QA server was stopped.
- **NEXT UP:** review the published PR and its independent GitHub/Cloudflare checks. Google OAuth configuration and real-provider/mobile/cross-app pilots remain pending; do not merge or deploy without owner approval.

### Session 50 — 2026-11-05 — Google Sign-In Without Password Creation
- Implemented Google authorization-code/OIDC with state/browser binding, PKCE, nonce, RS256/JWKS and strict claim checks; provider tokens remain server-only. SQL 11 and cold-start bootstrap are additive/idempotent.
- Google onboarding chooses a unique Gothwad username, confirms recovery email/terms, and never creates a password. A disabled credential marker preserves existing non-null snapshot gates. Profile flags drive No password added / Add password; native accounts retain Change password.
- Shared internal identity/session/slot contracts and local MFA are preserved. Existing users can explicitly Connect Google after password/MFA verification. No email-only merging, transfer or automatic mailbox creation.
- Fresh, single-use, session/credential/MFA-bound Google proofs protect Add password, MFA/passkey settings, phone/recovery changes and deletion. Password creation is optional, not a prerequisite for these settings. Other-device revocation and existing atomic mutation gates remain intact.
- Password reset cannot install a Google-only user's first password or trust an unverified third-party Google recovery mailbox. Existing native recovery behavior is preserved after explicit linking. Provider-loss limitations are documented rather than claiming stored email alone provides recovery.
- Verification: **223/223 tests**, CSS build, strict Worker types, dry-run, clean production dependency audits, whitespace checks, and real Chromium UI with synthetic provider/COOP popup for passwordless onboarding and Add → Change password. Existing bootstrap performance assertions still enforce six parallel validations and seven profile queries.
- Worker development-tool audit reports **2 moderate / 1 high** advisories (Wrangler/Miniflare/Undici); no production dependency findings and no lockfile changes. Separate dependency remediation is not silently applied.
- **NEXT UP:** owner reviews Google project/consent/client setup, privately configures both client credentials, verifies Accounts same-origin callback routing, and authorizes deployment/live-provider/mobile/cross-app pilots. Google remains disabled without credentials. No production configuration, deployment, other-repository change, domain purchase, rename, commit or PR was performed.
- Setup, protocol and limitations: [Google sign-in](docs/GOOGLE_SIGN_IN.md). Historical deployed MFA/passkey 404 reports still require independent Worker evidence.

### Session 49 — 2026-10-30 — Requested Sender Merge and Worker Build Guidance
- Owner explicitly requests merging the pending configuration update. Preparing its PR from `arena/bfd51291-accounts`; no other branch is used.
- Added a phone-dashboard Worker troubleshooting guide and corrected SETUP.md's unsupported implication that a merge necessarily deploys both Pages and Worker. Documented the compatible `cloudflare-worker` root / `main` production branch / Wrangler deploy layout without claiming these are the live settings or the failure cause.
- The pending RESEND_FROM sender and its regression remain in scope. No API deployment fix is asserted: the latest failed Worker log and live build/routing settings remain unverified.
- Verification: full local release gate passes with **195/195 tests**, build, strict Worker types, dry-run (951.25 KiB / 185.16 KiB gzip), both production dependency audits reporting zero known vulnerabilities, and whitespace checks.
- **NEXT UP:** create/merge the requested PR, then inspect its independent Pages/Worker results and obtain the redacted Worker build settings/log. No live secret, DNS, or dashboard changes are authorized by this repository merge.

### Session 48 — 2026-10-30 — Investigate Live MFA/Passkey Endpoint Errors
- Owner reports Endpoint not found while opening passkey and authenticator setup on the account site. Source routes and UI paths exist for both features; missing MFA encryption configuration does not explain both routes returning 404.
- Read-only GitHub checks confirm PR #24 is merged and the main merge revision has a successful Pages deployment. PR #24 has a failed Workers build (`23da081c-d162-439f-bd78-3ddfa8f8ebfd`); a successful post-merge Worker deployment is not confirmed from the available checks.
- Leading hypothesis is a frontend/backend deployment mismatch or an API route targeting an older Worker. The live Worker revision, current route mapping, and exact build failure remain unverified. No direct production probing, live configuration change, redeployment, or secret rotation was performed.
- **NEXT UP:** obtain the latest failed Accounts Worker build's redacted error log and commit/branch information from the phone dashboard, then apply the evidence-based deployment fix. Preserve the pending sender configuration changes; do not ask the owner to regenerate keys, run destructive SQL, or recreate accounts for this symptom.

### Session 47 — 2026-10-30 — Persist the Owner-Selected Recovery Sender
- Owner selected `noreply.gothwadtech.com` and requested maintaining RESEND_FROM in the repository rather than relying on a dashboard-only edit.
- Updated Wrangler's public RESEND_FROM to `Gothwad Accounts <security@noreply.gothwadtech.com>` and added a configuration regression check derived from APP_DOMAIN. Updated the owner checklist and project handoff notes.
- This change stays on `arena/bfd51291-accounts`. PR #24 was merged previously; older draft instructions below are historical. No new merge, deployment, DNS/provider setup, or secret change is performed in this follow-up.
- Verification: **195/195 tests**, frontend build, strict Worker types, dry-run with the selected sender, both production dependency audits (zero known vulnerabilities), and whitespace checks pass.
- **NEXT UP:** verify the selected sending domain in Resend, store RESEND_API_KEY privately in Cloudflare, review/release this configuration update, and prove actual recovery-email delivery. No production configuration was changed.

### Session 45 — 2026-10-30 — Draft Security PR #24 Created
- Owner requested a pull request and a clear explanation of remaining owner actions; this does not authorize a merge or deployment.
- Created draft [PR #24](https://github.com/GothwadTech/accounts/pull/24) from `arena/b5820242-accounts` to `main`; implementation commit `120f918` is pushed with the full security changes and explicit release gates. Unrelated `docs/CLOUDFLARE_REALTIME_ASSESSMENT.md` remains outside this PR.
- Reinstalled dependencies from both lockfiles in the fresh workspace and reran the complete local gate: **194/194 tests**, build, strict Worker types, bundle dry-run (951.25 KiB / 185.16 KiB gzip), root/Worker production audits with zero known vulnerabilities, and patch whitespace checks pass. Preserve six-slot parent-domain cookies; do not treat OAuth re-consent or older proxy compatibility as already verified in production.
- **NEXT UP:** owner review of backup/isolated restore, MFA encryption key, recovery delivery, exact origins/deployed consumers, and coordinated release. Keep the PR draft until release prerequisites are reviewed; merging may trigger externally configured Cloudflare deployments.

### Session 44 — 2026-10-29 — Remaining Security Coding Phases Complete Locally
- Added pinned WebAuthn verification, identity-host RP/origin policy, required device verification, password/MFA-authorized passkey management, single-use bounded challenges, guarded atomic login, and native browser UI. Added additive migration 09.
- Audited current Mail/Store source read-only; exact first-party/explicit extra origins replace broad siblings, headerless writes require server authentication, and browser signup/signin/refresh JSON omits session credentials. Parent-domain cookie/slot contracts remain unchanged.
- Split OAuth routes; consent/code issuance and refresh/access replacement are atomic. Additive migration 10 binds credential hashes to live grant/password state; userinfo checks issuer/audience/claims/ledger/scopes. Revocation, password changes, and factor changes invalidate access; legacy tokens require fresh consent.
- Added `npm run security:check`, local Worker/browser smoke tools, and synthetic backup/restore/migration/redirect regressions. Verified **194 tests**, build, types, dry-run, production audits, actual workerd ES256/RS256/OAuth, and Chromium registration/list/signed-out login/deletion/storage/CSP flows.
- Stopped both synthetic verification servers after the successful checks; no test server is left running.
- Added passkey/SSO contracts, release/incident/rollback runbook, and one final consolidated owner checklist; updated README/PLAN/HANDOVER and A–F dispositions. No secrets, production configuration, deployment, paid services, or cross-repository edits.
- **NEXT UP (owner-only release gates):** review/approve the checklist; confirm exact live consumers/origins, configure protected keys and real email, prove isolated D1 restore, inspect the historic Worker build, then authorize coordinated release and controlled device/cross-app pilot. This is not production completion or certification.

### Session 43 — 2026-10-28 — Authenticator MFA and Offline Recovery Codes
- Recorded the owner's instruction to defer email setup, build-log requests, and all configuration until a consolidated checklist after the coding phases.
- Added pinned OTPAuth, AES-256-GCM seed storage with account-bound authentication, optional explicit enrollment, ten hashed single-use recovery codes, and additive migration 08 matching runtime bootstrap.
- Password-only signin now returns a five-minute MFA challenge without session cookies for enrolled accounts. Proof/challenge consumption and full session issuance commit atomically; per-account and IP limits, replay protection, expiry, and concurrency/rollback cases are covered.
- Enforced factor-version assurance across JWT, refresh, legacy-token, and grace paths. Password reset retains MFA. Sensitive password/phone/recovery/deletion actions require password plus MFA when enabled and gate actual mutations on the authorized security state.
- Implemented Security settings, manual authenticator setup, once-only recovery-code display/download, replacement/disable controls, sign-in verification UI, and dialog/account guards. No secrets are persisted in Web Storage or sent to external QR services.
- Actual workerd exposed an existing invalid named-constant deployment export. Added a default-only `src/worker.ts` deployment entry while preserving `index.ts` library compatibility. Local runtime now starts and passes the MFA smoke flow; this is not proof of the older production build's exact failure cause.
- Synthetic Chromium passed real setup/confirmation, signout/password/MFA login, recovery-code replacement, and CSP/storage checks. The local-only smoke command is `npm run test:mfa:worker`.
- Final verification: **169/169 tests** (27 added this session), CSS build, strict Worker typecheck, dry-run (236.80 KiB / 54.48 KiB gzip), real local workerd/D1 and Chromium flows, and production-dependency audit with no known vulnerabilities. No production readiness guarantee.
- Documentation: [`docs/AUTHENTICATOR_MFA.md`](docs/AUTHENTICATOR_MFA.md); final setup items are queued, not requested now, in the owner checklist.
- Next: passkeys (Phase 3B), OAuth/SSO consumer audit and trust-boundary changes (Phase 4), then final configuration/production verification. No deployment, push, live secret changes, or other-repository edits.

### Session 42 — 2026-10-28 — Security Hardening Phase 0, Phase 1, and Recovery Core
- Documented findings A–F, phased acceptance criteria, limitations, owner decisions, deployment prerequisites, and the remaining security backlog in [`docs/ACCOUNTS_SECURITY_HARDENING.md`](docs/ACCOUNTS_SECURITY_HARDENING.md).
- Added persistent atomic D1 throttling on selected public auth routes, hashed source buckets, expiry cleanup, Retry-After, and fail-closed storage behavior; additive SQL migration 06 matches runtime bootstrap.
- Unified parsed origin policy for CORS and added a central hostile-browser mutation guard. Preserved HTTPS sibling SSO and temporary headerless-proxy compatibility; strict origin allowlists/proxy authentication remain unfinished.
- Password changes now atomically revoke other devices and pending reset links while retaining the current password-verified device and unrelated accounts.
- Enforced static script CSP/framing protections, moved executable inline HTML scripts into files, and nonce-protected dynamic OAuth consent. Existing styles/fonts and module-error fallback remain functional.
- Verified CSS build, **142/142 tests**, strict Worker TypeScript, Wrangler dry-run, and synthetic Chromium flows including blocked inline injection and working consent/fallback scripts.
- Rechecked PR 23: Cloudflare Worker build remains failed; Pages passed. Failure details require Cloudflare Dashboard access. No merge, production deployment, secret changes, or other repository edits.
- Owner chose staged authenticator MFA/recovery codes, then passkeys; email delivery is not configured. Recorded setup actions in [`docs/SECURITY_OWNER_CHECKLIST.md`](docs/SECURITY_OWNER_CHECKLIST.md).
- Added password-confirmed, single-use, email-verified recovery replacement with session/password/previous-address binding, atomic activation, and honest delivery errors. Existing recovery stays active until verification; generic profile updates cannot bypass the flow.
- Made reset consumption/password update/revocation atomic; tested concurrency and transaction rollback. Phone identifier changes/removal now require the current password, without claiming phone ownership verification.
- Added migration 07 and confirmation UI that removes the fragment and requires explicit action. Synthetic browser success used mocked delivery/verification; no real email was sent.
- Next: implement enforced authenticator MFA and recovery codes, then passkeys; complete OAuth/session and SSO consumer audits. Real delivery and deployment require owner configuration and separate verification.


### Session 41 — 2026-10-28 — Accounts Security Posture Review
- Reviewed local authentication, cookie, recovery, OAuth, CORS, and security-header implementation; reran tests: **105/105 passing**. This is a limited source review, not a penetration test or production certification.
- Confirmed salted password hashing, hashed refresh/reset tokens, refresh rotation, reset-time session revocation, HttpOnly cookies, and OAuth PKCE controls.
- Identified priorities: application-level abuse controls, enforced MFA/passkeys, consistent CSRF/origin policy, narrower subdomain trust, verified recovery changes with reauthentication, password-change session policy, reduced browser token exposure, and CSP/framing protection.
- Production Cloudflare rules/headers, deployment revision, secret management, backup restoration, and incident readiness remain unverified. Previous Worker deployment failure remains unresolved by this review.
- Recommended staged security hardening and a small controlled pilot before broad adoption; Indian product ownership does not imply Indian-only infrastructure or data residency. No runtime code, infrastructure, or billing changes were made.
- Next: obtain authorization for a dedicated security audit and prioritized fixes before making public security-equivalence claims.

### Session 40 — 2026-10-28 — RealtimeKit, TURN, and SFU Assessment
- Checked current official pricing: RealtimeKit participant-minute pricing versus the shared 1,000 GB/month SFU/TURN egress allowance; flagged conflicting older beta/calculator copy instead of assuming free RealtimeKit production usage.
- Read-only Meet and GrixChat call-path inspection found PeerJS/public TURN in Meet and LiveKit plus a STUN-only P2P fallback with Supabase signaling in GrixChat.
- Recommended evaluating short-lived managed TURN credentials first, then a deliberate SFU architecture for groups. Preserve GrixChat's Supabase stack; no app changes or service/billing activation were performed.
- Saved sources, limitations, and recommendations in the historical Cloudflare Realtime assessment (not present in this checkout).


### Session 39 — 2026-10-24 — Pull Request Preparation
- User requested a pull request for all changes on `arena/d34d0d2c-accounts`.
- Reverified `npm run build`, **105/105 tests**, and `git diff --check` before committing and pushing this branch.
- PR scope includes startup fixes, Universal Account Menu redesign and local preview, regression tests, and Mail / Store / Drive audit and implementation prompts.
- This operation opens the changes for review only; no merge or production deployment is requested.


### Session 38 — 2026-10-24 — Universal Account Menu Redesign and Live Preview
- Established the shared component name: **Universal Account Menu** (also Account Switcher), source `web/widget/`.
- Changed dark surface to `#212121` and neutral account cards; every account uses the same row/avatar size with rounded first/last corners and no collapse or avatar-edit controls.
- Added the aligned Gothwad Accounts heading; replaced the Google mark with the existing Gothwad logo.
- Removed Manage accounts; moved Add another account into a standalone pill matching Manage your Gothwad Account.
- Kept per-slot sign-out as sibling icon buttons (no nested interactive elements), all-account sign-out, badges, extra actions, and existing callback contracts.
- Added a local-only interactive preview using the real widget, synthetic 1/3/6-account fixtures, themes, and host-app controls. Start with `npm run preview:menu` (port 3010).
- Verified `npm run build`, **105/105 tests**, and real Chromium interaction/layout checks: equal 68px rows, switching, sign-out, add account, themes, Escape, and 390px mobile viewport without horizontal overflow.
- No production deployment or merge: await the user's design review.


### Session 37 — 2026-10-24 — App Startup Prompts and Drive Audit
- Created independent ready-to-copy prompts for Mail, Store / Console / Admin, and Drive, with fresh-code audit, security, account isolation, failure-path tests, and deployment requirements.
- Rechecked main commits: Mail `84aeab0`, Store `a0ed0ba`, Drive `1e8c397`. These repositories were audited read-only; no remote app source changes or deployments were made.
- Drive locally passes 9 tests and a build; lint exits 0 with 33 warnings. Build warns about browser-externalized crypto and a large main bundle.
- Reproduced Drive frontend misclassification: identity 503 becomes signed-out; vault 503 or HTML becomes missing vault. Documented sequential boot, unbounded operations, migration/save, sign-out deletion, and identity-scoping concerns.
- Corrected earlier operational advice: current Drive source reads `DRIVE_ENCRYPTION_KEY`, not `VAULT_MASTER_KEY`. Missing Worker GitHub checks do not prove an absent Worker; production signed-in checks remain unverified.
- Audit: [`docs/DRIVE_STARTUP_AUDIT.md`](docs/DRIVE_STARTUP_AUDIT.md). Prompts: [`Mail`](docs/MAIL_STARTUP_PERFORMANCE_PROMPT.md), [`Store`](docs/STORE_STARTUP_PERFORMANCE_PROMPT.md), [`Drive`](docs/DRIVE_STARTUP_REPAIR_PROMPT.md).


### Session 36 — 2026-10-24 — Session Startup and False Sign-in Redirect Fix
- Removed the root 1.2-second false-anonymous timer; Pages and local dev open the dashboard shell directly.
- Added early memory-only session discovery with single-flight sharing and selector isolation.
- Reused one browser inspection in `/auth/me`, validated slots concurrently in stable order, and joined live user/session validation reads.
- Removed redundant browser refresh after `/auth/me` 401; network/server failures preserve the dashboard retry state.
- Marked auth responses `no-store`; added client and real-SQLite startup regression tests.
- Read-only Mail / Store audit found additional application-specific loading gates; see [`docs/SESSION_STARTUP_PERFORMANCE.md`](docs/SESSION_STARTUP_PERFORMANCE.md) and [`HANDOVER.md`](HANDOVER.md).
- Verified: `npm run build`, `npm test` (**98/98 passing**), strict Worker TypeScript checks, Wrangler deployment dry-run, and `git diff --check`.
- Deployment remains pending: both Pages and Worker must deploy. Production latency has not been measured.


### Session 35 — 2026-10-22 — 100% Pure-English Repository Overhaul + Permanent Automated Language Gate
- Audited every single `.html`, `.js`, `.mjs`, `.ts`, `.css`, `.sql`, `.toml`, and `.md` file across the repository and converted **all 39 previously mixed Hinglish files** (`web/me/index.html`, `web/me/js/dialogs.js`, `web/me/js/dialogs-security.js`, `web/signin/js/signin.js`, `web/signin/js/modules/forgot-password.js`, all `web/css/*.css` & `web/**` comments, `sql/*`, `tools/*`, `cloudflare-worker/wrangler.toml`, `AGENTS.md`, `README.md`, `PLAN.md`, `TASK.md`, and `docs/*.md`) into crisp, idiomatic Google-grade English.
- Added **Permanent Rule #0 (`100% Pure English Only — Zero Hindi/Hinglish`)** in `AGENTS.md`, both cross-repo prompts (`docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md` & `docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`), and automated test coverage in `tests/frontend-and-filesize.test.mjs`.

### Session 34 — 2026-10-22 — Universal Google-Style Shadow-DOM Account Widget (`v2.4`) + Cross-Subdomain Silent SSO
- Built Google `OneGoogleBar`-style Shadow-DOM account switcher (`web/widget/account-menu.js`, `web/widget/account-menu-template.js`, `web/widget/account-menu-styles.js`) with Material 3 Expressive segmented card groups, Light + Dark modes, mobile full-screen sheet + desktop `396px` anchored popover, `68px` hero avatar + camera badge, real `avatarUrl` photos across all secondary slots `0..5`, collapse chevron, `+ Add another account`, inline `Manage accounts` slot/all sign-out, standalone `Manage your Account` pill, and `Privacy policy • Terms of Service` footer.
- Integrated `GothwadAccountMenu` into `/me` (`web/me/js/me.js`), added `X-Gothwad-Authuser` to `Access-Control-Allow-Headers` in `cloudflare-worker/src/http.ts`, enriched `toPublicAccountSummary()` (`name`, `avatarUrl`, `avatar_url`), exposed CORS headers on `/widget/*` in `web/_headers`, and authored standalone prompts [`docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md) & [`docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md`](docs/STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md).

### Session 33 — 2026-10-22 — `GothwadTech/store` Zero-Card Cloudflare D1 Migration Specification (`docs/STORE_D1_MIGRATION_PROMPT.md`)
- Audited `GothwadTech/store` + Android `GothwadTech/storeapp` end-to-end and authored [`docs/STORE_D1_MIGRATION_PROMPT.md`](docs/STORE_D1_MIGRATION_PROMPT.md) covering live D1 `store` (`a3dc3e71-cf89-4e0a-89d1-693fcf6f227a`), D1 `BLOB` + Edge Cache image deduplication, `GothwadTech/storefiles` APKs, and `<= 500`-line modularity.

### Session 32 — 2026-10-20 — Google-Grade `/u/0..5` · `authuser` Engine + Cross-Repo `GothwadTech/mail` Switch Fix (`v2.3`)
- Fixed Worker-to-Worker CSRF origin check (`verifyCsrfOrigin`), enriched `POST /api/auth/switch` payload (`{ ok, activeId, authuser, user, accounts }`), added persistent `remember` sessions + self-healing slot fallback, and added `/u/0/me`..`/u/5/me` edge rewrites & multi-tab isolation (`bf06daad`, PR #20).

### Session 31 — 2026-10-20 — Repo-Wide `<= 500`-Line Modular Refactor & Reload Hang Protections (`v2.2`)
- Split Worker (`3,960` lines → modular `<= 465`-line TS files), CSS (`15` modular files), dialogs, and tests (`8d53127`, PR #19).

> 📜 **Older Completed Sessions (`Sessions 1 – 30`):** Archived verbatim in **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.

---

## 🔜 NEXT UP

0. Owner reviews Google chooser/Add new/two accounts and joined Day / Month / Year entry on an actual phone. Before authorized release, coordinate SQL 12 and matching Pages/Worker with old writes stopped; keep existing recovery details.
1. Continue the [security hardening phases](docs/ACCOUNTS_SECURITY_HARDENING.md): recovery verification, MFA/passkeys, scoped SSO trust, browser credential migration, and production evidence. Phase 1 is locally verified, not a completed security certification.
2. Review and deploy the session-startup fix to Accounts Pages and Worker.
3. Verify existing login, signed-out, expired-token, revoked-session, multi-tab, and throttled-network flows in production; compare browser Network timings before making speed claims.
4. Address Mail's optional quota/unread bootstrap work and Store's catalog/library/developer/admin loading gates in their own repositories. The central widget cannot change those app-specific gates.
5. Existing migration and widget-integration prompts remain in `docs/` for reference; audit live code before applying them again.
