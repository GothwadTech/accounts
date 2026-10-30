# ✅ TASK.md — Live Status & Task Board

> **⚠️ MANDATORY RULES FOR EVERY AI SESSION:**
> 1. Always update this file (`✅ DONE` + `🔜 NEXT UP`) cleanly **before** finishing work.
> 2. **🚨 RULE #0 (100% PURE ENGLISH ONLY):** Every UI string, button, modal, error message, code comment, SQL comment, test, and Markdown file across the entire repository MUST be in **100% pure, idiomatic English** (zero Hindi / Hinglish anywhere — enforced automatically by `npm test`!).
> 3. **🚨 RULE #8 (STRICT `<= 500` LINES PER FILE):** Keep every file (`TS`, `JS`, `HTML`, `CSS`, `SQL`, `Test`, `MD`) **`<= 500` lines** (enforced automatically by `npm test`!). Archive older completed session logs into **[`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)**.
>
> Engineering guide: [`AGENTS.md`](AGENTS.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Session archive (`1–30`): [`docs/TASK_HISTORY.md`](docs/TASK_HISTORY.md)

**Last updated:** 2026-10-30 (Session 49 — Requested sender merge and deployment guidance)

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

**Current state in one line:** All security coding phases are implemented locally; **194 tests**, build/types/bundle/audits, actual workerd/D1 ES256/RS256/OAuth, Chromium virtual-passkey UI, and synthetic restore checks pass. No deployment/configuration occurred. One final owner checklist covers production email/keys/origins, backups, cross-app/device pilots, and release approval.

---

## ✅ DONE (Newest First — Sessions 31 to 49)

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
- Saved sources, limitations, and recommendations in [`docs/CLOUDFLARE_REALTIME_ASSESSMENT.md`](docs/CLOUDFLARE_REALTIME_ASSESSMENT.md).


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
- Audited every single `.html`, `.js`, `.mjs`, `.ts`, `.css`, `.sql`, `.toml`, and `.md` file across the repository and converted **all 39 previously mixed Hinglish files** (`web/me/index.html`, `web/me/js/dialogs.js`, `web/me/js/dialogs-security.js`, `web/signin/js/signin.js`, `web/signin/js/modules/forgot-password.js`, all `web/css/*.css` & `web/**` comments, `sql/*`, `tools/*`, `cloudflare-worker/wrangler.toml`, `AGENTS.md`, `README.md`, `ROADMAP.md`, `TASK.md`, and `docs/*.md`) into crisp, idiomatic Google-grade English.
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

0. Continue the [security hardening phases](docs/ACCOUNTS_SECURITY_HARDENING.md): recovery verification, MFA/passkeys, scoped SSO trust, browser credential migration, and production evidence. Phase 1 is locally verified, not a completed security certification.
1. Review and deploy the session-startup fix to Accounts Pages and Worker.
2. Verify existing login, signed-out, expired-token, revoked-session, multi-tab, and throttled-network flows in production; compare browser Network timings before making speed claims.
3. Address Mail's optional quota/unread bootstrap work and Store's catalog/library/developer/admin loading gates in their own repositories. The central widget cannot change those app-specific gates.
4. Existing migration and widget-integration prompts remain in `docs/` for reference; audit live code before applying them again.
