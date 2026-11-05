/** Entry pages must remain lightweight without changing security/session discovery. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('entry screens do not block rendering on external fonts or replay a full-screen fade', () => {
  for (const page of ['signin', 'signup']) {
    assert.doesNotMatch(read(`web/${page}/index.html`), /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(read(`web/${page}/css/${page}.css`), /animation:|@keyframes/);
  }
});

test('entry pages use one small hashed entry and a preloaded shared bundle, not a module waterfall', () => {
  const shared = [];
  for (const page of ['signin', 'signup']) {
    const html = read(`web/${page}/index.html`);
    const scripts = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)];
    assert.equal(scripts.length, 1);
    const entry = scripts[0][1];
    assert.match(entry, new RegExp(`^/assets/auth/${page}-[A-Z0-9]{8}\\.js$`));
    const preload = html.match(/rel="modulepreload" href="(\/assets\/auth\/shared-[A-Z0-9]{8}\.js)"/);
    assert.ok(preload);
    shared.push(preload[1]);
    for (const asset of [entry, preload[1]]) assert.ok(existsSync(new URL('../web' + asset, import.meta.url)));
    const bundle = read('web' + entry), common = read('web' + preload[1]);
    assert.ok(Buffer.byteLength(bundle) + Buffer.byteLength(common) < 40_000, 'Keep each entry plus shared code below 40 KB uncompressed');
    assert.ok(gzipSync(bundle).length + gzipSync(common).length < 15_000, 'Keep compressed entry code below 15 KB');
  }
  assert.equal(shared[0], shared[1], 'Reuse the same content-hashed shared module across both screens');
});

test('bundling preserves session checks and native URL/context navigation', () => {
  for (const page of ['signin', 'signup']) {
    assert.match(read(`web/${page}/js/${page}.js`), /redirectIfAuthed\(/);
    const html = read(`web/${page}/index.html`);
    assert.match(html, /href="\/signin"/);
    assert.match(html, /href="\/signup"/);
  }
  const api = read('web/js/api.js');
  assert.match(api, /credentials: 'include'/);
  assert.match(read('web/js/common.js'), /carryNextOnAuthLinks/);
});
