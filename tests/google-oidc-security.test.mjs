import test from 'node:test';
import assert from 'node:assert/strict';
import { b64url } from '../cloudflare-worker/src/crypto.ts';
import { googleConfig, validateGoogleIdToken } from '../cloudflare-worker/src/google-oidc.ts';
import { googleEnv, mockGoogle, googleJwt, claims, GoogleJar, beginGoogle, ticketCount } from './helpers/google-harness.mjs';

test('OIDC verifies Google signature, issuer, audience, authorized party, nonce, subject and fresh lifetime', async t => {
  mockGoogle(t); const env = googleEnv();
  const validate = token => validateGoogleIdToken(token, env.GOOGLE_CLIENT_ID, 'test-nonce');
  const valid = await validate(await googleJwt(claims(env)));
  assert.equal(valid.subject, 'google-subject-one'); assert.equal(valid.authoritative, true);
  for (const override of [{ iss: 'https://evil.example' }, { aud: 'another-app' }, { azp: 'another-app' },
    { aud: [env.GOOGLE_CLIENT_ID, 'another-app'] }, { nonce: 'wrong-nonce' }, { nonce: undefined },
    { exp: 0 }, { exp: '9999999999' }, { exp: undefined }, { iat: 0 }, { iat: Math.floor(Date.now() / 1000) + 120 },
    { nbf: Math.floor(Date.now() / 1000) + 120 }, { sub: '' }, { sub: 123 }, { email_verified: false },
    { email_verified: 'true' }, { email: 'invalid-email' }]) {
    await assert.rejects(() => googleJwt(claims(env, override)).then(validate), JSON.stringify(override));
  }
  const multiAudience = await validate(await googleJwt(claims(env, { aud: [env.GOOGLE_CLIENT_ID, 'other'], azp: env.GOOGLE_CLIENT_ID })));
  assert.equal(multiAudience.subject, valid.subject);
  assert.equal((await validate(await googleJwt(claims(env, { iss: 'accounts.google.com' })))).subject, valid.subject);
});

test('OIDC rejects unsigned, wrong-algorithm, tampered, unknown-key and malformed tokens', async t => {
  mockGoogle(t); const env = googleEnv();
  const validate = token => validateGoogleIdToken(token, env.GOOGLE_CLIENT_ID, 'test-nonce');
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'missing-key' }, { crit: ['unsupported'] }]) {
    await assert.rejects(() => googleJwt(claims(env), header).then(validate));
  }
  const signed = await googleJwt(claims(env));
  const pieces = signed.split('.'); pieces[1] = b64url(JSON.stringify(claims(env, { sub: 'attacker' })));
  await assert.rejects(() => validate(pieces.join('.')));
  for (const token of ['a.b', 'a.b.c.d', '%%%..', '', 'x'.repeat(20_001)]) await assert.rejects(() => validate(token));
});

test('Google-verified third-party email does not become an authoritative recovery mailbox', async t => {
  mockGoogle(t); const env = googleEnv();
  const validate = override => googleJwt(claims(env, override)).then(token => validateGoogleIdToken(token, env.GOOGLE_CLIENT_ID, 'test-nonce'));
  assert.equal((await validate({ email: 'person@external.example' })).authoritative, false);
  assert.equal((await validate({ email: 'person@workspace.example', hd: 'workspace.example' })).authoritative, true);
  assert.equal((await validate({ email: 'person@external.example', hd: 'workspace.example' })).authoritative, false);
});

test('invalid nonce or provider claims in a callback fail closed with no tickets or sessions', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar();
  for (const override of [{ nonce: 'wrong-nonce' }, { aud: 'wrong-app' }, { email_verified: false }]) {
    const flow = await beginGoogle(env, jar, {}, override);
    const response = await jar.fetch(env, flow.callback, { origin: null });
    assert.match(response.headers.get('Location'), /error=1/);
    assert.equal(await ticketCount(env), 0);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 0);
  }
});

test('provider configuration rejects missing credentials and insecure or malformed production hubs', () => {
  const env = googleEnv();
  for (const override of [{ GOOGLE_CLIENT_ID: '' }, { GOOGLE_CLIENT_SECRET: '' }, { AUTH_HUB_URL: 'http://accounts.example' },
    { AUTH_HUB_URL: 'https://user:password@accounts.example' }, { AUTH_HUB_URL: 'https://accounts.example/path' },
    { AUTH_HUB_URL: 'https://accounts.example?redirect=evil' }]) assert.equal(googleConfig({ ...env, ...override }), null);
  assert.ok(googleConfig({ ...env, AUTH_HUB_URL: 'http://localhost:8787', DEV_MODE: 'true' }));
});
