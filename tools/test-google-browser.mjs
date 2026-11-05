/** Local, synthetic Google-provider browser QA. Never points at production or real Google. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { googleEnv, claims, mockGoogle, planGoogleCode } from '../tests/helpers/google-harness.mjs';
import { randomToken } from '../cloudflare-worker/src/crypto.ts';

const port = process.env.GOOGLE_BROWSER_PORT || '3013';
const origin = `http://localhost:${port}`;
const temp = mkdtempSync(path.join(tmpdir(), 'accounts-google-qa-'));
const env = googleEnv({ AUTH_HUB_URL: origin });
Object.assign(process.env, { PORT: port, LOCAL_D1_PATH: path.join(temp, 'qa.sqlite'), AUTH_HUB_URL: origin,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET, DEV_MODE: 'true' });
let restore;
mockGoogle({ after: fn => { restore = fn; } });
const require = process.env.BROWSER_TOOLS_PATH
  ? createRequire(path.join(process.env.BROWSER_TOOLS_PATH, 'package.json')) : createRequire(import.meta.url);
const { chromium: playwright } = require('playwright');
let launch = { headless: true };
if (process.env.SERVERLESS_CHROMIUM === 'true') {
  const { default: chromium, setupLambdaEnvironment } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const { inflate } = await import(pathToFileURL(path.join(path.dirname(require.resolve('@sparticuz/chromium')), 'lambdafs.js')).href);
  await inflate(path.join(path.dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br'));
  setupLambdaEnvironment('/tmp/al2023/lib');
  launch = { ...launch, executablePath: await chromium.executablePath(), args: chromium.args.filter(arg =>
    !['--disable-web-security', '--disable-site-isolation-trials'].includes(arg) && !arg.startsWith('--disable-features=')) };
}
const browser = await playwright.launch(launch);
try {
  // The server uses an isolated temporary database and synthetic credentials only.
  await import('../server.js');
  const context = await browser.newContext();
  await context.route('https://accounts.google.com/o/oauth2/v2/auth?**', async route => {
    const auth = new URL(route.request().url()); const code = randomToken();
    planGoogleCode(code, env, auth.searchParams.get('code_challenge'), claims(env, { nonce: auth.searchParams.get('nonce') }));
    const callback = origin + '/api/auth/google/callback?' + new URLSearchParams({ code, state: auth.searchParams.get('state') });
    // A real cross-origin document with COOP simulates Google's opener isolation.
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html', 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: `<meta http-equiv="refresh" content="0;url=${callback.replaceAll('&', '&amp;')}"><p>Synthetic Google verification</p>` });
  });
  // No fonts or other external assets are needed for this offline test.
  await context.route('https://fonts.**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  context.on('page', popup => popup.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/signup/');
  await page.locator('#btn-google-entry').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('btn-google-entry').disabled);
  await page.locator('#btn-google-entry').click();
  await page.waitForURL('**/signin/google/');
  await page.locator('#google-onboarding').waitFor({ state: 'visible' });
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.locator('#google-username').fill('browsergoogle');
  await page.locator('#google-confirm-recovery').check(); await page.locator('#google-terms').check();
  await page.locator('#google-create').click();
  await page.waitForURL('**/u/0/me');
  await page.locator('.me-nav-item[data-section="security"]').click();
  await page.locator('[data-dialog="password"]').filter({ hasText: 'Add password' }).first().click();
  assert.equal(await page.locator('#dlg-current-pw').getAttribute('type'), 'hidden');
  await page.locator('#dlg-new-pw').fill('SyntheticGooglePassword!123');
  await page.locator('#dlg-confirm-pw').fill('SyntheticGooglePassword!123');
  const added = page.waitForResponse(response => response.url().endsWith('/auth/add-password'));
  added.catch(() => {});
  await page.locator('#dlg-save').click();
  assert.equal((await added).status(), 200);
  await page.locator('[data-dialog="password"]').filter({ hasText: 'Change password' }).first().waitFor();
  const profile = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  assert.equal(profile.user.has_password, true); assert.equal(profile.user.google_linked, true);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  assert.doesNotMatch(JSON.stringify(storage), /access_token|refresh_token|gothwad_google_|gothwad_sess_|SyntheticGooglePassword/);
  const firstId = profile.user.id;
  let finishes = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth/google/finish') finishes++;
  });
  async function chooseGoogle() {
    await page.goto(origin + '/signin/?add=1');
    await page.locator('#btn-google-entry').click();
    await page.waitForURL('**/signin/google/');
    await page.locator('#google-chooser').waitFor({ state: 'visible' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseGoogle();
  assert.equal(await page.locator('#google-account-list button').count(), 1);
  assert.equal(finishes, 0, 'Existing Google accounts must not auto-sign in');
  await page.locator('#google-add-new').click();
  await page.locator('#google-choose-back').click();
  assert.equal(await page.locator('#google-account-list button').count(), 1);
  await page.locator('#google-add-new').click();
  await page.locator('#google-username').fill('browsergoogletwo');
  await page.locator('#google-confirm-recovery').check(); await page.locator('#google-terms').check();
  await page.locator('#google-create').click();
  await page.waitForURL('**/u/1/me');
  const second = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  assert.notEqual(second.user.id, firstId); assert.equal(second.user.has_password, false);
  await chooseGoogle();
  assert.equal(await page.locator('#google-account-list button').count(), 2);
  assert.equal(finishes, 1);
  const rows = page.locator('#google-account-list button');
  const lastRow = await rows.last().boundingBox(), addNew = await page.locator('#google-add-new').boundingBox();
  assert.ok(addNew.y >= lastRow.y + lastRow.height, 'Existing accounts appear above Add new');
  await rows.filter({ hasText: 'browsergoogletwo@' }).focus();
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await page.waitForURL('**/u/1/me');
  assert.equal(finishes, 2);
  assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).json())).user.id, second.user.id);
  await chooseGoogle();
  await page.locator('#google-account-list button').filter({ hasText: 'browsergoogle@' }).click();
  await page.waitForURL('**/u/0/me');
  assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).json())).user.id, firstId);
  assert.deepEqual(errors, []);
  console.log('Google browser QA passed: passwordless onboarding, COOP-isolated reauth popup, Add → Change password, cookie-only storage, one/two-account chooser, Add new, keyboard selection and separate account data.');
} finally {
  await browser.close(); restore(); rmSync(temp, { recursive: true, force: true });
}
// The imported local server must not keep a completed one-shot QA command alive.
process.exit(0);
