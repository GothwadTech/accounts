/** Optional local-only regression for partitioned embedded-preview sessions without traffic tokens or cookie-jar shortcuts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arenaPreviewOrigin } from './preview-origin.mjs';
import { previewBrowserProxy } from './preview-browser-proxy.mjs';

const origin = arenaPreviewOrigin({ ...process.env, DEV_MODE: 'true', LOCAL_PREVIEW_PROXY: 'true' });
if (!origin) throw new Error('Run against the local Arena preview only. No remote target is supported.');
const local = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;
const settings = parseEnv(readFileSync('.env.preview', 'utf8'));
const require = process.env.BROWSER_TOOLS_PATH
  ? createRequire(path.join(process.env.BROWSER_TOOLS_PATH, 'package.json')) : createRequire(import.meta.url);
const { chromium: playwright } = require('playwright');
// Override Playwright's default switch that disables third-party storage partitioning.
let launch = { headless: true, args: ['--disable-features=OptimizationHints,MediaRouter'] };
if (process.env.SERVERLESS_CHROMIUM === 'true') {
  const { default: chromium, setupLambdaEnvironment } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const { inflate } = await import(pathToFileURL(path.join(path.dirname(require.resolve('@sparticuz/chromium')), 'lambdafs.js')).href);
  await inflate(path.join(path.dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br'));
  setupLambdaEnvironment('/tmp/al2023/lib');
  launch = { ...launch, executablePath: await chromium.executablePath(), args: [...chromium.args.filter(arg =>
    !['--disable-web-security', '--disable-site-isolation-trials'].includes(arg) && !arg.startsWith('--disable-features=')), ...launch.args] };
}
const shell = 'https://local-preview-shell.example.test', otherShell = 'https://other-shell.invalid.test';
const proxy = await previewBrowserProxy(origin, local, [shell, otherShell]);
// Use actual HTTPS responses: route.fulfill can lose the cookie partition key.
// All DNS maps to loopback; TLS is temporary/self-signed and test-only.
launch.args.push('--no-proxy-server', `--host-resolver-rules=MAP * 127.0.0.1:${proxy.port}`);
let browser;
try {
  browser = await playwright.launch(launch);
  const context = await browser.newContext({ ignoreHTTPSErrors: true }), errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const embedded = await context.newPage();
  const cdp = await context.newCDPSession(embedded);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookieControls', { enableThirdPartyCookieRestriction: true,
    disableThirdPartyCookieMetadata: true, disableThirdPartyCookieHeuristics: true });
  await embedded.goto(shell);
  const frame = embedded.frameLocator('iframe');
  assert.equal(await frame.locator('#local-preview-frame-notice').count(), 0);
  assert.equal(await frame.locator('#ui-preview-notice').count(), 0);
  await frame.locator('#identifier').fill(settings.LOCAL_PREVIEW_USERNAME);
  await frame.locator('#signin-btn').click();
  await frame.locator('#password').fill('IncorrectSyntheticPassword');
  const rejected = embedded.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/signin' && response.request().method() === 'POST');
  await frame.locator('#signin-btn').click();
  assert.equal((await rejected).status(), 401);
  await frame.locator('#alert-signin').filter({ hasText: 'Incorrect password' }).waitFor();
  await frame.locator('#password').fill(settings.LOCAL_PREVIEW_PASSWORD);
  await frame.locator('#signin-btn').click();
  await frame.locator('#dash-root:not(.hidden)').waitFor();
  const dashboard = embedded.frames().find(candidate => candidate.url().startsWith(origin));
  assert.equal(new URL(dashboard.url()).pathname, '/u/0/me');
  await dashboard.goto(dashboard.url());
  await frame.locator('#dash-root:not(.hidden)').waitFor();
  const me = await dashboard.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).json());
  assert.equal(me.user.username, settings.LOCAL_PREVIEW_USERNAME);
  const cookies = (await context.cookies(origin)).filter(cookie => cookie.name.startsWith('gothwad_sess_'));
  assert.ok(cookies.length > 0);
  for (const cookie of cookies) {
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'None');
    assert.ok(cookie.partitionKey, 'browser must actually store the session as partitioned');
    assert.equal(cookie.domain, new URL(origin).hostname);
  }
  for (const width of [1280, 390]) {
    await embedded.setViewportSize({ width, height: 900 });
    for (const section of ['home', 'personal', 'security', 'data', 'people', 'apps']) {
      if (width === 390) await frame.locator('#btn-menu').click();
      await frame.locator(`.me-nav-item[data-section="${section}"]`).click();
      await frame.locator('#section-' + section).waitFor({ state: 'visible' });
    }
  }
  // A different top-level site must not inherit the first iframe's session.
  const isolated = await context.newPage();
  await isolated.goto(otherShell);
  const otherFrame = isolated.frameLocator('iframe');
  await otherFrame.locator('#identifier').waitFor();
  const isolatedStatus = await otherFrame.locator('body').evaluate(async () => (await fetch('/api/auth/me')).status);
  assert.equal(isolatedStatus, 401);
  const directTab = await context.newPage();
  assert.equal((await directTab.goto(origin + '/signin/?form=1')).status(), 403,
    'modeled gateway must deny direct tabs; iframe login must not depend on them');
  // Clearing cookies must target the same partition, including active/slot metadata.
  const signout = await dashboard.evaluate(async () => (await fetch('/api/auth/signout', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })).status);
  assert.equal(signout, 200);
  assert.equal((await dashboard.evaluate(async () => (await fetch('/api/auth/me')).status)), 401);
  assert.equal((await context.cookies(origin)).filter(cookie => cookie.name.startsWith('gothwad_sess_')).length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: native iframe login, dashboard reload, six desktop/mobile sections, top-site cookie isolation, and partitioned signout; cookies remain host-only/Secure/HttpOnly and no standalone tab or traffic token is used.');
} finally { await browser?.close(); await proxy.close(); }
