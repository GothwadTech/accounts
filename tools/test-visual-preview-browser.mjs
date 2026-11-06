import { checkDashboardAccessibility } from './visual-preview/accessibility.mjs';
import { checkFinalReviewPhases } from './visual-preview/review-phase345.mjs';
import { checkSecurityRaces } from './visual-preview/review-security-races.mjs';
/** Local-only visual regression: initial twelve and approved UI phases 1–2. */
import { checkReviewPhases } from './visual-preview/review-phase12.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arenaPreviewOrigin } from './preview-origin.mjs';
import { previewBrowserProxy } from './preview-browser-proxy.mjs';

const origin = arenaPreviewOrigin({ ...process.env, DEV_MODE: 'true', LOCAL_PREVIEW_PROXY: 'true', PORT: process.env.PORT || '3002' });
if (!origin) throw new Error('Run against the local Arena preview only. No remote target is supported.');
const local = `http://127.0.0.1:${Number(process.env.PORT || 3002)}`;
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
  const page = await context.newPage();
  await page.goto(shell);
  const frame = page.frameLocator('iframe');
  await frame.locator('#identifier').fill(settings.LOCAL_PREVIEW_USERNAME);
  await frame.locator('#signin-btn').click();
  await frame.locator('#password').fill(settings.LOCAL_PREVIEW_PASSWORD);
  await frame.locator('#signin-btn').click();
  await frame.locator('#dash-root:not(.hidden)').waitFor();
  const app = page.frames().find(candidate => candidate.url().startsWith(origin));
  assert.equal(await frame.locator('#ui-preview-notice').count(), 0);
  assert.equal((await context.cookies(origin)).length, 0);
  await frame.locator('.me-nav-item[data-section="home"] svg').waitFor();
  assert.equal(await frame.locator('#home-security-sub').innerText().then(text => /looks secure/.test(text)), false);
  assert.equal(await frame.locator('#home-security-issues').innerText().then(text => /birth/.test(text)), false);
  for (const width of [1280, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['home', 'personal', 'security', 'data', 'people', 'apps']) {
      if (width <= 960) await frame.locator('#btn-menu').click();
      await frame.locator(`.me-nav-item[data-section="${section}"]`).click();
      await frame.locator('#section-' + section).waitFor({ state: 'visible' });
      assert.equal(new URL(app.url()).hash, '#' + section);
      assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  }
  await frame.locator('#btn-menu').click();
  await frame.locator('.me-nav-item[data-section="security"]').click();
  assert.equal(await frame.locator('#sec-recovery-status').innerText(), 'Not verified');
  assert.notEqual(await frame.locator('#sec-pw-last').innerText(), '—');
  assert.equal(await frame.locator('#btn-passkey-settings .setting-main').count(), 1);
  assert.equal(await frame.locator('#btn-passkey-settings .setting-label').evaluate(node => getComputedStyle(node).display), 'block');
  await frame.locator('#search-input').fill('Google');
  await frame.getByRole('option', { name: /Google accounts/ }).click();
  await frame.getByRole('dialog', { name: 'Google accounts' }).waitFor();
  await frame.locator('[data-close-modal]').click();
  await frame.locator('#search-input').fill('Passkeys');
  await frame.getByRole('option', { name: /Passkeys/ }).click();
  await frame.getByRole('dialog', { name: 'Passkeys' }).waitFor();
  await frame.locator('[data-close-modal]').click();
  await app.goto(app.url());
  await frame.locator('#section-security:not(.hidden)').waitFor();
  assert.equal((await context.cookies(origin)).length, 0);
  if (process.env.VISUAL_QA_SCOPE !== 'final') await checkReviewPhases({ page, frame, app, context, origin });
  await checkFinalReviewPhases({ page, frame, app, context, origin });
  await checkSecurityRaces({ page, frame, app, context, origin });
  await checkDashboardAccessibility({ page, frame, app, origin });
  await context.route('**/api/auth/activity', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary failure"}' }));
  await app.goto(origin + '/u/0/me?case=failed-activity#home');
  await frame.locator('#home-activity').getByRole('button', { name: 'Retry' }).waitFor();
  assert.equal(await frame.locator('#home-activity').innerText().then(text => /No recent activity/.test(text)), false);
  await context.unroute('**/api/auth/activity');
  await frame.locator('#home-activity').getByRole('button', { name: 'Retry' }).click();
  await frame.locator('#home-activity .activity-item').waitFor();
  await context.route('**/api/oauth/authorizations', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary failure"}' }));
  await app.goto(origin + '/u/0/me?case=failed-apps#apps');
  await frame.locator('#connected-list').getByRole('button', { name: 'Retry' }).waitFor();
  await context.unroute('**/api/oauth/authorizations');
  await frame.locator('#connected-list').getByRole('button', { name: 'Retry' }).click();
  await frame.locator('#gothwad-services-list .device').first().waitFor();
  await app.goto(origin + '/u/0/me?case=overview#home');
  await frame.locator('#home-activity .activity-item').waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/accounts-first12-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: '/tmp/accounts-first12-mobile.png', animations: 'disabled' });
  await app.evaluate(async () => fetch('/api/auth/signout', { method: 'POST', body: '{}' }));
  await app.goto(origin + '/signin/?form=1');
  await frame.locator('#identifier').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('PASS: all approved UI phase checks;  simulated login/dashboard/reload without cookies, six desktop/mobile sections, URL state, local SVG icons, truthful security fields, Google/passkey search dialogs, API failure + Retry, no preview strip, no overflow and no JS errors.');
} finally { await browser?.close(); await proxy.close(); }
