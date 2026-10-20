# 🛠️ `tools/` — Local Dev, Local D1 Engine & Security Tests (NEVER DEPLOY!)

Yeh folder local development, SQL generation aur automated security verification ke liye hai.

## 1. `local-d1.mjs` — Real SQLite D1 Adapter (Zero NPM Packages!)

Node 22 ke built-in `node:sqlite` (`DatabaseSync`) ko exact Cloudflare `D1Database` interface (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`) mein wrap karta hai.
- **Koi fake plain-text mock nahi!** Local server (`npm start`) aur saare tests **100% asli SQLite constraints, Foreign Keys, `ON DELETE CASCADE`, aur `PBKDF2-SHA256` hashing** ke saath chalte hain!

## 2. Automated Test Suite (`npm test`)

```bash
npm test
```

Runs **all 60+ tests** across:
- `tests/d1-native-auth.test.mjs` — Full account lifecycle, SQL `01–05` idempotency, pure username DB rule, dynamic domain change, phone/username signin, real-time session revoke, D1 + R2 avatar upload/ETag `304`, forgot/reset password, internal Mail lookup, `session` vs `oauth_access` JWT isolation, export & cascade account delete
- `tests/kiwi-store-migration.test.mjs` — Store migration, grants preservation, cookies & CORS
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
