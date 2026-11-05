/** Restrict new identities without locking out historical usernames. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidNewUsername, isValidUsername } from '../cloudflare-worker/src/http.ts';
import { googleEnv, GoogleJar, mockGoogle, verifyGoogle, googlePost, onboarding } from './helpers/google-harness.mjs';

test('new usernames accept only 3–24 lowercase letters and numbers; legacy lookup remains compatible', async () => {
  for (const value of ['abc', 'user123', 'a'.repeat(24)]) assert.equal(isValidNewUsername(value), true);
  for (const value of ['a_b', 'a-b', 'a.b', 'ab', 'a'.repeat(25), 'MixedCase', 'has space']) assert.equal(isValidNewUsername(value), false);
  const env = googleEnv(), jar = new GoogleJar();
  const details = { first_name: 'Policy', last_name: 'Test', password: 'aaaaaaaa', recovery_email: 'policy@example.test' };
  for (const username of ['new_name', 'new-name', 'new.name']) {
    assert.equal((await googlePost(env, jar, 'signup', { ...details, username })).status, 400);
    const available = await (await jar.fetch(env, `/api/auth/check-username?username=${username}`)).json();
    assert.equal(available.valid, false);
  }
  const created = await googlePost(env, jar, 'signup', { ...details, username: 'policyuser' });
  assert.equal(created.status, 201);
  const id = (await created.json()).user.id;
  for (const username of ['old_name', 'old-name', 'old.name']) {
    assert.equal(isValidUsername(username), true);
    await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, id).run();
    await env.DB.prepare('UPDATE profiles SET username = ? WHERE id = ?').bind(username, id).run();
    const visitor = new GoogleJar();
    assert.equal((await googlePost(env, visitor, 'signin', { identifier: username, password: 'aaaaaaaa' })).status, 200);
  }
});

test('Google creation enforces the same username policy without consuming proof on invalid input', async t => {
  mockGoogle(t); const env = googleEnv(), jar = new GoogleJar(); await verifyGoogle(env, jar);
  for (const username of ['google_name', 'google-name', 'google.name']) {
    assert.equal((await googlePost(env, jar, 'google/finish', onboarding(username))).status, 400);
  }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 0);
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding('googlevalid'))).status, 200);
});
