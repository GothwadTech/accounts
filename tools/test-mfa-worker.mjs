import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { TOTP, Secret } = createRequire(new URL('../cloudflare-worker/package.json', import.meta.url))('otpauth');
// Local-only smoke check: never creates synthetic accounts on production.
const target = new URL(process.env.MFA_SMOKE_URL || 'http://127.0.0.1:3012');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('MFA smoke checks require a local Worker');
const base = target.origin;
const jar = new Map();
async function call(path, body, cookies = jar) {
  const headers = { Origin: base, 'Content-Type': 'application/json', Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') };
  const response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0]; const at = pair.indexOf('='); cookies.set(pair.slice(0,at), pair.slice(at+1)); }
  const data = await response.json();
  assert.ok(response.status < 500, `Worker error ${response.status}: ${data.error || data.message || 'unknown'}`);
  return { response, data };
}
const username = `worker${Date.now()}`;
const password = 'SyntheticPassword!123';
assert.equal((await call('/auth/signup', { username, password, first_name: 'Local', last_name: 'Worker', recovery_email: 'synthetic@example.test' })).response.status, 201);
const setup = (await call('/auth/mfa/enroll', { current_password: password })).data;
assert.ok(setup.secret);
const code = new TOTP({ secret: Secret.fromBase32(setup.secret), algorithm: 'SHA1', digits: 6, period: 30 }).generate();
const confirmed = await call('/auth/mfa/confirm', { current_password: password, enrollment_id: setup.enrollment_id, code });
assert.equal(confirmed.response.status, 200);
assert.equal(confirmed.data.recovery_codes.length, 10);
const fresh = new Map();
const challenge = await call('/auth/signin', { identifier: username, password }, fresh);
assert.equal(challenge.response.status, 202);
assert.equal(fresh.size, 0);
const verified = await call('/auth/mfa/verify', { challenge: challenge.data.challenge, code: confirmed.data.recovery_codes[0] }, fresh);
assert.equal(verified.response.status, 200);
assert.equal((await call('/auth/me', undefined, fresh)).data.user.two_factor_enabled, true);
console.log('PASS: real workerd/local-D1 signup, AES-GCM/TOTP enrollment, pending login, recovery-code proof, assured session. No remote deployment or real email.');
