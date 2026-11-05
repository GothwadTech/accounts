/** Synthetic local-only keyboard regressions, used by test-auth-entry-browser.mjs. */
import assert from 'node:assert/strict';

export async function checkKeyboard(context, target, width = 390) {
  const page = await context.newPage(), errors = [], calls = new Map();
  await page.setViewportSize({ width, height: 900 });
  page.on('pageerror', error => errors.push(error.message));
  let signupBody, googleAccounts = [];
  const pendingWaiters = [];
  let release, response = { status: 400, body: { error: 'Synthetic retry' } };
  const handler = async route => {
    const url = new URL(route.request().url());
    if (url.origin !== target.origin) return route.abort();
    if (url.pathname === '/api/auth/google/status') return route.fulfill({ json: {
      new_user: true, accounts: googleAccounts, first_name: 'Keyboard', last_name: 'Tester', google_email: 'synthetic@example.test',
    } });
    if (route.request().method() !== 'POST' || !['/api/auth/signup', '/api/auth/check-identifier',
      '/api/auth/signin', '/api/auth/mfa/verify', '/api/auth/forgot-password', '/api/auth/reset-password',
      '/api/auth/google/finish'].includes(url.pathname)) return route.continue();
    if (url.pathname === '/api/auth/signup') signupBody = route.request().postDataJSON();
    calls.set(url.pathname, (calls.get(url.pathname) || 0) + 1);
    await new Promise(resolve => {
      release = resolve;
      for (const ready of pendingWaiters.splice(0)) ready();
    });
    return route.fulfill({ status: response.status, json: response.body });
  };
  await context.route('**/*', handler);
  const waitPending = () => release ? Promise.resolve() : new Promise(resolve => pendingWaiters.push(resolve));
  const releasePending = () => { const done = release; release = undefined; done(); };
  const focused = async id => assert.equal(await page.locator('#' + id).evaluate(el => el === document.activeElement), true);
  const count = path => calls.get('/api/auth/' + path) || 0;
  const heldEnter = async selector => {
    await page.locator(selector).focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter'); // real repeat flag, even if focus moved to the next step
    await page.keyboard.up('Enter');
  };
  const settle = async form => page.waitForFunction(id => !document.getElementById(id).hasAttribute('aria-busy'), form);
  const reply = async (form, body, status = 200) => {
    await waitPending(); response = { status, body }; releasePending(); await settle(form);
  };
  const burst = async form => page.evaluate(id => {
    for (let i = 0; i < 4; i++) document.getElementById(id).requestSubmit();
  }, form);
  const begin = async (selector, path) => {
    const request = page.waitForRequest(r => new URL(r.url()).pathname === '/api/auth/' + path);
    await heldEnter(selector); await request; await waitPending();
  };
  try {
    await page.goto(target.origin + '/signup/?form=1');
    await page.locator('#first_name').fill('Keyboard');
    await heldEnter('#first_name');
    assert.equal(await page.locator('#last_name').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#signup-step-1').isVisible(), true);
    assert.equal(count('signup'), 0);
    await page.locator('#last_name').fill('Tester');
    await page.locator('#signup-optional-toggle').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#signup-optional-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#birth-day').fill('01'); await page.locator('#birth-month').fill('01'); await page.locator('#birth-year').fill('2999');
    await heldEnter('#birth-year');
    assert.equal(await page.locator('#signup-step-1').isVisible(), true);
    assert.equal(count('signup'), 0);
    for (const part of ['day', 'month', 'year']) await page.locator('#birth-' + part).fill('');
    await page.locator('#signup-optional-toggle').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#signup-optional-toggle').getAttribute('aria-expanded'), 'false');
    // Autofilled hidden values must not cause held Enter to skip steps or create an account.
    await page.evaluate(() => {
      for (const [id, value] of Object.entries({ username: 'keyboardtester', password: 'aaaaaaaa', recovery_email: 'synthetic@example.test' })) {
        document.getElementById(id).value = value;
      }
    });
    await heldEnter('#last_name');
    assert.equal(await page.locator('#signup-step-2').isVisible(), true);
    assert.equal(await page.locator('#username').evaluate(el => el === document.activeElement), true);
    assert.equal(count('signup'), 0);
    // A repeated click on a hidden Next control cannot skip forward.
    await page.evaluate(() => document.getElementById('btn-step-1-next').click());
    assert.equal(await page.locator('#signup-step-2').isVisible(), true);
    await page.locator('#username').fill('a'); await heldEnter('#username');
    assert.equal(await page.locator('#signup-step-2').isVisible(), true);
    await page.locator('#username').fill('keyboardtester');
    assert.equal(await page.locator('#password').isVisible(), true);
    await page.locator('#password').fill('short'); await heldEnter('#password');
    assert.equal(await page.locator('#signup-step-2').isVisible(), true);
    await page.locator('#password').fill('aaaaaaaa'); await heldEnter('#password');
    assert.equal(await page.locator('#signup-step-3').isVisible(), true);
    assert.equal(count('signup'), 0);
    // Revalidate an earlier autofilled field by visibly returning to its own step.
    await page.evaluate(() => { document.getElementById('first_name').value = ''; });
    await heldEnter('#recovery_email');
    assert.equal(await page.locator('#signup-step-1').isVisible(), true);
    await page.locator('#first_name').fill('Keyboard');
    // Native/mobile implicit submission (no keydown) follows only the current step too.
    await page.evaluate(() => document.getElementById('signup-form').requestSubmit());
    assert.equal(await page.locator('#signup-step-2').isVisible(), true);
    await heldEnter('#password');
    await begin('#recovery_email', 'signup'); await burst('signup-form');
    assert.equal(count('signup'), 1);
    assert.equal('date_of_birth' in signupBody, false);
    assert.equal('confirm_password' in signupBody, false);
    assert.equal(signupBody.password, 'aaaaaaaa');
    assert.equal(await page.locator('#btn-step-3-back').isDisabled(), true);
    await reply('signup-form', { error: 'Synthetic retry' }, 400);
    await begin('#recovery_email', 'signup');
    response = { status: 201, body: { authuser: 0 } }; releasePending();
    await page.waitForFunction(() => document.getElementById('signup-btn').disabled &&
      document.getElementById('signup-btn').textContent.includes('Create'));
    await burst('signup-form'); assert.equal(count('signup'), 2);

    await page.goto(target.origin + '/signin/?form=1');
    await page.locator('#identifier').fill('keyboardtester');
    await begin('#identifier', 'check-identifier'); await burst('signin-form');
    assert.equal(count('check-identifier'), 1);
    // An edited identifier must not be advanced by an old lookup response.
    await page.locator('#identifier').fill('changedtester');
    await reply('signin-form', { exists: true });
    assert.equal(await page.locator('#step-identifier').isVisible(), true);
    await begin('#identifier', 'check-identifier');
    await reply('signin-form', { exists: true });
    assert.equal(await page.locator('#step-password').isVisible(), true);
    assert.equal(count('signin'), 0);
    await page.locator('#password').fill('SyntheticPassword!123');
    await begin('#password', 'signin'); await burst('signin-form');
    assert.equal(count('signin'), 1);
    await reply('signin-form', { mfa_required: true, challenge: 'synthetic-keyboard-challenge' });
    assert.equal(await page.locator('#step-mfa').isVisible(), true);
    await page.locator('#signin-mfa-code').fill('123456');
    await begin('#signin-mfa-code', 'mfa/verify'); await burst('signin-form');
    assert.equal(count('mfa/verify'), 1);
    await reply('signin-form', { error: 'Synthetic invalid code' }, 400);
    await page.locator('#signin-mfa-restart').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#step-identifier').isVisible(), true);
    await page.locator('.btn-forgot-action:visible').focus(); await page.keyboard.press('Enter');
    await page.locator('#forgot-username').fill('keyboardtester');
    await begin('#forgot-username', 'forgot-password'); await burst('forgot-form');
    assert.equal(count('forgot-password'), 1);
    await reply('forgot-form', { ok: true });
    assert.equal(await page.locator('#done-forgot').isVisible(), true);
    await page.evaluate(() => document.getElementById('signin-form').requestSubmit());
    assert.equal(count('check-identifier'), 2);

    await page.goto(target.origin + '/signin/?token=synthetic-keyboard-token');
    await page.locator('#new-password').fill('SyntheticPassword!123');
    await page.locator('#confirm-password').fill('SyntheticPassword!123');
    await begin('#confirm-password', 'reset-password'); await burst('reset-form');
    assert.equal(count('reset-password'), 1);
    await reply('reset-form', { error: 'Synthetic expired token' }, 400);

    await page.goto(target.origin + '/signin/google/');
    await page.locator('#google-onboarding').waitFor({ state: 'visible' });
    await page.locator('#google-username').fill('keyboardtester');
    await heldEnter('#google-username'); // required consent stays enforced
    assert.equal(count('google/finish'), 0);
    await page.locator('#google-confirm-recovery').check(); await page.locator('#google-terms').check();
    await begin('#google-username', 'google/finish'); await burst('google-onboarding');
    assert.equal(count('google/finish'), 1);
    await reply('google-onboarding', { mfa_required: true, challenge: 'synthetic-google-mfa' });
    assert.equal(await page.locator('#google-mfa').isVisible(), true);
    await page.evaluate(() => document.getElementById('google-onboarding').requestSubmit());
    assert.equal(count('google/finish'), 1);
    await page.locator('#google-mfa-code').fill('123456');
    await begin('#google-mfa-code', 'mfa/verify'); await burst('google-mfa');
    assert.equal(count('mfa/verify'), 2);
    await reply('google-mfa', { error: 'Synthetic invalid code' }, 400);
    // Returning Google users choose a specific account; no implicit finish is allowed.
    googleAccounts = [{ id: 'synthetic-first', username: 'firstaccount', first_name: 'First', last_name: 'Account' },
      { id: 'synthetic-second', username: 'secondaccount', first_name: 'Second', last_name: 'Account' }];
    await page.goto(target.origin + '/signin/google/');
    await page.locator('#google-chooser').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#google-account-list button').count(), 2);
    assert.equal(count('google/finish'), 1);
    await page.locator('#google-add-new').click(); await focused('google-first');
    await page.locator('#google-choose-back').click();
    assert.equal(await page.locator('#google-account-list button').first().evaluate(el => el === document.activeElement), true);
    const selected = page.waitForRequest(r => new URL(r.url()).pathname === '/api/auth/google/finish');
    await heldEnter('#google-account-list button[value="synthetic-second"]');
    assert.deepEqual((await selected).postDataJSON(), { action: 'select', account_id: 'synthetic-second' });
    await burst('google-chooser'); assert.equal(count('google/finish'), 2);
    await page.locator('#google-add-new').dispatchEvent('click');
    assert.equal(await page.locator('#google-chooser').isVisible(), true, 'Pending chooser cannot switch forms');
    await reply('google-chooser', { mfa_required: true, challenge: 'synthetic-selected-mfa' });
    assert.equal(await page.locator('#google-mfa').isVisible(), true);
    assert.equal(await page.locator('#google-chooser').isVisible(), false);
    await page.locator('#google-add-new').dispatchEvent('click');
    assert.equal(await page.locator('#google-onboarding').isVisible(), false, 'Hidden chooser cannot switch forms');
    // A stale backend without the new chooser contract must fail closed, not auto-sign in.
    googleAccounts = null;
    await page.goto(target.origin + '/signin/google/');
    await page.locator('#google-error').filter({ hasText: 'needs an update' }).waitFor();
    assert.equal(count('google/finish'), 2);
    assert.equal(await page.locator('#google-onboarding').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('Keyboard QA passed: visible-step Enter/focus, held Enter, implicit submit, retry, pending/terminal locks, hidden forms, native/MFA/recovery and Google consent/MFA.');
  } finally { await context.unroute('**/*', handler); await page.close(); }
}
