/** Run the actual callback example with fake browser storage/fetch. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const doc = readFileSync(new URL('../docs/OAUTH.md', import.meta.url), 'utf8');
const scripts = [...doc.matchAll(/<script type="module">\n([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);

async function runCallback({ stored = {}, query = {}, status = 200 } = {}) {
  const storage = new Map(Object.entries({
    oauth_state: 'expected', pkce_verifier: 'v'.repeat(43), oauth_started_at: String(Date.now()), ...stored,
  }).filter(([, value]) => value !== null));
  const calls = [], alerts = [], history = [];
  const params = new URLSearchParams({ state: 'expected', code: 'test-code', ...query });
  for (const [key, value] of Object.entries(query)) if (value === null) params.delete(key);
  const context = {
    URLSearchParams,
    location: new URL('https://chat.example.com/auth/gothwad/callback?' + params),
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    history: { replaceState: (...args) => history.push(args) },
    alert: text => alerts.push(text), console: { log() {} },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith('/oauth/token')
        ? Response.json({ access_token: 'test-access', refresh_token: 'test-refresh' }, { status })
        : Response.json({ sub: 'test-user' });
    },
  };
  await runInNewContext(`(async () => { ${scripts[1][1]} })()`, context);
  return { storage, calls, alerts, history, context };
}

for (const [name, options] of [
  ['absent pending state', { stored: { oauth_state: null }, query: { state: null } }],
  ['mismatched state', { query: { state: 'other' } }],
  ['missing verifier', { stored: { pkce_verifier: null } }],
  ['expired state', { stored: { oauth_started_at: String(Date.now() - 16 * 60 * 1000) } }],
  ['denial with mismatched state', { query: { error: 'access_denied', state: 'other' } }],
  ['missing code', { query: { code: '' } }],
  ['matching denial', { query: { error: 'access_denied', code: '' } }],
]) {
  test(`OAuth callback example does not exchange on ${name}`, async () => {
    const result = await runCallback(options);
    assert.equal(result.calls.length, 0);
    assert.equal(result.alerts.length, 1);
  });
}

test('OAuth callback example consumes state once and stores only verified tokens', async () => {
  const result = await runCallback();
  assert.equal(result.calls.length, 2);
  assert.equal(result.alerts.length, 0);
  assert.equal(result.storage.has('oauth_state'), false);
  assert.equal(result.storage.has('pkce_verifier'), false);
  assert.equal(result.storage.get('gothwad_access_token'), 'test-access');
  assert.equal(result.history[0][2], '/auth/gothwad/callback');
  await runInNewContext(`(async () => { ${scripts[1][1]} })()`, result.context);
  assert.equal(result.calls.length, 2, 'a repeated callback must not exchange the code again');
});

test('OAuth callback example does not store credentials after exchange failure', async () => {
  const result = await runCallback({ status: 503 });
  assert.equal(result.calls.length, 1);
  assert.equal(result.storage.has('gothwad_access_token'), false);
  assert.equal(result.alerts.length, 1);
});
