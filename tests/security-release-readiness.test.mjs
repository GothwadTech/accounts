/** Local release/restore rehearsals with synthetic data only, never remote infrastructure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLocalD1 } from '../tools/local-d1.mjs';
import { getDb } from '../cloudflare-worker/src/db.ts';
import { makeEnv, BrowserJar } from './helpers/multi-account-harness.mjs';
import { enroll, mfaFixture, TEST_MFA_KEY, mfaPost, startLogin } from './helpers/mfa-harness.mjs';
import { decryptMfaSeed } from '../cloudflare-worker/src/mfa-crypto.ts';
import { safeNextUrl } from '../web/js/accounts.js';
import { resolveSafeRedirectTarget } from '../cloudflare-worker/src/cookies.ts';
import { PASSKEY_SCHEMA } from '../cloudflare-worker/src/passkey-schema.ts';
import { OAUTH_STATE_SCHEMA } from '../cloudflare-worker/src/oauth-schema.ts';

test('security migrations 06 through 10 are additive and repeatable alongside runtime bootstrap', async () => {
  const env = makeEnv();
  try {
    await getDb(env);
    const migrations = ['06_auth_rate_limits.sql', '07_verified_recovery_changes.sql', '08_authenticator_mfa.sql',
      '09_passkeys.sql', '10_oauth_credential_bindings.sql'];
    for (const name of migrations) {
      const sql = readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8');
      assert.doesNotMatch(sql, /\b(?:DROP TABLE|ALTER TABLE|PRAGMA)\b/i);
      await env.DB.exec(sql); await env.DB.exec(sql);
    }
    for (const statement of [...PASSKEY_SCHEMA, ...OAUTH_STATE_SCHEMA]) await env.DB.prepare(statement).run();
    await env.DB.exec(readFileSync(new URL('../sql/00_d1_console_bootstrap.sql', import.meta.url), 'utf8'));
    await env.DB.exec(readFileSync(new URL('../sql/00_d1_console_bootstrap.sql', import.meta.url), 'utf8'));
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM ecosystem_apps WHERE id = 'kiwi-store'").first()).n, 1);
  } finally { env.DB.close(); }
});
test('synthetic SQLite backup restores encrypted MFA data, consumed recovery flags, passkeys, and revoked OAuth state', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'accounts-restore-'));
  const f = await mfaFixture();
  let restored;
  try {
    const factor = await enroll(f.env, f.owner);
    const login = await startLogin(f.env, f.owner);
    assert.equal((await mfaPost(login.jar, f.env, 'verify', { challenge: login.challenge, code: factor.codes[0] })).status, 200);
    await f.env.DB.prepare(`INSERT INTO auth_passkeys
      (id, credential_id, user_id, public_key, counter, transports, name, created_at, version)
      VALUES ('restore-key', 'synthetic-key', ?, ?, 7, '[]', 'Restore fixture', ?, 'version')`)
      .bind(f.owner.data.user.id, new Uint8Array([1, 2, 3]), new Date().toISOString()).run();
    await f.env.DB.prepare(`INSERT INTO oauth_refresh_tokens
      (id, token_hash, user_id, client_id, scopes, expires_at, revoked)
      VALUES ('revoked-restore-token', 'synthetic-revoked-hash', ?, 'kiwi-store', '[]', '2099-01-01', 1)`)
      .bind(f.owner.data.user.id).run();
    const file = path.join(directory, 'synthetic-backup.sqlite');
    await f.env.DB.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    restored = createLocalD1(file);
    const env = makeEnv({ DB: restored, MFA_ENCRYPTION_KEY: TEST_MFA_KEY });
    await getDb(env);
    const saved = await restored.prepare('SELECT * FROM auth_mfa_factors WHERE enabled = 1').first();
    assert.equal(await decryptMfaSeed(env, saved.user_id, saved.secret_ciphertext), factor.setup.secret);
    assert.equal((await restored.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes WHERE used_by IS NOT NULL').first()).n, 1);
    assert.equal((await restored.prepare("SELECT counter FROM auth_passkeys WHERE id = 'restore-key'").first()).counter, 7);
    assert.equal((await restored.prepare("SELECT revoked FROM oauth_refresh_tokens WHERE id = 'revoked-restore-token'").first()).revoked, 1);
    const retry = await startLogin(env, f.owner);
    assert.equal((await mfaPost(retry.jar, env, 'verify', { challenge: retry.challenge, code: factor.codes[0] })).status, 401);
    assert.equal((await new BrowserJar().fetch(env, '/api/auth/me')).status, 401);
  } finally { restored?.close(); f.env.DB.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('browser and server redirects reject untrusted siblings, credentials, HTTP and backslash confusion', () => {
  const previous = globalThis.location;
  globalThis.location = new URL('https://accounts.gothwadtech.com/signin');
  const env = makeEnv();
  const request = new Request('https://api.gothwadtech.com/api/auth/switch');
  try {
    const rejected = ['https://unclaimed.gothwadtech.com/inbox', 'http://mail.gothwadtech.com/inbox',
      'https://user:password@mail.gothwadtech.com/inbox', '//evil.example', '/\\evil.example', '/\n/evil.example'];
    for (const raw of rejected) {
      assert.equal(safeNextUrl(raw, '/fallback'), '/fallback', raw);
      assert.equal(resolveSafeRedirectTarget(raw, request, env), env.AUTH_HUB_URL + '/u/0/me', raw);
    }
    assert.equal(safeNextUrl('https://mail.gothwadtech.com/inbox'), 'https://mail.gothwadtech.com/inbox');
    assert.equal(safeNextUrl('/u/1/me'), '/u/1/me');
  } finally { globalThis.location = previous; env.DB.close(); }
});
