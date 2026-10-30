# Passkeys: Implementation and Security Contract

Updated: 2026-10-29. **Implemented and verified locally; not deployed.**
Passkeys are optional. Password fallback remains available; accounts with enabled
authenticator MFA still require MFA when choosing the password route.

## User experience

- Sign in: enter the account identifier and select **Sign in with a passkey**.
- Manage: Account dashboard -> Security -> Passkeys. Register a device/security key,
  list its chosen name, or remove it. At most ten credentials per account.
- Registration/removal require the current password and a fresh authenticator or
  unused recovery code when authenticator MFA is enabled. Registration verification
  must complete in the same live account session that authorized setup.
- Browser/platform verification is mandatory: a fingerprint, face, device PIN, or
  user-verifying security key. A touch-only key without user verification is rejected.
- Cancellation and unsupported browsers do not remove password access.
- Names, public keys, and counters are stored server-side; private keys are never
  received by Accounts or placed in browser Web Storage by this application.

A registered, user-verified passkey is a passwordless sign-in method, not a second
password prompt. It can establish MFA session assurance for the current factor
version. Password and authenticator enrollment are not silently disabled.

## Relying-party boundary

`AUTH_HUB_URL` defines the **exact** allowed origin. The RP ID defaults to its
hostname. An optional `WEBAUTHN_RP_ID` must equal that hostname; parent-domain RP IDs
and sibling application origins are rejected. HTTPS is required, except loopback
HTTP in explicit development mode. Production must use the permanent account host.

This intentionally prevents Mail/Store/unknown siblings from directly registering
or authenticating Accounts passkeys. Redirect users to Accounts for these actions.
Top-level identity-site use is required; `crossOrigin=true` client data is rejected.
Do not change the account host after enrollment without an explicit migration:
existing keys are bound to their original relying party and cannot be relabeled.

## Verification and atomicity

- Pinned `@simplewebauthn/server` 14.0.3 performs WebAuthn verification. Native browser
  credential APIs are used without external scripts or hand-rolled production crypto.
- ES256 and RS256 are explicitly offered and verified. Attestation is `none` and
  discoverable credentials plus user verification are requested/required.
- Five-minute challenges use random public handles with only their hashes stored.
  Each is bound to purpose, account/password snapshot, factor version, RP, origin,
  and optional enrollment session. Request bodies cannot override those snapshots.
- Challenges permit three attempts and one successful use; at most five pending
  prompts are retained per account. Durable IP and account limits also apply.
- Authentication checks account ownership, optional user handle, signature, RP,
  origin, user presence/verification, and signature counter semantics.
- Counter/proof update, challenge consumption, session/refresh issuance, and optional
  MFA assurance commit in one D1 batch. Deleted keys, changed passwords/factors,
  replayed challenges, counter rollback, and failed persistence cannot mint sessions.
- Synced keys reporting zero counters are supported. Counters are not a reliable
  clone detector for all synced passkeys; no universal cloning-detection claim is made.
- Enrollment storage is guarded by live session/password/factor state and the ten-key
  limit. Removal requires the same fresh-account authorization gates.
- Browser JSON contains no session access token, refresh token, or session ID.

## API

Routes also accept the `/api` prefix. All passkey requests require the exact account
origin; list GET may use a same-origin Referer when no Origin is sent.

| Method | Route | Input/result |
|---|---|---|
| GET | `/auth/passkeys/list` | Signed-in account; public names/IDs/dates only |
| POST | `/auth/passkeys/register/options` | `current_password`, optional `mfa_code`; returns `challenge`, `options` |
| POST | `/auth/passkeys/register/verify` | Same session; `challenge`, browser `response`, optional `name` |
| POST | `/auth/passkeys/login/options` | `identifier`, optional `remember`, `add`; returns account-bound options |
| POST | `/auth/passkeys/login/verify` | `challenge`, browser `response`; issues HttpOnly cookies |
| POST | `/auth/passkeys/delete` | Signed-in account; `id`, `current_password`, optional `mfa_code` |

Migration `sql/09_passkeys.sql` is additive/idempotent and matches runtime bootstrap.
No account is automatically enrolled, and this feature requires no paid service.

## Local verification and limits

- Cryptographic SQLite tests cover ES256/RS256, UV, RP/origin/iframe/user-handle
  rejection, replay/concurrency, zero counters and rollback, expiry, session binding,
  factor/password/deletion changes, and transaction failure.
- Actual local workerd/D1 passed ES256 and RS256 enrollment, passwordless login,
  replay rejection, and the OAuth smoke flow: `npm run test:passkeys:worker`.
- Actual Chromium with a virtual authenticator passed settings registration/list,
  signed-out passkey sign-in, deletion, cookie-only JSON, Web Storage, and CSP checks.
- Virtual keys do not prove physical biometric/security-key compatibility, mobile
  cross-device flows, provider synchronization behavior, or production performance.
  These remain controlled-pilot checks in the final owner checklist.
- Account enumeration remains visible through the existing identifier UX; throttling
  reduces abuse but does not make account existence private.

See [release readiness](SECURITY_RELEASE_READINESS.md) and the single consolidated
[owner checklist](SECURITY_OWNER_CHECKLIST.md). No deployment was performed.
