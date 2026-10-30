import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../cloudflare-worker/src/index.ts';
import { getDb } from '../cloudflare-worker/src/db.ts';
import { enforceAuthRateLimit, authRateLimitPolicy } from '../cloudflare-worker/src/auth-rate-limit.ts';
import { createLocalD1 } from '../tools/local-d1.mjs';
import { makeEnv } from './helpers/multi-account-harness.mjs';

function request(ip = '192.0.2.1', method = 'POST') {
  return new Request('https://api.gothwadtech.com/api/auth/forgot-password', {
    method, headers: { 'CF-Connecting-IP': ip },
  });
}

test('rate-limit migration is additive, idempotent, and agrees with runtime schema', async () => {
  const sql = readFileSync(new URL('../sql/06_auth_rate_limits.sql', import.meta.url), 'utf8');
  const db = createLocalD1(':memory:');
  await db.exec(sql);
  await db.prepare('INSERT INTO auth_rate_limits VALUES (?, ?, ?)').bind('existing', 3, 42).run();
  await db.exec(sql);
  await getDb(makeEnv({ DB: db }));
  assert.equal((await db.prepare('SELECT hits FROM auth_rate_limits WHERE bucket = ?').bind('existing').first()).hits, 3);
});

test('persistent limiter has exactly five winners under concurrent recovery attempts', async () => {
  const env = makeEnv();
  const db = await getDb(env);
  const now = 1_800_000_000_000;
  const results = await Promise.all(Array.from({ length: 24 }, () =>
    enforceAuthRateLimit(request(), db, env, '/auth/forgot-password', now)));
  assert.equal(results.filter((r) => r === null).length, 5);
  const blocked = results.filter(Boolean);
  assert.equal(blocked.length, 19);
  for (const response of blocked) {
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('Retry-After')) > 0);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const row = await db.prepare('SELECT * FROM auth_rate_limits').first();
  assert.equal(row.hits, 6, 'Counter is capped even under repeated abuse');
  assert.match(row.bucket, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(row).includes('192.0.2.1'), false);
});

test('limits survive a new env wrapper, separate IPs/groups, and reset at window expiry', async () => {
  const env = makeEnv();
  const db = await getDb(env);
  const now = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) await enforceAuthRateLimit(request(), db, env, '/auth/forgot-password', now);
  assert.equal((await enforceAuthRateLimit(request(), db, { ...env }, '/auth/forgot-password', now)).status, 429);
  assert.equal(await enforceAuthRateLimit(request('192.0.2.2'), db, env, '/auth/forgot-password', now), null);
  assert.equal(await enforceAuthRateLimit(request(), db, env, '/auth/reset-password', now), null);
  assert.equal(await enforceAuthRateLimit(request(), db, env, '/auth/forgot-password', now + 900_000), null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM auth_rate_limits WHERE expires_at <= ?')
    .bind(now / 1000 + 900).first()).count, 0);
});

test('missing edge IP cannot bypass throttling using arbitrary forwarding headers', async () => {
  const env = makeEnv();
  const db = await getDb(env);
  for (let i = 0; i < 6; i++) {
    const req = new Request('https://api.gothwadtech.com/api/auth/forgot-password', {
      method: 'POST', headers: { 'X-Forwarded-For': `192.0.2.${i}` },
    });
    const response = await enforceAuthRateLimit(req, db, env, '/auth/forgot-password');
    assert.equal(response?.status ?? 200, i < 5 ? 200 : 429);
  }
});

test('rate-limit storage failure fails closed with retryable 503 through the router', async () => {
  const env = makeEnv();
  await getDb(env);
  const original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (sql.includes('INSERT INTO auth_rate_limits')) throw new Error('Simulated limiter outage');
    return original(sql);
  };
  const response = await worker.fetch(new Request('https://api.gothwadtech.com/api/auth/signin', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.AUTH_HUB_URL }, body: '{}',
  }), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.getSetCookie().length, 0);
});

test('router enforces discovery throttling while health and identity bootstrap stay exempt', async () => {
  const env = makeEnv();
  for (let i = 0; i < 121; i++) {
    const res = await worker.fetch(new Request('https://api.gothwadtech.com/api/auth/check-username?username=sample', {
      headers: { 'CF-Connecting-IP': '192.0.2.8' },
    }), env);
    assert.equal(res.status, i < 120 ? 200 : 429);
  }
  assert.equal((await worker.fetch(new Request('https://api.gothwadtech.com/api/health'), env)).status, 200);
  assert.equal(authRateLimitPolicy('GET', '/auth/me'), null);
  for (const route of ['/auth/signin', '/auth/signup', '/auth/reset-password', '/oauth/token', '/auth/change-password']) {
    assert.ok(authRateLimitPolicy('POST', route));
    assert.equal(authRateLimitPolicy('GET', route), null);
  }
});


test('all passkey writes share a durable IP bucket; reads stay outside the proof limiter', () => {
  for (const route of ['/auth/passkeys/login/options', '/auth/passkeys/login/verify',
    '/auth/passkeys/register/options', '/auth/passkeys/register/verify', '/auth/passkeys/delete']) {
    assert.deepEqual(authRateLimitPolicy('POST', route), { group: 'passkeys', limit: 30, seconds: 300 });
    assert.equal(authRateLimitPolicy('GET', route), null);
  }
  assert.equal(authRateLimitPolicy('GET', '/auth/passkeys/list'), null);
});
