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
  const identities = [], backupGoogle = { sub: 'browser-backup-google', email: 'browserbackup@gmail.com' };
  // Simulate old browser cache keys. New callbacks/assets must never touch these.
  let staleDocuments = 0, staleScripts = 0;
  const legacyHtml = '<!doctype html><title>Old Google page</title><p id="google-message">Checking your Google verification</p><script type="module" src="/signin/google/google.js"></script>';
  const staleDocument = route => { staleDocuments++; return route.fulfill({ contentType: 'text/html', body: legacyHtml }); };
  const staleScript = route => { staleScripts++; return route.fulfill({ contentType: 'text/javascript',
    body: "document.getElementById('google-message').textContent = 'Signing in as undefined';" }); };
  await context.route(origin + '/signin/google/', staleDocument);
  await context.route(origin + '/signin/google/google.js', staleScript);

  await context.route('https://accounts.google.com/o/oauth2/v2/auth?**', async route => {
    const auth = new URL(route.request().url()); const code = randomToken();
    planGoogleCode(code, env, auth.searchParams.get('code_challenge'), claims(env, { nonce: auth.searchParams.get('nonce'), ...(identities.shift() || {}) }));
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
  await page.waitForURL(url => url.pathname === '/signin/google/' && url.searchParams.get('ui') === 'accounts-v2');
  await page.locator('#google-onboarding').waitFor({ state: 'visible' });
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.locator('#google-username').fill('browsergoogle');
  await page.locator('#google-confirm-recovery').check(); await page.locator('#google-terms').check();
  await page.locator('#google-create').click();
  await page.waitForURL('**/u/0/me');
  await page.locator('.me-nav-item[data-section="security"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  async function openMethods() {
    await page.locator('#btn-google-settings').click();
    await page.locator('#google-method-form').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.modal').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Methods dialog must not overflow on mobile');
  }
  async function addBackup(passwordless) {
    if (passwordless) identities.push({}, backupGoogle); // Existing authority, then new Google account.
    else { identities.push(backupGoogle); await page.locator('#google-method-password').fill('SyntheticGooglePassword!123'); }
    await page.locator('#google-method-add').click();
    await page.locator('#google-method-form').waitFor({ state: 'detached' });
    await page.waitForURL(url => url.pathname === '/u/0/me');
    await page.getByText('Google account connected, but the email alert could not be delivered.', { exact: true }).waitFor({ state: 'visible' });
    await openMethods();
    assert.equal(await page.locator('[data-google-remove]').count(), 2);
    assert.equal(await page.locator('#google-method-form').getByText(backupGoogle.email, { exact: true }).isVisible(), true);
  }
  // A stale selected-account response must not render another account's methods.
  const methodsUrl = origin + '/api/auth/google/links';
  await context.route(methodsUrl, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ response, json: { ...data, user_id: 'changed-account' } });
  });
  await page.locator('#btn-google-settings').click();
  await page.getByText('The selected account changed. Please reopen Google settings.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#google-method-form').count(), 0);
  await context.unroute(methodsUrl);
  await openMethods();
  assert.equal(await page.locator('[data-google-remove]').count(), 1);
  assert.equal(await page.locator('[data-google-remove]').isDisabled(), true, 'Last Google is protected without a password');
  await addBackup(true);
  assert.equal(await page.locator('#google-method-password').getAttribute('type'), 'hidden', 'Backups do not require adding a password');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.device').filter({ hasText: backupGoogle.email }).locator('[data-google-remove]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-google-remove]').length === 1);
  assert.equal(await page.locator('[data-google-remove]').isDisabled(), true);
  await page.locator('[data-close-modal]').click();
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
  await openMethods();
  await addBackup(false);
  await page.locator('[data-close-modal]').click();
  const firstId = profile.user.id;
  let finishes = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth/google/finish') finishes++;
  });
  async function chooseGoogle() {
    await page.goto(origin + '/signin/?add=1');
    await page.locator('#btn-google-entry').click();
    await page.waitForURL(url => url.pathname === '/signin/google/' && url.searchParams.get('ui') === 'accounts-v2');
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

  identities.push(backupGoogle);
  await chooseGoogle();
  assert.equal(await page.locator('#google-account-list button').count(), 1, 'Backup Google sees only its linked Gothwad account');
  await page.locator('#google-account-list button').click();
  await page.waitForURL('**/u/0/me');
  assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).json())).user.id, firstId);

  assert.equal(staleDocuments, 0, 'Versioned callback avoids the cached old HTML URL');
  assert.equal(staleScripts, 0, 'Hashed entry avoids the cached old JavaScript URL');
  await context.unroute(origin + '/signin/google/', staleDocument);
  await context.unroute(origin + '/signin/google/google.js', staleScript);
  // Cached old HTML plus fresh compatibility source must recover with the same HttpOnly proof.
  await chooseGoogle();
  const beforeRecovery = finishes;
  const oldDocumentUrl = origin + '/signin/google/?legacy-test=1';
  await context.route(oldDocumentUrl, route => route.fulfill({ contentType: 'text/html', body: legacyHtml }));
  await page.goto(oldDocumentUrl);
  await page.waitForURL(url => url.searchParams.get('refresh') === '1');
  await page.locator('#google-chooser').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#google-account-list button').count(), 2);
  assert.equal(finishes, beforeRecovery, 'Legacy document recovery never signs in automatically');
  assert.deepEqual(errors, []);
  console.log('Google browser QA passed: passwordless onboarding, COOP-isolated reauth popup, Add → Change password, cookie-only storage, one/two-account chooser, Add new, keyboard selection and separate account data, stale-cache isolation, legacy-document recovery, Google method list, backup linking/removal, last-method protection and backup sign-in.');
} finally {
  await browser.close(); restore(); rmSync(temp, { recursive: true, force: true });
}
// The imported local server must not keep a completed one-shot QA command alive.
process.exit(0);
