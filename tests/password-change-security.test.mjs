import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, verifyPassword } from '../cloudflare-worker/src/crypto.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

async function fixture() {
  const env = makeEnv();
  const owner = await seedAccount(env, { username: 'passwordowner', firstName: 'Password', lastName: 'Owner' });
  const other = new BrowserJar();
  const response = await other.fetch(env, '/api/auth/signin', {
    method: 'POST', origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'passwordowner', password: owner.password },
  });
  assert.equal(response.status, 200);
  const otherData = { access_token: other.cookies.get('gothwad_at'), refresh_token: other.cookies.get('gothwad_rt'), session_id: other.cookies.get('gothwad_sid') };
  const unrelated = await seedAccount(env, { username: 'unrelateduser', firstName: 'Unrelated', lastName: 'User' });
  return { env, owner, other, otherData, unrelated };
}

async function change(env, jar, currentPassword) {
  return jar.fetch(env, '/api/auth/change-password', {
    method: 'POST', origin: 'https://accounts.gothwadtech.com',
    body: { current_password: currentPassword, new_password: 'NewStrongPassword!456' },
  });
}

test('password change revokes other devices immediately, preserves current/unrelated sessions, and invalidates old reset links', async () => {
  const { env, owner, other, otherData, unrelated } = await fixture();
  const ownerId = owner.data.user.id;
  const resetToken = 'pending-reset-token-before-password-change';
  await env.DB.prepare(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used)
    VALUES (?, ?, ?, 0)`).bind(await sha256Hex(resetToken), ownerId, new Date(Date.now() + 60_000).toISOString()).run();

  assert.equal((await change(env, owner.jar, 'wrong-password')).status, 400);
  assert.equal((await other.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await change(env, owner.jar, owner.password)).status, 200);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await other.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await unrelated.jar.fetch(env, '/api/auth/me')).status, 200);

  const replay = new BrowserJar();
  assert.equal((await replay.fetch(env, '/api/auth/refresh', {
    method: 'POST', body: { refresh_token: otherData.refresh_token, session_id: otherData.session_id },
  })).status, 401);
  assert.equal((await replay.fetch(env, '/api/auth/me', {
    headers: { Authorization: `Bearer ${otherData.access_token}` },
  })).status, 401);
  assert.equal((await replay.fetch(env, '/api/auth/reset-password', {
    method: 'POST', body: { token: resetToken, password: 'AnotherStrongPassword!123' },
  })).status, 400);

  const currentRefresh = await owner.jar.fetch(env, '/api/auth/refresh', { method: 'POST', body: {} });
  assert.equal(currentRefresh.status, 200);
  const login = new BrowserJar();
  assert.equal((await login.fetch(env, '/api/auth/signin', {
    method: 'POST', body: { identifier: 'passwordowner', password: owner.password },
  })).status, 401);
  assert.equal((await login.fetch(env, '/api/auth/signin', {
    method: 'POST', body: { identifier: 'passwordowner', password: 'NewStrongPassword!456' },
  })).status, 200);
});

test('password change remains atomic when a later revocation statement fails', async () => {
  const { env, owner, other } = await fixture();
  const originalBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = (statements) => originalBatch([
    ...statements,
    env.DB.prepare('INSERT INTO deliberately_missing_security_table VALUES (1)'),
  ]);
  const response = await change(env, owner.jar, owner.password);
  assert.equal(response.status, 500);
  env.DB.batch = originalBatch;
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(owner.data.user.id).first();
  assert.equal(await verifyPassword(owner.password, row.password_hash), true);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await other.fetch(env, '/api/auth/me')).status, 200);
});
