/** Visual-only login simulation is separate from production authentication and never emits real sessions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVisualPreview } from '../tools/visual-preview/server.mjs';
const settings = { LOCAL_PREVIEW_USERNAME: 'visualuser', LOCAL_PREVIEW_PASSWORD: 'SyntheticVisual123' };
test('visual simulator refuses production/CI and requires private configuration', () => {
  for (const environment of [{}, { VISUAL_PREVIEW: 'true', NODE_ENV: 'production' }, { VISUAL_PREVIEW: 'true', CI: 'true' }]) assert.throws(() => createVisualPreview(environment, settings));
  assert.throws(() => createVisualPreview({ VISUAL_PREVIEW: 'true' }, {}));
  const source = readFileSync(new URL('../tools/visual-preview/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /cloudflare-worker|local-d1|JWT_SECRET|Set-Cookie/);
  assert.doesNotMatch(readFileSync('server.js', 'utf8'), /visual-preview|__visual/);
});
test('visual screens use shared markup, simulate login with no cookies, and do not claim real authentication', async t => {
  const server = createVisualPreview({ VISUAL_PREVIEW: 'true' }, settings);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const signin = await fetch(origin + '/signin/');
  const html = await signin.text();
  assert.match(html, /id="identifier"/); assert.doesNotMatch(html, /__visual/);
  assert.doesNotMatch(html, /ui-preview-notice|UI-only preview/);
  assert.equal((await fetch(origin + '/api/auth/me')).status, 401);
  const post = body => fetch(origin + '/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ identifier: 'visualuser', password: 'incorrect' })).status, 401);
  const signed = await post({ identifier: 'visualuser', password: settings.LOCAL_PREVIEW_PASSWORD });
  assert.equal(signed.status, 200); assert.deepEqual(signed.headers.getSetCookie(), []);
  const data = await signed.json(); assert.equal(data.user.username, 'visualuser'); assert.equal(data.access_token, undefined);
  assert.equal((await fetch(origin + '/api/auth/me', { headers: { 'X-Visual-Preview-State': 'in' } })).status, 200);
  assert.equal((await fetch(origin + '/api/auth/google/start', { method: 'POST', body: '{}', headers: { 'X-Visual-Preview-State': 'in' } })).status, 409);
});
