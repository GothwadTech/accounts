# 🗄️ `sql/` — Cloudflare D1 Database Schema & Migrations

All database tables live inside the dedicated **Cloudflare D1** database (`accounts`).
- **Automatic Bootstrap:** The Cloudflare Worker automatically executes idempotent schema setup (`ensureSchema()`) on cold start, so an empty database initializes cleanly with zero manual intervention.
- **Manual Console Inspection & Re-Run:** Every SQL file in this folder uses `IF NOT EXISTS` / `ON CONFLICT DO UPDATE` so you can paste or execute them anytime in **Cloudflare Dashboard → Workers & Pages → D1 → `accounts` → Console**.

---

## 📁 Numbered SQL Files (Order: `00` → `12`)

| # | File | Purpose |
|---|------|---------|
| 0 | `00_d1_console_bootstrap.sql` | Legacy base bootstrap; apply later migrations too (Zero `PRAGMA` statements — remote Cloudflare D1 compatible) |
| 1 | `01_core_schema.sql` | `users` (pure username + PBKDF2-SHA256 hash), `profiles`, `user_sessions`, `auth_refresh_tokens`, `password_reset_tokens`, `ecosystem_apps`, `app_authorizations`, `oauth_auth_codes`, `oauth_refresh_tokens` |
| 2 | `02_account_activity.sql` | `account_activity` (Google-style Security & Recent Activity feed, auto-trimmed to latest 100 entries per user) |
| 3 | `03_avatars_storage.sql` | `user_avatars` (256×256 profile photo storage in D1 + Cloudflare Edge CDN cache; optional R2 drop-in support) |
| 4 | `04_kiwi_store_oauth_migration.sql` | Registers `kiwi-store` web + Android OAuth callbacks and migrates legacy grants |
| 5 | `05_store_android_oauth.sql` | Ensures native Android callbacks (`gothwadstore://oauth/callback`, `kiwistore://oauth/callback`) stay registered without dropping web URLs |

| 6 | `06_auth_rate_limits.sql` | Persistent bounded authentication rate limits |
| 7 | `07_verified_recovery_changes.sql` | Verified recovery-address changes |
| 8 | `08_authenticator_mfa.sql` | Optional authenticator MFA and recovery codes |
| 9 | `09_passkeys.sql` | User-verified WebAuthn credentials |
| 10 | `10_oauth_credential_bindings.sql` | OAuth credential snapshots and revocation bindings |
| 11 | `11_google_identities.sql` | Google flow/proof tickets and legacy identity metadata |
| 12 | `12_google_account_links.sql` | Many accounts per Google subject; non-destructive, one-time legacy import |

SQL 12 runs after core tables and SQL 11. It retains all legacy identity rows and
copies their metadata to `auth_external_account_links`. A schema-version marker
prevents repeat imports/legacy scans. Stop old Worker writes and release matching
frontend/backend together; Worker-only rollback to legacy writes is unsupported.
See [Google setup](../docs/GOOGLE_SIGN_IN.md) before an authorized production migration.

> Generate exact OAuth callback SQL for any configured `APP_DOMAIN`:
> ```bash
> node tools/generate-store-oauth-sql.mjs
> ```

---

## 🧠 Core Database Invariants (Never Violate These!)

1. **100% Pure Username-Only (`Rule #2`):** Neither `users` nor `profiles` ever stores an `email` column. The user's primary address is always derived dynamically at runtime as `username + "@" + APP_DOMAIN`. Changing domains requires **0 SQL migrations**.
2. **Zero Raw Secrets in DB:**
   - Passwords = `pbkdf2_sha256$100000$<salt>$<hash>`
   - Session Refresh Tokens = `SHA-256(token)`
   - Password Reset Tokens = `SHA-256(token)` (15-minute expiry, single-use)
   - OAuth Refresh Tokens = `SHA-256(token)`
   - Confidential Client Secrets = `SHA-256(secret)`
3. **Zero Direct Browser DB Access:** Browsers can never connect to Cloudflare D1 directly — `env.DB` is bound privately inside the Cloudflare Worker runtime only.
