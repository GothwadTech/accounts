# Prompt for the Mail repo maintainer — fix "Mail could not verify your sign-in"

> **✅ STATUS (2026-10-11): DONE — both sides merged.**
> Mail repo: PR #4 (session status mapping: 3xx/HTML → `503 accounts_unexpected_response`,
> invalid username → `503 accounts_user_invalid`) + PR #5 (`AUTH_HUB_URL` for server calls,
> `AUTH_SIGNIN_URL` for browser links). Accounts repo: `/api/auth/me` username fallback +
> `503 profile_unavailable`.
> **Root cause of the 503 class:** `AUTH_HUB_URL` pointed at `accounts.gothwadtech.com/api`,
> a Worker **Route** on a Pages host — same-zone Worker-to-Worker fetches do not run a Worker
> behind a Route, so the Pages origin answered HTML. Correct server base =
> **`https://api.gothwadtech.com`** (Accounts Worker Custom Domain). See `docs/MAIL_INTERNAL.md`.
> This file is kept as reference for future session-verification work.

Copy everything below the line into the Mail repo's AI agent or give it to the maintainer.

---

You are working in the public repo `GothwadTech/mail` (Gothwad Mail: Vite React frontend + Cloudflare Worker at `worker/`). Branch from `main`, make a PR. Do not touch the Accounts repo (`GothwadTech/accounts`); it is handled separately.

## The bug (user-facing)

1. User opens `https://mail.gothwadtech.com` while signed out → redirected to Accounts (`/signin?choose=1&next=...`). Correct.
2. User picks an existing Gothwad account → Accounts sets `gothwad_at`, `gothwad_rt`, `gothwad_sid` on `Domain=.gothwadtech.com`. Correct.
3. Browser returns to Mail. `GET https://mail.gothwadtech.com/api/session` returns **401** and the page shows:
   "Accounts sent you back to Mail, but Mail could not verify your sign-in…"

Network evidence from a real failing request (the cookies ARE sent to `mail.gothwadtech.com`, the `gothwad_at` JWT is valid for ~1 hour, and the 401 body is exactly Mail's own `requireSession` 401 body, 118 bytes). The response has **no** `Set-Cookie`. So the cookie is shared and fresh, but Mail's verification step via Accounts `GET /api/auth/me` is failing and Mail collapses every failure into "signed out".

## What Mail gets wrong today (fix these in Mail)

File `worker/src/session.ts`, function `resolveCookie` and `isUnauthenticated`:

- `isUnauthenticated()` treats **3xx, 401, 403** as "signed out" and returns `null` → Mail returns 401. A 3xx or an HTML page from Accounts (route not matching) is an **Accounts configuration problem**, not a signed-out user. It must not be reported as 401.
- If Accounts returns **200** but `res.json()` fails or the body has no `authenticated: true`, Mail returns 401. Treat as upstream failure.
- If Accounts returns `authenticated: true` but `user.username` fails `normalizeUsername`, Mail returns **401**. Should be a 503 (the user IS signed in; Mail just cannot read the username).
- Accounts returning **503** is already mapped to a Mail 503 — keep that.

Required behaviour after the fix:

| Accounts `/api/auth/me` result | Mail `/api/session` |
|---|---|
| 401 / 403 (real signed-out) | 401 with `signinUrl` (unchanged) |
| 200, `authenticated: false` | 401 with `signinUrl` (unchanged) |
| 200, `authenticated: true`, valid username | 200 session (unchanged) |
| 200, `authenticated: true`, username missing/invalid | **503** `accounts_user_invalid` (new, was 401) |
| 200 but body not JSON / no `authenticated` field, e.g. HTML from a misrouted `/api/*` | **503** `accounts_unexpected_response` (new, was 401) |
| 3xx redirect from Accounts | **503** `accounts_unexpected_response` (new, was 401) |
| network error / timeout / 5xx | 503 `auth_unavailable` (unchanged) |

Also:

- Log one line per failure with `console.warn` containing: upstream status, content-type, and the error code. **Never log cookie values, tokens, or the response body.**
- Keep the existing cookie forwarding (`keepAccountsCookies` / `takeUpstreamCookies`) untouched.
- Keep `redirect: 'manual'` on the upstream fetch.

## Frontend (`src/hooks/useSession.ts`, `src/services/mailApi.ts`)

- A 503 must **not** redirect to Accounts. It should show the error with a Retry button (current `else` branch already does this; just make sure the new 503 codes are not converted into a redirect).
- Keep the `__mail_auth_return` loop guard as is.
- Make the 503 message specific: for `accounts_user_invalid` / `accounts_unexpected_response`, say "Your Gothwad Account is signed in, but Mail could not load your profile. Try again in a minute, or contact the admin." Don't say "cookie may be expired" for a 503.

## Tests

Add to `worker/test/worker.test.ts` (and `tests/auth-redirect.test.ts` if the frontend changes):

1. Accounts mock returns 401 → Mail 401 with `signinUrl`.
2. Accounts mock returns 200 `{authenticated:false}` → Mail 401.
3. Accounts mock returns 200 `{authenticated:true,user:{username:"Pawan"}}` → Mail 200, username `pawan`.
4. Accounts mock returns 200 `{authenticated:true,user:{username:""}}` → Mail **503** `accounts_user_invalid`.
5. Accounts mock returns 200 with `text/html` body → Mail **503** `accounts_unexpected_response`.
6. Accounts mock returns 302 → Mail **503** `accounts_unexpected_response` (never follows).
7. Accounts mock throws → Mail 503 `auth_unavailable`.

Run `npm run lint`, `npm test`, and the worker tests as the repo's `AGENTS.md`/`docs/SETUP.md` describe. Do not add secrets.

## Docs

Update `docs/MAIL.md` "If Accounts keeps showing the chooser" with the new status table above. Add a line to `TASK.md`.

## Verification after both sides are deployed

1. Browser (same profile as the failing user), open `https://accounts.gothwadtech.com/api/auth/me`. Check **only** the status code, that it is JSON, and `authenticated` / `user.username`. Do not share the body (it contains tokens).
2. Reload `https://mail.gothwadtech.com`. Expected: inbox loads (200). If not, the Network tab `/api/session` status and JSON `error` code now say exactly which branch failed:
   - `accounts_user_invalid` → the Accounts profile row for that user is missing/has no username. Accounts side fix (already merged in `GothwadTech/accounts`) falls back to JWT metadata; if still failing, check the `profiles` row.
   - `accounts_unexpected_response` → `AUTH_HUB_URL` is a host that does not reach the Accounts Worker (e.g. the Pages host `accounts.gothwadtech.com/api`, or a Route instead of a Custom Domain), or Accounts is redirecting. Fix: `AUTH_HUB_URL=https://api.gothwadtech.com` (Custom Domain dedicated to Worker-to-Worker requests). The Pages route `accounts.gothwadtech.com/api/*` is strictly for direct browser traffic.
   - `auth_unavailable` → Accounts worker down or `AUTH_HUB_URL` wrong.
3. Never paste cookie values, JWTs, or refresh tokens into the PR, issues, or chat.

## Deliverables

- PR to `GothwadTech/mail` `main` with the changes above and passing tests.
- In the PR description: the status-code table, and the three verification steps.
