/** Optional local Chromium QA for entry-step layout and navigation; no production access. */
import assert from 'node:assert/strict';
import { checkKeyboard } from './auth-keyboard-checks.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const target = new URL(process.env.AUTH_ENTRY_BROWSER_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Use a local development server only');
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
async function fieldGeometry(page, id) {
  return page.evaluate(id => {
    const input = document.getElementById(id);
    const box = input.closest('.btn-field-box');
    const label = document.querySelector(`label[for="${id}"]`);
    const bounds = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, height: r.height }; };
    const style = getComputedStyle(box);
    return { label: bounds(label), box: bounds(box), padding: style.paddingLeft, radius: style.borderRadius };
  }, id);
}
const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.6, `${message}: ${actual} vs ${expected}`);
async function checkSpacing(page) {
  await page.goto(target.origin + '/signup/?form=1');
  const first = await fieldGeometry(page, 'first_name'), last = await fieldGeometry(page, 'last_name');
  closeTo(first.box.top - first.label.bottom, 6, 'Create New label gap');
  closeTo(last.label.top - first.box.bottom, 12, 'Create New field gap');
  const createNext = await page.locator('#btn-step-1-next').boundingBox();
  const optional = await page.locator('.auth-optional-action').boundingBox();
  closeTo(optional.y - last.box.bottom, 12, 'Last name to optional details');
  closeTo(createNext.y - optional.y - optional.height, 12, 'Optional details to Next');
  await page.locator('#signup-optional-toggle').click();
  assert.equal(await page.locator('#signup-optional-toggle').getAttribute('aria-expanded'), 'true');
  const birthday = await fieldGeometry(page, 'birth-day');
  closeTo(birthday.box.top - birthday.label.bottom, 6, 'Optional birthday label gap');
  closeTo(await page.evaluate(() => document.querySelector('label[for="birth-day"]').getBoundingClientRect().top -
    document.querySelector('.auth-optional-action').getBoundingClientRect().bottom), 12, 'Toggle to birthday field');
  closeTo(birthday.box.height, first.box.height, 'Matching birthday input height');
  const segments = await page.locator('.birthday-box .input').evaluateAll(inputs => inputs.map(input => {
    const r = input.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, type: input.type };
  }));
  assert.equal(segments.length, 3);
  for (const segment of segments) { closeTo(segment.y, segments[0].y, 'Segments share one horizontal row'); assert.equal(segment.type, 'text'); }
  closeTo(segments[1].x, segments[0].x + segments[0].width, 'Day/Month have no external gap');
  closeTo(segments[2].x, segments[1].x + segments[1].width, 'Month/Year have no external gap');

  assert.notEqual(await page.locator('.optional-chevron').evaluate(el => getComputedStyle(el).transform), 'none');
  await page.locator('#signup-optional-toggle').click();
  assert.equal(await page.locator('#birth-day').isVisible(), false);
  await page.locator('#first_name').fill('Layout'); await page.locator('#last_name').fill('Tester');
  await page.locator('#btn-step-1-next').click();
  const password = await fieldGeometry(page, 'password');
  closeTo(password.box.top - password.label.bottom, 6, 'Combined password label gap');
  closeTo(password.box.height, first.box.height, 'Matching password input height');
  closeTo(await page.evaluate(() => document.querySelector('label[for="password"]').getBoundingClientRect().top -
    document.getElementById('username').closest('.auth-field-group').getBoundingClientRect().bottom), 12, 'Email group to password');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(target.origin + '/signin/?form=1');
  const identifier = await fieldGeometry(page, 'identifier');
  closeTo(identifier.box.top - identifier.label.bottom, 6, 'Sign In label gap');
  closeTo(identifier.box.height, first.box.height, 'Matching input heights');
  closeTo(identifier.label.left, identifier.box.left, 'Sign In label alignment');
  assert.equal(identifier.padding, first.padding); assert.equal(identifier.radius, first.radius);
  const forgot = await page.locator('#step-identifier .auth-recovery-action').boundingBox();
  const next = await page.locator('#signin-btn').boundingBox();
  closeTo(forgot.y - identifier.box.bottom, 12, 'Input to Forgot password');
  closeTo(next.y - forgot.y - forgot.height, 12, 'Forgot password to Next');
  closeTo(forgot.x, identifier.box.left, 'Forgot password alignment');
  closeTo(next.width, (await page.locator('#identifier-box').boundingBox()).width, 'Matching input and action width');
}
async function checkDisclosureStability(page) {
  await page.goto(target.origin + '/signup/?form=1');
  const original = page.viewportSize();
  const height = await page.evaluate(() => Math.ceil(document.querySelector('.auth-container-modern').getBoundingClientRect().height) + 90);
  await page.setViewportSize({ width: original.width, height });
  const geometry = () => page.evaluate(() => {
    const header = document.querySelector('.auth-header-card').getBoundingClientRect();
    const input = document.getElementById('last_name').getBoundingClientRect();
    return { top: header.top, left: header.left, width: input.width, scale: visualViewport.scale,
      scroll: scrollY, scrollable: document.documentElement.scrollHeight > innerHeight };
  });
  const before = await geometry();
  assert.equal(before.scrollable, false);
  await page.locator('#signup-optional-toggle').click();
  const open = await geometry();
  assert.equal(open.scrollable, true);
  closeTo(open.top, before.top, 'Opening optional details does not recenter the header');
  closeTo(open.width, before.width, 'Scrollbar does not resize the form');
  closeTo(open.left, before.left, 'Scrollbar does not shift the form');
  assert.equal(open.scale, before.scale); assert.equal(open.scroll, before.scroll);
  assert.equal(await page.locator('#signup-optional-toggle').evaluate(el => el === document.activeElement), true);
  if (original.width <= 600) assert.equal(await page.locator('#birth-day').evaluate(el => getComputedStyle(el).fontSize), '16px');
  await page.locator('#signup-optional-toggle').click();
  const closed = await geometry();
  closeTo(closed.top, before.top, 'Closing optional details does not recenter the header');
  assert.equal(closed.scale, before.scale); assert.equal(closed.scroll, before.scroll);
  await page.setViewportSize(original);
}
const browser = await playwright.launch(launch);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort());
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const username = `uientry${Date.now()}`;
  await page.goto(target.origin + '/signin/');
  await page.getByRole('link', { name: 'Create New', exact: true }).click();
  await page.waitForURL('**/signup', { waitUntil: 'domcontentloaded' });
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  assert.equal(resources.filter(name => name.includes('fonts.googleapis.com')).length, 0);
  assert.equal(resources.filter(name => new URL(name).pathname.endsWith('.js')).length, 2);
  await page.getByRole('link', { name: 'Sign In', exact: true }).click();
  await page.waitForURL('**/signin', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Create New', exact: true }).click();
  await page.waitForURL('**/signup', { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.auth-tab-btn.active').textContent(), 'Create New');
  assert.equal(await page.locator('#birth-day').isVisible(), false);
  assert.equal(await page.locator('#btn-google-entry').isVisible(), true);
  const next = await page.locator('#btn-step-1-next').boundingBox();
  const google = await page.locator('#btn-google-entry').boundingBox();
  assert.ok(google.y >= next.y + next.height);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#first_name').fill('Entry'); await page.locator('#last_name').fill('Tester');
  await page.locator('#signup-optional-toggle').click();
  await page.locator('#birth-day').fill('29');
  await page.locator('#birth-month').fill('02');
  await page.locator('#birth-year').fill('2000');
  await page.locator('#signup-optional-toggle').click();
  await page.locator('#btn-step-1-next').click();
  assert.equal(await page.locator('#btn-google-entry').isVisible(), false);
  await page.locator('#btn-step-2-back').click();
  assert.equal(await page.locator('#btn-google-entry').isVisible(), true);
  assert.equal(await page.locator('#first_name').inputValue(), 'Entry');
  assert.equal(await page.locator('#date_of_birth').inputValue(), '2000-02-29');
  assert.equal(await page.locator('#birth-day').isVisible(), false);
  await page.locator('#btn-step-1-next').click();
  await page.locator('#username').fill(username);
  assert.equal(await page.locator('#password').isVisible(), true);
  assert.equal(await page.locator('input[type="password"]').count(), 1);
  assert.equal(await page.locator('#confirm_password, #strength-text, #strength-fill').count(), 0);
  await page.locator('#password').fill('aaaaaaaa');
  await page.locator('[data-eye="password"]').click();
  assert.equal(await page.locator('#password').getAttribute('type'), 'text');
  await page.locator('[data-eye="password"]').click();
  await page.locator('#btn-step-2-next').click();
  assert.equal(await page.locator('#btn-google-entry').isVisible(), false);
  await page.locator('#recovery_email').fill('synthetic@example.test');
  const signup = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/signup');
  await page.locator('#signup-btn').click();
  const created = await signup; assert.equal(created.status(), 201);
  assert.equal(created.request().postDataJSON().date_of_birth, '2000-02-29');
  assert.equal('confirm_password' in created.request().postDataJSON(), false);
  assert.equal((await created.json()).user.date_of_birth, '2000-02-29');
  await page.waitForURL('**/u/0/me');
  await page.evaluate(() => fetch('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await page.goto(target.origin + '/signin/');
  assert.equal(await page.locator('a[href^="/signup"]').textContent(), 'Create New');
  assert.equal(await page.locator('#btn-google-entry').isVisible(), true);
  await page.locator('#identifier').fill(username); await page.locator('#signin-btn').click();
  await page.locator('#step-password').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#btn-google-entry').isVisible(), false);
  assert.equal(await page.locator('#signin-passkey').isVisible(), true);
  await page.locator('#btn-back-to-identifier').click();
  assert.equal(await page.locator('#btn-google-entry').isVisible(), true);
  assert.equal(await page.locator('#signin-passkey').isVisible(), false);
  await page.locator('#signin-btn').click();
  await page.locator('#password').fill('aaaaaaaa');
  // Only simulate MFA's server response here; real MFA security has separate tests.
  await page.route('**/api/auth/signin', route => route.fulfill({ status: 202, contentType: 'application/json',
    body: JSON.stringify({ ok: true, mfa_required: true, challenge: 'synthetic-ui-challenge' }) }));
  await page.locator('#signin-btn').click();
  await page.locator('#step-mfa').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#btn-google-entry').isVisible(), false);
  assert.equal(await page.locator('#signin-passkey').isVisible(), false);
  assert.equal(await page.locator('.auth-separator:visible').count(), 0);
  await page.locator('#signin-mfa-restart').click();
  assert.equal(await page.locator('#btn-google-entry').isVisible(), true);
  const spacingPage = await context.newPage();
  for (const width of [390, 1280]) {
    await spacingPage.setViewportSize({ width, height: 900 });
    for (const colorScheme of ['light', 'dark']) {
      await spacingPage.emulateMedia({ colorScheme });
      await checkSpacing(spacingPage);
      await checkDisclosureStability(spacingPage);
    }
  }
  await spacingPage.close();
  assert.deepEqual(errors, []);
  for (const width of [390, 1280]) await checkKeyboard(context, target, width);
  console.log('Mobile entry UI passed: Create New, optional birthday, combined email/password, native signup, Google first-step-only, Back/MFA visibility, and stable scroll-threshold disclosure/6px/12px spacing on mobile/desktop in both themes.');
} finally { await browser.close(); }
