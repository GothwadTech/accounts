/** Diagnostics must be explicit, local-only and incapable of echoing arbitrary header data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewAuthTrace } from '../tools/preview-auth-trace.mjs';
const env = { DEV_MODE: 'true', LOCAL_PREVIEW_PROXY: 'true', LOCAL_PREVIEW_TRACE: 'true', E2B_SANDBOX_ID: 'syntheticpreview' };
const request = { method: 'POST', headers: { cookie: 'gothwad_sess_a=PRIVATE_SESSION; gothwad_active=a; attacker_PRIVATE_NAME=value',
  origin: 'https://3000-syntheticpreview.e2b.app', 'x-gothwad-authuser': '0', 'user-agent': 'Chrome/153 PRIVATE_AGENT',
  authorization: 'Bearer PRIVATE_TOKEN', 'e2b-traffic-access-token': 'PRIVATE_GATEWAY', referer: 'https://private.example/?secret=PRIVATE_QUERY' } };

test('trace records only allowlisted diagnostics, never credential/header values or account identity', () => {
  const result = previewAuthTrace(request, '/api/auth/signin', 200,
    ['gothwad_sess_a=PRIVATE_SESSION; Secure; HttpOnly; SameSite=None; Partitioned'], env);
  assert.deepEqual(result.incoming, ['gothwad_active', 'gothwad_sess_a']);
  assert.equal(result.origin, 'exact-preview'); assert.equal(result.selector, '0');
  assert.equal(result.outgoingPartitioned, true); assert.equal(result.status, 200);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Bearer|secret|traffic-access/);
  const unusual = previewAuthTrace({ ...request, headers: { ...request.headers,
    origin: 'PRIVATE_ORIGIN', 'x-gothwad-authuser': 'PRIVATE_SELECTOR' } }, '/api/auth/me', 401, [], env);
  assert.equal(unusual.origin, 'other'); assert.equal(unusual.selector, 'other');
  assert.doesNotMatch(JSON.stringify(unusual), /PRIVATE/);
});

test('no trace without both explicit local mode and diagnostic opt-in, or on arbitrary paths', () => {
  for (const settings of [{}, { ...env, LOCAL_PREVIEW_TRACE: 'false' }, { ...env, LOCAL_PREVIEW_PROXY: 'false' },
    { ...env, E2B_SANDBOX_ID: '' }]) {
    assert.equal(previewAuthTrace(request, '/api/auth/me', 401, [], settings), null);
  }
  assert.equal(previewAuthTrace(request, '/api/profile/PRIVATE_PATH', 200, [], env), null);
  assert.throws(() => previewAuthTrace(request, '/api/auth/me', 401, [], { ...env, NODE_ENV: 'production' }));
});
