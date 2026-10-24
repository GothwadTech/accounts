import test from 'node:test';
import assert from 'node:assert/strict';
import { getSession, primeSession } from '../web/js/session.js';
import { requireAuth } from '../web/js/common.js';

// Globals are restored after each test; top-level tests run sequentially.
function browser(t, fetch) {
  const before = { fetch: globalThis.fetch, location: globalThis.location };
  globalThis.location = { pathname: '/u/0/me', search: '' };
  globalThis.fetch = fetch;
  t.after(() => {
    globalThis.fetch = before.fetch;
    if (before.location === undefined) delete globalThis.location;
    else globalThis.location = before.location;
  });
}

const sessionResponse = () => Response.json({
  authenticated: true, user: { username: 'bootstrap' }, activeId: 'a', authuser: 0, accounts: [],
});

test('early identity discovery and concurrent consumers share one request', async (t) => {
  let calls = 0;
  let finish;
  browser(t, (url, options) => {
    calls++;
    assert.equal(url, '/api/auth/me');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.headers['X-Gothwad-Authuser'], '0');
    assert.equal(options.credentials, 'include');
    return new Promise((resolve) => { finish = resolve; });
  });
  primeSession();
  const first = getSession();
  const second = getSession();
  finish(sessionResponse());
  assert.equal((await first).authenticated, true);
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  // Only the initial boot is reused. Later checks still contact the server.
  globalThis.fetch = async () => { calls++; return sessionResponse(); };
  await getSession();
  assert.equal(calls, 2);
});

test('a completed early request is reused when the dashboard modules finish loading', async (t) => {
  let calls = 0;
  browser(t, async () => { calls++; return sessionResponse(); });
  primeSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await getSession()).authenticated, true);
  assert.equal(calls, 1);
});

test('a different tab selector never consumes the initial account snapshot', async (t) => {
  const selectors = [];
  browser(t, async (url, options) => {
    selectors.push(options.headers['X-Gothwad-Authuser']);
    return sessionResponse();
  });
  primeSession();
  globalThis.location.pathname = '/u/1/me';
  await getSession();
  assert.deepEqual(selectors, ['0', '1']);
});

test('confirmed anonymous identity does not trigger a redundant refresh waterfall', async (t) => {
  let calls = 0;
  browser(t, async () => { calls++; return Response.json({ authenticated: false }, { status: 401 }); });
  assert.equal((await getSession()).authenticated, false);
  assert.equal(calls, 1);
});

for (const status of [503, 500, 429]) {
  test(`HTTP ${status} does not redirect a signed-in visitor to Sign in`, async (t) => {
    browser(t, async () => Response.json({ message: 'Please retry.' }, { status }));
    await assert.rejects(requireAuth(), /Please retry/);
    assert.equal(globalThis.location.href, undefined);
  });
}

test('network errors preserve the dashboard retry state instead of redirecting', async (t) => {
  browser(t, async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(requireAuth(), /Cannot reach/);
  assert.equal(globalThis.location.href, undefined);
});
