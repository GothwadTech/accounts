# Copy-paste prompt — GothwadTech/store (web + Store Worker)

Work ONLY in `GothwadTech/store`. Fix its real **Sign in with Gothwad** integration;
do not redesign the UI, change unrelated catalog/upload behavior, rename Worker
`store`, or modify the Accounts/Android repositories. Follow this repo's working
branch rules. Read HANDOVER.md, PLAN.md, TASK.md, src/lib/auth.ts, config.ts,
AppContext.tsx, App.tsx, the four shells, and worker/src/index.ts first.

These findings were checked against main `eb3147adb0f2217fe9b6cef96aec569636b057ce`
on 2026-10-17. Re-check current code before patching. These are source findings,
not proof that the live database/deployment has already been fixed.

## Shared contract — keep this compatible

- Public OAuth client: `kiwi-store`; scopes `profile email offline_access`.
  No client secret in the browser or APK.
- Browser authorize base: `https://accounts.gothwadtech.com/api` (config/env).
- Store Worker → Accounts base: `https://api.gothwadtech.com` (Custom Domain).
  Keep this distinction; same-zone server calls must not use the browser Route host.
- OAuth endpoints: `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo` relative
  to the appropriate base. OAuth refresh uses `/oauth/token` with
  `grant_type=refresh_token`, NOT Accounts' Supabase-session `/api/auth/refresh`.
- Web callback: `window.location.origin + '/auth/callback'`.
  Sites: store, console, storeadmin, storeapp under the configured APP_DOMAIN.
- Android's separate callback is `gothwadstore://oauth/callback`. Do not replace
  it with the landing site's HTTPS URL or overwrite it during web registration.
- Callback allowlisting lives in **Accounts'** `public.ecosystem_apps`, not the
  Store database or Supabase Authentication URL settings. Accounts work is
  handled separately; SQL still requires an owner to apply it.
- Accounts is being hardened to require valid S256 PKCE at authorize, consent
  and token exchange, consume codes/refresh tokens once, and return 503
  `temporarily_unavailable` for storage failures. Do not assume deployment yet.

## Confirmed problems and required fixes

1. **Authorize URL drops `/api`.** In `src/lib/auth.ts`, this is wrong:
   `new URL('/oauth/authorize', AUTH_BASE + '/')`.
   Use `new URL('oauth/authorize', AUTH_BASE.replace(/\/+$/, '') + '/')`.
   Cover both trailing-slash variants and the API Custom Domain in tests.

2. **Admin has no OAuth callback handling.** StoreApp and ConsoleApp handle
   `/auth/callback`; AdminApp goes directly through Gate/SignInPrompt. The
   landing shell also has no callback handler. Add a shared callback route
   before mode-specific auth gates, usable on all four configured sites;
   consolidate existing handlers to avoid duplicate exchanges. Keep backend
   admin authorization: successful login does not make someone an admin.

3. **Callback validation/lifecycle is incomplete.** `null === null` currently
   passes the state comparison when both expected/returned state are absent.
   Require a nonempty pending state, matching returned state, PKCE verifier,
   and nonempty success code. Validate state on error/denial callbacks too,
   before accepting their outcome. Add a bounded pending-request lifetime.
   Consume a matching transaction once, handle React StrictMode/remounts with
   single-flight exchange, clear its temporary state, and remove code/state
   from browser history after completion. Use `oauth_return` only after checking
   it is a safe same-origin relative destination. Do not navigate to arbitrary URLs.
   `signInPageUrl()` is currently unused and sends users straight to `/signin`
   then an OAuth callback without creating a transaction: remove it or make it
   follow the real authorize flow; do not start wiring this broken shortcut.

4. **Refresh is stored but unused.** The web client stores
   `gothwad_refresh_token` but has no rotation flow. Add one shared refresh
   operation, persist the newly returned token pair/expiry, and retry eligible
   authenticated calls at most once. Coordinate callers so they never race the
   same rotating refresh token. Use a properly validated Store Worker proxy if
   following the existing server-side exchange design; keep credentials out of
   logs. A stale Bearer currently prevents cookie fallback in `verifyUser()`:
   define consistent session/account priority rather than silently switching
   to a different cookie user's account.

5. **SSO refresh cookies are discarded.** `verifyUser()` calls Accounts
   `/api/auth/me` but drops its `Set-Cookie` headers. Propagate refreshed cookies
   from the trusted Accounts response to the browser through the Store response
   (preserve multiple Set-Cookie values; never comma-split them). Do not turn
   HttpOnly session cookies into readable frontend storage. Mark auth responses
   no-store. This is distinct from OAuth Bearer token rotation.

6. **Outages masquerade as logout.** `verifyUser()` catches everything as null;
   callers return 401. Exchange also maps every token failure to 401, and can
   report success without a valid user. Add bounded upstream timeouts and JSON/
   user-shape validation. Preserve genuine unauthorized/invalid-grant vs
   retryable 503/network failures; render retryable errors instead of silently
   clearing a good identity on an outage. Sanitize errors; never log credentials.

7. **Document logout semantics.** `/api/auth/signout` is currently a no-op;
   browser token deletion leaves Accounts SSO cookies, so reload may sign back
   in. Make Store-local logout behavior explicit and consistent. Do not silently
   sign out all Gothwad services, clear unrelated cookies, invent an Accounts
   revocation endpoint, or use `/oauth/revoke` to disconnect the core Store app.

## Tests and handoff

Add focused automated tests for URL construction, every site's callback,
missing/mismatched/expired state, denial, duplicate callback/StrictMode exchange,
one-time codes, refresh single-flight/rotation, cookie refresh forwarding,
upstream 401 vs 503/timeout/malformed JSON, and admin vs non-admin access.
Run available lint, tests and build (report exact commands/results).

Update TASK.md/HANDOVER.md/docs/SETUP.md: include all four web callbacks and the
Android callback, Accounts-project ownership, and pending owner SQL/deploy steps.
Keep production demo login disabled; never use mock login as a fix. Keep secrets
server-side and existing public API shapes compatible with Android.

Deliver the source changes, tests, a concise summary in pure English, and clearly separate
local verification from live deployment/device checks. Do not claim that editing
this repo changed the Accounts database. Do not merge or deploy production unless
the owner separately authorizes that operation.
