# Security Release and Incident Readiness

Date: 2026-10-29. Scope: Accounts branch `arena/b5820242-accounts` only.
**All planned coding phases are implemented locally. Production release is not
complete, approved, or verified.** Use the single [owner checklist](SECURITY_OWNER_CHECKLIST.md).

## Local evidence

| Check | Result |
|---|---|
| `npm run security:check` | Build, full test suite, strict Worker types, dry-run, production dependency audits, and patch checks pass |
| Automated suite | 194 tests, including existing six-slot/native OAuth/proxy compatibility and new negative/concurrency/rollback cases |
| Worker bundle | Default-only `src/worker.ts`; dry-run 951.25 KiB / 185.16 KiB gzip |
| Actual local workerd/D1 | ES256 and RS256 registration/login/replay rejection, cookie-only responses, OAuth exchange/userinfo/access and refresh revocation pass |
| Actual Chromium | Virtual-authenticator enrollment, list, signed-out passkey login, removal, Web Storage and CSP checks pass |
| Restore rehearsal | Synthetic SQLite snapshot restores encrypted MFA data with its separate key, consumed recovery flags, public-key/counter data, and revoked refresh state |
| Production dependencies | Root and Worker npm audits report zero known vulnerabilities at the time checked |

Audit output is time-specific, not proof of no vulnerabilities. Physical/mobile
passkey devices, real email delivery, real Cloudflare backups, live cross-app
behavior, quotas/CPU, and the deployed revision remain unverified.

## Repeat the local gates

```sh
npm ci
npm ci --prefix cloudflare-worker
npm run security:check
```

The gate never deploys, writes remote D1, or changes secrets. It deliberately fails
if a required command/audit cannot run. Install dependencies before running it.

For actual Worker smoke checks, start a **local** Wrangler Worker with DEV_MODE=true,
`AUTH_HUB_URL=http://localhost:3012`, a synthetic local MFA key/signing secret, and
local persistence. Bind `0.0.0.0` when a preview is required. Do not reuse production
secrets. Then, from the repository root:

```sh
npm run test:passkeys:worker
PASSKEY_TEST_ALGORITHM=RS256 npm run test:passkeys:worker
npm run test:mfa:worker
```

The tools refuse non-loopback targets and create synthetic accounts. The smoke tools use the local request origin; never point them at real user data.

For browser QA, start the local frontend server on port 3010 with a fresh synthetic
SQLite file, then run `npm run test:passkeys:browser`. Playwright and a Chromium
installation are optional QA tools, not runtime dependencies. Install them in a
separate tooling directory and set `BROWSER_TOOLS_PATH` to that directory. In a
serverless sandbox, `SERVERLESS_CHROMIUM=true` uses optional `@sparticuz/chromium`.
The harness removes flags that disable browser web security before testing.
It uses Chromium virtual keys, not a physical biometric device.

## Release sequence: owner approval required

1. Freeze scope; record the reviewed revision, dependency locks, deployment/build
   settings, and a rollback revision that includes the security schema/guards.
2. Inspect the old failed Worker build and preserve redacted diagnostic text.
   The local entrypoint fix is not proof of that historical failure's cause.
3. Confirm real origins/proxies and the OAuth re-consent impact. Upgrade any older
   origin-less adapters first; no unsafe Accept fallback will be restored.
4. Obtain a protected backup/export and prove restoration into an isolated test
   database. Review representative existing accounts, unverified recovery addresses,
   OAuth grants, and existing cookie flows. Keep real exports outside Git/chat.
5. Review additive SQL 06–10; runtime bootstrap is also idempotent. Use the actual
   Accounts database binding. Do not delete, rename, or overwrite existing tables.
6. Configure approved secrets/domains, deploy coordinated Worker and Pages changes,
   and record the successful deployed revision and health/binding evidence.
7. Controlled pilot: sign-up/password sign-in, six accounts/parallel tabs, refresh,
   logout/device revoke, password change/reset, recovery verification, TOTP/recovery
   codes, passkeys, OAuth PKCE/refresh/disconnect, and Mail/Store proxy cookies.
8. Verify actual HTTP/CSP/framing/cache/CORS headers and blocked hostile origins.
   Verify missing key/provider failures fail safely without an account lockout.
9. Observe error/rate-limit/CPU/D1 quota trends before broader enrollment.

A merge or dry-run is not any of steps 4–9. No changes to Supabase applications,
paid infrastructure, R2, or card-gated service are part of this release.

## Backups and restore safety

- Use the Cloudflare backup/Time Travel/export facilities actually available on the
  account's free plan. Verify retention and recovery-point options in the dashboard;
  do not assume a paid feature or a particular retention window exists.
- Restrict and encrypt any exported database offline. It contains password hashes,
  recovery addresses, public keys, encrypted seeds, token hashes, and audit data.
  Store `MFA_ENCRYPTION_KEY` separately with an access-controlled offline backup.
- Rehearse on an isolated D1/test database and test foreign keys, profile identity,
  factor decryption, passkey counters, account selection, and revocation behavior.
  Never restore an export over production just to test whether it opens.
- A point-in-time restore can resurrect consumed recovery/reset codes, old sessions,
  grants, counters, and deleted keys. Revoke restored sessions and token ledgers,
  expire pending challenges/reset/recovery links, and review compromised credentials
  before reopening traffic. Reissue recovery codes through fresh verified access.
- A database backup does not recover lost device private keys or a missing encryption
  key. Do not bypass MFA because the seed cannot decrypt; use a saved recovery code
  or an already-enrolled user-verified passkey, then follow a controlled recovery.
- Record restore date, snapshot reference, isolated validation outcome, affected
  period, authorized operator, and credential invalidation actions—never raw secrets.

The repository rehearsal proves local snapshot mechanics, not Cloudflare restore
permissions, backup retention, or an operational recovery-time objective.

## Rollback and incident response

- Stop rollout for account cross-talk, unexpected factor bypass, unexplained
  credential disclosure, repeated 5xx, broken proxies, or failed restore verification.
- Prefer a reviewed forward fix or a security-compatible rollback. Keep additive
  tables; never downgrade to a version that ignores enrolled factors or the OAuth
  revocation ledger. Coordinate frontend/backend rollback and preserve user state.
- Record UTC times, revision, sanitized error categories, routes, and impacted users.
  Logs must omit Cookie/Authorization headers, passwords, OTPs, seeds, reset links,
  proxy secrets, and recovery codes. Minimize personal data and restrict log access.
- Account compromise: revoke sessions/refresh credentials, delegated grants/ledger,
  pending authorization/reset/recovery/passkey challenges, and unknown passkeys;
  preserve required evidence and use independently verified recovery. Password reset
  deliberately does not silently remove enrolled authenticators/passkeys.
- Signing/proxy/email/encryption-key compromise: contain affected channels, coordinate
  all consumers, rotate only the affected material with a documented recovery plan.
  Encryption-key rotation requires decrypt/re-encrypt support or controlled factor
  re-enrollment; blindly replacing the key makes stored seeds unreadable.
- Assign an owner/security contact, an emergency communication path, and no-cost
  monitoring available on the existing plan. Review unexpected 401/403/429/5xx and
  successful security changes without recording credential contents.
- Triage dependency advisories promptly, update pinned security libraries deliberately,
  and repeat runtime/browser/restore checks after upgrades. Record review cadence
  and unresolved risks; this repository does not operate a staffed response service.
