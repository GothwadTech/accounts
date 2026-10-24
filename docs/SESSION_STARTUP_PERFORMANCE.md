# Session Startup Performance

Updated: 2026-10-24. Changes are prepared on the Accounts working branch, not a
claim that production has been redeployed or benchmarked.

## Confirmed Accounts causes

1. `web/index.html` raced identity discovery against a 1,200 ms timer. A slow
   authenticated response lost that race and sent the visitor to Sign in.
   Sign in repeated discovery and redirected to the profile. A timeout was being
   mistaken for an anonymous session.
2. `/auth/me` resolved a session, fetched its profile, then inspected accounts
   again. With an explicit authuser selector, session resolution had already
   inspected every account. That repeated validation and could repeat refresh
   rotation within the same request.
3. Slot inspection checked accounts sequentially. A valid session performed
   separate user and session queries before fetching its profile.
4. The dashboard started identity discovery after its larger import graph loaded.
5. The browser retried a 401 from `/auth/me` through `/auth/refresh`, although the
   server already handles cookie refresh during identity discovery.

## Changes

- Pages rewrites `/` to `/me/index.html`; the local server mirrors that rule.
  The root HTML is a `/me` navigation fallback for hosts without rewrites. Neither
  path assumes authentication from a timer or client-readable cookie.
- A small early module starts session discovery. The dashboard consumes that
  one-shot in-memory result; concurrent consumers share the pending request.
  Different authuser selectors cannot consume each other's bootstrap result.
- `/auth/me` passes its single browser inspection into session resolution.
- Independent slots are validated concurrently, then collected in their original
  order. Public authuser indices do not depend on completion order.
- Access-token validation joins users and sessions in one live D1 read. Revoked
  sessions are still rejected on the next request; there is no cross-request
  authenticated-session cache.
- `/auth/me` no longer triggers the browser's redundant refresh retry. Other
  protected routes retain their existing refresh behavior.
- GET requests without bodies no longer send an unnecessary JSON content type.
  Authuser headers may still require cross-origin preflight.
- Auth API responses use `Cache-Control: no-store`.
- Network / server errors preserve the dashboard retry state rather than
  redirecting to Sign in. Sign-in and signup forms remain usable when automatic
  session discovery is unavailable.

No credentials or account snapshots are written to browser storage. HttpOnly
cookies, PKCE, rotation, signed account ordering, and server authorization remain
in place. Rendering a dashboard shell does not authorize private data.

## Verification

- `npm run build` checks modular stylesheets.
- `npm test` includes client bootstrap sharing, selector isolation, anonymous
  handling, network/server failures, real SQLite query instrumentation, parallel
  six-account validation, ordering, revocation, and service outage behavior.
- In the healthy six-account case, instrumentation asserts six joined validation
  reads and seven profile reads: 13 reads total after schema initialization.
  The selected profile is fetched separately for the complete user response.
- TypeScript checks and a Wrangler deployment dry-run validate the Worker.

Local SQLite timing is not a production latency measurement. No fixed startup
latency or sub-16-ms network authentication is promised.

## Mail and Store follow-up audit

Read-only audit of GitHub main on 2026-10-24; no files in those repositories were
changed. Audit current code again before implementing these recommendations.

### Mail

- `worker/src/session.ts` forwards cookie identity to Accounts `/api/auth/me`.
  Therefore the Accounts Worker optimization benefits that upstream operation
  after deployment, without changing the widget or Mail frontend.
- `worker/src/index.ts`, `handleSession()`, waits for identity, then send-count
  data, then unread-count data before returning `/api/session`.
- `src/hooks/useSession.ts` gates the application on that complete response.
- Consider separating optional badges/quotas from critical identity bootstrap,
  or fetching independent metadata concurrently. Preserve response contracts,
  per-account isolation, error classification, and forwarded Set-Cookie headers.

### Store / Console / Admin

- `src/lib/AppContext.tsx`, `hydrateFromBackend()`, initially waits for both
  session and catalog. It then waits for library/wishlist, developer data, and
  admin data before setting `authReady` in the successful signed-in path.
- Resolve identity independently from catalog and account-content hydration.
  Paint authenticated navigation after verified identity; load app data with
  section-specific skeletons and errors instead of a global authentication gate.
- Abort or generation-guard old requests during account changes. Never apply
  account A's delayed data to account B, or infer permissions from cached UI.
- `src/lib/auth.ts` also has sequential backend-to-direct-Accounts fallback paths;
  measure actual usage before changing them.

## Rollout and production check

1. Deploy Accounts Pages and Worker from the reviewed branch changes.
2. Test an existing login at `/`, `/me`, and `/u/0/me` with normal and throttled
   networking; a slow response must not cause a Sign-in flash.
3. Test signed-out, expired-access / valid-refresh, revoked-session, multi-account,
   parallel-tab, account-switch, and API-outage scenarios.
4. Use browser Network timings to separate static imports, session TTFB, and
   app-specific metadata. Compare cold and warm loads on the same device/network.
5. Apply separately reviewed Mail / Store loading-gate changes if needed.

The shared account-menu widget is a presentation component. Updating it alone
cannot remove application-specific startup waits.
