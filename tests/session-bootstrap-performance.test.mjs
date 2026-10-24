import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeSlotCredentials, encodeSlotCredentials } from '../cloudflare-worker/src/cookies.ts';
import { signJwt } from '../cloudflare-worker/src/crypto.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

// Instrument real SQLite statements, not mocked query results.
function observeDb(db) {
  const stats = { fail: false, queries: [], inFlight: 0, peak: 0 };
  function wrap(statement, sql) {
    return new Proxy(statement, {
      get(target, name) {
        if (name === 'bind') return (...args) => wrap(target.bind(...args), sql);
        if (name === 'first') return async (...args) => {
          if (stats.fail) throw new Error('Simulated D1 outage');
          stats.queries.push(sql);
          const validation = sql.includes('JOIN user_sessions');
          if (validation) {
            stats.inFlight++;
            stats.peak = Math.max(stats.peak, stats.inFlight);
            // Allow every candidate to reach validation before any completes.
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          try { return await target.first(...args); }
          finally { if (validation) stats.inFlight--; }
        };
        const value = Reflect.get(target, name);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  const observed = new Proxy(db, {
    get(target, name) {
      if (name === 'prepare') return (sql) => wrap(target.prepare(sql), sql);
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { observed, stats };
}

async function signedIn(count) {
  const env = makeEnv();
  const browser = new BrowserJar();
  for (let index = 0; index < count; index++) {
    const username = `bootstrap${index}`;
    await seedAccount(env, { username, firstName: 'Bootstrap', lastName: String(index) });
    const response = await browser.fetch(env, '/api/auth/signin', {
      method: 'POST', body: {
        identifier: username, password: 'StrongPassword!123', remember: true, add: index > 0,
      },
    });
    assert.equal(response.status, 200);
  }
  return { env, browser };
}

for (const selector of [null, '0', '5']) {
  test(`/auth/me validates each of six accounts once, in parallel (selector ${selector})`, async () => {
    const { env, browser } = await signedIn(6);
    const { observed, stats } = observeDb(env.DB);
    env.DB = observed;
    const activeBefore = browser.cookies.get('gothwad_active');
    const response = await browser.fetch(env, '/api/auth/me', {
      headers: selector === null ? {} : { 'X-Gothwad-Authuser': selector },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.equal(body.user.username, `bootstrap${selector ?? 5}`);
    assert.deepEqual(body.accounts.map((account) => account.username),
      Array.from({ length: 6 }, (_, index) => `bootstrap${index}`));
    assert.deepEqual(body.accounts.map((account) => account.authuser), [0, 1, 2, 3, 4, 5]);
    assert.equal(stats.queries.filter((sql) => sql.includes('JOIN user_sessions')).length, 6);
    assert.equal(stats.queries.filter((sql) => sql.includes('SELECT * FROM profiles')).length, 7);
    assert.equal(stats.peak, 6);
    // An explicit tab selector must not overwrite another tab's active cookie.
    assert.equal(browser.cookies.get('gothwad_active'), activeBefore);
  });
}

test('bootstrap still rejects revoked sessions on the very next request', async () => {
  const { env, browser } = await signedIn(1);
  assert.equal((await browser.fetch(env, '/api/auth/me')).status, 200);
  await env.DB.prepare('DELETE FROM user_sessions').run();
  const response = await browser.fetch(env, '/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).authenticated, false);
  assert.equal(browser.cookies.has('gothwad_sess_a'), false);
});

test('bootstrap DB outage is a retryable 503 and does not clear session cookies', async () => {
  const { env, browser } = await signedIn(1);
  const { observed, stats } = observeDb(env.DB);
  env.DB = observed;
  assert.equal((await browser.fetch(env, '/api/auth/me')).status, 200);
  const cookies = browser.headerValue();
  stats.fail = true;
  const response = await browser.fetch(env, '/api/auth/me');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal(browser.headerValue(), cookies);
});

test('root opens the dashboard shell without an auth timeout or Sign in detour', () => {
  const redirects = readFileSync(new URL('../web/_redirects', import.meta.url), 'utf8');
  assert.match(redirects, /^\/\s+\/me\/index\.html\s+200$/m);
  const root = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(root, /getSession|Promise\.race|1200/);
  assert.match(root, /location\.replace\('\/me'/);
  const dashboard = readFileSync(new URL('../web/me/index.html', import.meta.url), 'utf8');
  assert.ok(dashboard.indexOf('/js/session-bootstrap.js') < dashboard.indexOf('/me/js/me.js'));
});

for (const selector of [null, '0']) {
  test(`expired access tokens rotate once per slot and deliver replacement cookies (selector ${selector})`, async () => {
    const { env, browser } = await signedIn(2);
    const oldRefreshTokens = [];
    for (const slot of ['a', 'b']) {
      const key = `gothwad_sess_${slot}`;
      const credentials = decodeSlotCredentials(browser.cookies.get(key));
      oldRefreshTokens.push(credentials.refreshToken);
      credentials.accessToken = await signJwt({
        token_use: 'session', sub: 'expired', exp: 1,
      }, env.JWT_SECRET);
      browser.cookies.set(key, encodeSlotCredentials(credentials));
    }
    const { observed, stats } = observeDb(env.DB);
    env.DB = observed;
    const response = await browser.fetch(env, '/api/auth/me', {
      headers: selector === null ? {} : { 'X-Gothwad-Authuser': selector },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.username, `bootstrap${selector ?? 1}`);
    assert.equal(body.accounts.length, 2);
    assert.equal(browser.cookies.get('gothwad_active'), 'b');
    assert.equal(stats.queries.filter((sql) => sql.includes('UPDATE auth_refresh_tokens')).length, 2);
    for (const [index, slot] of ['a', 'b'].entries()) {
      const credentials = decodeSlotCredentials(browser.cookies.get(`gothwad_sess_${slot}`));
      assert.notEqual(credentials.refreshToken, oldRefreshTokens[index]);
    }
    stats.queries.length = 0;
    assert.equal((await browser.fetch(env, '/api/auth/me')).status, 200);
    assert.equal(stats.queries.filter((sql) => sql.includes('UPDATE auth_refresh_tokens')).length, 0);
  });
}
