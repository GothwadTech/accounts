import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
import { randomToken, sha256Hex, verifyPassword } from '../cloudflare-worker/src/crypto.ts';

async function fixture() {
  const env = makeEnv();
  const owner = await seedAccount(env, { username: 'resetatomic', firstName: 'Reset', lastName: 'Atomic' });
  const token = randomToken();
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), owner.data.user.id, new Date(Date.now() + 60_000).toISOString()).run();
  return { env, owner, token };
}
const reset = (env, token) => new BrowserJar().fetch(env, '/api/auth/reset-password', {
  method: 'POST', origin: 'https://accounts.gothwadtech.com',
  body: { token, password: 'ReplacementPassword!456' },
});

test('password reset has one concurrent winner and invalidates all outstanding links and sessions', async () => {
  const { env, owner, token } = await fixture();
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('another-pending-reset-hash', owner.data.user.id, new Date(Date.now() + 60_000).toISOString()).run();
  const responses = await Promise.all(Array.from({ length: 8 }, () => reset(env, token)));
  assert.equal(responses.filter((r) => r.status === 200).length, 1);
  assert.equal(responses.filter((r) => r.status === 400).length, 7);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens WHERE used = 0').first()).n, 0);
});

test('password reset database failure rolls back password, token consumption, and revocations together', async () => {
  const { env, owner, token } = await fixture();
  const original = env.DB.batch.bind(env.DB);
  env.DB.batch = (statements) => original([...statements, env.DB.prepare('INSERT INTO missing_reset_table VALUES (1)')]);
  assert.equal((await reset(env, token)).status, 503);
  env.DB.batch = original;
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(owner.data.user.id).first();
  assert.equal(await verifyPassword(owner.password, user.password_hash), true);
  assert.equal((await env.DB.prepare('SELECT used FROM password_reset_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).first()).used, 0);
  assert.equal((await reset(env, token)).status, 200);
});
