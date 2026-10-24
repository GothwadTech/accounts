# Accounts Handover

## Current change: session startup, 2026-10-24

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
