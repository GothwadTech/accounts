import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserJar, seedAccount } from './helpers/multi-account-harness.mjs';
import { mfaFixture, enroll, startLogin, mfaPost, mfaCode } from './helpers/mfa-harness.mjs';
import { randomToken, sha256Hex } from '../cloudflare-worker/src/crypto.ts';

const profile = async (env, owner) => env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(owner.data.user.id).first();

test('enrollment fails closed without encryption configuration or the current password', async () => {
  const { env, owner } = await mfaFixture();
  assert.equal((await mfaPost(owner.jar, env, 'enroll', {})).status, 400);
  assert.equal((await mfaPost(owner.jar, env, 'enroll', { current_password: 'wrong-password' })).status, 400);
  delete env.MFA_ENCRYPTION_KEY;
  const status = await (await owner.jar.fetch(env, '/api/auth/mfa/status')).json();
  assert.equal(status.enrollment_available, false);
  assert.equal(status.enabled, false);
  assert.equal((await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password })).status, 503);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_factors').first()).n, 0);
});

test('pending setup is encrypted, expires, and does not enable MFA or reveal its key through status', async () => {
  const { env, owner } = await mfaFixture();
  const response = await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const setup = await response.json();
  const row = await env.DB.prepare('SELECT * FROM auth_mfa_factors').first();
  assert.equal(JSON.stringify(row).includes(setup.secret), false);
  assert.equal(row.enabled, 0);
  const statusText = await (await owner.jar.fetch(env, '/api/auth/mfa/status')).text();
  assert.equal(statusText.includes(setup.secret), false);
  assert.equal((await profile(env, owner)).two_factor_enabled, 0);
  await env.DB.prepare('UPDATE auth_mfa_factors SET pending_expires_at = ?').bind(new Date(0).toISOString()).run();
  assert.equal((await mfaPost(owner.jar, env, 'confirm', { current_password: owner.password,
    enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret) })).status, 400);
});

test('setup confirmation is bound to the originating account, session, and enrollment version', async () => {
  const { env, owner } = await mfaFixture();
  const otherDevice = new BrowserJar();
  assert.equal((await otherDevice.fetch(env, '/api/auth/signin', { method: 'POST',
    body: { identifier: 'mfaowner', password: owner.password } })).status, 200);
  const setup = await (await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password })).json();
  const body = { current_password: owner.password, enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret) };
  assert.equal((await mfaPost(otherDevice, env, 'confirm', body)).status, 400);
  const different = await seedAccount(env, { username: 'setupdifferent', firstName: 'Different', lastName: 'Setup' });
  assert.equal((await mfaPost(different.jar, env, 'confirm', { ...body, current_password: different.password })).status, 400);
  assert.equal((await mfaPost(owner.jar, env, 'confirm', { ...body, enrollment_id: 'wrong-version' })).status, 400);
  assert.equal((await mfaPost(owner.jar, env, 'confirm', body)).status, 200);
  assert.equal((await otherDevice.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await different.jar.fetch(env, '/api/auth/me')).status, 200);
});

test('concurrent enrollment activation has one winner and creates exactly ten recovery codes', async () => {
  const { env, owner } = await mfaFixture();
  const setup = await (await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password })).json();
  const responses = await Promise.all(Array.from({ length: 3 }, () => mfaPost(owner.jar, env, 'confirm', {
    current_password: owner.password, enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret),
  })));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes').first()).n, 10);
  assert.equal((await profile(env, owner)).two_factor_enabled, 1);
});

test('activation transaction failure rolls back factor, codes, and session revocations', async () => {
  const { env, owner } = await mfaFixture();
  const setup = await (await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password })).json();
  const original = env.DB.batch.bind(env.DB);
  env.DB.batch = statements => original([...statements, env.DB.prepare('INSERT INTO missing_activation_table VALUES (1)')]);
  const body = { current_password: owner.password, enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret) };
  assert.equal((await mfaPost(owner.jar, env, 'confirm', body)).status, 503);
  env.DB.batch = original;
  assert.equal((await profile(env, owner)).two_factor_enabled, 0);
  assert.equal((await env.DB.prepare('SELECT enabled FROM auth_mfa_factors').first()).enabled, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes').first()).n, 0);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await mfaPost(owner.jar, env, 'confirm', body)).status, 200);
});

test('recovery-code regeneration requires both factors and invalidates the complete previous set', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  assert.equal((await mfaPost(owner.jar, env, 'recovery-codes', { current_password: owner.password })).status, 400);
  const generated = await mfaPost(owner.jar, env, 'recovery-codes', { current_password: owner.password, code: codes[0] });
  assert.equal(generated.status, 200);
  const replacement = (await generated.json()).recovery_codes;
  assert.equal(replacement.length, 10);
  assert.equal(replacement.some(c => codes.includes(c)), false);
  const login = await startLogin(env, owner);
  assert.equal((await mfaPost(login.jar, env, 'verify', { challenge: login.challenge, code: codes[1] })).status, 401);
  assert.equal((await mfaPost(login.jar, env, 'verify', { challenge: login.challenge, code: replacement[0] })).status, 200);
});

test('disabling MFA requires password plus a fresh proof and cannot be done by changing a profile flag', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  const other = await startLogin(env, owner);
  assert.equal((await mfaPost(other.jar, env, 'verify', { challenge: other.challenge, code: codes[0] })).status, 200);
  await owner.jar.fetch(env, '/api/auth/update-profile', { method: 'POST', body: { two_factor_enabled: false } });
  assert.equal((await profile(env, owner)).two_factor_enabled, 1);
  assert.equal((await mfaPost(owner.jar, env, 'disable', { current_password: owner.password })).status, 400);
  assert.equal((await mfaPost(owner.jar, env, 'disable', { current_password: 'wrong-password', code: codes[1] })).status, 400);
  assert.equal((await mfaPost(owner.jar, env, 'disable', { current_password: owner.password, code: codes[1] })).status, 200);
  assert.equal((await profile(env, owner)).two_factor_enabled, 0);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await other.jar.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await env.DB.prepare('SELECT secret_ciphertext FROM auth_mfa_factors').first()).secret_ciphertext, '');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_recovery_codes').first()).n, 0);
});

test('enabled factor survives revocation of its original enrollment session', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(owner.data.user.id).run();
  assert.equal((await env.DB.prepare('SELECT enabled FROM auth_mfa_factors').first()).enabled, 1);
  const login = await startLogin(env, owner);
  assert.equal((await mfaPost(login.jar, env, 'verify', { challenge: login.challenge, code: codes[0] })).status, 200);
});

test('password, phone, recovery, and deletion actions require the second factor after password verification', async () => {
  const { env, owner } = await mfaFixture();
  const { codes } = await enroll(env, owner);
  for (const [route, body] of [
    ['/auth/change-password', { current_password: owner.password, new_password: 'ChangedPassword!456' }],
    ['/auth/update-profile', { current_password: owner.password, phone_number: '+919876543210' }],
    ['/auth/recovery-email/request', { current_password: owner.password, recovery_email: 'new@example.test' }],
    ['/auth/delete-account', { password: owner.password }],
  ]) {
    const response = await owner.jar.fetch(env, `/api${route}`, { method: 'POST', body });
    assert.equal(response.status, 400, route);
    assert.equal((await response.json()).error, 'mfa_required', route);
  }
  assert.equal((await owner.jar.fetch(env, '/api/auth/update-profile', { method: 'POST',
    body: { current_password: owner.password, phone_number: '+919876543210', mfa_code: codes[0] } })).status, 200);
});

test('password recovery changes the password but does not disable MFA or issue a bypass session', async () => {
  const { env, owner } = await mfaFixture();
  await enroll(env, owner);
  const token = randomToken();
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), owner.data.user.id, new Date(Date.now() + 60_000).toISOString()).run();
  const anonymous = new BrowserJar();
  assert.equal((await anonymous.fetch(env, '/api/auth/reset-password', { method: 'POST',
    body: { token, password: 'RecoveredPassword!456' } })).status, 200);
  const response = await anonymous.fetch(env, '/api/auth/signin', { method: 'POST',
    body: { identifier: 'mfaowner', password: 'RecoveredPassword!456' } });
  assert.equal(response.status, 202);
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal((await profile(env, owner)).two_factor_enabled, 1);
});
