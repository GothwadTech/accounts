/** Local-only real workerd/D1 WebAuthn and OAuth lifecycle smoke checks. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authenticator } from '../tests/helpers/passkey-authenticator.mjs';
const target = new URL(process.env.PASSKEY_SMOKE_URL || 'http://localhost:3012');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Synthetic smoke checks require a local Worker');
const origin = target.origin;
const jar = new Map();
async function call(path, body, cookies = jar, headers = {}) {
  const response = await fetch(origin + '/api' + path, { method: body ? 'POST' : 'GET',
    headers: { Origin: origin, 'Content-Type': 'application/json',
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
    body: body ? JSON.stringify(body) : undefined });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0]; const at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const data = await response.json();
  assert.ok(response.status < 500, `Worker error ${response.status}: ${JSON.stringify(data)}`);
  return { response, data };
}
const username = `passkey${Date.now()}`;
const password = 'SyntheticPasskeyPassword!123';
const signup = await call('/auth/signup', { username, password, first_name: 'Local', last_name: 'Passkey', recovery_email: 'synthetic@example.test' });
assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
assert.equal(signup.data.access_token, undefined);
const setup = await call('/auth/passkeys/register/options', { current_password: password });
assert.equal(setup.response.status, 200);
const key = authenticator({ algorithm: process.env.PASSKEY_TEST_ALGORITHM || 'ES256' });
assert.equal((await call('/auth/passkeys/register/verify', { challenge: setup.data.challenge,
  response: key.response(setup.data.options, { register: true, counter: 0, origin }), name: 'Workerd test' })).response.status, 200);
const fresh = new Map();
const login = await call('/auth/passkeys/login/options', { identifier: username }, fresh);
assert.equal(login.response.status, 200);
const proof = { challenge: login.data.challenge, response: key.response(login.data.options, { origin }) };
assert.equal((await call('/auth/passkeys/login/verify', proof, fresh)).response.status, 200);
assert.equal((await call('/auth/passkeys/login/verify', proof, fresh)).response.status, 401);
assert.equal((await call('/auth/me', undefined, fresh)).data.user.username, username);
const domain = signup.data.user.email.split('@')[1];
const redirectUri = `https://tube.${domain}/auth/callback`;
const verifier = 'v'.repeat(43);
const consent = await call('/oauth/decision', { approved: true, client_id: 'gothwad-tube',
  redirect_uri: redirectUri, scope: 'profile email offline_access',
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }, fresh);
// The non-core synthetic consumer uses the default domain-derived callback seed.
assert.equal(consent.response.status, 200, JSON.stringify(consent.data));
const code = new URL(consent.data.redirect_url).searchParams.get('code');
const issued = await call('/oauth/token', { grant_type: 'authorization_code', client_id: 'gothwad-tube',
  redirect_uri: redirectUri, code, code_verifier: verifier }, new Map());
assert.equal(issued.response.status, 200, JSON.stringify(issued.data));
assert.equal((await call('/oauth/userinfo', undefined, new Map(), { Authorization: `Bearer ${issued.data.access_token}` })).response.status, 200);
assert.equal((await call('/oauth/revoke', { app_id: 'gothwad-tube' }, fresh)).response.status, 200);
assert.equal((await call('/oauth/userinfo', undefined, new Map(), { Authorization: `Bearer ${issued.data.access_token}` })).response.status, 401);
assert.equal((await call('/oauth/token', { grant_type: 'refresh_token', client_id: 'gothwad-tube', refresh_token: issued.data.refresh_token }, new Map())).response.status, 400);
console.log(`PASS: real workerd/D1 ${process.env.PASSKEY_TEST_ALGORITHM || 'ES256'} registration, UV passwordless login, replay rejection, cookie-only responses, OAuth exchange, live userinfo, access and refresh revocation. Local synthetic data only.`);
