# Drive Startup Audit — 2026-10-24

## Scope and evidence

Read-only review of `GothwadTech/drive` main at
`1e8c397a036ab7b65f7b35233a0e58f96297d38d`. No Drive source was changed or pushed.
Temporary checkouts and dependencies were removed after verification.

GitHub lists one successful Cloudflare Pages check on this commit. There is no
Worker build check listed. This is not proof that a manually deployed Worker
is absent. No authenticated production browser session, Cloudflare Dashboard,
or live deployment configuration was inspected in this session.

Local verification with freshly resolved dependencies (repo ignores its lockfile):
- `npm install --no-audit --no-fund`: succeeds.
- `npm test`: **9/9 tests pass**.
- `npm run build`: succeeds, with node:crypto externalization and large-chunk
  warnings. Main JS: approximately **1,824 kB**, **460 kB gzip**.
- `npm run lint`: exits 0 with **33 warnings**, not a warning-free result.

## Confirmed code-level failures

The actual frontend SSO module was bundled with esbuild and executed locally
with mocked fetch responses, without modifying its source:

| Input | Observed client result |
|---|---|
| Both identity endpoints return JSON 503 | `authenticated: false` |
| Vault endpoint returns JSON 503 | `hasVault: false, vault: null` |
| Vault endpoint returns 200 HTML | `hasVault: false, vault: null` |

These results conflate outages/routing errors with signed-out or never-linked
accounts. They do not demonstrate which response the user's production browser
is currently receiving.

## Startup flow

`src/lib/previewSetup.ts` awaits SSO, vault, and Telegram auto-connect before
clearing `booting`. The boot effect has no outer error/finally or stale-run
cleanup. Fetches and Telegram connection have no explicit application deadline.

`src/hooks/useAuth.ts` waits for Telegram `connect()`, `getMe()`, and profile-photo
download before declaring connection ready. It retries connect with additional
backoff. Slow external connectivity can hold the global loader open.

`/api/me` and `/api/drive/vault` separately resolve Accounts identity. The client
may additionally perform sequential direct-Accounts fallback.

The callback used in boot depends on `activeAccountId`, which changes during
account remembering. Repeated effect runs and StrictMode cleanup need behavioral
tests; this audit did not claim a production infinite loop was reproduced.

## Data-preservation concerns

- Vault sync does not await `saveDriveVault()` success before scrubbing legacy
  session storage. Other helpers scrub legacy data during connection too.
- A vault decryption failure currently yields a false `hasVault` indication,
  rather than a distinct recovery error.
- Account switch ignores the switch result before logout/navigation.
- Slot/all sign-out reaches `handleLogout()`, which also calls vault deletion.
  After sign-out, an authuser index can resolve differently. Ownership and
  destructive-action sequencing must be audited before changing this flow.
- Folder indexes use topic ID alone; local/memory fallbacks need verified
  Gothwad and Telegram identity scoping.

Do not delete existing ciphertext, reset keys, revoke Telegram sessions, or
silently migrate an unowned legacy session as a performance fix.

## Correction to earlier secret advice

The audited implementation reads **`DRIVE_ENCRYPTION_KEY`**, not
`VAULT_MASTER_KEY`. Setting the latter alone does not configure this code's
vault encryption. Verify the deployed revision before changing secrets.

The code also supports a legacy key in D1 `system_keys`. A key beside ciphertext
does not protect against a full database compromise. AES-GCM uses per-user HKDF
but does not explicitly pass `additionalData`, despite the repository guide's
AAD description. Any change requires a versioned, backward-compatible migration,
not blind key replacement or deletion.

Both root `wrangler.toml` and `worker/wrangler.toml` currently configure the same
Drive route and D1. Either consistent build-root setup may work. Verify actual
Cloudflare routing instead of assuming `worker/` is the only valid project root.

## Next action

Use [the standalone repair prompt](DRIVE_STARTUP_REPAIR_PROMPT.md) in the Drive
repository. Keep Accounts deployment and app-specific repairs separate. Add
frontend failure-path tests; the current nine green tests do not establish
correct browser startup or production vault availability.
