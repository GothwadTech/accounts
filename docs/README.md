# Accounts Documentation

Use one source per responsibility. [TASK.md](../TASK.md) records changes;
[HANDOVER.md](../HANDOVER.md) describes the working tree and [PLAN.md](../PLAN.md)
tracks next work. Historical test counts and dated audits are not current release evidence.

## Setup and implementation

| Document | Purpose |
|---|---|
| [Setup](SETUP.md) | Pages, Worker, dedicated D1 and private configuration |
| [Architecture](ARCHITECTURE.md) | Runtime modules, identity and cookie contracts |
| [Google sign-in](GOOGLE_SIGN_IN.md) | Passwordless onboarding, explicit linking, setup and limitations |
| [Session startup](SESSION_STARTUP_PERFORMANCE.md) | Identity/bootstrap performance and remaining verification |
| [Entry performance](AUTH_ENTRY_PERFORMANCE.md) | Entry bundles, fonts and local measurement limits |
| [Worker troubleshooting](WORKER_BUILD_TROUBLESHOOTING.md) | Diagnose Worker builds separately from Pages |
| [SQL guide](../sql/README.md) | Additive migrations and bootstrap |
| [Local tools](../tools/README.md) | Build, browser QA and development servers |

## Security and app integration

| Document | Purpose |
|---|---|
| [Owner checklist](SECURITY_OWNER_CHECKLIST.md) | Single operational approval/checklist |
| [Release readiness](SECURITY_RELEASE_READINESS.md) | Local gates, incident/restore work and production limits |
| [Security findings](ACCOUNTS_SECURITY_HARDENING.md) | Threat findings and implementation decisions |
| [Authenticator MFA](AUTHENTICATOR_MFA.md) | Enrollment, recovery codes and enforcement |
| [Passkeys](PASSKEYS.md) | WebAuthn setup, verification and device limitations |
| [SSO trust](SSO_TRUST_AND_OAUTH.md) | Shared-cookie trust, origins and token boundaries |
| [OAuth](OAUTH.md) | Consumer integration and PKCE contracts |
| [Mail contract](MAIL_INTERNAL.md) | Worker URLs, cookie forwarding and internal lookup |
| [Store OAuth](STORE_OAUTH.md) | Web/Android callbacks and registration |

## Dated sibling-repository handoffs

Keep these specifications/audits for their distinct migration or repair detail,
but re-read the target repository before applying them. They do not authorize
changes outside Accounts or establish current production failures.

- Mail: [D1 migration](MAIL_D1_MIGRATION_PROMPT.md),
  [account menu](MAIL_UNIVERSAL_ACCOUNT_MENU_PROMPT.md), [startup](MAIL_STARTUP_PERFORMANCE_PROMPT.md).
- Store: [D1 migration](STORE_D1_MIGRATION_PROMPT.md),
  [account menu](STORE_UNIVERSAL_ACCOUNT_MENU_PROMPT.md), [startup](STORE_STARTUP_PERFORMANCE_PROMPT.md),
  [web auth](STORE_WEB_AUTH_FIX_PROMPT.md), [Android auth](STOREAPP_AUTH_FIX_PROMPT.md),
  [post-merge hotfix findings](STORE_HOTFIX_PROMPT.md).
- Drive: [SSO/vault specification](DRIVE_SSO_UPGRADE_PROMPT.md),
  [startup audit](DRIVE_STARTUP_AUDIT.md), [repair handoff](DRIVE_STARTUP_REPAIR_PROMPT.md).
- [Archived session history](TASK_HISTORY.md).

Superseded Mail bootstrap/session-repair instructions have been removed; use the
Mail contract above. The old founding roadmap and duplicate hybrid-cloud plan
have been consolidated into PLAN.md and the architecture/migration guides.
