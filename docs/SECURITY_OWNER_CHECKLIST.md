# Final Security Hardening: Owner Checklist

Updated: 2026-10-30. **Coding is complete locally; nothing has been deployed or
configured in production.** This is the single consolidated checklist requested
after implementation. These actions still require owner review/approval.

Related: [A–F findings](ACCOUNTS_SECURITY_HARDENING.md),
[release/restore/incident runbook](SECURITY_RELEASE_READINESS.md),
[passkeys](PASSKEYS.md), [SSO/OAuth migration](SSO_TRUST_AND_OAUTH.md).

Never paste passwords, keys, tokens, cookies, backups, authenticator seeds, or
recovery codes into chat. Use the provider's secret-management interface directly.
No paid service, card requirement, SMS, R2, or automatic deployment is authorized.

## 1. Verify infrastructure ownership and the failed Worker build

- Protect Cloudflare, GitHub, the domain registrar, and the recovery mailbox with
  strong MFA and offline recovery material. Keep a separate emergency recovery path.
- Confirm actual Accounts Worker/Pages projects, account ownership, and the existing
  Accounts D1 binding. Record the live revision rather than assuming main is deployed.
- Open Cloudflare -> Workers & Pages -> accounts -> Builds. Inspect failed build
  `b05a2e9f-9643-4ba2-b8c8-a065a54987f0` associated with PR 23. Preserve only relevant,
  redacted errors. The local default-only entrypoint fix does not establish its cause.
- Build configuration must deploy Worker `cloudflare-worker/src/worker.ts` through
  the existing Wrangler configuration; `index.ts` still has library/test exports.

## 2. Confirm exact domains and consumers before release

- Confirm the permanent HTTPS `AUTH_HUB_URL`, `APP_DOMAIN`, and API custom domain.
  Passkeys default to the identity hostname; `WEBAUTHN_RP_ID`, if supplied, must
  exactly equal it. Never set the parent domain as the RP ID or change it casually.
- Review the explicit first-party origins in [SSO policy](SSO_TRUST_AND_OAUTH.md).
  Add only genuinely required **exact HTTPS** origins to `ALLOWED_ORIGINS`; coordinate
  additional UI redirect destinations with `web/js/config.js` `SSO_REDIRECT_ORIGINS`.
  No wildcard previews or blanket sibling trust.
- Current audited Mail switch/signout code already forwards a trusted Origin.
  Check the **deployed** Mail/Store revisions, plus Drive/Meet/older native consumers.
  Headerless GET `/auth/me` is preserved. Headerless writes based only on Accept
  will be rejected; upgrade those adapters or use authenticated backend transport.
- If an approved backend genuinely needs headerless writes or legacy session-token
  JSON, generate a separate random `SSO_PROXY_TOKEN` of at least 32 characters.
  Store it as an Accounts Worker secret and in that backend's secret store; send
  `X-Gothwad-Proxy-Token`. Do not expose the header/secret to browsers or add it to
  CORS. No proxy secret is needed for the current trusted-Origin Mail switch flow.
- Plan fresh OAuth authorization for existing consumers: old unbound access/refresh
  tokens and pending codes will be rejected after release. Verify handling of
  `invalid_token` and `invalid_grant`. Offline JWT validation cannot observe live
  revocation; resources must consult authoritative Accounts userinfo.
- Shared parent-domain cookies remain intentional for this release. Host-only SSO
  requires a separate coordinated protocol and approval, not a silent setting change.

## 3. Configure authenticator encryption safely

- Generate a separate cryptographically random **32-byte** key and encode it as
  unpadded base64url (43 characters). Set Worker secret `MFA_ENCRYPTION_KEY`.
  Do not reuse `JWT_SECRET`, a proxy secret, or a password-derived value.
- Keep a protected offline copy separate from database backups. Existing encrypted
  seeds depend on this exact key; do not blindly rotate or replace it.
- Missing encryption configuration blocks setup/decryption safely. Password plus an
  unused recovery code, or a registered user-verified passkey, remains an available
  recovery/sign-in route. Never bypass enrolled MFA to resolve a configuration issue.
- Enrollment is optional and never automatic. Pilot authenticator setup/login,
  recovery-code use/replacement, disabling, and passkey registration/removal first.
  Recovery codes are displayed once and should be saved offline by the user.

## 4. Configure and prove recovery email delivery

Existing code uses Resend; no provider account or paid plan was activated. Confirm
an actually available free, card-free plan. If payment/card entry is required, stop
and reassess transport rather than enabling billing or weakening verification.

1. The owner selected `noreply.gothwadtech.com` as the sending subdomain. Add it
   in the provider dashboard without http/https. Do not alter Gothwad Mail inbound DNS.
2. Copy **only** the record names/types/values supplied there into Cloudflare DNS.
   Do not invent SPF/DKIM values or overwrite root MX/TXT records blindly.
3. After verification, choose a real sender on that domain, for example
   `Gothwad Accounts <security@noreply.gothwadtech.com>`.
4. Create a least-privilege sending key; set Worker secret `RESEND_API_KEY` directly
   in Cloudflare. The non-secret `RESEND_FROM` is now maintained in
   `cloudflare-worker/wrangler.toml` as the sender above; no duplicate manual value
   is needed for the next reviewed deployment. This source change does not verify
   the domain, configure an API key, or prove production delivery.
5. Coordinate the setup with the approved release. From a controlled mailbox,
   request a reset and recovery-address replacement; prove actual receipt, explicit
   confirmation, expiry, replay rejection, correct recipient, and prior-address notice.
6. Test failure without changing the active recovery address. Local mocked email
   responses and successful API requests are not proof that mail arrived.

## 5. Backup, migrate, and approve release

- Run `npm run security:check`; inspect the full [runbook](SECURITY_RELEASE_READINESS.md).
  Local Chromium/workerd checks do not replace production sign-off.
- Obtain a protected backup and prove restore into an isolated test database using
  facilities actually available on the free plan. Keep real exports outside Git/chat.
  Store the MFA encryption key separately. Document snapshot/retention and access.
- Review additive migrations **06–10** and runtime bootstrap against representative
  existing data. Do not delete tables or declare historic recovery addresses verified.
- Verify `DEV_MODE=false`, proper D1 binding, existing signing secret, exact origins,
  provider/key presence, and absence of credentials from public Pages variables/logs.
- Authorize a coordinated Worker/Pages release separately. Record deployed revision,
  successful build/runtime health, actual CSP/framing/CORS/cache headers, and rollback.
- Pilot all six slots/parallel tabs, cross-app switching and rotated cookies, password
  changes/resets, session revocation, real email, TOTP/recovery, passkeys, OAuth
  exchange/refresh/disconnect/re-consent, and denied untrusted-origin requests.
- Test physical/mobile passkeys and user-verifying security keys on intended browsers.
  Virtual-authenticator success is not evidence for every device or sync provider.
- Monitor available free-plan error/CPU/D1/rate-limit/quota metrics before expansion;
  confirm no unexpected chargeable resource or provider requirement was introduced.

## 6. Recovery, incident, and maintenance ownership

- Record an owner/security contact, emergency communications, backup review cadence,
  dependency-review cadence, and incident/rollback responsibilities.
- Do not roll back to code that ignores enrolled factors or the OAuth ledger.
  Preserve additive schema and security state during rollback.
- A restore can revive used codes, sessions, counters, grants, and deleted keys.
  Revoke restored credentials/challenges and review recovery codes before reopening.
- Password reset preserves enrolled factors/passkeys. For compromise, separately
  remove unknown keys, revoke delegated access and sessions, and verify recovery
  ownership; changing the password alone is not a complete incident response.
- Review retained account enumeration, PBKDF2's runtime ceiling, shared-cookie trust,
  distributed-abuse limits, and unverified infrastructure controls honestly. This is
  source hardening, not a penetration test, certification, or Google equivalence.

No item above has been performed against production by this coding session.
