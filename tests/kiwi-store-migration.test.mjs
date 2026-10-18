import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCorsHeaders, cookieDomain } from '../cloudflare-worker/src/index.ts';

const migration = await readFile(new URL('../sql/04_kiwi_store_oauth_migration.sql', import.meta.url), 'utf8');
const appCatalog = await readFile(new URL('../web/js/gothwad-apps.js', import.meta.url), 'utf8');

const env = { APP_DOMAIN: 'gothwadtech.com' };

test('Kiwi Store migration registers exactly the requested production and local callbacks', () => {
  const block = migration.match(/ARRAY\[([\s\S]*?)\]::TEXT\[\]/)?.[1];
  assert.ok(block, 'migration must explicitly set redirect_uris');
  const actual = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(actual, [
    'https://kiwistore.gothwadtech.com/auth/callback',
    'https://kiwiconsole.gothwadtech.com/auth/callback',
    'https://kiwiadmin.gothwadtech.com/auth/callback',
    'http://localhost:3000/auth/callback',
  ]);
  assert.equal(actual.includes('https://kiwiapp.gothwadtech.com/auth/callback'), false);
});

test('migration preserves grants and invalidates legacy OAuth credentials only', () => {
  assert.match(migration, /INSERT INTO public\.app_authorizations/);
  assert.match(migration, /DELETE FROM public\.oauth_auth_codes WHERE client_id = 'gothwad-store'/);
  assert.match(migration, /UPDATE public\.oauth_refresh_tokens[\s\S]*?client_id = 'gothwad-store'/);
  assert.match(migration, /revoked = TRUE/);
  assert.match(migration, /\('kiwi-store',[\s\S]*?, 'kiwi-store'\)/);
});

test('app chooser catalog now points Store users to Kiwi Store', () => {
  assert.match(appCatalog, /id: 'kiwi-store'/);
  assert.match(appCatalog, /name: 'Kiwi Store'/);
  assert.match(appCatalog, /url: 'https:\/\/kiwistore\.gothwadtech\.com'/);
  assert.doesNotMatch(appCatalog, /gothwad-store|Gothwad Store|https:\/\/store\.gothwadtech\.com/);
});

test('session cookies retain a root-domain scope across the renamed subdomains', () => {
  for (const host of [
    'accounts.gothwadtech.com', 'api.gothwadtech.com',
    'kiwistore.gothwadtech.com', 'kiwiconsole.gothwadtech.com',
    'kiwiadmin.gothwadtech.com', 'kiwiapp.gothwadtech.com',
  ]) {
    assert.equal(cookieDomain(new Request(`https://${host}/`), env), '.gothwadtech.com', host);
  }
  assert.equal(cookieDomain(new Request('https://unrelated.example/'), env), null);
});

test('CORS allows new Gothwad subdomains without host-specific configuration', () => {
  for (const origin of [
    'https://kiwistore.gothwadtech.com', 'https://kiwiconsole.gothwadtech.com',
    'https://kiwiadmin.gothwadtech.com', 'https://kiwiapp.gothwadtech.com',
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
