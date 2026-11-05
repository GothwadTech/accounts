/** The pre-chooser frontend must not be reused with the explicit-choice API. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { googleEnv, GoogleJar, mockGoogle, beginGoogle } from './helpers/google-harness.mjs';
const read = file => readFileSync(file, 'utf8');

test('Google callback uses a fresh UI URL and preserves no-store on success/failure', async t => {
  mockGoogle(t); const env = googleEnv(), jar = new GoogleJar();
  const flow = await beginGoogle(env, jar);
  const success = await jar.fetch(env, flow.callback, { origin: null });
  const target = new URL(success.headers.get('Location'));
  assert.equal(target.origin, env.AUTH_HUB_URL);
  assert.equal(target.pathname, '/signin/google/');
  assert.equal(target.searchParams.get('ui'), 'accounts-v2');
  assert.match(success.headers.get('Cache-Control'), /no-store/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 0);
  const replay = await jar.fetch(env, flow.callback, { origin: null });
  const failure = new URL(replay.headers.get('Location'));
  assert.equal(failure.searchParams.get('ui'), 'accounts-v2');
  assert.equal(failure.searchParams.get('error'), '1');
  assert.match(replay.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual([...target.searchParams.keys()], ['ui'], 'No credentials or provider codes in the UI URL');
});

test('Google HTML references hashed code, never the cached pre-chooser source URL', () => {
  const html = read('web/signin/google/index.html');
  const entry = html.match(/data-auth-entry="google" src="(\/assets\/auth\/google-[A-Z0-9]{8}\.js)"/);
  assert.ok(entry); assert.ok(existsSync('web' + entry[1]));
  assert.doesNotMatch(html, /src="\/signin\/google\/google\.js"/);
  assert.doesNotMatch(read('web' + entry[1]), /from[\s]*['"]\.\//, 'Google bundle has no stale module/chunk dependency');
  assert.match(read('web/_headers'), /\/signin\/google\/\*\n  Cache-Control: no-store/);
  assert.match(read('web/js/google-auth.js'), /cache: 'no-store'/);
  assert.doesNotMatch(read('web/signin/google/google.js'), /Signing in as|return finish\(\)/);
});

test('fresh source on legacy markup refreshes once without selecting or consuming a proof', () => {
  const source = read('web/signin/google/google.js').replace(/^import .*;\n/gm, '');
  for (const query of ['', '?reauth=1', '?error=1']) {
    const replacements = [], message = { textContent: 'Checking your Google verification' };
    const location = { href: 'https://accounts.example.test/signin/google/' + query, replace: url => replacements.push(url) };
    const context = { URL, location, document: { getElementById: id => id === 'google-message' ? message : null },
      fetch() { assert.fail('Legacy markup must never issue automatic API requests'); } };
    vm.runInNewContext(source, context);
    assert.equal(replacements.length, 1);
    const refreshed = new URL(replacements[0]);
    assert.equal(refreshed.searchParams.get('refresh'), '1');
    if (query) assert.equal(refreshed.searchParams.get(query.slice(1).split('=')[0]), '1');
    location.href = refreshed.href;
    vm.runInNewContext(source, context);
    assert.equal(replacements.length, 1, 'No reload loop when an outdated deployment still serves old markup');
    assert.match(message.textContent, /Accounts is updating/);
  }
});
