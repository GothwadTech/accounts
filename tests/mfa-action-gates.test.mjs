import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeActionMfa } from '../cloudflare-worker/src/mfa-proofs.ts';
import { mfaFixture, enroll, mfaPost } from './helpers/mfa-harness.mjs';

async function guardedUpdate(env, owner, gate) {
  return env.DB.prepare(`UPDATE profiles SET first_name = 'Unauthorized' WHERE id = ? AND (${gate.sql}) RETURNING id`)
    .bind(owner.data.user.id, ...gate.bindings).first();
}

test('a no-MFA authorization cannot mutate account state after concurrent MFA enrollment', async () => {
  const { env, owner } = await mfaFixture();
  const gate = await authorizeActionMfa(env.DB, env, owner.data.user.id, '');
  assert.ok(gate);
  await enroll(env, owner);
  assert.equal(await guardedUpdate(env, owner, gate), null);
});

test('a consumed proof cannot authorize an action after concurrent recovery-code replacement', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const gate = await authorizeActionMfa(env.DB, env, owner.data.user.id, codes[0]);
  assert.ok(gate);
  assert.equal((await mfaPost(owner.jar, env, 'recovery-codes', { current_password: owner.password, code: codes[1] })).status, 200);
  assert.equal(await guardedUpdate(env, owner, gate), null);
});
