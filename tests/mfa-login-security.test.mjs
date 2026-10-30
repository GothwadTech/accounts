import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserJar, seedAccount } from './helpers/multi-account-harness.mjs';
import { mfaFixture, enroll, startLogin, mfaPost, mfaCode } from './helpers/mfa-harness.mjs';
import { issueSessionAccessToken, randomToken, sha256Hex } from '../cloudflare-worker/src/crypto.ts';

async function verify(login, env, code) {
  return mfaPost(login.jar, env, 'verify', { challenge: login.challenge, code });
}

test('password-only sign-in issues no session or cookies; authenticator proof completes the account session', async () => {
  const { env, owner } = await mfaFixture();
  const { setup } = await enroll(env, owner);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n;
  const login = await startLogin(env, owner);
  assert.equal(login.response.headers.getSetCookie().length, 0);
  assert.equal(login.jar.cookies.size, 0);
  assert.equal((await login.jar.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, before);
  const response = await verify(login, env, mfaCode(setup.secret, 30_000));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.two_factor_enabled, true);
  assert.equal(data.access_token, undefined);
  assert.equal(data.refresh_token, undefined);
  assert.ok(response.headers.getSetCookie().length);
  assert.equal((await login.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await verify(login, env, mfaCode(setup.secret, 30_000))).status, 401);
});

test('consumed authenticator codes cannot be replayed against another challenge', async () => {
  const { env, owner } = await mfaFixture();
  const { setup } = await enroll(env, owner);
  const code = mfaCode(setup.secret, 30_000);
  assert.equal((await verify(await startLogin(env, owner), env, code)).status, 200);
  assert.equal((await verify(await startLogin(env, owner), env, code)).status, 401);
});

test('concurrent MFA completion has one session winner and consumes one backup code', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const login = await startLogin(env, owner);
  const attempts = await Promise.all(Array.from({ length: 5 }, () => verify(login, env, codes[0])));
  assert.equal(attempts.filter(r => r.status === 200).length, 1);
  assert.equal(attempts.filter(r => r.status === 401).length, 4);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 2);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes WHERE used_by IS NOT NULL').first()).n, 1);
});

test('backup codes are single-use across challenges and never appear in status or database plaintext', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  assert.equal((await verify(await startLogin(env, owner), env, codes[0])).status, 200);
  assert.equal((await verify(await startLogin(env, owner), env, codes[0])).status, 401);
  const response = await owner.jar.fetch(env, '/api/auth/mfa/status');
  const text = await response.text();
  assert.equal(JSON.parse(text).recovery_codes_remaining, 9);
  assert.equal(codes.some(c => text.includes(c)), false);
  const rows = JSON.stringify((await env.DB.prepare('SELECT * FROM auth_mfa_recovery_codes').all()).results);
  assert.equal(codes.some(c => rows.includes(c)), false);
});

test('expired, superseded, password-invalidated, and exhausted challenges fail without cookies', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const old = await startLogin(env, owner);
  const newer = await startLogin(env, owner);
  assert.equal((await verify(old, env, codes[0])).status, 401);
  await env.DB.prepare('UPDATE auth_mfa_challenges SET expires_at = ?').bind(new Date(0).toISOString()).run();
  assert.equal((await verify(newer, env, codes[0])).status, 401);
  const wrong = await startLogin(env, owner);
  for (let i = 0; i < 5; i++) assert.equal((await verify(wrong, env, 'invalid-code')).status, 401);
  assert.equal((await verify(wrong, env, codes[0])).status, 401);
  const stale = await startLogin(env, owner);
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind('changed-password-version', owner.data.user.id).run();
  const failed = await verify(stale, env, codes[0]);
  assert.equal(failed.status, 401);
  assert.equal(failed.headers.getSetCookie().length, 0);
});

test('per-account attempt budgets survive new challenges and IP rotation', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  await env.DB.prepare('UPDATE auth_mfa_attempts SET attempts = 10').run();
  const login = await startLogin(env, owner);
  const blocked = await mfaPost(login.jar, env, 'verify', { challenge: login.challenge, code: codes[0] });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '300');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes WHERE used_by IS NOT NULL').first()).n, 0);
});

test('a storage failure rolls back proof consumption, challenge use, and session creation for safe retry', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const login = await startLogin(env, owner);
  const original = env.DB.batch.bind(env.DB);
  env.DB.batch = statements => original([...statements, env.DB.prepare('INSERT INTO missing_mfa_table VALUES (1)')]);
  const failed = await verify(login, env, codes[0]);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.getSetCookie().length, 0);
  env.DB.batch = original;
  assert.equal((await env.DB.prepare('SELECT used_by FROM auth_mfa_challenges').first()).used_by, null);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes WHERE used_by IS NOT NULL').first()).n, 0);
  assert.equal((await verify(login, env, codes[0])).status, 200);
});

test('unassured sessions and refresh tokens cannot bypass MFA, including sid-less legacy JWTs', async () => {
  const { env, owner } = await mfaFixture();
  await enroll(env, owner);
  const userId = owner.data.user.id;
  const sid = crypto.randomUUID();
  const refresh = randomToken();
  await env.DB.prepare('INSERT INTO user_sessions (id, user_id) VALUES (?, ?)').bind(sid, userId).run();
  await env.DB.prepare('INSERT INTO auth_refresh_tokens (token_hash, user_id, session_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(refresh), userId, sid, new Date(Date.now() + 60_000).toISOString()).run();
  const forged = new BrowserJar();
  const token = await issueSessionAccessToken(env, { userId, username: 'mfaowner', sessionId: sid });
  assert.equal((await forged.fetch(env, '/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await forged.fetch(env, '/api/auth/refresh', { method: 'POST', body: { refresh_token: refresh, session_id: sid } })).status, 401);
  const sidless = await issueSessionAccessToken(env, { userId, username: 'mfaowner' });
  assert.equal((await forged.fetch(env, '/api/auth/me', { headers: { Authorization: `Bearer ${sidless}` } })).status, 401);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
});

test('MFA sign-in preserves add-account slots and cannot authenticate a different account with a code', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const other = await seedAccount(env, { username: 'differentacct', firstName: 'Different', lastName: 'Account' });
  const challenged = await other.jar.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST', body: { identifier: 'mfaowner', password: owner.password, add: true },
  });
  assert.equal(challenged.status, 202);
  const { challenge } = await challenged.json();
  const verified = await mfaPost(other.jar, env, 'verify', { challenge, code: codes[0], user_id: other.data.user.id });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).user.username, 'mfaowner');
  const accounts = await (await other.jar.fetch(env, '/api/auth/accounts')).json();
  assert.deepEqual(accounts.accounts.map(a => a.username), ['differentacct', 'mfaowner']);
});
