# Authenticator MFA and Offline Recovery Codes

Date: 2026-10-28. Implementation status: local code, not deployed.
Owner configuration is deferred until the consolidated final release checklist.
Passkeys remain the next implementation stage; TOTP is not phishing-resistant.

## What is implemented

- Optional authenticator enrollment using standard TOTP: SHA1, six digits,
  30-second periods, and a one-step clock-skew window.
- OTPAuth 9.5.2 (MIT) provides the standard algorithm. Both the Node application
  and independently installed Worker declare the pinned runtime dependency.
- Seeds are encrypted with AES-256-GCM using a random 96-bit nonce and account-bound
  authenticated data. They are never stored as plaintext in D1.
- A distinct `MFA_ENCRYPTION_KEY` is required for enrollment/seed decryption.
  There is no JWT-key or development-key fallback. Existing unenrolled accounts
  continue to work without this configuration.
- Ten randomly generated 128-bit recovery codes, stored as account-bound SHA256
  hashes. Plaintext codes are returned once at activation or replacement, never
  through status, profile, or export endpoints.
- Current password plus a valid authenticator/recovery proof is required for
  disabling MFA or replacing recovery codes.
- Pending setup is bound to account, originating session, password version, setup
  identifier, and a 15-minute expiry. Activation is atomic with backup-code storage,
  current-session assurance, and other-device revocation.
- The original setup-session foreign key is cleared on activation. Signing out
  that original device does not delete the enabled factor.

## Sign-in enforcement

1. `/auth/signin` checks the password as before.
2. For an enrolled account it returns HTTP 202 and a random preauthentication
   challenge. It does not create a session, refresh token, or session cookie.
3. The challenge expires after five minutes and permits at most five attempts.
   A new challenge supersedes the previous pending challenge for that account.
4. `/auth/mfa/verify` accepts the challenge and an authenticator or recovery code.
5. Proof consumption, challenge consumption, session creation, refresh storage,
   and the session's factor-version assurance are committed together.
6. Concurrent attempts have one winner. Database failure rolls back the proof
   and session writes, permitting a safe retry while the challenge remains valid.

Preauthentication values are not session JWTs. They cannot authorize `/auth/me`,
OAuth consent, or account management. Supplied user identifiers, remember flags,
and add-account flags at the second step cannot change the account/options fixed
by the password-verified challenge.

## Session and sensitive-action policy

- Enabled accounts require a live assurance record matching the current factor
  version. The condition applies to normal JWTs, refresh rotation, and refresh
  grace fallback; sid-less legacy JWTs do not bypass it.
- Enabling MFA keeps the password-and-code-verified current device and signs out
  other devices. Other accounts in the same six-slot browser remain independent.
- Password recovery can change the password but never disables the factor or
  creates a full sign-in session. The next login still requires the second factor.
- Password changes, phone changes/removal, recovery-address requests, and account
  deletion require the current password plus MFA when enabled.
- The actual database mutation is gated on the authorized factor state. A race
  with enrollment, factor replacement, or password replacement cannot reuse a
  stale no-MFA authorization to perform the sensitive mutation.
- One-time action proofs may be consumed before a later, unrelated action fails.
  Use a new authenticator code or another recovery code when retrying; there is
  no reusable bearer step-up token stored in browser storage.
- Enrollment invalidates pending recovery-address changes, old OAuth authorization
  codes, refresh tokens, and OAuth credential bindings. Phase 4 adds authoritative
  access-token revocation; see [SSO/OAuth](SSO_TRUST_AND_OAUTH.md).
- User-verified passkey sign-in is now also available and can establish current MFA
  assurance without decrypting the TOTP seed. Password sign-in still requires MFA.

## Replay and abuse controls

- Successful TOTP counters must strictly increase. Codes cannot be reused for a
  later login or sensitive action after they have been consumed.
- Recovery-code use is an atomic single-winner update. Regeneration invalidates
  the entire previous set, including previously unused codes.
- Per-challenge limits persist in D1. A separate per-account limit allows ten MFA
  proof/management attempts in five minutes and survives challenge replacement
  and IP changes. Fixed windows permit boundary bursts; this is not DDoS protection.
- MFA POST routes also share an IP-based 30-attempt/five-minute limit.
- Status does not reveal seeds, provisioning URIs, hashes, or code values.
- Missing/corrupt encryption configuration causes a retryable failure for seed
  operations rather than disabling verification. Password plus an unused recovery
  code does not require seed decryption and remains a supported recovery path.

## User interface

- Security -> 2-Step Verification now opens real settings, not a coming-soon row.
- Enrollment uses a manual setup key compatible with standard authenticator apps.
  No secret is sent to an external QR-code generator or analytics service.
- Activation shows recovery codes once and offers an explicit local text download.
- The sign-in form adds a second step and clears the password after receiving the
  challenge. Codes/challenges/seeds remain in page memory, not Web Storage.
- Account identity, selector, and dialog-generation checks prevent late asynchronous
  responses from reopening secrets after a dialog is closed or an account changes.
- Sensitive-action dialogs include an MFA field only when the account is enrolled.
- An already-used six-digit code may require waiting for the next time period;
  the UI also accepts unused offline recovery codes.

## Schema and deployment entrypoint

`sql/08_authenticator_mfa.sql` is additive and idempotent. Runtime bootstrap uses
`mfa-schema.ts` with matching definitions. Migration does not enroll existing users
or invent a secret for an account. No existing secrets were rotated.

`wrangler.toml` now targets `src/worker.ts`, which exports only the default handler.
`src/index.ts` preserves library/test exports. A real local workerd launch rejected
the previous constant exports as invalid Worker entrypoints; the thin wrapper
resolves that reproduced startup defect. This does not prove the cause of the
older Cloudflare build failure without its deployment log.

## Verification and reproduction

- **169/169 tests** pass (27 added for this implementation), plus the CSS build,
  strict Worker typecheck, and dry-run (236.80 KiB / 54.48 KiB gzip). Root and Worker
  production-dependency npm audits report no known vulnerabilities at this check.
- RFC 6238 vector tests, encryption tampering/wrong-account/wrong-key tests,
  replay/concurrency/rollback cases, management safeguards, legacy-session rejection,
  password-reset/MFA isolation, add-account compatibility, and mutation-state gates.
- Synthetic Chromium: actual setup/confirmation, status update, one-time recovery
  display, no Web Storage persistence, signed-out password/MFA flow, recovery-code
  replacement, and enforced CSP. No real email was sent.
- Actual workerd with local D1: signup, seed encryption/TOTP enrollment, password
  challenge without cookies, recovery-code completion, and assured session.
- `npm run test:mfa:worker` runs a local-only smoke check against a configured local
  Worker on port 3012. `MFA_SMOKE_URL` may change the local origin; remote hosts are
  rejected. It creates only synthetic local test accounts, not production users.

These checks are not a production security certification. Deployment, real email,
secret backup/restore, passkeys, SSO trust boundaries, and operational readiness
remain separate unfinished phases. Do not enable MFA in production without a
reviewed key-backup and user-recovery plan.

## Session 44 follow-up

Passkeys and SSO/OAuth hardening are implemented locally. The current release gate
includes the original MFA regression suite; the 169-test result above records the
Phase 3A milestone, not the final suite count. Use [release readiness](SECURITY_RELEASE_READINESS.md)
and the [final owner checklist](SECURITY_OWNER_CHECKLIST.md). No production rollout occurred.
