/** Proxy regression: exact preview origins must work without widening production CSRF. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { arenaPreviewOrigin } from '../tools/preview-origin.mjs';
import { ensurePreviewAccount } from '../tools/preview-account.mjs';
import { isUnsafeBrowserMutation } from '../cloudflare-worker/src/origins.ts';

const local = { DEV_MODE: 'true', LOCAL_PREVIEW_PROXY: 'true', E2B_SANDBOX_ID: 'syntheticpreview', PORT: '3000' };

test('public origin is exact, opt-in, local-only and derived from trusted process configuration', () => {
  assert.equal(arenaPreviewOrigin({}), null);
  assert.equal(arenaPreviewOrigin({ ...local, LOCAL_PREVIEW_PROXY: 'false' }), null);
  assert.equal(arenaPreviewOrigin({ ...local, E2B_SANDBOX_ID: '' }), null);
  assert.equal(arenaPreviewOrigin(local), 'https://3000-syntheticpreview.e2b.app');
  for (const override of [{ NODE_ENV: 'production' }, { DEV_MODE: 'false' }, { CI: 'true' }, { CF_PAGES: '1' },
    { WORKERS_CI: '1' }, { PORT: '0' }, { PORT: '65536' }, { PORT: '3000/path' },
    { E2B_SANDBOX_ID: 'other.example/path' }, { E2B_SANDBOX_ID: 'x.e2b.app@evil' }]) {
    assert.throws(() => arenaPreviewOrigin({ ...local, ...override }));
  }
});

test('production CSRF still rejects preview, arbitrary, null and missing browser origins', () => {
  const env = { DEV_MODE: 'false', APP_DOMAIN: 'example.test', AUTH_HUB_URL: 'https://accounts.example.test' };
  for (const origin of ['https://3000-syntheticpreview.e2b.app', 'https://evil.test', 'null', undefined]) {
    const request = new Request(env.AUTH_HUB_URL + '/api/auth/signin', {
      method: 'POST', headers: origin === undefined ? {} : { Origin: origin },
    });
    assert.equal(isUnsafeBrowserMutation(request, env), true);
  }
  assert.equal(isUnsafeBrowserMutation(new Request(env.AUTH_HUB_URL + '/api/auth/signin', {
    method: 'POST', headers: { Origin: env.AUTH_HUB_URL },
  }), env), false);
});

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('real local HTTP server accepts preview login behind rewritten Host/protocol but rejects foreign origins', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'accounts-proxy-csrf-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM'); await exited;
    }
    rmSync(root, { recursive: true, force: true });
  });
  const settings = { DEV_MODE: 'true', LOCAL_PREVIEW_USERNAME: 'proxytest', LOCAL_PREVIEW_PASSWORD: 'SyntheticProxy123' };
  const { databasePath } = await ensurePreviewAccount(root, settings);
  const port = String(await freePort()), origin = arenaPreviewOrigin({ ...local, PORT: port });
  child = spawn(process.execPath, ['--experimental-strip-types', 'server.js'], {
    cwd: process.cwd(), env: { ...process.env, ...local, NODE_ENV: 'development', CI: '', CF_PAGES: '', WORKERS_CI: '',
      PORT: port, LOCAL_D1_PATH: databasePath, AUTH_HUB_URL: '', ALLOWED_ORIGINS: '',
      JWT_SECRET: 'synthetic-preview-csrf-test-key', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Local proxy test server did not start')), 15000);
    child.stdout.on('data', chunk => {
      log += chunk;
      if (log.includes('running on http://')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Local proxy test server exited before ready')); });
  });
  const document = await fetch(`http://127.0.0.1:${port}/signin/?form=1`);
  const html = await document.text();
  assert.doesNotMatch(html, /local-preview-frame-notice/);
  assert.doesNotMatch(html, /__local-preview/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/__local-preview/frame.js`)).status, 404);
  const post = (route, body, extra = {}) => fetch(`http://127.0.0.1:${port}/api/auth/${route}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  });
  for (const extra of [{}, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'untrusted.example' }]) {
    const response = await post('check-identifier', { identifier: settings.LOCAL_PREVIEW_USERNAME }, extra);
    assert.equal(response.status, 200, 'HTTPS preview Origin must survive an internal HTTP Host');
  }
  for (const rejected of ['https://3000-anothersandbox.e2b.app', origin + '.evil.test', 'https://evil.test', 'null']) {
    const response = await post('check-identifier', { identifier: settings.LOCAL_PREVIEW_USERNAME }, { Origin: rejected });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'csrf_rejected');
  }
  const anonymous = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
  assert.equal(anonymous.status, 401, 'preview must not auto-authenticate a visitor');
  const incorrect = await post('signin', { identifier: settings.LOCAL_PREVIEW_USERNAME, password: 'IncorrectSyntheticPassword' });
  assert.equal(incorrect.status, 401, 'preview must validate the real password');
  const signed = await post('signin', { identifier: settings.LOCAL_PREVIEW_USERNAME, password: settings.LOCAL_PREVIEW_PASSWORD });
  assert.equal(signed.status, 200);
  const cookies = signed.headers.getSetCookie();
  assert.ok(cookies.some(cookie => /^gothwad_sess_[a-f]=/.test(cookie)));
  for (const cookie of cookies) {
    assert.match(cookie, /; Secure/); assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=None/); assert.match(cookie, /; Partitioned/); assert.doesNotMatch(cookie, /; Domain=/);
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { Cookie: cookies.map(cookie => cookie.split(';')[0]).join('; ') },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.username, settings.LOCAL_PREVIEW_USERNAME);
});
