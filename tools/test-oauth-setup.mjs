/** Configuration-only tests: generated SQL is printed, never applied here. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateStoreOAuthSql } from './generate-store-oauth-sql.mjs';

const config = readFileSync(new URL('../cloudflare-worker/wrangler.toml', import.meta.url), 'utf8');

test('Store setup combines the native migration and domain-configured web registration', () => {
  const sql = generateStoreOAuthSql('example.com');
  assert.ok(sql.includes("app_domain text := 'example.com'"));
  assert.ok(sql.includes("array_append(redirect_uris, 'gothwadstore://oauth/callback')"));
  for (const host of ['store', 'console', 'storeadmin', 'storeapp']) {
    assert.ok(sql.includes(`'https://${host}.' || app_domain || '/auth/callback'`));
  }
  assert.ok(sql.includes('BEGIN;') && sql.endsWith('COMMIT;\n'));
  assert.ok(sql.includes('secret_hash IS NOT NULL'));
  assert.equal(sql.includes('SET secret_hash'), false);
});

test('SQL generator rejects unsafe domains instead of interpolating them', () => {
  for (const domain of [undefined, '', 'localhost', '*.example.com', 'https://example.com',
    'example.com/path', 'example.com:443', "example.com'; DROP TABLE profiles;--", 'EXAMPLE.COM',
    '-bad.example.com', 'bad-.example.com', 'a'.repeat(64) + '.com']) {
    assert.throws(() => generateStoreOAuthSql(domain), /APP_DOMAIN must/);
  }
});

test('CLI obtains its default domain from wrangler vars, not another production constant', () => {
  const script = fileURLToPath(new URL('./generate-store-oauth-sql.mjs', import.meta.url));
  const domain = config.match(/^APP_DOMAIN\s*=\s*"([^"]+)"/m)[1];
  const sql = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(sql, generateStoreOAuthSql(domain));
});

test('production config disables DEV_MODE while local overrides remain possible', () => {
  assert.match(config, /^DEV_MODE\s*=\s*"false"/m);
});
