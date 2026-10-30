/** Configuration + live SQLite execution tests for D1 Store OAuth SQL generator. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLocalD1 } from './local-d1.mjs';
import { generateStoreOAuthSql } from './generate-store-oauth-sql.mjs';

const config = readFileSync(new URL('../cloudflare-worker/wrangler.toml', import.meta.url), 'utf8');
const coreSchema = readFileSync(new URL('../sql/01_core_schema.sql', import.meta.url), 'utf8');

test('Store D1 setup executes cleanly against real SQLite twice and registers Android + web callbacks without touching secrets', async () => {
  const db = createLocalD1(':memory:');
  await db.exec(coreSchema);
  await db.prepare("UPDATE ecosystem_apps SET secret_hash = 'keep-my-secret' WHERE id = 'kiwi-store'").run();

  const sql = generateStoreOAuthSql('example.com');
  await db.exec(sql);
  await db.exec(sql); // Re-run to verify 100% idempotency!

  const row = await db.prepare("SELECT redirect_uris, secret_hash FROM ecosystem_apps WHERE id = 'kiwi-store'").first();
  const uris = JSON.parse(row.redirect_uris);

  for (const expected of [
    'gothwadstore://oauth/callback',
    'kiwistore://oauth/callback',
    'https://kiwistore.example.com/auth/callback',
    'https://kiwiconsole.example.com/auth/callback',
    'https://kiwiadmin.example.com/auth/callback',
  ]) {
    assert.ok(uris.includes(expected), `missing ${expected}`);
  }
  assert.equal(new Set(uris).size, uris.length, 'must not duplicate callbacks on re-run');
  assert.equal(row.secret_hash, 'keep-my-secret', 'must never clear existing secret_hash');
});

test('SQL generator rejects unsafe domains instead of interpolating them', () => {
  for (const domain of [
    undefined,
    '',
    'localhost',
    '*.example.com',
    'https://example.com',
    'example.com/path',
    'example.com:443',
    "example.com'; DROP TABLE profiles;--",
    'EXAMPLE.COM',
    '-bad.example.com',
    'bad-.example.com',
    'a'.repeat(64) + '.com',
  ]) {
    assert.throws(() => generateStoreOAuthSql(domain), /APP_DOMAIN must/);
  }
});

test('CLI obtains its default domain from wrangler vars, not another production constant', () => {
  const script = fileURLToPath(new URL('./generate-store-oauth-sql.mjs', import.meta.url));
  const domain = config.match(/^APP_DOMAIN\s*=\s*"([^"]+)"/m)[1];
  const sql = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(sql, generateStoreOAuthSql(domain));
});

test('production config binds D1 DB, contains zero Supabase vars, and disables DEV_MODE', () => {
  assert.match(config, /^binding\s*=\s*"DB"/m);
  assert.match(config, /^DEV_MODE\s*=\s*"false"/m);
  assert.doesNotMatch(config, /SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});


test('production sender retains the owner-selected noreply sending subdomain', () => {
  const domain = config.match(/^APP_DOMAIN\s*=\s*"([^"]+)"/m)[1];
  const sender = config.match(/^RESEND_FROM\s*=\s*"([^"]+)"/m)[1];
  assert.equal(sender, `Gothwad Accounts <security@noreply.${domain}>`);
  assert.doesNotMatch(sender, /onboarding@resend\.dev/);
});
