import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BrowserJar, makeEnv, seedAccount } from './multi-account-harness.mjs';
const require = createRequire(new URL('../../cloudflare-worker/package.json', import.meta.url));
const { TOTP, Secret } = require('otpauth');

export const TEST_MFA_KEY = Buffer.alloc(32, 7).toString('base64url');
export const mfaCode = (secret, offset = 0) => new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
  .generate({ timestamp: Date.now() + offset });
export const mfaPost = (jar, env, route, body) => jar.fetch(env, `/api/auth/mfa/${route}`, {
  method: 'POST', origin: 'https://accounts.gothwadtech.com', body,
});
export async function mfaFixture() {
  const env = makeEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY });
  const owner = await seedAccount(env, { username: 'mfaowner', firstName: 'Mfa', lastName: 'Owner' });
  return { env, owner };
}
export async function enroll(env, owner) {
  const response = await mfaPost(owner.jar, env, 'enroll', { current_password: owner.password });
  assert.equal(response.status, 200);
  const setup = await response.json();
  const confirmed = await mfaPost(owner.jar, env, 'confirm', {
    current_password: owner.password, enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret),
  });
  assert.equal(confirmed.status, 200);
  const enabled = await confirmed.json();
  assert.equal(enabled.recovery_codes.length, 10);
  return { setup, codes: enabled.recovery_codes };
}
export async function startLogin(env, owner, extra = {}) {
  const jar = new BrowserJar();
  const response = await jar.fetch(env, '/api/auth/signin', {
    method: 'POST', origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'mfaowner', password: owner.password, ...extra },
  });
  assert.equal(response.status, 202);
  return { jar, response, challenge: (await response.json()).challenge };
}
