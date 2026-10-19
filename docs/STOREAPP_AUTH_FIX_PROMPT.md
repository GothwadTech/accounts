# Copy-paste prompt — GothwadTech/storeapp (Android)

Work ONLY in `GothwadTech/storeapp`. Fix real **Sign in with Gothwad**, callback
handling and session refresh without redesigning unrelated screens or changing
applicationId, package identity, signing keys, Worker names, or download/install
architecture. Follow this repo's working branch rules. Read its working guide,
README.md, task.md, integration/build docs, AuthManager.kt, StoreNetwork.kt,
AppGraph.kt, MainActivity.kt, AndroidManifest.xml and SignInScreen first.

These source findings were checked against main
`ec3d7995610330f342883923dabf79308fa95b38` on 2026-10-17. Re-check current code
before changing it. No Android runtime/device reproduction was performed in the
Accounts session; add focused tests to prove the failures and fixes.

## Shared contract — do not change it to hide the error

- `OAUTH_CLIENT_ID = kiwi-store` (public client; no client secret in the APK).
- `OAUTH_REDIRECT_URI = gothwadstore://oauth/callback`, exactly, no trailing slash.
- Default Accounts API base: `https://accounts.gothwadtech.com/api/`.
  Android already constructs `/api/oauth/authorize` correctly. Do not remove `/api`.
- Scopes: `profile email offline_access`; S256 PKCE using a fresh random verifier
  (43–128 RFC 7636 characters), base64url SHA-256 challenge (43 characters, no
  padding), and a fresh nonempty state per request.
- Code exchange and OAuth refresh go to `oauth/token`; profile to `oauth/userinfo`.
  Store API calls use `https://store.gothwadtech.com/api/` with the OAuth Bearer token.
- The native callback must be in **Accounts'** `ecosystem_apps.redirect_uris` for
  `kiwi-store`. This is not a Store DB or Supabase Authentication setting.
  Accounts has prepared registration SQL; an owner still needs to apply it.
  `https://storeapp.<APP_DOMAIN>/auth/callback` is the WEB landing callback,
  not a replacement for Android's custom scheme.
- Accounts hardening enforces valid S256 PKCE and one-time code/refresh use and
  distinguishes 503 `temporarily_unavailable` from invalid credentials. These
  changes require deployment; do not assume the live provider is updated.

## Confirmed source problems and required fixes

1. **Refresh interceptor recursion / deadlock — highest priority.**
   `AuthManager.client` is built from `StoreNetwork.downloadClient.newBuilder()`.
   That client inherits `authInterceptor`, which calls `tokenProvider()` →
   `accessTokenBlocking()`. Refresh takes `refreshMutex` then calls `postJson()`
   using the SAME intercepted client. Its interceptor can call the token provider
   again and wait on the same mutex, hanging refresh. Use a dedicated Accounts
   token/exchange HTTP client with NO token-provider interceptor. Add the Bearer
   header explicitly only for userinfo. Keep timeouts and never recurse from a
   refresh request into refresh. Reproduce with an expired token and a bounded
   MockWebServer test; do not just increase the timeout.

2. **Weak callback matching and state lifecycle.** `handleRedirect()` checks
   scheme/host, not the exact configured path/port/credentials/fragment; the
   manifest uses `pathPrefix`. Match the configured callback exactly apart from
   expected query parameters and tighten the manifest path. A state mismatch is
   checked only when expectedState is non-null, and KEY_STARTED is written but
   never checked. Require a live pending transaction with nonempty state/verifier,
   matching returned state, bounded age, and exactly a success code OR an error.
   Validate state before processing denial/error too. Reject unsolicited/stale
   links without network exchange and without consuming a different valid pending
   request. Guard duplicate deliveries; consume the matching transaction once
   into immutable request data before launching asynchronous exchange.

3. **Cancel/retry UI can stay disabled.** SignInScreen sets `busy=true` before
   launching the browser and only resets it on launch failure. Browser close,
   provider denial and exchange failure need explicit lifecycle/state handling
   so the button becomes usable again. Do not erase a pending callback merely
   because onResume races its delivery. Clear matching temporary PKCE/state/
   timestamp after success, cancellation, expiry or logout; reset stale errors
   before retrying and preserve useful failure messages.

4. **Refresh/session consistency.** Read the current refresh token inside the
   mutex, not a stale value captured before waiting. Keep one refresh in flight,
   persist the rotated pair together, and prevent a late refresh/code exchange
   from restoring a session after logout or overwriting a newer account.
   Do not return an expired access token on every failure and retry forever.
   Treat real invalid_grant/unauthorized as reauthentication, but preserve
   recoverable state and show retry for offline/timeouts/503. A fresh code
   exchange must replace the old session, not retain another account's refresh
   token when the new response omits one. Keep account switching deterministic.

5. **Bearer-header scope.** The shared auth interceptor currently adds the token
   without checking the destination. Restrict automatic credentials to the
   configured trusted Store API origin; explicitly authorize Accounts userinfo.
   Third-party APK/image/download requests must not receive the account token.
   Test initial foreign-host requests as well as redirects, and never log tokens.

6. **Stale docs.** README.md and docs/ANDROID_INTEGRATION.md still describe native
   auth as unimplemented, but MainActivity/AppGraph/AuthManager now wire it.
   Update docs/task.md to reflect actual implementation, exact callback/API config,
   owner-only Accounts registration and remaining device checks. Do not claim
   native login succeeds just because the app compiles.

## Required tests and boundaries

Use MockWebServer/coroutine tests for successful code + S256 exchange, missing/
mismatched/expired state, wrong callback path, unsolicited/error/duplicate links,
refresh without interceptor recursion, concurrent expiry (one refresh), refresh
rotation, invalid_grant vs network/503, logout/account-switch races, and no Bearer
header on untrusted URLs. Add a lifecycle/UI test for browser cancel → retry.
Keep private token storage excluded from backup; do not add backend credentials,
embedded password login, WebView auth, or a fake signed-in user.

Run available Gradle tests, lint and APK build using the repo's supported JDK/SDK
or existing CI. Preserve signing/application identity; do not publish a release
or change signing configuration just to make tests pass. Report exactly what ran
and what needs a real device. Device acceptance: fresh browser login, existing
Accounts login, cold/warm callback, cancel/retry, token expiry, offline recovery,
and logout/relogin. Network/API success is not device verification.

Deliver code, tests, updated docs and a short Hinglish summary. If Accounts still
says redirect not registered, report the non-secret client_id/redirect_uri and
request Accounts-project registration; do not disable validation or change the
scheme to bypass it. Do not edit other repos or claim the live Accounts DB was
updated by Android changes. Do not merge/deploy production without authorization.
