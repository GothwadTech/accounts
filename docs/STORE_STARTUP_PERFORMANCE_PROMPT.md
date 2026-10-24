# Store / Console / Admin Startup — Standalone Implementation Prompt

Paste into the coding agent working in `GothwadTech/store`:

```text
Work in GothwadTech/store. Fix slow identity startup across Kiwi Store, Console,
and Admin. Prioritize Store and Console, but do not break Admin's authorization.

Audit the current codebase and repository instructions independently. Do not
follow this prompt blindly: verify every observation and implement the best
safe engineering solution. Work on your assigned branch only.

CONTEXT AND VERIFIED OBSERVATIONS
- Read-only audit on 2026-10-24: main at a0ed0ba.
- src/lib/AppContext.tsx hydrateFromBackend() awaits Promise.all(session,catalog)
  before applying identity. It then awaits library/wishlist, developer bundle,
  and admin data before setting authReady in its signed-in success path.
- This conflates identity readiness with catalog and private-content readiness.
- src/lib/api.ts fetchSession() catches failures and sequentially falls back to
  fetchDirectAccountsSession(); do not let both unavailable services become an
  apparently anonymous session or authoritative "not admin" result.
- worker/src/auth.ts handleMe() resolves Accounts identity and additionally
  initializes Store D1 / loads developer data before answering.
- Accounts startup changes are prepared separately, not guaranteed deployed.
  Keep existing Accounts API compatibility; do not edit the Accounts repository.

IMPLEMENTATION REQUIREMENTS
1. Trace and measure Store/Console startup. Separate static loading, Accounts
   verification, Store D1 work, catalog, library/wishlist, and developer/admin
   hydration. No fake minimum loading delay or unmeasured speed guarantees.
2. Separate identity, authorization, catalog, and per-section readiness/errors.
   Publish verified identity/account-menu state immediately when available.
   Slow catalog or private-data queries must not hold the identity gate open.
   Public Store catalog must remain usable without waiting for sign-in checks.
3. Investigate a lightweight verified identity endpoint and deferred app data,
   or an equivalent compatible design. A verified identity is not proof of
   developer/admin permission. Protected sections stay guarded until their
   server-derived permissions are known; unknown permission is not a false
   "not authorized" screen. Enforce all permissions on the Worker as before.
4. Start independent work concurrently where safe, but avoid overfetching every
   Console/Admin bundle on a normal Store page. Use section skeletons and local
   errors/retries instead of a global auth loader for data hydration.
5. Deduplicate in-flight discovery by authuser selector, handle StrictMode and
   remounts, and use cancellation/generation guards. A late account-A request
   must never populate account B's developer data, library, wishlist, reports,
   submissions, permissions, or catalog overlays. Clear private state on switch
   and sign-out. Never let an old successful response resurrect a session.
6. Use explicit anonymous/unavailable states. Only confirmed anonymous identity
   can redirect to Accounts. 429, offline, timeouts, HTML, malformed responses,
   routing errors, and 5xx need retryable errors. Add bounded requests, not a
   timer that assumes signed-out status. Avoid redundant direct-Accounts fallback
   after authoritative responses. If fallback verifies identity but Store is
   unavailable, retain identity while marking app permissions/data unavailable.
7. Preserve /u/0..5, explicit authuser headers, per-tab isolation, safe next URLs,
   silent SSO, central widget loading, and (slotId, target) sign-out callbacks.
   Reject failed switches instead of silently navigating as if they succeeded.
8. Keep browser requests same-origin where supported and Worker Accounts calls
   on the configured API origin. Forward allowed Set-Cookie headers individually.
   Retain cookie refresh, revocation, CSRF, and server authorization contracts.
9. No auth tokens in Web Storage, persistent identity-as-authorization caches,
   or private API caching in service workers. Keep auth/private responses no-store.
10. Preserve all prior hotfixes: primitive slot IDs, account avatar overflow
    badge, TypeScript compatibility, genuine backend-offline behavior, and no
    production demo login. Do not disable security or remove tests to gain speed.

MANDATORY TESTS
- Verified identity renders while catalog/library/developer/admin promises are
  deliberately unresolved. Protected content stays gated until permission known.
- Public catalog works with slow/unavailable Accounts. Identity works with slow
  catalog, while unavailable private backend shows an honest retry state.
- Anonymous, expired-access/valid-refresh, revoked, offline, timeout, 429, 5xx,
  unexpected HTML/JSON, and direct-fallback paths preserve error distinctions.
- Switch/sign-out during pending hydration cannot leak or resurrect private data.
- StrictMode, parallel tabs, Back/Forward, authuser headers, rotated cookies,
  central widget, per-slot/all sign-out, and previous hotfix regression coverage.
- Existing image/APK upload, catalog, review, publishing, and admin flows pass.

CONSTRAINTS AND DELIVERY
- Pure English everywhere; every source/doc file <=500 lines.
- Domain-agnostic configuration; preserve the dedicated Store D1 database
  a3dc3e71-cf89-4e0a-89d1-693fcf6f227a and existing free storage/APK architecture.
- No R2 or paid/card-gated requirement, Supabase migration, or committed secrets.
- Update README.md, TASK.md, HANDOVER.md, and PLAN.md (create missing files).
- Run npm test, npm run lint, npm run build, applicable UI tests, and
  npx wrangler deploy --dry-run --config worker/wrangler.toml.
- Use npm ci only with a valid lockfile; otherwise follow the repo's install
  policy. Report exactly which verification ran, failures, and warnings.
- Deliver root causes, implementation, request-order/count evidence, remaining
  risks, and Pages + Worker rollout instructions. Do not label local work live.
```
