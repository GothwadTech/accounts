import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as entrypoint from '../cloudflare-worker/src/worker.ts';
import * as library from '../cloudflare-worker/src/index.ts';

test('deployment exposes only the fetch handler while library compatibility exports remain available', () => {
  assert.deepEqual(Object.keys(entrypoint), ['default']);
  assert.equal(entrypoint.default, library.default);
  assert.equal(typeof entrypoint.default.fetch, 'function');
  assert.ok(Array.isArray(library.ACCOUNT_SLOTS));
  const config = readFileSync(new URL('../cloudflare-worker/wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /main = "src\/worker\.ts"/);
});
