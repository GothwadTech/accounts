# 🛠️ `tools/` — Local Dev, Local D1 Engine & Security Tests (NEVER DEPLOY!)

This directory provides local development servers, SQL migration generators, and automated security & hygiene test suites.

## 1. `local-d1.mjs` — Real SQLite D1 Adapter (Zero External Packages!)

Wraps Node 22's built-in `node:sqlite` (`DatabaseSync`) with the exact Cloudflare `D1Database` interface (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`).
- **Zero fake plain-text mocks!** Both `npm start` and all automated tests execute real SQLite constraints, Foreign Keys, `ON DELETE CASCADE`, `UNIQUE` indexes, binary `BLOB` storage, and `PBKDF2-SHA256` hashing!

## 2. Automated Test Suite (`npm test`)

```bash
npm test
```

Runs the authentication, integration and repository hygiene suites, including:
- `tests/d1-native-auth.test.mjs` — Full account lifecycle, SQL `01–05` idempotency, pure username DB rule, dynamic domain change, phone/username signin, real-time session revoke, D1 + R2 avatar upload/ETag `304`, forgot/reset password, internal Mail lookup, `session` vs `oauth_access` JWT isolation, export & cascade account delete
- `tests/kiwi-store-migration.test.mjs` — Store migration, grants preservation, cookies & CORS
- `tests/browser-multi-account-slots.test.mjs` — `a`..`f` `HttpOnly` browser slots, `/u/0..5`, `X-Gothwad-Authuser`, single-slot sign-out
- `tests/universal-account-widget.test.mjs` — Universal Google-style Shadow-DOM account menu (`web/widget/account-menu.js`), secondary account `avatarUrl` slots, cross-subdomain `X-Gothwad-Authuser` CORS
- `tests/frontend-and-filesize.test.mjs` — Frontend integrity, file limits, English-only text and local documentation links
- `tests/password-policy.test.mjs` — Length-only password acceptance across signup/signin/change/reset; no strength/composition gate
- `tools/test-oauth-redirects.mjs` — Native & web redirect allowlist exact-match enforcement
- `tools/test-oauth-security.mjs` — PKCE S256 checks, `<script>` escaping, cookie rotation preservation on 503, single-winner atomic race tests
- `tools/test-oauth-docs.mjs` — Executes the literal client JS snippet in `docs/OAUTH.md`
- `tools/test-oauth-setup.mjs` — Executes `generateStoreOAuthSql()` twice in real SQLite & audits production `wrangler.toml`

## 3. `generate-store-oauth-sql.mjs` — D1 OAuth Callback Generator

```bash
node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
```

Reads `APP_DOMAIN` from `cloudflare-worker/wrangler.toml` and prints ready-to-run, idempotent Cloudflare D1 SQL for `kiwi-store` (web + Android `gothwadstore://` & `kiwistore://`), `gothwad-mail`, `gothwad-meet`, `gothwad-chat`, and `gothwad-drive`.

## 4. `dev-server.js` — Standalone Static + Proxy Dev Server

- Quick single-process preview: `npm start` (`node --experimental-strip-types server.js` on port `3000`)
- Split Wrangler preview: `cd cloudflare-worker && npx wrangler dev` (`:8787`) + `node tools/dev-server.js` (`:3000`)

## Entry UI browser regression

`node tools/test-auth-entry-browser.mjs` checks the local preview at port 3000 on a
390px viewport: Create New labels, collapsed optional birthday, combined email/password, first-step-only Google,
Back navigation and password/MFA method visibility, plus 390px/1280px keyboard
regressions in `auth-keyboard-checks.mjs`: visible-step Enter/focus, held Enter,
implicit submission, hidden-form rejection, pending/terminal locks, recovery,
reset and Google consent/chooser/MFA, plus short-height disclosure geometry in both themes. It creates a synthetic local
account only. Set `BROWSER_TOOLS_PATH` for an external Playwright installation and
`SERVERLESS_CHROMIUM=true` when using `@sparticuz/chromium`. No production URL is
accepted. Google provider integration has its separate synthetic browser QA:
`node --experimental-strip-types tools/test-google-browser.mjs`. It runs an isolated
local server/database with a mock provider and covers chooser/COOP/cache isolation,
passwordless/native backup linking, removal/final-method protection, account-change
response rejection, alert-failure notices and backup Google sign-in. It never uses
production, real provider tokens or actual email delivery.

## Lightweight entry bundles

`npm run build` also runs `tools/bundle-auth.mjs`. Edit modular sources, then rebuild;
do not hand-edit `web/assets/auth` outputs. See [entry performance](../docs/AUTH_ENTRY_PERFORMANCE.md)
for hashed assets, shared preloading, local cache policy and measurement limits.
