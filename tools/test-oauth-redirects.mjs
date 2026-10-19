/**
 * Offline OAuth redirect regressions. No real accounts, secrets, or servers.
 * Run: node --experimental-strip-types --test tools/test-oauth-redirects.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import worker from '../cloudflare-worker/src/index.ts';

const nativeCallback = 'gothwadstore://oauth/callback';
const webCallbacks = ['store', 'console', 'storeadmin', 'storeapp']
  .map((host) => `https://${host}.example.com/auth/callback`);
const env = {
  APP_DOMAIN: 'example.com',
  AUTH_HUB_URL: 'https://accounts.example.com',
  SUPABASE_URL: 'https://database.example.com',
  SUPABASE_ANON_KEY: 'local-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'local-test-only',
  DEV_MODE: 'false', // Production checks must pass without the localhost bypass.
};

function mockRegistry(t, callbacks) {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, env.SUPABASE_URL, 'never contact a real backend');
    if (url.pathname === '/auth/v1/user') {
      return Response.json({ id: 'test-user' });
    }
    assert.equal(url.pathname, '/rest/v1/ecosystem_apps');
    const matches = url.searchParams.get('client_id') === 'eq.kiwi-store'
      || url.searchParams.get('id') === 'eq.kiwi-store';
    return Response.json(matches ? [{
      id: 'kiwi-store', client_id: 'kiwi-store', name: 'Kiwi Store',
      redirect_uris: callbacks, secret_hash: null,
    }] : []);
  });
}

function authorize(callback, { pkce = true } = {}) {
  const url = new URL('/api/oauth/authorize', env.AUTH_HUB_URL);
  url.search = new URLSearchParams({
    client_id: 'kiwi-store', redirect_uri: callback,
    response_type: 'code', scope: 'profile email offline_access', state: 'test-state',
    ...(pkce ? { code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' } : {}),
  }).toString();
  return worker.fetch(new Request(url), env);
}

for (const [name, callbacks] of [['empty', []], ['web-only', webCallbacks]]) {
  test(`${name} registry reproduces the Android redirect error`, async (t) => {
    mockRegistry(t, callbacks);
    const res = await authorize(nativeCallback);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'redirect_uri is not registered for this app');
    assert.equal(res.headers.get('Location'), null);
  });
}

for (const callback of [nativeCallback, ...webCallbacks]) {
  test(`registered callback reaches sign-in: ${callback}`, async (t) => {
    mockRegistry(t, [...webCallbacks, nativeCallback]);
    const res = await authorize(callback);
    assert.equal(res.status, 302);
    const login = new URL(res.headers.get('Location'));
    assert.equal(login.origin, env.AUTH_HUB_URL);
    assert.equal(login.pathname, '/signin');
    assert.equal(login.searchParams.get('choose'), '1');
    const next = new URL(login.searchParams.get('next'));
    assert.equal(next.pathname, '/api/oauth/authorize');
    assert.equal(next.searchParams.get('redirect_uri'), callback);
    assert.equal(next.searchParams.get('state'), 'test-state');
    assert.equal(next.searchParams.get('code_challenge_method'), 'S256');
  });
}

test('registration does not allow near matches or arbitrary destinations', async (t) => {
  mockRegistry(t, [...webCallbacks, nativeCallback]);
  for (const callback of [
    `${nativeCallback}/`, `${nativeCallback}?next=https://untrusted.example`,
    'gothwadstore://other/callback', 'anotherapp://oauth/callback',
    'https://untrusted.example/auth/callback',
    'https://store.example.com/other', 'http://localhost:3000/auth/callback',
  ]) {
    const res = await authorize(callback);
    assert.equal(res.status, 400, callback);
    assert.match((await res.json()).error, /redirect_uri is not registered/, callback);
  }
});

test('registering Android does not disable the public-client PKCE requirement', async (t) => {
  mockRegistry(t, [nativeCallback]);
  const res = await authorize(nativeCallback, { pkce: false });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /PKCE required/);
});

test('consent decision also requires exact registration and preserves native state', async (t) => {
  mockRegistry(t, [nativeCallback]);
  for (const callback of [nativeCallback, `${nativeCallback}/`]) {
    const res = await worker.fetch(new Request(`${env.AUTH_HUB_URL}/api/oauth/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'gothwad_at=test-session' },
      body: JSON.stringify({
        client_id: 'kiwi-store', redirect_uri: callback, approved: false, state: 'a/b & c',
      }),
    }), env);
    const data = await res.json();
    if (callback !== nativeCallback) {
      assert.equal(res.status, 400);
      assert.match(data.error, /redirect_uri is not registered/);
    } else {
      assert.equal(res.status, 200);
      const redirect = new URL(data.redirect_url);
      assert.equal(`${redirect.protocol}//${redirect.host}${redirect.pathname}`, nativeCallback);
      assert.equal(redirect.searchParams.get('error'), 'access_denied');
      assert.equal(redirect.searchParams.get('state'), 'a/b & c');
    }
  }
});

// Execute the actual documented expressions, not copies of the proposed fix.
// The old leading-slash examples silently discarded the /api Worker route.
for (const [file, variable] of [['OAUTH.md', 'GOTHWAD_AUTH_URL'], ['STORE_OAUTH.md', 'AUTH_BASE']]) {
  const doc = readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8');
  const expression = doc.match(/const u = (new URL\('oauth\/authorize'[^\n]+);/);
  assert.ok(expression, `${file} must include a path-preserving authorize example`);
  for (const base of [
    'https://accounts.example.com/api', 'https://accounts.example.com/api/',
    'https://api.example.com',
  ]) {
    test(`${file} preserves the configured API base: ${base}`, () => {
      const url = runInNewContext(expression[1], { URL, [variable]: base });
      assert.equal(url.href, `${base.replace(/\/+$/, '')}/oauth/authorize`);
    });
  }
}
