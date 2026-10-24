# Drive Startup, Vault Recovery, and Account Isolation — Implementation Prompt

Paste into the coding agent working in `GothwadTech/drive`:

```text
Work in GothwadTech/drive. Diagnose and repair persistent startup/login/vault
problems. This is not merely a spinner redesign: preserve existing Telegram
sessions, encrypted vaults, private account isolation, and user files.

Read repository instructions and audit current code independently. Do not trust
this prompt blindly. Use your best engineering judgment; verify findings before
changing behavior. Work on your assigned branch only, not in Accounts.

AUDIT BASELINE (2026-10-24)
- main: 1e8c397. Its Cloudflare Pages check succeeded. No Worker build check was
  listed for that commit; this does NOT prove the Worker is absent or broken.
- A fresh local npm install, npm test, and npm run build succeed: 9 tests pass.
  npm run lint exits 0 but reports 33 warnings; do not call that warning-free.
- Build emits an approximately 1,824 kB main JS chunk (460 kB gzip), large-chunk
  warning, and node:crypto browser-externalization warning from @mtcute/convert.
  Measure browser impact; do not just raise the warning threshold.
- Existing tests cover Worker/crypto/static contracts, not the frontend boot flow.

CONFIRMED STARTUP PROBLEMS TO RECHECK
1. src/lib/previewSetup.ts useSsoVaultBootAndSync() sequentially awaits SSO,
   vault fetch, and tryAutoConnect() before clearing the global booting flag.
   Its async boot has no overall catch/finally or stale-run cleanup.
2. src/hooks/useAuth.ts connectWithSessionString() waits for Telegram connect,
   retries, getMe(), and profile-photo download before connected becomes true.
   Fetch/connect operations have no explicit application timeout here.
3. src/lib/gothwadSso.ts turns failed SSO discovery into authenticated:false.
   Reproduced with mocked 503 from both /api/me and direct Accounts fallback.
4. fetchDriveVault() maps 503, unexpected HTML, and network failure to the same
   hasVault:false result as a genuine missing vault. Reproduced locally.
5. /api/me and the following /api/drive/vault each call Accounts /api/auth/me.
   The first failed same-origin call can also cause sequential direct fallback.
6. Boot's tryAutoConnect callback depends on activeAccountId, which changes when
   rememberAccount() runs. Investigate repeated effects/reconnects; do not assume
   production repeats without reproducing. StrictMode exposes duplicate runs.
7. Vault sync fires saveDriveVault() without awaiting success and immediately
   scrubs legacy storage. Other connection helpers also scrub sessions before
   cloud persistence is confirmed. Audit crash/reload data-loss behavior.
8. Account switching ignores switchSsoAccount() failure and navigates anyway.
   Slot sign-out invokes handleLogout(), which also deletes a vault. Audit
   ordering: after sign-out the same authuser index may resolve another account.
   Ordinary sign-out must not accidentally delete anyone's cloud vault.

REQUIRED REPAIR
A. Implement an explicit cancellable/generation-safe startup state machine:
   identity checking, confirmed anonymous, identity error, vault loading,
   genuine no-vault, vault error, Telegram connecting/error, and ready.
   After verified identity show the account shell and honest local progress;
   don't keep everything behind "Verifying your encrypted cloud vault".
   Offer bounded retries and appropriate reconnect/link actions.
B. Only confirmed anonymous identity may trigger the safe Accounts sign-in flow.
   429, timeouts, network errors, invalid JSON, unexpected HTML/redirects, and
   upstream 5xx must be retryable service errors, not sign-out or "link again".
   Wrong routing must be diagnosed, not hidden by silent direct fallback.
C. Bound fetch and Telegram operations with real cancellation/disposal where
   supported. Do not leave Promise.race losers running and changing global
   clients. Deduplicate same-selector boot and prevent effects from reconnecting
   after account bookkeeping updates. StrictMode/unmount/stale runs are safe.
D. Consider a compatible same-origin bootstrap that verifies identity once and
   returns the selected vault, with one request-scoped resolved identity. Keep
   existing endpoints for compatibility. Do not blindly parallelize duplicate
   authenticated endpoints or cache authorization across users/requests.
E. Render Telegram profile without waiting for optional avatar bytes; defer
   avatar download, folder indexing, service-worker readiness, bot checks, and
   other noncritical work. Investigate lazy loading the MTProto/preview stack
   so the identity shell does not require the entire large entry bundle.
F. Distinguish a missing vault row from ciphertext/key/decryption failure. Keep
   existing ciphertext intact; an unreadable vault is a recovery error, not a
   new empty account. No silent overwrite, delete, or fresh empty vault.
G. Await verified vault-save success before marking migration complete. Retry
   failures explicitly and avoid duplicate saves. New runtime Telegram sessions
   remain memory-only; do not reintroduce plaintext Web Storage persistence.
   Reconcile legacy-storage cleanup with safe migration: provide an explicit
   export/recovery/re-link path, never silently scrub the only recoverable copy
   or report failed cloud persistence as success. Persist no Gothwad tokens.
H. Bind runtime clients, caches, folder indexes, migration decisions, and sync
   writes to verified Gothwad user ID + linked Telegram identity. Never silently
   import an unowned legacy Telegram session into a different Gothwad account.
   Review src/lib/db.ts keys (currently topicId alone), memoryAccountSessions,
   cached drive config, and fallback auto-connect for cross-account leakage.
   Abort old sync/uploads where necessary; stale A must never write into B.
I. Handle switch failure before URL/state changes. Ordinary account switch or
   sign-out must not revoke the user's Telegram session or delete their vault.
   Separate local client disposal from remote revocation/unlinking. Destructive
   unlink/reset requires explicit confirmation and server-verified ownership.
J. Preserve shared account-menu ESM, primitive slotId sign-out contract, /u/0..5,
   per-tab X-Gothwad-Authuser, safe next URLs, CSRF, and separate Set-Cookie
   forwarding. Workers use configured Accounts API origin, not a browser route.
   Keep authenticated/vault responses no-store and out of service-worker caches.

ENCRYPTION / DEPLOYMENT CORRECTIONS
- Current crypto.ts reads DRIVE_ENCRYPTION_KEY, NOT VAULT_MASTER_KEY. Verify the
  deployed version before giving secret instructions. Never print secret values.
- Current code has a legacy fallback key in D1 system_keys, stored alongside
  ciphertext. Do not describe that as separation from a database compromise.
- Inspect actual AES-GCM calls: they currently lack explicit additionalData,
  despite documentation mentioning per-user AAD. User-specific HKDF is present.
- Design a versioned, tested migration if improving key/AAD protection. Preserve
  old decryptability, backups, and ownership; no blind key rotation, deletion of
  system_keys, or mass re-encryption without a recoverable plan and approval.
- Preserve dedicated D1: database_name=drive,
  database_id=dfefd813-244a-47f1-8f5a-8d5c15ba3162.
- Check root wrangler.toml versus worker/wrangler.toml and the deployed build root.
  Either consistent configuration can work; don't assume worker/ is mandatory.
- Verify production /api/health returns Drive JSON and /api/me is the Worker,
  not SPA HTML. public/_redirects has a catch-all that can hide missing routing.
  Check actual Worker deployment/routes and D1 binding with available access.
  A successful health response alone does not prove D1, vault keys, or signed-in
  access work. Report checks you cannot perform as unverified, not absent.

REGRESSION TESTS AND DELIVERY
- Add frontend behavioral boot tests with controllable SSO/vault/connect promises:
  slow/hung calls, 503/offline/HTML, no vault, bad key/ciphertext, delayed avatar,
  StrictMode, rerenders, unmount, switch/sign-out during pending work, failed
  switch, failed vault save/migration, and two Gothwad identities on one browser.
- Assert no infinite global spinner, false sign-out, false missing vault, data
  overwrite, wrong-account cache/vault write, or sign-out-triggered vault deletion.
- Test one identity verification per combined bootstrap and separate cookie
  forwarding. Preserve upload/download, streaming, shares, and both
  #GothwadDrive_v1 and #TgCloudDrive_v1 signature compatibility.
- Pure English everywhere; each source/doc file <=500 lines. No R2, credit card,
  paid service, Supabase migration, secrets in Git, or unrelated redesign.
- Update README.md, TASK.md, HANDOVER.md, PLAN.md (create missing files).
- Run npm test, npm run lint, npm run build, and
  npx wrangler deploy --dry-run -c worker/wrangler.toml; use the root config too
  if the deployment actually uses it. Follow the current lockfile/install policy.
- Report exact tests, lint/build warnings, before/after request evidence, residual
  risk, and Pages + Worker rollout/rollback steps. Label production checks and
  actual deployment separately from local results. Never promise instant MTProto.
```
