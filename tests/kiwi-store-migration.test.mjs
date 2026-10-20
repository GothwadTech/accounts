import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocalD1 } from '../tools/local-d1.mjs';
import { buildCorsHeaders, cookieDomain } from '../cloudflare-worker/src/index.ts';

const coreSchema = await readFile(new URL('../sql/01_core_schema.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../sql/04_kiwi_store_oauth_migration.sql', import.meta.url), 'utf8');
const appCatalog = await readFile(new URL('../web/js/gothwad-apps.js', import.meta.url), 'utf8');

const env = { DB: createLocalD1(':memory:'), APP_DOMAIN: 'gothwadtech.com', AUTH_HUB_URL: 'https://accounts.gothwadtech.com' };

test('Kiwi Store D1 migration registers exact production, local and Android callbacks and migrates legacy grants', async () => {
  const db = createLocalD1(':memory:');
  await db.exec(coreSchema);

  // Simulate legacy `gothwad-store` client + user grant + legacy code & refresh token
  await db.prepare("INSERT INTO users (id, username, password_hash) VALUES ('u1', 'pawan', 'hash')").run();
  await db.prepare("INSERT INTO ecosystem_apps (id, client_id, name, redirect_uris) VALUES ('gothwad-store', 'gothwad-store', 'Old Store', '[]')").run();
  await db.prepare("INSERT INTO app_authorizations (id, user_id, app_id, scopes) VALUES ('a1', 'u1', 'gothwad-store', '[\"profile\",\"email\"]')").run();
  await db.prepare("INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, scopes, expires_at, used) VALUES ('old-code', 'gothwad-store', 'u1', 'https://old/cb', '[]', '2099-01-01T00:00:00Z', 0)").run();
  await db.prepare("INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked) VALUES ('rt1', 'hash1', 'u1', 'gothwad-store', '[]', '2099-01-01T00:00:00Z', 0)").run();

  // Execute migration twice to guarantee 100% idempotency
  await db.exec(migration);
  await db.exec(migration);

  const row = await db.prepare("SELECT redirect_uris FROM ecosystem_apps WHERE id = 'kiwi-store'").first();
  const actual = JSON.parse(row.redirect_uris);
  assert.deepEqual(actual, [
    'https://kiwistore.gothwadtech.com/auth/callback',
    'https://kiwiconsole.gothwadtech.com/auth/callback',
    'https://kiwiadmin.gothwadtech.com/auth/callback',
    'http://localhost:3000/auth/callback',
    'gothwadstore://oauth/callback',
    'kiwistore://oauth/callback',
  ]);
  assert.equal(actual.includes('https://kiwiapp.gothwadtech.com/auth/callback'), false);

  // Legacy grant preserved under `kiwi-store`, legacy codes deleted, legacy refresh revoked
  assert.equal(await db.prepare("SELECT COUNT(*) AS c FROM app_authorizations WHERE user_id = 'u1' AND app_id = 'kiwi-store'").first('c'), 1);
  assert.equal(await db.prepare("SELECT COUNT(*) AS c FROM oauth_auth_codes WHERE client_id = 'gothwad-store'").first('c'), 0);
  assert.equal(await db.prepare("SELECT revoked FROM oauth_refresh_tokens WHERE id = 'rt1'").first('revoked'), 1);
  assert.equal(await db.prepare("SELECT COUNT(*) AS c FROM ecosystem_apps WHERE id = 'gothwad-store'").first('c'), 0);
});

test('app chooser catalog points Store users to Kiwi Store', () => {
  assert.match(appCatalog, /id: 'kiwi-store'/);
  assert.match(appCatalog, /name: 'Kiwi Store'/);
  assert.match(appCatalog, /url: 'https:\/\/kiwistore\.gothwadtech\.com'/);
  assert.doesNotMatch(appCatalog, /gothwad-store|Gothwad Store|https:\/\/store\.gothwadtech\.com/);
});

test('session cookies retain a root-domain scope across all Gothwad subdomains', () => {
  for (const host of [
    'accounts.gothwadtech.com',
    'api.gothwadtech.com',
    'mail.gothwadtech.com',
    'kiwistore.gothwadtech.com',
    'kiwiconsole.gothwadtech.com',
    'kiwiadmin.gothwadtech.com',
    'kiwiapp.gothwadtech.com',
  ]) {
    assert.equal(cookieDomain(new Request(`https://${host}/`), env), '.gothwadtech.com', host);
  }
  assert.equal(cookieDomain(new Request('https://unrelated.example/'), env), null);
});

test('CORS allows Gothwad subdomains without host-specific configuration and rejects lookalikes', () => {
  for (const origin of [
    'https://mail.gothwadtech.com',
    'https://kiwistore.gothwadtech.com',
    'https://kiwiconsole.gothwadtech.com',
    'https://kiwiadmin.gothwadtech.com',
    'https://kiwiapp.gothwadtech.com',
  ]) {
    const headers = buildCorsHeaders(
      new Request('https://api.gothwadtech.com/oauth/userinfo', { headers: { Origin: origin } }),
      env,
    );
    assert.equal(headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(headers.get('Access-Control-Allow-Credentials'), 'true');
  }
  const rejected = buildCorsHeaders(
    new Request('https://api.gothwadtech.com/oauth/userinfo', {
      headers: { Origin: 'https://gothwadtech.com.attacker.example' },
    }),
    env,
  );
  assert.equal(rejected.has('Access-Control-Allow-Origin'), false);
});
