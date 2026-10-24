# Mail Startup Performance — Standalone Implementation Prompt

Paste into the coding agent working in `GothwadTech/mail`:

```text
Work in GothwadTech/mail. Fix slow startup and the full-screen "Loading your
Gothwad Account" gate without weakening authentication or breaking mail.

Use independent engineering judgment. Audit the current repository and its
instructions first; do not trust this prompt blindly. Implement the best safe
solution, not a cosmetic spinner change. Work on your assigned branch only.

CONTEXT AND VERIFIED OBSERVATIONS
- Read-only audit on 2026-10-24: main at 84aeab0.
- worker/src/index.ts handleSession() waits for requireSession(), then the
  optional send-count query, then unreadCounts() before returning /api/session.
- src/hooks/useSession.ts gates the app on that entire response.
- worker/src/session.ts calls Accounts /api/auth/me and forwards rotated cookies.
- Accounts has a separate startup optimization prepared on its working branch.
  Do not assume it is merged/deployed. Retain compatibility with the existing
  /api/auth/me response; do not edit Accounts from this repository.

IMPLEMENTATION REQUIREMENTS
1. Measure the actual request waterfall, duplicate calls, module-loading costs,
   and critical path before changing architecture. Report code evidence and
   local measurements separately from real production measurements.
2. Identity and optional metadata must have separate readiness/error states.
   After verified identity, render the Mail shell and account trigger without
   waiting for quota/unread data or initial mailbox content. Use local skeletons
   and retry states; do not replace the full app with the auth loader again.
3. Choose a compatible lightweight identity response plus deferred metadata, or
   another demonstrably equivalent nonblocking design. Preserve existing API
   consumers; migrate frontend types/tests together. Unknown badges/quotas are
   unknown, not fake zeros. Sending limits remain enforced server-side.
4. Start the critical identity request early and share in-flight work for the
   same tab selector. Handle React StrictMode/remounts correctly. Avoid duplicate
   Accounts calls within one Worker request. No cross-user or long-lived
   authenticated-session cache; preserve immediate server revocation checks.
5. Use the same-origin Mail API in the browser. Worker calls go to the configured
   Accounts API origin, not an assumed browser-only Accounts route. Forward
   Cookie, X-Gothwad-Authuser, and every allowed rotated Set-Cookie separately.
6. Only a confirmed anonymous identity should start the existing safe sign-in
   flow. Network errors, 429, timeouts, malformed JSON, unexpected HTML/redirects,
   and 5xx must produce actionable retry errors, not false sign-outs or loops.
   Preserve the existing Accounts-return marker and next-URL validation.
7. Bound network operations with real cancellation where supported. Use request
   generations/cleanup so late account-A responses cannot mutate account B or
   restore a signed-out session. Do not merely race a timer while work continues.
8. Preserve account-isolated mailbox/draft caches, draft-flush-before-switch,
   /u/0..5, authuser selectors, Back/Forward, and optimistic switching. Keep
   account switching responsive, without promising instant network verification.
9. Keep loading the central account-menu widget from the configured Accounts
   web origin. Do not fork its UI or make widget download block identity.
10. Keep private responses no-store. Never persist auth/session/OAuth tokens in
    localStorage, sessionStorage, Cache Storage, or service-worker caches. Do not
    add browser credential caches to disguise slow authentication.

MANDATORY TESTS
- A deliberately unresolved quota/unread request cannot block the verified shell.
- Anonymous, valid-session, expired-access/valid-refresh, revoked-session,
  offline, timeout, 429, upstream 5xx, HTML, and invalid-payload paths.
- StrictMode/in-flight sharing, account switches during pending requests,
  sign-out during pending requests, parallel tabs, and per-header selector use.
- Rotated cookies forwarded separately; drafts and mail never cross accounts.
- Existing routing, widget, D1, send-limit, attachment, and mail tests still pass.

CONSTRAINTS AND DELIVERY
- Pure English in every response, UI, comment, test, and document.
- Every source/doc file <=500 lines; split by responsibility.
- Domain-agnostic configuration; dedicated existing D1; no Supabase migration,
  R2 requirement, paid services, or secrets committed/logged.
- Update README.md, TASK.md, HANDOVER.md, and PLAN.md (create missing files).
- Run npm test, npm run lint, npm run build, and
  npx wrangler deploy --dry-run --config worker/wrangler.toml.
- Use npm ci only if a valid lockfile exists; otherwise use npm install and
  follow the repository's lockfile policy. Do not claim commands you did not run.
- Report root causes, changes, request ordering/count evidence, tests, residual
  limitations, and exact deployment steps. Distinguish local completion from
  production deployment; both Pages and Worker changes may need deployment.
```
