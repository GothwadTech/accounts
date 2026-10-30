import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../cloudflare-worker/src/index.ts';
import { signJwt, verifyJwt, sha256Hex } from '../cloudflare-worker/src/crypto.ts';
import { makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const client = 'revocation-test';
const redirect = 'https://consumer.example/auth/callback';
async function fixture() {
  const env = makeEnv();
  const owner = await seedAccount(env, { username: 'oauthowner', firstName: 'Oauth', lastName: 'Owner' });
  await env.DB.prepare('INSERT INTO ecosystem_apps (id, client_id, name, redirect_uris) VALUES (?, ?, ?, ?)')
    .bind(client, client, 'Test consumer', JSON.stringify([redirect])).run();
  return { env, owner };
}
async function consent(f) {
  const response = await f.owner.jar.fetch(f.env, '/api/oauth/decision', { method: 'POST',
    body: { approved: true, client_id: client, redirect_uri: redirect, scope: 'profile email offline_access',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'unchanged' } });
  assert.equal(response.status, 200, await response.clone().text());
  return new URL((await response.json()).redirect_url).searchParams.get('code');
}
const exchange = (f, code) => token(f, { grant_type: 'authorization_code', client_id: client,
  redirect_uri: redirect, code, code_verifier: verifier });
async function token(f, body) {
  return worker.fetch(new Request('https://api.gothwadtech.com/api/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), f.env);
}
const userinfo = (f, access) => worker.fetch(new Request('https://api.gothwadtech.com/api/oauth/userinfo',
  { headers: { Authorization: `Bearer ${access}` } }), f.env);
async function tokens(f) {
  const response = await exchange(f, await consent(f));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const refresh = (f, value) => token(f, { grant_type: 'refresh_token', client_id: client, refresh_token: value });

test('OAuth revocation rejects issued access, refresh and pending codes; reconsent never revives them', async () => {
  const f = await fixture();
  try {
    const issued = await tokens(f);
    const pending = await consent(f);
    assert.equal((await userinfo(f, issued.access_token)).status, 200);
    const removed = await f.owner.jar.fetch(f.env, '/api/oauth/revoke', { method: 'POST', body: { app_id: client } });
    assert.equal(removed.status, 200);
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
    assert.equal((await refresh(f, issued.refresh_token)).status, 400);
    assert.equal((await exchange(f, pending)).status, 400);
    const renewed = await tokens(f);
    assert.equal((await userinfo(f, renewed.access_token)).status, 200);
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
  } finally { f.env.DB.close(); }
});
test('OAuth tokens fail closed after password change, grant scope removal, and account deletion', async () => {
  const f = await fixture();
  try {
    const issued = await tokens(f);
    await f.env.DB.prepare("UPDATE app_authorizations SET scopes = '[\"profile\"]'").run();
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
    assert.equal((await refresh(f, issued.refresh_token)).status, 400);
    await f.env.DB.prepare("UPDATE app_authorizations SET scopes = '[\"profile\",\"email\",\"offline_access\"]'").run();
    await f.env.DB.prepare("UPDATE users SET password_hash = 'new-version'").run();
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
    assert.equal((await refresh(f, issued.refresh_token)).status, 400);
    await f.env.DB.prepare('DELETE FROM users').run();
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_credential_bindings').first()).n, 0);
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
  } finally { f.env.DB.close(); }
});
test('OAuth userinfo checks issuer, audience, expiry and live ledger even with a valid signature', async () => {
  const f = await fixture();
  try {
    const issued = await tokens(f);
    const payload = await verifyJwt(issued.access_token, f.env.JWT_SECRET);
    const originalHash = await sha256Hex(issued.access_token);
    for (const changes of [{ iss: 'https://evil.example' }, { aud: 'different-client' },
      { exp: undefined }, { iat: Date.now() / 1000 + 1000 }, { token_use: 'session' }]) {
      const forged = await signJwt({ ...payload, ...changes }, f.env.JWT_SECRET);
      await f.env.DB.prepare(`INSERT INTO oauth_credential_bindings
        SELECT ?, kind, user_id, client_id, grant_id, password_snapshot, expires_at
        FROM oauth_credential_bindings WHERE credential_hash = ?`)
        .bind(await sha256Hex(forged), originalHash).run();
      assert.equal((await userinfo(f, forged)).status, 401);
    }
    await f.env.DB.prepare('DELETE FROM oauth_credential_bindings WHERE credential_hash = ?').bind(originalHash).run();
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
  } finally { f.env.DB.close(); }
});
test('OAuth issuance rolls back code consumption when replacement persistence fails', async () => {
  const f = await fixture();
  try {
    const code = await consent(f);
    await f.env.DB.exec(`CREATE TRIGGER fail_access BEFORE INSERT ON oauth_credential_bindings
      WHEN NEW.kind = 'access' BEGIN SELECT RAISE(ABORT, 'synthetic persistence failure'); END;`);
    assert.equal((await exchange(f, code)).status, 503);
    assert.equal((await f.env.DB.prepare('SELECT used FROM oauth_auth_codes WHERE code = ?').bind(code).first()).used, 0);
    await f.env.DB.exec('DROP TRIGGER fail_access');
    assert.equal((await exchange(f, code)).status, 200);
  } finally { f.env.DB.close(); }
});
test('OAuth refresh rotation has a live binding and one-use semantics', async () => {
  const f = await fixture();
  try {
    const issued = await tokens(f);
    const results = await Promise.all([refresh(f, issued.refresh_token), refresh(f, issued.refresh_token)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const rotated = await results.find(r => r.status === 200).json();
    assert.equal((await userinfo(f, rotated.access_token)).status, 200);
    assert.notEqual(rotated.refresh_token, issued.refresh_token);
    assert.equal((await refresh(f, rotated.refresh_token)).status, 200);
  } finally { f.env.DB.close(); }
});

test('OAuth existing access credentials are invalidated when authenticator MFA is enabled', async () => {
  const f = await fixture();
  try {
    const { TEST_MFA_KEY, enroll } = await import('./helpers/mfa-harness.mjs');
    f.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;
    const issued = await tokens(f);
    await enroll(f.env, f.owner);
    assert.equal((await userinfo(f, issued.access_token)).status, 401);
    assert.equal((await refresh(f, issued.refresh_token)).status, 400);
  } finally { f.env.DB.close(); }
});
