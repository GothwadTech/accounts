import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/src/index.ts';
import { buildCorsHeaders } from '../cloudflare-worker/src/http.ts';
import { verifyCsrfOrigin, resolveSafeRedirectTarget } from '../cloudflare-worker/src/cookies.ts';
import { authenticatedProxy, sessionResponse } from '../cloudflare-worker/src/sso-policy.ts';
import { makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
const host = 'https://api.gothwadtech.com';

test('SSO trusts explicit core services, not arbitrary or nested sibling hosts', () => {
  const env = makeEnv();
  try {
    for (const origin of ['https://unclaimed.gothwadtech.com', 'https://nested.mail.gothwadtech.com',
      'https://mail.gothwadtech.com:8443']) {
      const request = new Request(`${host}/api/auth/switch`, { headers: { Origin: origin } });
      assert.equal(buildCorsHeaders(request, env).has('Access-Control-Allow-Origin'), false);
      assert.equal(verifyCsrfOrigin(request, env), false);
      assert.equal(resolveSafeRedirectTarget(`${origin}/inbox`, request, env), env.AUTH_HUB_URL + '/u/0/me');
    }
  } finally { env.DB.close(); }
});
test('Accept, fetch metadata, and forwarded headers cannot authenticate a headerless proxy', async () => {
  const env = makeEnv();
  try {
    const { jar } = await seedAccount(env, { username: 'ssoproxy', firstName: 'Sso', lastName: 'Proxy' });
    for (const headers of [{ Accept: 'application/json' }, { 'Sec-Fetch-Site': 'same-site' },
      { 'Sec-Fetch-Site': 'same-origin' }, { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Gothwad-Proxy-Token': 'incorrect-proxy-secret-value-that-is-long' }]) {
      const response = await jar.fetch(env, '/api/auth/switch', { method: 'POST', origin: null, headers, body: { id: 'a' } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.getSetCookie().length, 0);
    }
    const allowed = await jar.fetch(env, '/api/auth/switch', { method: 'POST', origin: null,
      headers: { 'X-Gothwad-Proxy-Token': env.SSO_PROXY_TOKEN }, body: { id: 'a' } });
    assert.equal(allowed.status, 200);
  } finally { env.DB.close(); }
});
test('session credential JSON is server-authenticated only; browser evidence always strips it', async () => {
  const env = makeEnv();
  try {
    const { jar } = await seedAccount(env, { username: 'cookieresponse', firstName: 'Cookie', lastName: 'Response' });
    const body = { identifier: 'cookieresponse', password: 'StrongPassword!123' };
    const browser = await jar.fetch(env, '/api/auth/signin', { method: 'POST', body });
    const publicData = await browser.json();
    for (const key of ['access_token', 'refresh_token', 'session_id']) assert.equal(publicData[key], undefined);
    assert.ok(browser.headers.getSetCookie().length);
    const refreshed = await jar.fetch(env, '/api/auth/refresh', { method: 'POST', body: {} });
    assert.equal((await refreshed.json()).access_token, undefined);
    const server = await worker.fetch(new Request(`${host}/api/auth/signin`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gothwad-Proxy-Token': env.SSO_PROXY_TOKEN },
      body: JSON.stringify(body) }), env);
    assert.ok((await server.json()).access_token);
    const secretRequest = new Request(`${host}/api/auth/signin`, { headers: {
      'X-Gothwad-Proxy-Token': env.SSO_PROXY_TOKEN, Origin: env.AUTH_HUB_URL } });
    assert.equal(authenticatedProxy(secretRequest, env), true);
    assert.deepEqual(sessionResponse(secretRequest, env, { ok: true, access_token: 'secret', refresh_token: 'secret', session_id: 'secret' }), { ok: true });
    assert.equal(buildCorsHeaders(secretRequest, env).get('Access-Control-Allow-Headers').includes('Proxy-Token'), false);
  } finally { env.DB.close(); }
});
test('proxy secrets never override explicitly hostile browser evidence', async () => {
  const env = makeEnv({ DB: undefined });
  const request = new Request(`${host}/api/auth/signout`, { method: 'POST', headers: {
    'X-Gothwad-Proxy-Token': env.SSO_PROXY_TOKEN, Origin: 'https://unclaimed.gothwadtech.com' } });
  assert.equal((await worker.fetch(request, env)).status, 403);
});
