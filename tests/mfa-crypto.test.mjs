import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encryptMfaSeed, decryptMfaSeed, mfaConfigured, totpCounter, newRecoveryCodes, recoveryCodeHash } from '../cloudflare-worker/src/mfa-crypto.ts';
import { makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
import { TEST_MFA_KEY } from './helpers/mfa-harness.mjs';

const env = { MFA_ENCRYPTION_KEY: TEST_MFA_KEY };
test('TOTP validation matches RFC 6238 SHA1 vectors truncated to six digits', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [seconds, code] of [[59, '287082'], [1111111109, '081804'], [1234567890, '005924']]) {
    assert.equal(totpCounter(secret, code, seconds * 1000), Math.floor(seconds / 30));
  }
  assert.equal(totpCounter(secret, '287082', 59_000 + 90_000), null);
  for (const value of ['28708', '2870820', 'abcdef', ' 287082']) assert.equal(totpCounter(secret, value, 59_000), null);
});

test('AES-GCM seed encryption is randomized and authenticated to the account and key', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const a = await encryptMfaSeed(env, 'user-a', secret);
  const b = await encryptMfaSeed(env, 'user-a', secret);
  assert.notEqual(a, b);
  assert.equal(a.includes(secret), false);
  assert.equal(await decryptMfaSeed(env, 'user-a', a), secret);
  await assert.rejects(decryptMfaSeed(env, 'user-b', a));
  await assert.rejects(decryptMfaSeed({ MFA_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64url') }, 'user-a', a));
  const pieces = a.split('.');
  pieces[2] = (pieces[2][0] === 'A' ? 'B' : 'A') + pieces[2].slice(1);
  await assert.rejects(decryptMfaSeed(env, 'user-a', pieces.join('.')));
});

test('MFA encryption never falls back to JWT signing secrets or development defaults', async () => {
  for (const key of [undefined, '', 'short', 'A'.repeat(42), 'A'.repeat(44)]) {
    const missing = { MFA_ENCRYPTION_KEY: key, DEV_MODE: 'true', JWT_SECRET: 'valid-signing-secret' };
    assert.equal(mfaConfigured(missing), false);
    await assert.rejects(encryptMfaSeed(missing, 'user-a', 'secret'));
  }
});

test('recovery codes have 128-bit random values, normalized account-bound hashes, and no stored plaintext requirement', async () => {
  const codes = await newRecoveryCodes('user-a');
  assert.equal(new Set(codes.map(c => c.code)).size, 10);
  for (const { code, hash } of codes) {
    assert.match(code, /^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(await recoveryCodeHash('user-a', code.toUpperCase()), hash);
    assert.notEqual(await recoveryCodeHash('user-b', code), hash);
  }
});

test('MFA migration is idempotent and preserves existing users without enabling MFA', async () => {
  const local = makeEnv();
  await seedAccount(local, { username: 'mfaschema', firstName: 'Mfa', lastName: 'Schema' });
  const sql = readFileSync(new URL('../sql/08_authenticator_mfa.sql', import.meta.url), 'utf8');
  await local.DB.exec(sql); await local.DB.exec(sql);
  assert.equal((await local.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 1);
  assert.equal((await local.DB.prepare('SELECT COUNT(*) AS n FROM auth_mfa_factors').first()).n, 0);
});
