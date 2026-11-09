/** Local preview fixtures must never become production authentication behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensurePreviewAccount, previewConfig } from '../tools/preview-account.mjs';
import { createLocalD1 } from '../tools/local-d1.mjs';
import { verifyPassword } from '../cloudflare-worker/src/crypto.ts';

const settings = { DEV_MODE: 'true', LOCAL_PREVIEW_USERNAME: 'previewuser', LOCAL_PREVIEW_PASSWORD: 'SyntheticPreview123' };
function directory(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'accounts-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('preview setup refuses production/CI/missing configuration before opening a database', async t => {
  const root = directory(t);
  for (const override of [{ NODE_ENV: 'production' }, { DEV_MODE: 'false' }, { CI: 'true' },
    { CF_PAGES: '1' }, { WORKERS_CI: '1' }, { LOCAL_PREVIEW_PASSWORD: '' }, { LOCAL_PREVIEW_USERNAME: '' }]) {
    await assert.rejects(ensurePreviewAccount(root, { ...settings, ...override }));
    assert.equal(existsSync(path.join(root, '.local-d1.sqlite')), false);
  }
  assert.throws(() => previewConfig({}));
  await assert.rejects(ensurePreviewAccount(root, { ...settings, LOCAL_D1_PATH: 'remote.sqlite' }));
  assert.equal(existsSync(path.join(root, '.local-d1.sqlite')), false);
});

test('opt-in preview creates a hashed local account once and preserves existing profile/security state', async t => {
  const root = directory(t), first = await ensurePreviewAccount(root, settings);
  assert.equal(first.created, true);
  const db = createLocalD1(first.databasePath); t.after(() => db.close());
  const user = await db.prepare('SELECT id, password_hash FROM users WHERE username = ?').bind(settings.LOCAL_PREVIEW_USERNAME).first();
  assert.notEqual(user.password_hash, settings.LOCAL_PREVIEW_PASSWORD);
  assert.equal(await verifyPassword(settings.LOCAL_PREVIEW_PASSWORD, user.password_hash), true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens').first()).n, 0);
  await db.prepare("UPDATE profiles SET first_name = 'Edited locally' WHERE id = ?").bind(user.id).run();
  assert.equal((await ensurePreviewAccount(root, settings)).created, false);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 1);
  assert.deepEqual(await db.prepare('SELECT id, password_hash FROM users').first(), user);
  assert.equal((await db.prepare('SELECT first_name FROM profiles').first()).first_name, 'Edited locally');
  await assert.rejects(ensurePreviewAccount(root, { ...settings, LOCAL_PREVIEW_PASSWORD: 'DifferentPreview123' }), /no reset was performed/);
  assert.deepEqual(await db.prepare('SELECT id, password_hash FROM users').first(), user);
  await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  assert.equal((await ensurePreviewAccount(root, settings)).created, true);
});

test('preview setup is opt-in tooling, absent from deployed Worker/frontend entrypoints', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['preview:local'], /tools\/preview-local\.mjs/);
  assert.doesNotMatch(pkg.scripts.start + pkg.scripts.dev, /preview-local|preview-account/);
  for (const file of ['cloudflare-worker/src/worker.ts', 'cloudflare-worker/src/index.ts', 'server.js']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /preview-account|preview-local|LOCAL_PREVIEW_PASSWORD/);
  }
});
