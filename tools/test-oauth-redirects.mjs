/**
 * Offline OAuth redirect regressions against real SQLite D1 (`LocalD1Database`).
 * Run: node --experimental-strip-types --test tools/test-oauth-redirects.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createLocalD1 } from './local-d1.mjs';
import worker, { hashPassword, issueSessionAccessToken } from '../cloudflare-worker/src/index.ts';

const nativeCallback = 'gothwadstore://oauth/callback';
const webCallbacks = ['kiwistore', 'kiwiconsole', 'kiwiadmin', 'kiwiapp']
  .map((host) => `https://${host}.example.com/auth/callback`);

async function makeEnv(callbacks) {
  const db = createLocalD1(':memory:');
  const env = {
    DB: db,
    APP_DOMAIN: 'example.com',
    AUTH_HUB_URL: 'https://accounts.example.com',
    JWT_SECRET: 'test-only-jwt-secret-key-for-redirects',
    DEV_MODE: 'false',
  };
  await worker.fetch(new Request('https://accounts.example.com/api/health'), env);

  const pwHash = await hashPassword('Password123!');
  await db
    .prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
    .bind('test-user', 'tester', pwHash)
    .run();
  await db
    .prepare('INSERT INTO profiles (id, username, first_name, last_name) VALUES (?, ?, ?, ?)')
    .bind('test-user', 'tester', 'Test', 'User')
    .run();
  await db
    .prepare('UPDATE ecosystem_apps SET redirect_uris = ? WHERE id = ?')
    .bind(JSON.stringify(callbacks), 'kiwi-store')
    .run();

  const sessionJwt = await issueSessionAccessToken(env, {
    userId: 'test-user',
    username: 'tester',
  });
  return { env, sessionJwt };
}

function authorize(env, callback, { pkce = true } = {}) {
  const url = new URL('/api/oauth/authorize', env.AUTH_HUB_URL);
  url.search = new URLSearchParams({
    client_id: 'kiwi-store',
    redirect_uri: callback,
    response_type: 'code',
    scope: 'profile email offline_access',
    state: 'test-state',
    ...(pkce ? { code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' } : {}),
  }).toString();
  return worker.fetch(new Request(url), env);
}

for (const [name, callbacks] of [['empty', []], ['web-only', webCallbacks]]) {
  test(`${name} registry reproduces the Android redirect error`, async () => {
    const { env } = await makeEnv(callbacks);
    const res = await authorize(env, nativeCallback);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'redirect_uri is not registered for this app');
    assert.equal(res.headers.get('Location'), null);
  });
}

for (const callback of [nativeCallback, ...webCallbacks]) {
  test(`registered callback reaches sign-in: ${callback}`, async () => {
    const { env } = await makeEnv([...webCallbacks, nativeCallback]);
    const res = await authorize(env, callback);
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

test('registration does not allow near matches or arbitrary destinations', async () => {
  const { env } = await makeEnv([...webCallbacks, nativeCallback]);
  for (const callback of [
    `${nativeCallback}/`,
    `${nativeCallback}?next=https://untrusted.example`,
    'gothwadstore://other/callback',
    'anotherapp://oauth/callback',
    'https://untrusted.example/auth/callback',
    'https://kiwistore.example.com/other',
    'http://localhost:3000/auth/callback',
  ]) {
    const res = await authorize(env, callback);
    assert.equal(res.status, 400, callback);
    assert.match((await res.json()).error, /redirect_uri is not registered/, callback);
  }
});

test('registering Android does not disable the public-client PKCE requirement', async () => {
  const { env } = await makeEnv([nativeCallback]);
  const res = await authorize(env, nativeCallback, { pkce: false });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /PKCE required/);
});

test('consent decision also requires exact registration and preserves native state', async () => {
  const { env, sessionJwt } = await makeEnv([nativeCallback]);
  for (const callback of [nativeCallback, `${nativeCallback}/`]) {
    const res = await worker.fetch(
      new Request(`${env.AUTH_HUB_URL}/api/oauth/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `gothwad_at=${sessionJwt}`,
        },
        body: JSON.stringify({
          client_id: 'kiwi-store',
          redirect_uri: callback,
          approved: false,
          state: 'a/b & c',
        }),
      }),
      env,
    );
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

for (const [file, variable] of [['OAUTH.md', 'GOTHWAD_AUTH_URL'], ['STORE_OAUTH.md', 'AUTH_BASE']]) {
  const doc = readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8');
  const expression = doc.match(/const u = (new URL\('oauth\/authorize'[^\n]+);/);
  assert.ok(expression, `${file} must include a path-preserving authorize example`);
  for (const base of [
    'https://accounts.example.com/api',
    'https://accounts.example.com/api/',
    'https://api.example.com',
  ]) {
    test(`${file} preserves the configured API base: ${base}`, () => {
      const url = runInNewContext(expression[1], { URL, [variable]: base });
      assert.equal(url.href, `${base.replace(/\/+$/, '')}/oauth/authorize`);
    });
  }
}
