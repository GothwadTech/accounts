/**
 * Provider-side OAuth security regressions against real SQLite D1 + fault injection.
 * Run: node --experimental-strip-types --test tools/test-oauth-security.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createLocalD1 } from './local-d1.mjs';
import worker, { hashPassword, issueSessionAccessToken } from '../cloudflare-worker/src/index.ts';

const native = 'gothwadstore://oauth/callback';
const verifier = 'v'.repeat(43);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const challengeFor = (value) => createHash('sha256').update(value).digest('base64url');
const challenge = challengeFor(verifier);

const params = {
  client_id: 'kiwi-store',
  redirect_uri: native,
  response_type: 'code',
  scope: 'profile email offline_access',
  state: 'test-state',
  code_challenge: challenge,
  code_challenge_method: 'S256',
};

const exchange = (overrides = {}) => ({
  grant_type: 'authorization_code',
  client_id: params.client_id,
  redirect_uri: native,
  code: 'test-code',
  code_verifier: verifier,
  ...overrides,
});

function wrapDbWithFaults(realDb, { failSql, raceSql } = {}) {
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise((resolve) => {
    releaseReads = resolve;
  });

  return {
    prepare(sql) {
      const stmt = realDb.prepare(sql);
      const wrapStmt = (inner) => ({
        bind(...args) {
          return wrapStmt(inner.bind(...args));
        },
        async first(col) {
          if (failSql && failSql(sql, 'first')) throw new Error('Simulated D1 failure');
          const result = await inner.first(col);
          if (raceSql && raceSql(sql)) {
            if (++reads === 2) releaseReads();
            await bothRead;
          }
          return result;
        },
        async all() {
          if (failSql && failSql(sql, 'all')) throw new Error('Simulated D1 failure');
          return inner.all();
        },
        async run() {
          if (failSql && failSql(sql, 'run')) throw new Error('Simulated D1 failure');
          return inner.run();
        },
        async raw() {
          return inner.raw();
        },
        _executeSync() {
          if (failSql && failSql(sql, 'batch')) throw new Error('Simulated D1 failure');
          return inner._executeSync();
        },
      });
      return wrapStmt(stmt);
    },
    batch(stmts) {
      return realDb.batch(stmts);
    },
    exec(sql) {
      return realDb.exec(sql);
    },
  };
}

async function createFixture({ callback = native, secret = null, failSql, raceSql } = {}) {
  const rawDb = createLocalD1(':memory:');
  const baseEnv = {
    DB: rawDb,
    APP_DOMAIN: 'example.com',
    AUTH_HUB_URL: 'https://accounts.example.com',
    JWT_SECRET: 'test-only-signing-key-0123456789',
    DEV_MODE: 'false',
  };
  await worker.fetch(new Request('https://accounts.example.com/api/health'), baseEnv);

  const pwHash = await hashPassword('Password123!');
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 3_600_000).toISOString();

  await rawDb
    .prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind('test-user', 'tester', pwHash, nowIso, nowIso)
    .run();
  await rawDb
    .prepare('INSERT INTO profiles (id, username, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('test-user', 'tester', 'OAuth', 'Test', nowIso, nowIso)
    .run();
  await rawDb
    .prepare('INSERT INTO user_sessions (id, user_id, device_name, browser, last_active, is_current, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
    .bind('test-session-id', 'test-user', 'Chrome on Linux', 'Chrome', nowIso, nowIso)
    .run();
  await rawDb
    .prepare('INSERT INTO auth_refresh_tokens (token_hash, user_id, session_id, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(sha256('old-refresh'), 'test-user', 'test-session-id', futureIso, nowIso)
    .run();
  await rawDb
    .prepare('UPDATE ecosystem_apps SET redirect_uris = ?, secret_hash = ? WHERE id = ?')
    .bind(JSON.stringify([callback]), secret, params.client_id)
    .run();

  const sessionJwt = await issueSessionAccessToken(baseEnv, {
    userId: 'test-user',
    username: 'tester',
    sessionId: 'test-session-id',
  });

  const db = failSql || raceSql ? wrapDbWithFaults(rawDb, { failSql, raceSql }) : rawDb;
  if (db !== rawDb) {
    // Warm bootstrap on wrapped DB before enabling faults if needed
    await worker.fetch(new Request('https://accounts.example.com/api/health'), { ...baseEnv, DB: db }).catch(() => undefined);
  }
  const env = { ...baseEnv, DB: db };

  const call = (path, { body, session = false, cookie } = {}) =>
    worker.fetch(
      new Request(`${env.AUTH_HUB_URL}/api/oauth/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: env.AUTH_HUB_URL,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(session ? { Authorization: `Bearer ${sessionJwt}` } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );

  const authorize = (patch = {}, options = {}) =>
    call(`authorize?${new URLSearchParams({ ...params, ...patch })}`, options);
  const decision = (patch = {}, options = {}) =>
    call('decision', { body: { ...params, approved: true, ...patch }, session: true, ...options });

  return { rawDb, env, call, authorize, decision };
}

for (const [label, patch] of [
  ['missing challenge', { code_challenge: '' }],
  ['missing method', { code_challenge_method: '' }],
  ['plain method', { code_challenge_method: 'plain' }],
  ['short challenge', { code_challenge: 'abc' }],
  ['padded challenge', { code_challenge: challenge + '=' }],
  ['non-base64url challenge', { code_challenge: '/'.repeat(43) }],
]) {
  test(`PKCE ${label} is rejected at both authorize and direct consent POST`, async () => {
    const { rawDb, authorize, decision } = await createFixture();
    assert.equal((await authorize(patch)).status, 400);
    assert.equal((await decision(patch)).status, 400);
    assert.equal((await rawDb.prepare('SELECT COUNT(*) AS c FROM oauth_auth_codes').first('c')), 0);
    assert.equal((await rawDb.prepare('SELECT COUNT(*) AS c FROM app_authorizations').first('c')), 0);
  });
}

test('native approval, PKCE token, userinfo and code reuse protection work together', async () => {
  const { rawDb, env, call, decision } = await createFixture();
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

  const me = await worker.fetch(
    new Request(`${env.AUTH_HUB_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }),
    env,
  );
  assert.equal(me.status, 200);
  assert.equal((await me.json()).preferred_username, 'tester');
  assert.equal((await call('token', { body })).status, 400);
  assert.equal(await rawDb.prepare('SELECT used FROM oauth_auth_codes WHERE code = ?').bind(body.code).first('used'), 1);
});

for (const badVerifier of ['x'.repeat(42), 'x'.repeat(129), '!'.repeat(43), ' '.repeat(43)]) {
  test(`invalid verifier syntax is rejected even when its digest matches: length ${badVerifier.length}`, async () => {
    const { rawDb, call } = await createFixture();
    await rawDb
      .prepare(
        `INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used)
         VALUES (?, ?, ?, ?, ?, ?, 'S256', ?, 0)`,
      )
      .bind(
        'test-code',
        params.client_id,
        'test-user',
        native,
        JSON.stringify(['profile', 'email', 'offline_access']),
        challengeFor(badVerifier),
        new Date(Date.now() + 300_000).toISOString(),
      )
      .run();

    const res = await call('token', { body: exchange({ code_verifier: badVerifier }) });
    assert.equal(res.status, 400);
    assert.equal(await rawDb.prepare("SELECT used FROM oauth_auth_codes WHERE code = 'test-code'").first('used'), 0);
  });
}

test('a legacy public authorization code without PKCE cannot bypass token checks', async () => {
  const { rawDb, call } = await createFixture();
  await rawDb
    .prepare(
      `INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used)
       VALUES ('test-code', ?, 'test-user', ?, '["profile"]', NULL, NULL, ?, 0)`,
    )
    .bind(params.client_id, native, new Date(Date.now() + 300_000).toISOString())
    .run();

  assert.equal((await call('token', { body: exchange({ code_verifier: '' }) })).status, 400);
  assert.equal(await rawDb.prepare("SELECT used FROM oauth_auth_codes WHERE code = 'test-code'").first('used'), 0);
});

test('confidential clients may omit PKCE but still need their client secret', async () => {
  const secret = 'test-only-client-secret';
  const { rawDb, call, decision } = await createFixture({ secret: sha256(secret) });
  const res = await decision({ code_challenge: '', code_challenge_method: '' });
  assert.equal(res.status, 200);
  const code = await rawDb.prepare('SELECT code FROM oauth_auth_codes LIMIT 1').first('code');
  assert.equal((await call('token', { body: exchange({ code, code_verifier: '' }) })).status, 401);
  assert.equal((await call('token', { body: exchange({ code, code_verifier: '', client_secret: secret }) })).status, 200);
});

test('consent state cannot close the script tag, and still round-trips unchanged', async () => {
  const { authorize } = await createFixture();
  const state = '</script><script>globalThis.untrusted=true</script>&"';
  const res = await authorize({ state }, { session: true });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.equal(html.includes(state), false);
  assert.equal((html.match(/<script(?:\s[^>]*)?>/g) || []).length, 1);
  const serialized = html.match(/const data = (.+);/)[1];
  assert.equal(JSON.parse(serialized).state, state);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

for (const approved of [true, false]) {
  test(`callback preserves registered query values on ${approved ? 'approval' : 'denial'}`, async () => {
    const callback = 'https://kiwistore.example.com/auth/callback?source=web&code=old&error=old&state=old';
    const { decision } = await createFixture({ callback });
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
  '/relative',
  'javascript:alert(1)',
  'https://kiwistore.example.com/auth/callback#fragment',
  'https://user:password@kiwistore.example.com/auth/callback',
]) {
  test(`unsafe callback is rejected even if mistakenly registered: ${callback}`, async () => {
    const { authorize } = await createFixture({ callback });
    assert.equal((await authorize({ redirect_uri: callback })).status, 400);
  });
}

for (const step of ['consent', 'decision']) {
  test(`session refresh cookies survive the OAuth ${step} response`, async () => {
    const { authorize, decision } = await createFixture();
    const options = {
      session: false,
      cookie: 'gothwad_at=expired; gothwad_rt=old-refresh; gothwad_sid=test-session-id',
    };
    const res = step === 'consent' ? await authorize({}, options) : await decision({}, options);
    assert.equal(res.status, 200);
    const cookies = res.headers.getSetCookie();
    assert.ok(cookies.some((c) => c.startsWith('gothwad_at=')));
    assert.ok(cookies.some((c) => c.startsWith('gothwad_rt=') && !c.startsWith('gothwad_rt=old-refresh;')));
    assert.ok(cookies.some((c) => c.startsWith('gothwad_sid=test-session-id;')));
  });
}

test('registry D1 error returns 503 temporarily_unavailable, not unknown-client', async () => {
  const { authorize } = await createFixture({
    failSql: (sql) => sql.includes('FROM ecosystem_apps'),
  });
  const res = await authorize();
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'temporarily_unavailable');
});

test('a genuinely missing client still returns 400 Unknown client_id, not 503', async () => {
  const { rawDb, authorize } = await createFixture();
  await rawDb.prepare("DELETE FROM ecosystem_apps WHERE id = 'kiwi-store'").run();
  const res = await authorize();
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Unknown client_id');
});

test('failed authorization-code persistence never returns a fake callback code and preserves rotated cookies', async () => {
  const { rawDb, decision } = await createFixture({
    failSql: (sql) => sql.includes('INSERT INTO oauth_auth_codes'),
  });
  const res = await decision({}, { session: false, cookie: 'gothwad_at=expired; gothwad_rt=old-refresh; gothwad_sid=test-session-id' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).redirect_url, undefined);
  assert.equal(await rawDb.prepare('SELECT COUNT(*) AS c FROM app_authorizations').first('c'), 0);
  assert.ok(res.headers.getSetCookie().some((c) => c.startsWith('gothwad_rt=') && !c.startsWith('gothwad_rt=old-refresh;')));
});

for (const table of ['oauth_auth_codes', 'oauth_refresh_tokens']) {
  test(`concurrent ${table} consumption has exactly one winner`, { timeout: 5000 }, async () => {
    const { rawDb, call } = await createFixture({
      raceSql: (sql) => sql.includes(`SELECT * FROM ${table}`),
    });
    let body = exchange();
    if (table === 'oauth_auth_codes') {
      await rawDb
        .prepare(
          `INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used)
           VALUES ('test-code', ?, 'test-user', ?, ?, ?, 'S256', ?, 0)`,
        )
        .bind(
          params.client_id,
          native,
          JSON.stringify(['profile', 'email', 'offline_access']),
          challenge,
          new Date(Date.now() + 300_000).toISOString(),
        )
        .run();
    } else {
      await rawDb
        .prepare(
          `INSERT INTO oauth_refresh_tokens (id, token_hash, user_id, client_id, scopes, expires_at, revoked)
           VALUES ('rt-1', ?, 'test-user', ?, '["profile","offline_access"]', ?, 0)`,
        )
        .bind(sha256('test-refresh'), params.client_id, new Date(Date.now() + 60_000).toISOString())
        .run();
      body = { grant_type: 'refresh_token', client_id: params.client_id, refresh_token: 'test-refresh' };
    }
    await rawDb.prepare(`INSERT INTO app_authorizations (id, user_id, app_id, scopes)
      VALUES ('race-grant', 'test-user', ?, '["profile","email","offline_access"]')`).bind(params.client_id).run();
    const password = await rawDb.prepare("SELECT password_hash FROM users WHERE id = 'test-user'").first('password_hash');
    await rawDb.prepare(`INSERT INTO oauth_credential_bindings
      (credential_hash, kind, user_id, client_id, grant_id, password_snapshot, expires_at)
      VALUES (?, ?, 'test-user', ?, 'race-grant', ?, ?)`)
      .bind(sha256(table === 'oauth_auth_codes' ? 'test-code' : 'test-refresh'),
        table === 'oauth_auth_codes' ? 'code' : 'refresh', params.client_id, password,
        new Date(Date.now() + 60_000).toISOString()).run();
    const results = await Promise.all([call('token', { body }), call('token', { body })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal(await rawDb.prepare('SELECT COUNT(*) AS c FROM oauth_refresh_tokens WHERE revoked = 0').first('c'), 1);
  });
}
