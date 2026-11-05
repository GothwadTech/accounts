import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount } from './helpers/multi-account-harness.mjs';
import { TEST_MFA_KEY, mfaCode } from './helpers/mfa-harness.mjs';
import { googleEnv, GoogleJar, mockGoogle, googleAccount, verifyGoogle, beginGoogle, googlePost, reauth, sha256Hex } from './helpers/google-harness.mjs';

const addPassword = (env, jar) => googlePost(env, jar, 'add-password', { new_password: 'NewStrongPassword!456' });

test('Add password requires fresh linked Google proof, is single-use, changes has_password and enables native sign-in', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  assert.equal((await addPassword(env, owner.jar)).status, 400);
  assert.equal((await googlePost(env, owner.jar, 'change-password', { new_password: 'NewStrongPassword!456' })).status, 409);
  const other = await googleAccount(env);
  await reauth(env, owner.jar);
  const result = await addPassword(env, owner.jar); assert.equal(result.status, 200);
  assert.equal((await result.json()).user.has_password, true);
  assert.equal((await addPassword(env, owner.jar)).status, 409);
  assert.equal((await other.jar.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal((await googlePost(env, new GoogleJar(), 'signin', { identifier: 'googleowner', password: 'NewStrongPassword!456' })).status, 200);
  const returning = await googleAccount(env);
  assert.equal(returning.data.user.id, owner.data.user.id);
  assert.equal(returning.data.user.has_password, true);
});

test('Google reauthentication is bound to linked subject, session, credential snapshot and factor version', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  const wrong = await beginGoogle(env, owner.jar, { purpose: 'reauth' }, { sub: 'attacker-google-subject' });
  assert.match((await owner.jar.fetch(env, wrong.callback, { origin: null })).headers.get('Location'), /error=1/);
  assert.equal((await addPassword(env, owner.jar)).status, 400);
  await reauth(env, owner.jar);
  const other = await googleAccount(env);
  other.jar.cookies.set('gothwad_google_reauth', owner.jar.cookies.get('gothwad_google_reauth'));
  assert.equal((await addPassword(env, other.jar)).status, 400);
  const good = await owner.jar.fetch(env, '/api/auth/google/status?reauth=1');
  assert.equal((await good.json()).ready, true);
  await env.DB.prepare("UPDATE auth_google_tickets SET expires_at = '2000-01-01' WHERE purpose = 'reauth'").run();
  assert.equal((await addPassword(env, owner.jar)).status, 400);
  await reauth(env, owner.jar);
  await env.DB.prepare("UPDATE users SET password_hash = '!no-password:changed-security-state' WHERE id = ?").bind(owner.data.user.id).run();
  assert.equal((await addPassword(env, owner.jar)).status, 400);
});

test('revoked sessions cannot finish security reauthentication or link an identity', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  const flow = await beginGoogle(env, owner.jar, { purpose: 'reauth' });
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(owner.data.user.id).run();
  assert.match((await owner.jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  assert.equal((await addPassword(env, owner.jar)).status, 401);
});

test('existing native users can explicitly link Google only after password verification; same internal identity is retained', async t => {
  mockGoogle(t); const env = googleEnv();
  const native = await seedAccount(env, { username: 'nativeowner', firstName: 'Native', lastName: 'Owner' });
  const jar = new GoogleJar(native.jar);
  assert.equal((await googlePost(env, jar, 'google/start', { purpose: 'link' })).status, 400);
  assert.equal((await googlePost(env, jar, 'google/start', { purpose: 'link', current_password: 'wrong' })).status, 400);
  await verifyGoogle(env, jar, { purpose: 'link', current_password: native.password });
  const signed = await googleAccount(env);
  assert.equal(signed.data.user.id, native.data.user.id);
  assert.equal(signed.data.user.username, 'nativeowner');
  assert.equal(signed.data.user.has_password, true);
});

test('explicit password-verified linking can share Google without transferring either existing account', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  const native = await seedAccount(env, { username: 'anotherowner', firstName: 'Another', lastName: 'Owner' });
  const jar = new GoogleJar(native.jar);
  const flow = await beginGoogle(env, jar, { purpose: 'link', current_password: native.password });
  assert.doesNotMatch((await jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  const links = (await env.DB.prepare('SELECT user_id FROM auth_google_methods').all()).results;
  assert.deepEqual(new Set(links.map(link => link.user_id)), new Set([owner.data.user.id, native.data.user.id]));
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
});

test('Google-only users can enroll MFA without adding a password; Google and Add password both honor local MFA', async t => {
  mockGoogle(t); const env = googleEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY }); const owner = await googleAccount(env);
  assert.equal((await googlePost(env, owner.jar, 'mfa/enroll')).status, 400);
  await reauth(env, owner.jar);
  const enrolled = await googlePost(env, owner.jar, 'mfa/enroll'); assert.equal(enrolled.status, 200);
  const setup = await enrolled.json();
  await reauth(env, owner.jar);
  const confirmed = await googlePost(env, owner.jar, 'mfa/confirm', { enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret) });
  assert.equal(confirmed.status, 200); const codes = (await confirmed.json()).recovery_codes;
  const jar = new GoogleJar(); await verifyGoogle(env, jar);
  const firstFactor = await googlePost(env, jar, 'google/finish', { action: 'select', account_id: owner.data.user.id }); assert.equal(firstFactor.status, 202);
  const challenge = (await firstFactor.json()).challenge;
  assert.equal((await jar.fetch(env, '/api/auth/me')).status, 401);
  const verified = await googlePost(env, jar, 'mfa/verify', { challenge, code: codes[0] });
  assert.equal(verified.status, 200); assert.equal((await verified.json()).user.id, owner.data.user.id);
  assert.equal((await googlePost(env, jar, 'mfa/verify', { challenge, code: codes[1] })).status, 401);
  await reauth(env, owner.jar);
  assert.equal((await addPassword(env, owner.jar)).status, 400, 'Google alone cannot bypass local MFA');
  await reauth(env, owner.jar);
  const added = await googlePost(env, owner.jar, 'add-password', { new_password: 'StrongNewPassword!123', mfa_code: codes[1] });
  assert.equal(added.status, 200);
});

test('Google-only users can change phone identifiers and delete their account without creating a password', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  assert.equal((await googlePost(env, owner.jar, 'update-profile', { phone_number: '+15550123456' })).status, 400);
  await reauth(env, owner.jar);
  const changed = await googlePost(env, owner.jar, 'update-profile', { phone_number: '+15550123456' });
  assert.equal(changed.status, 200);
  assert.equal((await googlePost(env, owner.jar, 'delete-account')).status, 400, 'A used reauthentication proof cannot be replayed');
  await reauth(env, owner.jar);
  assert.equal((await googlePost(env, owner.jar, 'delete-account')).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_google_methods').first()).n, 0);
});

test('forgot/reset password cannot silently set a Google-only password or trust an unverified third-party recovery mailbox', async t => {
  mockGoogle(t); const env = googleEnv({ DEV_MODE: 'true' });
  const owner = await googleAccount(env, new GoogleJar(), { email: 'person@thirdparty.example' });
  const requestReset = () => googlePost(env, new GoogleJar(), 'forgot-password', { username: 'googleowner' });
  assert.equal((await requestReset()).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').first()).n, 0);
  const raw = 'synthetic-reset-token';
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)')
    .bind(await sha256Hex(raw), owner.data.user.id, new Date(Date.now() + 60_000).toISOString()).run();
  assert.equal((await googlePost(env, owner.jar, 'reset-password', { token: raw, password: 'NewStrongPassword!456' })).status, 400);
  await reauth(env, owner.jar, { email: 'person@thirdparty.example' });
  assert.equal((await addPassword(env, owner.jar)).status, 200);
  await requestReset();
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM verified_recovery_emails').first()).n, 0);
});

test('Google-only users can register, use and remove a passkey without creating a password', async t => {
  mockGoogle(t); const env = googleEnv(); const owner = await googleAccount(env);
  const { authenticator } = await import('./helpers/passkey-authenticator.mjs');
  const key = authenticator();
  assert.equal((await googlePost(env, owner.jar, 'passkeys/register/options')).status, 400);
  await reauth(env, owner.jar);
  const response = await googlePost(env, owner.jar, 'passkeys/register/options');
  assert.equal(response.status, 200); const setup = await response.json();
  const registered = await googlePost(env, owner.jar, 'passkeys/register/verify', { challenge: setup.challenge,
    response: key.response(setup.options, { register: true, counter: 0 }), name: 'Google account passkey' });
  assert.equal(registered.status, 200);
  const jar = new GoogleJar();
  const prepared = await googlePost(env, jar, 'passkeys/login/options', { identifier: 'googleowner' });
  assert.equal(prepared.status, 200); const options = await prepared.json();
  const signed = await googlePost(env, jar, 'passkeys/login/verify', { challenge: options.challenge, response: key.response(options.options) });
  assert.equal(signed.status, 200); assert.equal((await signed.json()).user.has_password, false);
  const keys = (await (await owner.jar.fetch(env, '/api/auth/passkeys/list')).json()).passkeys;
  assert.equal((await googlePost(env, owner.jar, 'passkeys/delete', { id: keys[0].id })).status, 400);
  await reauth(env, owner.jar);
  assert.equal((await googlePost(env, owner.jar, 'passkeys/delete', { id: keys[0].id })).status, 200);
});

test('Google linking honors native local MFA and binds callback to unchanged security state', async t => {
  mockGoogle(t); const env = googleEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY });
  const native = await seedAccount(env, { username: 'linkmfaowner', firstName: 'Native', lastName: 'Owner' });
  const { enroll } = await import('./helpers/mfa-harness.mjs');
  const { codes } = await enroll(env, native);
  const jar = new GoogleJar(native.jar);
  assert.equal((await googlePost(env, jar, 'google/start', { purpose: 'link', current_password: native.password })).status, 400);
  const flow = await beginGoogle(env, jar, { purpose: 'link', current_password: native.password, mfa_code: codes[0] });
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind('changed-credential-snapshot', native.data.user.id).run();
  assert.match((await jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_google_methods').first()).n, 0);
});

test('Google-only recovery replacement requires Google proof and email confirmation, not password creation', async t => {
  mockGoogle(t); const upstream = globalThis.fetch; const emails = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') {
      emails.push(JSON.parse(options.body)); return Response.json({ id: 'synthetic-email-id' });
    }
    return upstream(url, options);
  };
  const env = googleEnv({ RESEND_API_KEY: 'synthetic-email-secret', RESEND_FROM: 'Accounts <security@example.test>' });
  const owner = await googleAccount(env);
  const body = { recovery_email: 'independent@external.example' };
  assert.equal((await googlePost(env, owner.jar, 'recovery-email/request', body)).status, 400);
  await reauth(env, owner.jar);
  assert.equal((await googlePost(env, owner.jar, 'recovery-email/request', body)).status, 200);
  assert.equal((await (await owner.jar.fetch(env, '/api/auth/me')).json()).user.recovery_email, 'verified@gmail.com');
  const pending = await env.DB.prepare('SELECT token_hash FROM recovery_email_changes').first();
  assert.ok(pending);
  const mail = JSON.stringify(emails[0]);
  const match = mail.match(/token=([a-f0-9]{64})/); assert.ok(match);
  assert.equal((await googlePost(env, owner.jar, 'recovery-email/verify', { token: match[1] })).status, 200);
  const profile = (await (await owner.jar.fetch(env, '/api/auth/me')).json()).user;
  assert.equal(profile.recovery_email, body.recovery_email); assert.equal(profile.has_password, false);
});

test('explicit linking preserves an existing native account’s password-recovery contract', async t => {
  mockGoogle(t); const env = googleEnv({ DEV_MODE: 'true' });
  const native = await seedAccount(env, { username: 'nativerecovery', firstName: 'Native', lastName: 'Recovery' });
  const jar = new GoogleJar(native.jar);
  await verifyGoogle(env, jar, { purpose: 'link', current_password: native.password });
  assert.equal((await googlePost(env, new GoogleJar(), 'forgot-password', { username: 'nativerecovery' })).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').first()).n, 1);
});
