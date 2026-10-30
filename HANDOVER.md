# Accounts Handover

## Deployment investigation and requested merge — 2026-10-30

The owner requests merging the pending sender change. A separate PR from
`arena/bfd51291-accounts` will include that setting, its regression, and corrected
deployment guidance. Pages and Workers Builds are independent; the old setup guide
incorrectly implied that merging necessarily deploys both. That claim is corrected.
[Worker troubleshooting](docs/WORKER_BUILD_TROUBLESHOOTING.md) documents compatible
root/branch/commands and the redacted log needed to determine the real cause.
No live dashboard setting, route, secret, or deployment command is changed here.
The reported security endpoint 404 remains unresolved pending Worker evidence.

## Current follow-up: source-controlled recovery sender, 2026-10-30

On `arena/bfd51291-accounts`, Wrangler now retains the owner-selected public sender
`Gothwad Accounts <security@noreply.gothwadtech.com>`. A configuration regression
checks the sender against APP_DOMAIN. This prevents future reviewed deployments
from reverting it to the old Resend test sender. No deployment or provider/DNS
verification was performed; RESEND_API_KEY remains a private Cloudflare secret.
PR #24 was merged previously; the older draft-state handoff below is historical.


## Current change: remaining security phases, 2026-10-29

Branch `arena/b5820242-accounts`; implementation commit `120f918` is pushed and
draft [PR #24](https://github.com/GothwadTech/accounts/pull/24) is open at the owner's
request on 2026-10-30. No merge or deployment command was executed; external
Cloudflare integration outcomes still require verification.
All remaining coding phases are complete: required-UV passkeys, exact origin/proxy
trust, cookie-only browser responses, durable OAuth revocation, and release/
restore/incident tooling/docs. No configuration questions interrupted the work.
See [release readiness](docs/SECURITY_RELEASE_READINESS.md) and the single
[final owner checklist](docs/SECURITY_OWNER_CHECKLIST.md).

Verification: **194 tests**, build, strict Worker types, default-only entrypoint
bundle, root/Worker production audits, actual local workerd/D1 ES256/RS256 and
OAuth flows, real Chromium virtual-passkey settings/login/removal, and synthetic
SQLite backup/restore checks. Nothing proves production email/deployment/backups.

Mail/Store current source was audited read-only; no other repository was changed.
Existing parent-domain cookie names/domain/slots/Set-Cookie behavior remain.
Old unbound OAuth tokens require re-consent; older headerless write proxies need
trusted Origin or a server-only SSO_PROXY_TOKEN. Browser JSON no longer exposes
session credentials; OAuth token response contracts remain separate.

Next: owner review/approval of the consolidated checklist, real email/key/origin
setup, protected backup/isolated restore, coordinated Worker/Pages release and
consumer/device pilot. Do not restore the Accept-only proxy exception, silently
switch to host-only cookies, bypass MFA, rotate encryption keys blindly, or deploy
without authorization. Preserve unrelated Realtime assessment documentation.

### Historical milestones below

Older phase counts, pending-work notes, and proxy behavior record their session's
state and are superseded by the current section and release documents above.

## Previous change: security hardening, 2026-10-28

Branch: `arena/b5820242-accounts`. Scope and decisions:
[Accounts security hardening](docs/ACCOUNTS_SECURITY_HARDENING.md).

Phase 1 adds persistent authentication throttling (SQL 06 and runtime bootstrap),
parsed CORS origin checks, central rejection of explicit hostile browser mutations,
other-device revocation on password change, static script/framing CSP, and dynamic
OAuth script nonces. Current cookies and headerless proxy compatibility remain;
this is not a completed SSO trust-boundary migration or full CSRF remediation.

Verification: build, **142/142 tests**, strict Worker typecheck, deploy dry-run,
and synthetic Chromium checks pass. No production deployment or new secrets.
PR 23 was merged previously; its Worker build failed while Pages passed. Inspect
the Cloudflare build log before diagnosing the production failure.

Recovery core is also implemented: password-confirmed pending replacements,
single-use verification bound to session/password/address state, atomic reset
consumption/update/revocation, and current-password checks for phone changes.
SQL 07 matches runtime bootstrap. Confirmation removes the fragment and requires
an explicit click; generic profile updates cannot overwrite recovery addresses.
Real email delivery remains unconfigured and successful browser email responses
were mocked. See [owner actions](docs/SECURITY_OWNER_CHECKLIST.md).

Next: owner chose authenticator MFA/recovery codes first, then passkeys. Implement
real enforcement and audit OAuth/SSO/token consumers; no MFA is enabled yet. No other
repositories were edited. Keep unrelated Realtime research documentation intact.

## Historical change: session startup, 2026-10-24

User reported an Accounts homepage -> Sign in -> profile bounce and multi-second
identity loading in Accounts, Mail, and Store / Console.

Implemented in this repository:

- Root dashboard rewrite, removing the 1.2-second false-anonymous timer.
- Early, one-shot, memory-only session bootstrap with in-flight sharing.
- One browser-account inspection per `/auth/me` request.
- Parallel slot inspection with stable authuser ordering.
- Joined user/session validation without removing live revocation checks.
- No redundant frontend refresh after `/auth/me` returns 401.
- Retryable dashboard state for service/network errors; no false sign-out.
- `no-store` responses for all auth routes.
- Client and real-SQLite regression tests.

Architecture and follow-up details:
[Session startup performance](docs/SESSION_STARTUP_PERFORMANCE.md).

## Deployment boundary

Changes are on `arena/d34d0d2c-accounts`. They are not deployed by editing the
working tree. Both Accounts Pages and Worker must deploy after review/merge.
No production speed claim has been measured in this session.

Mail and Store were audited read-only. Their app-specific loading gates remain
unchanged; recommendations are documented, not implemented in those repos.

Verification completed: **98/98 tests pass**, CSS build passes, strict Worker
TypeScript checks pass, and Wrangler dry-run succeeds.

## Verification commands

```sh
npm run build
npm test
npm exec --yes --package=typescript -- tsc --noEmit -p cloudflare-worker/tsconfig.json
npm exec --yes --package=wrangler -- wrangler deploy --dry-run --config cloudflare-worker/wrangler.toml
```

Keep English-only text, files at or below 500 lines, zero browser-storage auth
credentials, and all existing HttpOnly slot-cookie / OAuth security contracts.


## Follow-up prompts and read-only Drive audit

Created standalone implementation prompts in `docs/` for Mail, Store, and Drive.
See `docs/DRIVE_STARTUP_AUDIT.md` for reproduced client failure classification,
startup flow, data-preservation risks, and local verification results. Drive's
nine tests pass; build succeeds with warnings; lint has 33 warnings. No app
source changes or production deployment were performed in this follow-up.
The audited Drive key variable is `DRIVE_ENCRYPTION_KEY`, not `VAULT_MASTER_KEY`.
A missing Worker GitHub check is not evidence of a missing Worker deployment.


## Universal Account Menu design preview — 2026-10-24

The shared profile/account-switcher popup is called the **Universal Account
Menu**, implemented in `web/widget/`. Dark surface is now `#212121`; account rows
are uniform and always visible, with the current account first but its server
authuser index unchanged. No hero, edit pencil, collapse arrow, or Manage accounts
control. The heading reads Gothwad Accounts; the manage pill uses the existing
Gothwad logo. Add another account is a separate matching pill. Per-slot and
all-account sign-out remain accessible without management mode.

`npm run preview:menu` starts the real widget's local-only synthetic-data design
preview at port 3010. No real authentication API or account changes are involved.
The user requested preview before deployment; no merge or deployment performed.

Verification: **105/105 tests pass**, CSS build passes, and headless Chromium
checks passed for equal desktop row heights, switching, per-slot sign-out, add,
themes, Escape, and mobile layout/close without horizontal overflow. Browser
check dependencies were installed only under ignored `node_modules/`; no new
production dependency was added.
