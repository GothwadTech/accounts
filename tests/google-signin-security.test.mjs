import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDb } from '../cloudflare-worker/src/db.ts';
import { verifyPassword } from '../cloudflare-worker/src/crypto.ts';
import { seedAccount, makeEnv } from './helpers/multi-account-harness.mjs';
import { GoogleJar, googleEnv, mockGoogle, beginGoogle, verifyGoogle, googleAccount, googlePost,
  onboarding, ticketCount, sha256Hex } from './helpers/google-harness.mjs';

test('Google is opt-in and unavailable without both credentials; additive migration is idempotent', async () => {
  const env = makeEnv(); const jar = new GoogleJar();
  assert.deepEqual(await (await jar.fetch(env, '/api/auth/google/config')).json(), { enabled: false });
  assert.equal((await googlePost(env, jar, 'google/start')).status, 503);
  await env.DB.exec(readFileSync('sql/11_google_identities.sql', 'utf8'));
  await env.DB.exec(readFileSync('sql/11_google_identities.sql', 'utf8'));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 0);
});

test('authorization uses minimal scopes, S256 PKCE, a nonce and host-only HttpOnly browser binding', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar();
  const flow = await beginGoogle(env, jar, { next: 'https://attacker.example/stolen' });
  assert.equal(flow.auth.origin, 'https://accounts.google.com');
  assert.equal(flow.auth.searchParams.get('scope'), 'openid email profile');
  assert.equal(flow.auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(flow.auth.searchParams.get('response_type'), 'code');
  assert.equal(flow.auth.searchParams.get('redirect_uri'), env.AUTH_HUB_URL + '/api/auth/google/callback');
  assert.ok(flow.auth.searchParams.get('nonce'));
  assert.doesNotMatch(flow.auth.href, /secret|refresh_token|offline|gmail\.readonly/);
  const stranger = new GoogleJar();
  const rejected = await stranger.fetch(env, flow.callback, { origin: null });
  assert.match(rejected.headers.get('Location'), /error=1/);
  assert.equal(await ticketCount(env), 0);
  const accepted = await jar.fetch(env, flow.callback, { origin: null });
  assert.doesNotMatch(accepted.headers.get('Location'), /error=1/);
  assert.equal(accepted.headers.get('Referrer-Policy'), 'no-referrer');
  const status = await (await jar.fetch(env, '/api/auth/google/status')).json();
  assert.equal(status.next_url, env.AUTH_HUB_URL + '/u/0/me');
});

test('callback has one atomic winner, rejects expiry/replay and never creates a session', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar();
  const flow = await beginGoogle(env, jar);
  const cookie = jar.headerValue();
  const responses = await Promise.all([0, 1].map(() => jar.fetch(env, flow.callback, { headers: { Cookie: cookie }, origin: null })));
  assert.equal(responses.filter(r => !r.headers.get('Location').includes('error=1')).length, 1);
  assert.equal(await ticketCount(env), 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 0);
  const expired = await beginGoogle(env, jar);
  await env.DB.prepare("UPDATE auth_google_flows SET expires_at = '2000-01-01' WHERE state_hash = ?")
    .bind(await sha256Hex(expired.auth.searchParams.get('state'))).run();
  assert.match((await jar.fetch(env, expired.callback, { origin: null })).headers.get('Location'), /error=1/);
});

test('Google signup chooses a Gothwad username with no password, cookie-only sessions and accurate profile flags', async t => {
  mockGoogle(t); const env = googleEnv();
  const { jar, data, response } = await googleAccount(env);
  assert.equal(data.user.username, 'googleowner');
  assert.equal(data.user.has_password, false);
  assert.equal(data.user.google_linked, true);
  assert.equal(data.user.email, 'googleowner@' + env.APP_DOMAIN);
  assert.equal(data.user.recovery_email, 'verified@gmail.com');
  assert.equal(data.access_token, undefined); assert.equal(data.refresh_token, undefined); assert.equal(data.session_id, undefined);
  assert.doesNotMatch(JSON.stringify(data), /never-return-this-provider-token|synthetic-google-secret/);
  assert.ok(response.headers.getSetCookie().some(c => c.startsWith('gothwad_sess_a=') && c.includes('Domain=.')));
  const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(data.user.id).first();
  assert.match(user.password_hash, /^!no-password:/);
  for (const password of ['', 'anything', user.password_hash]) assert.equal(await verifyPassword(password, user.password_hash), false);
  assert.equal((await googlePost(env, new GoogleJar(), 'signin', { identifier: 'googleowner', password: user.password_hash })).status, 401);
  assert.equal((await (await jar.fetch(env, '/api/auth/me')).json()).user.has_password, false);
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding())).status, 401);
});

test('onboarding requires explicit recovery and terms confirmation, valid unique username and names', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar(); await verifyGoogle(env, jar);
  for (const body of [{}, { ...onboarding(), confirm_recovery_email: false }, { ...onboarding(), accept_terms: false },
    onboarding('admin'), onboarding('a'), { ...onboarding(), first_name: '' }, { ...onboarding(), date_of_birth: '2026-02-31' }]) {
    assert.equal((await googlePost(env, jar, 'google/finish', body)).status, 400);
  }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 0);
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding())).status, 200);
});

test('separate fresh proofs can create distinct usernames for one Google identity without orphan rows', async t => {
  mockGoogle(t); const env = googleEnv(); const left = new GoogleJar(), right = new GoogleJar();
  await verifyGoogle(env, left); await verifyGoogle(env, right);
  const results = await Promise.all([googlePost(env, left, 'google/finish', onboarding('googleleft')),
    googlePost(env, right, 'google/finish', onboarding('googleright'))]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  for (const table of ['users', 'profiles', 'auth_google_methods']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 2);
  }
});

test('identity uses issuer/subject, not matching email; returning Google users keep the same internal ID', async t => {
  mockGoogle(t); const env = googleEnv();
  const native = await seedAccount(env, { username: 'nativeowner', firstName: 'Native', lastName: 'Owner' });
  await env.DB.prepare("UPDATE profiles SET recovery_email = 'verified@gmail.com' WHERE id = ?").bind(native.data.user.id).run();
  const first = await googleAccount(env);
  assert.notEqual(first.data.user.id, native.data.user.id);
  const second = await googleAccount(env, new GoogleJar(), { email: 'changed@gmail.com' });
  assert.equal(first.data.user.id, second.data.user.id);
  assert.equal(second.data.user.username, 'googleowner');
  const distinct = await googleAccount(env, new GoogleJar(), { sub: 'different-subject' }, 'googledifferent');
  assert.notEqual(first.data.user.id, distinct.data.user.id);
});

test('untrusted origins cannot start, finish or link Google authorization', async () => {
  const env = googleEnv(); const jar = new GoogleJar();
  for (const path of ['google/start', 'google/finish', 'add-password']) {
    assert.equal((await jar.fetch(env, '/api/auth/' + path, { method: 'POST', origin: 'https://attacker.example', body: {} })).status, 403);
  }
});

test('Google add-mode honors the six-slot maximum without creating another account', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar();
  for (let i = 0; i < 6; i++) {
    await seedAccount(env, { username: `existing${i}`, firstName: 'Existing', lastName: 'Owner' });
    assert.equal((await googlePost(env, jar, 'signin', { identifier: `existing${i}`, password: 'StrongPassword!123', add: i > 0 })).status, 200);
  }
  await verifyGoogle(env, jar, { add: true });
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding())).status, 409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 6);
});

test('expired onboarding proof cannot create an account', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar(); await verifyGoogle(env, jar);
  await env.DB.prepare("UPDATE auth_google_tickets SET expires_at = '2000-01-01'").run();
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding())).status, 401);
});

test('bootstrap can initialize the additive schema without any provider configuration', async () => {
  const env = makeEnv(); await getDb(env);
  assert.ok(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'auth_external_identities'").first());
});
