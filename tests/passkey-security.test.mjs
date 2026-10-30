import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
import { authenticator } from './helpers/passkey-authenticator.mjs';
import { enroll, TEST_MFA_KEY } from './helpers/mfa-harness.mjs';
import { passkeyConfig } from '../cloudflare-worker/src/passkey-core.ts';
const origin = 'https://accounts.gothwadtech.com';
const post = (jar, env, route, body, from = origin) => jar.fetch(env, `/api/auth/passkeys/${route}`, { method: 'POST', origin: from, body });
async function fixture() {
  const env = makeEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY });
  const owner = await seedAccount(env, { username: 'passkeyowner', firstName: 'Passkey', lastName: 'Owner' });
  const key = authenticator();
  return { env, owner, key };
}
async function prepare(f) {
  const result = await post(f.owner.jar, f.env, 'register/options', { current_password: f.owner.password });
  assert.equal(result.status, 200, await result.clone().text());
  return result.json();
}
async function register(f) {
  const setup = await prepare(f);
  const response = await post(f.owner.jar, f.env, 'register/verify', {
    challenge: setup.challenge, response: f.key.response(setup.options, { register: true, counter: 0 }), name: 'Security key',
  });
  assert.equal(response.status, 200, await response.clone().text());
  return setup;
}
async function login(f, tweaks = {}) {
  const jar = new BrowserJar();
  const prepared = await post(jar, f.env, 'login/options', { identifier: 'passkeyowner' });
  assert.equal(prepared.status, 200);
  const data = await prepared.json();
  const body = { challenge: data.challenge, response: f.key.response(data.options, tweaks) };
  return { jar, body, result: await post(jar, f.env, 'login/verify', body) };
}

test('passkeys: verified ES256 registration, passwordless login, one-use proof, and no secrets in list', async () => {
  const f = await fixture();
  try {
    await register(f);
    const listing = await f.owner.jar.fetch(f.env, '/api/auth/passkeys/list', { origin });
    const listed = await listing.json();
    assert.equal(listed.passkeys[0].name, 'Security key');
    assert.equal(listed.passkeys[0].public_key, undefined);
    const signed = await login(f);
    assert.equal(signed.result.status, 200, await signed.result.clone().text());
    assert.ok(signed.result.headers.getSetCookie().length);
    assert.equal((await post(signed.jar, f.env, 'login/verify', signed.body)).status, 401);
  } finally { f.env.DB.close(); }
});
test('passkeys: reject missing UV, wrong origin, cross-origin iframe, wrong RP and user handle', async () => {
  const f = await fixture();
  try {
    await register(f);
    for (const change of [{ uv: false }, { origin: 'https://mail.gothwadtech.com' }, { crossOrigin: true },
      { rpID: 'gothwadtech.com' }]) {
      const signed = await login(f, change);
      assert.equal(signed.result.status, 401);
      // A fresh test bucket, not a relaxation of the production attempt cap.
      await f.env.DB.prepare('DELETE FROM auth_mfa_attempts').run();
    }
    assert.equal((await login(f, { userHandle: 'aW1wb3N0b3I' })).result.status, 401);
  } finally { f.env.DB.close(); }
});
test('passkeys: identity-host RP only and identity-origin-only enrollment', async () => {
  const f = await fixture();
  try {
    assert.throws(() => passkeyConfig({ ...f.env, WEBAUTHN_RP_ID: 'gothwadtech.com' }));
    assert.equal((await post(f.owner.jar, f.env, 'register/options', { current_password: f.owner.password }, 'https://mail.gothwadtech.com')).status, 403);
    assert.equal((await post(f.owner.jar, f.env, 'register/options', { current_password: 'incorrect' })).status, 400);
    const setup = await prepare(f);
    const response = f.key.response(setup.options, { register: true });
    response.response.clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: setup.options.challenge,
      origin, crossOrigin: true })).toString('base64url');
    assert.equal((await post(f.owner.jar, f.env, 'register/verify', { challenge: setup.challenge, response })).status, 400);
  } finally { f.env.DB.close(); }
});
test('passkeys: enrollment expires and cannot move between sessions', async () => {
  const f = await fixture();
  try {
    const setup = await prepare(f);
    const other = new BrowserJar();
    await other.fetch(f.env, '/api/auth/signin', { method: 'POST', origin,
      body: { identifier: 'passkeyowner', password: f.owner.password } });
    const body = { challenge: setup.challenge, response: f.key.response(setup.options, { register: true }) };
    assert.equal((await post(other, f.env, 'register/verify', body)).status, 400);
    await f.env.DB.prepare("UPDATE auth_passkey_challenges SET expires_at = '2000-01-01'").run();
    assert.equal((await post(f.owner.jar, f.env, 'register/verify', body)).status, 400);
  } finally { f.env.DB.close(); }
});
test('passkeys: deletion and password change invalidate pending assertions', async () => {
  const f = await fixture();
  try {
    await register(f);
    const prepared = await (await post(f.owner.jar, f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    const row = await f.env.DB.prepare('SELECT id FROM auth_passkeys').first();
    assert.equal((await post(f.owner.jar, f.env, 'delete', { id: row.id, current_password: f.owner.password })).status, 200);
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', { challenge: prepared.challenge,
      response: f.key.response(prepared.options) })).status, 401);
    await register(f);
    const next = await (await post(f.owner.jar, f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    await f.env.DB.prepare("UPDATE users SET password_hash = 'changed'").run();
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', { challenge: next.challenge,
      response: f.key.response(next.options) })).status, 401);
  } finally { f.env.DB.close(); }
});
test('passkeys: UV assertion satisfies enabled MFA and factor changes invalidate pending login', async () => {
  const f = await fixture();
  try {
    await register(f);
    await enroll(f.env, f.owner);
    const signed = await login(f);
    assert.equal(signed.result.status, 200, await signed.result.clone().text());
    const assurance = await f.env.DB.prepare('SELECT * FROM auth_mfa_sessions WHERE session_id IN (SELECT id FROM user_sessions)').all();
    assert.ok(assurance.results.length >= 2);
    const pending = await (await post(new BrowserJar(), f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    await f.env.DB.prepare("UPDATE auth_mfa_factors SET version = 'changed'").run();
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', { challenge: pending.challenge,
      response: f.key.response(pending.options, { counter: 2 }) })).status, 401);
  } finally { f.env.DB.close(); }
});
test('passkeys: concurrent replay has one winner, including synced zero-counter keys', async () => {
  const f = await fixture();
  try {
    await register(f);
    const prepared = await (await post(new BrowserJar(), f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    const body = { challenge: prepared.challenge, response: f.key.response(prepared.options, { counter: 0 }) };
    const results = await Promise.all([1, 2].map(() => post(new BrowserJar(), f.env, 'login/verify', body)));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  } finally { f.env.DB.close(); }
});

test('passkeys: RSA security-key credentials are verified using the advertised algorithm', async () => {
  const f = await fixture();
  f.key = authenticator({ algorithm: 'RS256' });
  try {
    await register(f);
    assert.equal((await login(f)).result.status, 200);
  } finally { f.env.DB.close(); }
});
test('passkeys: nonzero counter rollback is rejected; a challenge locks after three invalid attempts', async () => {
  const f = await fixture();
  try {
    await register(f);
    assert.equal((await login(f, { counter: 4 })).result.status, 200);
    assert.equal((await login(f, { counter: 3 })).result.status, 401);
    const pending = await (await post(new BrowserJar(), f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    for (let i = 0; i < 3; i++) {
      assert.equal((await post(new BrowserJar(), f.env, 'login/verify', { challenge: pending.challenge,
        response: f.key.response(pending.options, { counter: 5, uv: false }) })).status, 401);
    }
    await f.env.DB.prepare('DELETE FROM auth_mfa_attempts').run();
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', { challenge: pending.challenge,
      response: f.key.response(pending.options, { counter: 5 }) })).status, 401);
  } finally { f.env.DB.close(); }
});
test('passkeys: enabling MFA invalidates password-only enrollment authorization and requires fresh proofs', async () => {
  const f = await fixture();
  try {
    const pending = await prepare(f);
    await enroll(f.env, f.owner);
    assert.equal((await post(f.owner.jar, f.env, 'register/verify', { challenge: pending.challenge,
      response: f.key.response(pending.options, { register: true }) })).status, 400);
    assert.equal((await post(f.owner.jar, f.env, 'register/options', { current_password: f.owner.password })).status, 400);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM auth_passkeys').first()).n, 0);
  } finally { f.env.DB.close(); }
});
test('passkeys: persistence failure rolls back the assertion and does not issue a session', async () => {
  const f = await fixture();
  try {
    await register(f);
    const pending = await (await post(new BrowserJar(), f.env, 'login/options', { identifier: 'passkeyowner' })).json();
    const body = { challenge: pending.challenge, response: f.key.response(pending.options) };
    const before = (await f.env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n;
    await f.env.DB.exec(`CREATE TRIGGER fail_session BEFORE INSERT ON user_sessions
      BEGIN SELECT RAISE(ABORT, 'synthetic session failure'); END;`);
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', body)).status, 503);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, before);
    assert.equal((await f.env.DB.prepare('SELECT counter FROM auth_passkeys').first()).counter, 0);
    await f.env.DB.exec('DROP TRIGGER fail_session');
    assert.equal((await post(new BrowserJar(), f.env, 'login/verify', body)).status, 200);
  } finally { f.env.DB.close(); }
});
