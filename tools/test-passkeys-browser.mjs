/** Local-only UI smoke check using Chromium's virtual authenticator. Optional QA dependencies. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const target = new URL(process.env.PASSKEY_BROWSER_URL || 'http://localhost:3010');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Browser smoke checks require a local development server');
const require = process.env.BROWSER_TOOLS_PATH
  ? createRequire(path.join(process.env.BROWSER_TOOLS_PATH, 'package.json')) : createRequire(import.meta.url);
const { chromium: playwright } = require('playwright');
let launch = { headless: true };
if (process.env.SERVERLESS_CHROMIUM === 'true') {
  const { default: chromium, setupLambdaEnvironment } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const { inflate } = await import(pathToFileURL(path.join(path.dirname(require.resolve('@sparticuz/chromium')), 'lambdafs.js')).href);
  const bins = path.join(path.dirname(require.resolve('@sparticuz/chromium')), '../bin');
  await inflate(path.join(bins, 'al2023.tar.br'));
  setupLambdaEnvironment('/tmp/al2023/lib');
  launch = { ...launch, executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => !['--disable-web-security', '--disable-site-isolation-trials'].includes(arg) && !arg.startsWith('--disable-features=')) };
}
const browser = await playwright.launch(launch);
try {
  const page = await browser.newPage();
  const violations = [];
  if (process.env.BROWSER_DEBUG === 'true') {
    page.on('pageerror', error => console.error('Browser error:', error.message));
    page.on('response', response => { if (response.url().includes('/passkeys/')) console.error(response.status(), response.url()); });
  }
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event =>
    window.__cspViolations = [...(window.__cspViolations || []), event.violatedDirective]));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const username = `browserkey${Date.now()}`;
  const password = 'SyntheticBrowserPassword!123';
  await page.goto(target.origin + '/signin');
  const signup = await page.evaluate(async ({ username, password }) => {
    const result = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, first_name: 'Browser', last_name: 'Passkey', recovery_email: 'synthetic@example.test' }) });
    return { status: result.status, data: await result.json() };
  }, { username, password });
  assert.equal(signup.status, 201, JSON.stringify(signup.data));
  assert.equal(signup.data.access_token, undefined);
  await page.goto(target.origin + '/u/0/me');
  await page.locator('.me-nav-item[data-section="security"]').click();
  await page.locator('#btn-passkey-settings').click();
  await page.locator('#passkey-password').fill(password);
  await page.locator('#passkey-name').fill('Browser virtual key');
  const registration = page.waitForResponse(response => response.url().endsWith('/auth/passkeys/register/verify'));
  registration.catch(() => {});
  await page.locator('#passkey-add').click();
  try { assert.equal((await registration).status(), 200); }
  catch (error) { console.error('Registration UI:', await page.locator('#passkey-error').textContent()); throw error; }
  await page.locator('#dialog-root li').filter({ hasText: 'Browser virtual key' }).waitFor();
  const status = await page.evaluate(async () => (await fetch('/api/auth/passkeys/list')).json());
  assert.equal(status.passkeys.length, 1);
  assert.equal(status.passkeys[0].public_key, undefined);
  violations.push(...await page.evaluate(() => window.__cspViolations || []));
  await page.evaluate(() => fetch('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await page.goto(target.origin + '/signin');
  await page.locator('#identifier').fill(username);
  let loginResult;
  await page.route('**/api/auth/passkeys/login/verify', async route => {
    const upstream = await route.fetch();
    loginResult = { status: upstream.status(), data: await upstream.json() };
    await route.fulfill({ response: upstream });
  });
  const verified = page.waitForResponse(response => response.url().endsWith('/auth/passkeys/login/verify'));
  await page.locator('#signin-passkey').click();
  const response = await verified;
  assert.equal(response.status(), 200, JSON.stringify(loginResult));
  const signed = loginResult.data;
  for (const key of ['access_token', 'refresh_token', 'session_id']) assert.equal(signed[key], undefined);
  await page.waitForURL('**/u/0/me');
  await page.locator('.me-nav-item[data-section="security"]').click();
  await page.locator('#btn-passkey-settings').click();
  await page.locator('#passkey-password').fill(password);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-passkey-remove="0"]').click();
  await page.getByText('No passkeys registered.', { exact: true }).waitFor();
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  assert.doesNotMatch(JSON.stringify(storage), /access_token|refresh_token|gothwad_sess_|SyntheticBrowserPassword|Browser virtual key/);
  violations.push(...await page.evaluate(() => window.__cspViolations || []));
  assert.deepEqual(violations, []);
  const executed = await page.evaluate(() => {
    window.__cspViolations = [];
    window.__blockedScriptRan = false;
    const script = document.createElement('script');
    script.textContent = 'window.__blockedScriptRan = true';
    document.head.append(script);
    return window.__blockedScriptRan;
  });
  assert.equal(executed, false, 'CSP must block an injected inline script');
  await page.waitForFunction(() => (window.__cspViolations || []).includes('script-src-elem'));

  console.log('PASS: real Chromium WebAuthn enrollment, key listing, signed-out passwordless login, deletion, cookie-only JSON, Web Storage and CSP checks. Synthetic local virtual authenticator only.');
} finally { await browser.close(); }
