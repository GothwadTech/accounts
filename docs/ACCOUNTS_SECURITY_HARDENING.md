# Accounts Security Hardening: Findings A–F and Delivery Plan

Updated: 2026-10-29. Owner instruction: build first; defer all configuration requests
until one consolidated checklist after the coding phases; that checklist is now ready. Scope: `GothwadTech/accounts`, branch `arena/b5820242-accounts`.

## Scope and guarantees

This work hardens the existing identity service. It is not a security certification,
penetration test, or claim of equivalence to Google. Local tests do not establish
production deployment, infrastructure configuration, or absence of vulnerabilities.
Preserve six account slots, username-only identity, domain configuration, cookie
SSO, and separate session/OAuth token types. No paid services, R2, card requirements,
secret disclosure, destructive migrations, or changes to other repositories.

## Findings register

| ID | Finding and evidence | Required outcome |
|---|---|---|
| A1 | No persistent application throttling in public authentication routes | Atomic, shared throttling; 429 and Retry-After; tests for concurrency, expiry, and outages |
| A2 | Sign-in/discovery distinguish unknown accounts and support phone lookup | Explicit enumeration policy; tighten responses and discovery with UX-compatible changes |
| A3 | Password hashing is PBKDF2-SHA256 at 100,000 iterations | Review resistance within the runtime ceiling; never silently raise above supported limits |
| B1 | No complete enforced MFA/passkey flow in the reviewed backend | Real enrollment, challenges, login enforcement, recovery codes, removal safeguards, and negative tests |
| B2 | A two-factor database/UI field is not authentication enforcement | Never display an unsupported security guarantee |
| C1 | Credentialed CORS previously used raw string suffix/prefix checks | Parse origins; reject malformed origins, insecure production origins, and loopback-prefix lookalikes |
| C2 | Shared parent-domain session cookies and broad sibling trust | Inventory every app/proxy; explicit browser-origin allowlist; staged host-only migration design |
| D1 | Recovery email can change with only an existing session | Fresh authentication, pending destination, ownership verification, expiry, notification, replay protection |
| D2 | Ordinary password change leaves other sessions active | Keep the verified current session; revoke other sessions and refresh credentials atomically |
| D3 | Recovery and sensitive actions require a wider audit | Check reset races, deletion, recovery enrollment, OAuth grants, and session policies |
| E1 | CSRF checks differ by route; headerless proxy exception exists | Central request policy, negative tests, then authenticated proxy protocol without lockouts |
| E2 | Browser JSON includes session credentials on some routes | Inventory consumers; migrate browser flows to cookie-only responses without breaking native/proxy clients |
| E3 | Static Pages headers lacked CSP and framing protection | Enforced CSP, no executable inline handlers, framing denial, matching development behavior |
| E4 | Dynamic OAuth consent HTML has its own inline script | Per-response script nonce and framing/CSP headers; consent remains functional |
| F1 | Previous Worker deployment check failed | Inspect failure logs and prove deployed revision and binding health before claiming completion |
| F2 | Production rules, headers, secrets, backups, and response readiness unverified | Owner checklist, restore drill, deployment/rollback runbook, monitoring and incident process |

## Phased implementation

### Phase 0 — Baseline and planning

- Document findings A–F and their limitations.
- Baseline: 105/105 tests passed before implementation.
- Keep existing unrelated Realtime assessment changes intact.

### Phase 1 — Immediate, backward-compatible defenses

Implementation scope:
- Persistent D1 fixed-window throttling on public sign-in, signup, recovery,
  reset, discovery, and OAuth-token routes. This is an application defense, not
  volumetric DDoS protection or a replacement for edge controls.
- Parse CORS origins correctly; retain existing HTTPS subdomain compatibility
  until the app inventory is approved.
- Reject explicitly untrusted Origin/Referer and cross-site browser mutations
  centrally, including sign-in and recovery. Preserve headerless non-browser
  clients temporarily; document that this is not full proxy authentication.
- Revoke other sessions on password change while keeping the current session.
- Add enforced script/framing protections and remove static executable inline
  code. Keep existing inline styles and external fonts working.
- Add regression tests and run build, full suite, Worker typecheck, and dry-run.

Acceptance: no cross-account regressions; no paid dependency; no secrets in Git;
new abuse/error/hostile-origin/session/CSP tests pass. Local completion only until
production deployment is separately verified.

### Phase 2 — Sensitive account changes and recovery

- Inspect email delivery availability without requesting secret values.
- Add recent-authentication proof scoped to the correct account/session/action.
- Store pending recovery changes separately; activate only after destination
  verification. Protect removal and notify the previous verified address.
- Define migration for existing unverified recovery addresses; never abruptly
  disable the only recovery method for existing users.
- Audit reset consumption and credential revocation for concurrency and failure.
- Update UI and test expired/replayed/wrong-account challenges and delivery failure.

Acceptance: a stolen session alone cannot replace account recovery; failures
leave the previous recovery route intact. Owner email configuration may be needed.

### Phase 3 — MFA/passkeys

- Choose initial rollout: authenticator-app MFA, passkeys, or staged support.
- Use a maintained, reviewed implementation rather than custom WebAuthn parsing.
- Enrollment requires reauthentication; login must withhold full sessions until
  the second factor succeeds. OAuth and silent SSO must obey the same policy.
- Implement secure recovery codes, anti-replay/rate limits, key protection,
  removal safeguards, and usability/accessibility tests.
- Define relying-party domain and allowed origins before passkey enrollment.

Acceptance: real enforcement and recovery tests, not only a settings toggle.
Optional user enrollment first unless the owner approves a different policy.

### Phase 4 — SSO trust boundaries and browser credentials

- Inventory Mail, Store/Console/Admin, Drive, Meet, native clients, and proxies.
- Replace broad credentialed browser trust with exact configured origins.
- Authenticate privileged headerless proxies; Accept headers are not proof of trust.
- Remove browser-readable account credentials through a versioned consumer migration.
- Design host-only identity cookies plus per-app sessions without breaking existing
  cross-subdomain SSO. This changes the existing cookie contract and requires
  explicit approval and cross-repository coordination; do not silently switch it.

Acceptance: trusted apps still work; unrelated sibling origins cannot read
identity responses; existing cookies have a documented migration/rollback path.

### Phase 5 — Production verification and operational readiness

- Inspect Accounts Worker/Pages deployment logs and fix the recorded failure.
- Apply additive migrations using a tested backup/rollback plan.
- Verify deployed revision, actual headers, DEV_MODE=false, bindings, and secret
  presence without exposing secret values.
- Exercise sign-in, refresh, revocation, recovery, MFA, OAuth, all six slots, and
  authorized proxy behavior on a controlled test account.
- Set up available no-cost monitoring and edge abuse controls; test backup restore,
  document incident response, security contact, and dependency maintenance.

Acceptance: dated production evidence, not only a successful merge or local suite.
No automatic production deployment, secret rotation, or new paid services.

## Rate-limit design and limitations

- Limits are per Cloudflare-observed source IP and route group, not per account.
  Shared networks can hit limits together; distributed attackers can rotate IPs.
- Store a keyed hash, not the raw IP or submitted username, in the counter table.
- Missing edge IP uses a shared unknown-source bucket rather than bypassing limits.
- Fixed windows allow a boundary burst; counters cap at limit + 1.
- Expired rows are pruned in bounded batches. Limits do not bound total D1 costs
  under a distributed attack; edge controls and quota monitoring remain necessary.
- Storage failure must produce a retryable 503, never disable enforcement silently.
- Do not trust arbitrary browser-supplied forwarding headers as client IP evidence.

## Owner actions and decisions

No passwords, tokens, keys, backup contents, or recovery codes should be pasted
into chat. Secret values belong only in the provider's secret-management UI.

1. Decision recorded: both in stages, authenticator-app MFA and offline recovery
   codes first, passkeys next. SMS is not assumed.
2. Decision recorded: delivery is not configured or not working. Follow the
   [owner setup checklist](SECURITY_OWNER_CHECKLIST.md); do not share key values.
3. Confirm actual production browser origins and native/proxy consumers before
   narrowing SSO trust or removing response credentials. We can audit repository
   configuration read-only first; owner confirmation is still needed.
4. When deployment is ready, authorize it separately and verify settings that
   cannot be inspected through the available GitHub connection. No card required.
5. Keep control of the domain, Cloudflare/GitHub accounts, and emergency recovery;
   protect administrator accounts with strong MFA and offline recovery material.

## Progress ledger

- Phase 0: documented; baseline suite passed.
- Phase 1: implemented and verified locally; not deployed.
  - Build passes; **128/128 tests pass** (23 new cases).
  - Strict Worker TypeScript check and Wrangler dry-run pass (146.70 KiB upload,
    32.11 KiB gzip). No production deployment was executed.
  - Chromium verified signin/signup/legal/dashboard loading under enforced CSP,
    blocked injected inline JavaScript, working nonce-protected consent decisions,
    and module-load failure UI without inline handlers. Browser data was synthetic.
  - Existing session-slot, OAuth, and startup regression tests still pass.
  - GitHub recheck confirms the prior Worker build failure and Pages success;
    no GitHub Actions run exposes the Cloudflare build's failure details.
- Phase 2 recovery core: implemented and locally verified; production email is not configured.
  - Password-confirmed, pending recovery replacement; hashed single-use token,
    15-minute expiry, requesting-session/password-version binding, atomic activation,
    verified-address record, prior-address notification, and reset-link invalidation.
  - Generic profile updates cannot bypass recovery verification. Phone identifier
    updates/removal now require a current password; phone ownership is not verified.
  - Password reset now commits token consumption, password replacement, and session
    revocation atomically, with one concurrent winner and rollback/retry tests.
  - Production forgot-password returns an explicit configuration error when sender
    configuration is missing; no fake successful delivery claim.
  - Synthetic Chromium verified the recovery dialog's unavailable-email state and
    explicit-click confirmation with a scrubbed URL fragment. Email/verification
    responses were mocked for the successful browser flow, not live delivery.
  - Latest full suite: **142/142 tests** (37 added since baseline). Build and strict
    Worker typecheck pass; final Wrangler dry-run is 156.26 KiB / 33.91 KiB gzip.
  - Broader OAuth revocation/session semantics and MFA integration remain unfinished.
- Phase 3A: authenticator MFA and offline recovery codes implemented locally.
  - Real password-first second-step enforcement, AES-GCM encrypted seeds, per-account
    attempt limits, anti-replay, atomic proof/session issuance, and factor-version
    session assurance. Sensitive mutations are gated on the authorized factor state.
  - Enrollment/management UI, once-only recovery-code display/download, and
    password-reset isolation are implemented. No production MFA is enabled.
  - **169/169 tests**, build, strict Worker typecheck, dry-run, actual local
    workerd/D1, and synthetic Chromium checks passed; production-dependency audits
    reported no known vulnerabilities. No production release was performed.
  - Details: [Authenticator MFA](AUTHENTICATOR_MFA.md).
- Phase 3B: passkeys implemented locally with pinned WebAuthn verification,
  identity-host RP/origin, required user verification, guarded enrollment/removal,
  single-use challenges, and atomic session issuance. [Details](PASSKEYS.md).
- Phase 4: exact origin/redirect allowlists, authenticated headerless proxies,
  cookie-only browser session responses, and grant/password-bound OAuth credential
  revocation are implemented. Mail/Store source was audited read-only; deployed
  consumer confirmation and OAuth re-consent remain release gates. Shared-cookie
  isolation is explicitly deferred to a separately approved coordinated migration.
  [Contracts and residual risk](SSO_TRUST_AND_OAUTH.md).
- Phase 5 coding/readiness: repeatable local release gate, synthetic backup/restore
  rehearsal, operational/incident/rollback runbook, and final combined owner checklist
  are complete. **Production verification itself is not complete.**
- Current full suite: **194 tests**; build, strict types, Worker dry-run, production
  audits, real local workerd/D1 ES256/RS256/OAuth flows, and Chromium virtual-passkey
  UI flows pass. See [release evidence and limits](SECURITY_RELEASE_READINESS.md).

Further progress is tracked in TASK.md. Do not interpret a phase's plan as a
completed security control or a production deployment.

## Phase 1 operational notes

Default limits per observed source IP:

| Route group | Attempts | Window |
|---|---:|---:|
| Sign-in | 60 | 10 minutes |
| Signup | 10 | 1 hour |
| Forgot password | 5 | 15 minutes |
| Reset password | 30 | 15 minutes |
| Change password | 10 | 10 minutes |
| Profile update (includes phone password checks) | 60 | 10 minutes |
| Account deletion | 10 | 10 minutes |
| Request recovery replacement | 5 | 15 minutes |
| Verify recovery replacement | 30 | 15 minutes |
| Username/identifier discovery, shared | 120 | 1 minute |
| OAuth token | 120 | 1 minute |
| MFA writes | 30 | 5 minutes |
| Passkey writes | 30 | 5 minutes |

Do not reset counters manually to solve normal throttling; honor Retry-After.
Shared school/carrier networks may need evidence-based adjustment. The limiter
protects only the listed routes and does not promise per-account brute-force or
volumetric protection. The new additive migration is `sql/06_auth_rate_limits.sql`;
runtime bootstrap also creates the table/index idempotently.

Static CSP allows same-origin scripts, existing inline styles, external Google
fonts, HTTPS images, and HTTPS API connections. It blocks inline JavaScript,
eval, framing, plugins, and base-tag overrides. HTTPS connect/image destinations
remain broad for domain-configurable API/avatar compatibility; narrowing them is
separate work. OAuth consent uses its own unpredictable per-response script nonce.
CSP does not sanitize allowed script code or cure all DOM-based XSS.

On a password change, the verified current device stays signed in; other devices
for that account lose sessions and refresh credentials. Existing unused reset
links are invalidated. Other accounts in the same browser are unaffected.
Phase 4 now binds OAuth credentials to the password snapshot and live consent grant;
password change/reset invalidates them at authoritative userinfo/exchange checks.

### Owner-only deployment evidence still needed

Open Cloudflare Dashboard -> Workers & Pages -> accounts -> Builds, and inspect
the failed build associated with PR 23. Share only the relevant error text with
secret values redacted. The recorded build identifier is
`b05a2e9f-9643-4ba2-b8c8-a065a54987f0`.

Before any release, verify backup availability and restore procedure, review the
additive migration, deploy both Worker and Pages in a coordinated release, and
exercise a controlled test account. Rolling back code does not require deleting
the new rate-limit table. Do not roll back password changes or restore revoked
sessions to work around a sign-in issue. Do not rotate JWT_SECRET blindly because
that changes active-session behavior and rate-limit bucket identity.

## Recovery-change API and migration notes

- `POST /auth/recovery-email/request`: existing session, replacement
  `recovery_email`, and `current_password` required. Missing/broken email delivery
  returns 503 without changing the actual recovery address. No confirmation token
  is returned to the browser API caller.
- `POST /auth/recovery-email/verify`: single-use `token` from the delivered link.
  The token proves destination possession and is bound server-side to the
  originating password version, live session, previous address, and expiry.
  A signed-in browser session is not required to open the mailbox confirmation.
- `/verify-recovery/#token=...`: script scrubs the fragment immediately and waits
  for an explicit button click. Confirmation is never performed on GET.
- `sql/07_verified_recovery_changes.sql` creates additive pending/verified tables;
  runtime bootstrap matches it. Existing recovery addresses are not automatically
  declared verified or removed. Existing reset capability still requires a working
  email transport. Recovery removal is not exposed as a session-only operation.
- Notification delivery can fail after a committed verified change. That failure
  is logged and reported, not misrepresented as an uncommitted address change.
- Recovery requests now require the second factor for MFA-enabled accounts. The
  recovery-email flow itself is not a substitute for MFA or passkeys.

## Session 43 runtime finding

A real local workerd launch reproduced a startup failure: constants exported from
`src/index.ts` were interpreted as invalid Worker entrypoints. Deployment now uses
`src/worker.ts` (default handler only), while library exports remain compatible.
The corrected Worker passed an actual local D1/MFA flow, not only bundling.
The old Cloudflare build log is still required later to establish its exact cause.
No deployment or configuration changes were applied to Cloudflare.

## Final disposition and accepted limits

- A1, B1–B2, C1, D1–D3, E1–E4: implemented in the local source/test scope described
  above. These are not assertions about the currently deployed service.
- A2: account existence remains intentionally visible in the existing identifier/
  chooser flow. Rate limits reduce abuse but do not provide enumeration privacy.
  No hidden breaking switch to generic sign-in errors was made.
- A3: salted PBKDF2 remains at the 100,000-iteration Workers ceiling. Passkeys and
  optional MFA supplement it; this is not a claim of best-in-class password KDF cost.
- C2: broad CORS/redirect trust is removed, but parent-domain cookie delivery remains
  a known sibling-backend trust boundary. The coordinated host-only design is
  documented and not silently deployed across other repositories.
- F1: a local entrypoint defect was reproduced/fixed and actual workerd verified;
  the historical failed production build still needs its original log and new proof.
- F2: local release/restore/incident preparation is complete. Real backup restoration,
  live headers/rules, deployment, email, quotas/CPU, security-contact ownership, and
  cross-app/device pilot remain owner-only operational gates.

No scope-limited audit can establish absence of vulnerabilities or Indian-only data
residency. Use [the final owner checklist](SECURITY_OWNER_CHECKLIST.md), not another
mid-implementation configuration request. No deployment was performed.
