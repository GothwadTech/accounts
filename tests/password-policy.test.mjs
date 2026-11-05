/** Password acceptance is length-based; strength guidance never gates authentication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, verifyPassword } from '../cloudflare-worker/src/crypto.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

const origin = 'https://accounts.gothwadtech.com';

test('signup and sign-in accept exactly eight repeated letters or digits without composition rules', async () => {
  for (const password of ['aaaaaaaa', '12345678']) {
    const env = makeEnv();
    const owner = await seedAccount(env, { username: 'lengthpolicy', firstName: 'Length', lastName: 'Policy', password });
    const login = new BrowserJar();
    const response = await login.fetch(env, '/api/auth/signin', { method: 'POST', origin,
      body: { identifier: 'lengthpolicy', password } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.id, owner.data.user.id);
    env.DB.close();
  }
});

test('change and reset accept weak eight-character passwords but reject shorter or oversized values', async () => {
  const env = makeEnv();
  const owner = await seedAccount(env, { username: 'lengthpolicy', firstName: 'Length', lastName: 'Policy', password: 'aaaaaaaa' });
  const userId = owner.data.user.id;
  const post = (path, body) => owner.jar.fetch(env, '/api/auth/' + path, { method: 'POST', origin, body });
  for (const password of ['1234567', 'a'.repeat(129)]) {
    assert.equal((await post('change-password', { current_password: owner.password, new_password: password })).status, 400);
    assert.equal((await post('reset-password', { token: 'synthetic-policy-token', password })).status, 400);
    const signup = await new BrowserJar().fetch(env, '/api/auth/signup', { method: 'POST', origin,
      body: { username: 'shortpolicy', first_name: 'Length', last_name: 'Policy', recovery_email: 'synthetic@example.test', password } });
    assert.equal(signup.status, 400);
  }
  assert.equal((await post('change-password', { current_password: owner.password, new_password: '12345678' })).status, 200);
  const token = 'synthetic-policy-token';
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)')
    .bind(await sha256Hex(token), userId, new Date(Date.now() + 60_000).toISOString()).run();
  const reset = await new BrowserJar().fetch(env, '/api/auth/reset-password', { method: 'POST', origin,
    body: { token, password: 'bbbbbbbb' } });
  assert.equal(reset.status, 200);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
  assert.equal(await verifyPassword('bbbbbbbb', row.password_hash), true);
  env.DB.close();
});
