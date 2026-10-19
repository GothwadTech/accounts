/**
 * Provider-side OAuth regressions. In-memory REST fixture, never a real DB.
 * Run: node --experimental-strip-types --test tools/test-oauth-*.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import worker from '../cloudflare-worker/src/index.ts';

const native = 'gothwadstore://oauth/callback';
const verifier = 'v'.repeat(43);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const challengeFor = value => createHash('sha256').update(value).digest('base64url');
const challenge = challengeFor(verifier);
const env = {
  APP_DOMAIN: 'example.com', AUTH_HUB_URL: 'https://accounts.example.com',
  SUPABASE_URL: 'https://database.example.com', SUPABASE_ANON_KEY: 'test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only', JWT_SECRET: 'test-only-signing-key', DEV_MODE: 'false',
};
const params = {
  client_id: 'gothwad-store', redirect_uri: native, response_type: 'code',
  scope: 'profile email offline_access', state: 'test-state',
  code_challenge: challenge, code_challenge_method: 'S256',
};
const authCode = (overrides = {}) => ({
  code: 'test-code', client_id: params.client_id, user_id: 'test-user', redirect_uri: native,
  scopes: ['profile', 'email', 'offline_access'], code_challenge: challenge, code_challenge_method: 'S256',
  expires_at: new Date(Date.now() + 300_000).toISOString(), used: false, ...overrides,
});
const exchange = (overrides = {}) => ({
  grant_type: 'authorization_code', client_id: params.client_id, redirect_uri: native,
  code: 'test-code', code_verifier: verifier, ...overrides,
});

function fixture(t, { callback = native, secret = null, fail, raceTable } = {}) {
  const db = {
    ecosystem_apps: [{ id: params.client_id, client_id: params.client_id, name: 'Gothwad Store', redirect_uris: [callback], secret_hash: secret }],
    profiles: [{ id: 'test-user', username: 'tester', first_name: 'OAuth', last_name: 'Test' }],
    oauth_auth_codes: [], oauth_refresh_tokens: [], app_authorizations: [], account_activity: [],
  };
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise(resolve => { releaseReads = resolve; });
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, env.SUPABASE_URL, 'fixture must never contact external services');
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : {};
    if (url.pathname === '/auth/v1/user') {
      return headers.get('Authorization') === 'Bearer expired'
        ? Response.json({ error: 'expired' }, { status: 401 })
        : Response.json({ id: 'test-user' });
    }
    if (url.pathname === '/auth/v1/token') {
      assert.equal(body.refresh_token, 'old-refresh');
      return Response.json({ user: { id: 'test-user' }, access_token: 'new-access', refresh_token: 'new-refresh' });
    }
    const table = url.pathname.replace('/rest/v1/', '');
    assert.ok(db[table], `unexpected table: ${table}`);
    const failed = fail?.(table, method);
    if (failed) return failed;
    const matches = row => [...url.searchParams].every(([key, filter]) => {
      if (key === 'select') return true;
      const dot = filter.indexOf('.');
      const op = filter.slice(0, dot), value = filter.slice(dot + 1);
      if (op === 'eq') return String(row[key]) === value;
      if (op === 'gt') return String(row[key]) > value;
      throw new Error(`Unexpected filter: ${key}=${filter}`);
    });
    if (method === 'GET') {
      // Capture BEFORE the barrier: prove atomic writes, not lucky scheduling.
      const snapshot = structuredClone(db[table].filter(matches));
      if (table === raceTable) {
        if (++reads === 2) releaseReads();
        await bothRead;
      }
      return Response.json(snapshot);
    }
    if (method === 'POST') {
      const row = { id: `test-${db[table].length}`, ...body };
      db[table].push(row);
      return Response.json([row], { status: 201 });
    }
    if (method === 'PATCH') {
      const rows = db[table].filter(matches);
      for (const row of rows) Object.assign(row, body);
      return Response.json(rows);
    }
    throw new Error(`Unexpected method: ${method}`);
  });
  return db;
}

function call(path, { body, session = false, cookie } = {}) {
  return worker.fetch(new Request(`${env.AUTH_HUB_URL}/api/oauth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Authorization: 'Bearer test-session' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}
const authorize = (patch = {}, options = {}) => call(`authorize?${new URLSearchParams({ ...params, ...patch })}`, options);
const decision = (patch = {}, options = {}) => call('decision', { body: { ...params, approved: true, ...patch }, session: true, ...options });

for (const [label, patch] of [
  ['missing challenge', { code_challenge: '' }],
  ['missing method', { code_challenge_method: '' }],
  ['plain method', { code_challenge_method: 'plain' }],
  ['short challenge', { code_challenge: 'abc' }],
  ['padded challenge', { code_challenge: challenge + '=' }],
  ['non-base64url challenge', { code_challenge: '/'.repeat(43) }],
]) {
  test(`PKCE ${label} is rejected at both authorize and direct consent POST`, async t => {
    const db = fixture(t);
    assert.equal((await authorize(patch)).status, 400);
    assert.equal((await decision(patch)).status, 400);
    assert.equal(db.oauth_auth_codes.length, 0);
    assert.equal(db.app_authorizations.length, 0);
  });
}

test('native approval, PKCE token, userinfo and code reuse protection work together', async t => {
  const db = fixture(t);
  const approval = await decision();
  assert.equal(approval.status, 200);
  const redirect = new URL((await approval.json()).redirect_url);
  assert.equal(redirect.searchParams.get('state'), params.state);
  const body = exchange({ code: redirect.searchParams.get('code') });
  const tokenRes = await call('token', { body });
  assert.equal(tokenRes.status, 200);
  assert.equal(tokenRes.headers.get('Cache-Control'), 'no-store');
  const tokens = await tokenRes.json();
  assert.ok(tokens.access_token && tokens.refresh_token);
  const me = await worker.fetch(new Request(`${env.AUTH_HUB_URL}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }), env);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).preferred_username, 'tester');
  assert.equal((await call('token', { body })).status, 400);
  assert.equal(db.oauth_auth_codes[0].used, true);
});

for (const badVerifier of ['x'.repeat(42), 'x'.repeat(129), '!'.repeat(43), ' '.repeat(43)]) {
  test(`invalid verifier syntax is rejected even when its digest matches: length ${badVerifier.length}, char ${JSON.stringify(badVerifier[0])}`, async t => {
    const db = fixture(t);
    db.oauth_auth_codes.push(authCode({ code_challenge: challengeFor(badVerifier) }));
    const res = await call('token', { body: exchange({ code_verifier: badVerifier }) });
    assert.equal(res.status, 400);
    assert.equal(db.oauth_auth_codes[0].used, false);
  });
}

test('a legacy public authorization code without PKCE cannot bypass token checks', async t => {
  const db = fixture(t);
  db.oauth_auth_codes.push(authCode({ code_challenge: null, code_challenge_method: null }));
  assert.equal((await call('token', { body: exchange({ code_verifier: '' }) })).status, 400);
  assert.equal(db.oauth_auth_codes[0].used, false);
});

test('confidential clients may omit PKCE but still need their client secret', async t => {
  const secret = 'test-only-client-secret';
  const db = fixture(t, { secret: sha256(secret) });
  const res = await decision({ code_challenge: '', code_challenge_method: '' });
  assert.equal(res.status, 200);
  const code = db.oauth_auth_codes[0].code;
  assert.equal((await call('token', { body: exchange({ code, code_verifier: '' }) })).status, 401);
  assert.equal((await call('token', { body: exchange({ code, code_verifier: '', client_secret: secret }) })).status, 200);
});

test('consent state cannot close the script tag, and still round-trips unchanged', async t => {
  fixture(t);
  const state = '</script><script>globalThis.untrusted=true</script>&"';
  const res = await authorize({ state }, { session: true });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal(html.includes(state), false);
  assert.equal((html.match(/<script>/g) || []).length, 1);
  const serialized = html.match(/const data = (.+);/)[1];
  assert.equal(JSON.parse(serialized).state, state);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

for (const approved of [true, false]) {
  test(`callback preserves registered query values on ${approved ? 'approval' : 'denial'}`, async t => {
    const callback = 'https://store.example.com/auth/callback?source=web&code=old&error=old&state=old';
    fixture(t, { callback });
    const state = 'a/b & c + d';
    const res = await decision({ redirect_uri: callback, state, approved });
    assert.equal(res.status, 200);
    const url = new URL((await res.json()).redirect_url);
    assert.equal(url.searchParams.get('source'), 'web');
    assert.equal(url.searchParams.get('state'), state);
    assert.equal(url.searchParams.getAll('state').length, 1);
    assert.equal(url.searchParams.has(approved ? 'error' : 'code'), false);
    assert.ok(url.searchParams.get(approved ? 'code' : 'error'));
  });
}

for (const callback of [
  '/relative', 'javascript:alert(1)', 'https://store.example.com/auth/callback#fragment',
  'https://user:password@store.example.com/auth/callback',
]) {
  test(`unsafe callback is rejected even if mistakenly registered: ${callback}`, async t => {
    fixture(t, { callback });
    assert.equal((await authorize({ redirect_uri: callback })).status, 400);
  });
}

for (const step of ['consent', 'decision']) {
  test(`session refresh cookies survive the OAuth ${step} response`, async t => {
    fixture(t);
    const options = { session: false, cookie: 'gothwad_at=expired; gothwad_rt=old-refresh; gothwad_sid=test-session-id' };
    const res = step === 'consent' ? await authorize({}, options) : await decision({}, options);
    assert.equal(res.status, 200);
    const cookies = res.headers.getSetCookie();
    assert.ok(cookies.some(c => c.startsWith('gothwad_at=new-access;')));
    assert.ok(cookies.some(c => c.startsWith('gothwad_rt=new-refresh;')));
    assert.ok(cookies.some(c => c.startsWith('gothwad_sid=test-session-id;')));
  });
}

for (const [label, failure] of [
  ['HTTP error', () => Response.json({ message: 'private database detail' }, { status: 503 })],
  ['malformed response', () => Response.json({ not: 'an array' })],
  ['network error', () => { throw new Error('private connection detail'); }],
]) {
  test(`registry ${label} is 503, not unknown-client or redirect-mismatch`, async t => {
    fixture(t, { fail: table => table === 'ecosystem_apps' ? failure() : null });
    const res = await authorize();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'temporarily_unavailable');
  });
}

test('a genuinely missing client still returns a client error, not a storage failure', async t => {
  const db = fixture(t);
  db.ecosystem_apps = [];
  const res = await authorize();
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Unknown client_id');
});

test('failed authorization-code persistence never returns a fake callback code', async t => {
  const db = fixture(t, { fail: (table, method) => table === 'oauth_auth_codes' && method === 'POST'
    ? Response.json({}, { status: 503 }) : null });
  const res = await decision();
  assert.equal(res.status, 503);
  assert.equal((await res.json()).redirect_url, undefined);
  assert.equal(db.app_authorizations.length, 0);
});

for (const table of ['oauth_auth_codes', 'oauth_refresh_tokens']) {
  test(`concurrent ${table} consumption has exactly one winner`, { timeout: 5000 }, async t => {
    const db = fixture(t, { raceTable: table });
    let body = exchange();
    if (table === 'oauth_auth_codes') db[table].push(authCode());
    else {
      db[table].push({
        token_hash: sha256('test-refresh'), user_id: 'test-user', client_id: params.client_id,
        scopes: ['profile', 'offline_access'], revoked: false, expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      body = { grant_type: 'refresh_token', client_id: params.client_id, refresh_token: 'test-refresh' };
    }
    const results = await Promise.all([call('token', { body }), call('token', { body })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    assert.equal(db.oauth_refresh_tokens.filter(row => !row.revoked).length, 1);
  });
}

for (const [table, method] of [['oauth_auth_codes', 'PATCH'], ['oauth_refresh_tokens', 'POST']]) {
  test(`failed ${method} ${table} cannot issue tokens`, async t => {
    const db = fixture(t, { fail: (name, verb) => name === table && verb === method
      ? Response.json({}, { status: 503 }) : null });
    db.oauth_auth_codes.push(authCode());
    const res = await call('token', { body: exchange() });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).access_token, undefined);
  });
}

test('a later storage failure does not discard already-rotated session cookies', async t => {
  fixture(t, { fail: (table, method) => table === 'oauth_auth_codes' && method === 'POST'
    ? Response.json({}, { status: 503 }) : null });
  const res = await decision({}, { session: false, cookie: 'gothwad_at=expired; gothwad_rt=old-refresh' });
  assert.equal(res.status, 503);
  assert.ok(res.headers.getSetCookie().some(c => c.startsWith('gothwad_rt=new-refresh;')));
});
