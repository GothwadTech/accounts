/** Synthetic MFA progression and multi-account races; never proves real enrollment or authentication. */
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
export async function checkSecurityRaces({ page, frame, app, context, origin }) {
  await page.setViewportSize({ width: 1280, height: 900 });
  const base = await app.evaluate(async () => (await fetch('/api/auth/me')).json());
  let enabled = false, confirmations = 0;
  const uri = 'otpauth://totp/Accounts:review%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Accounts&digits=6&period=30';
  await context.route('**/api/auth/mfa/status', route => route.fulfill({ json: { enabled, enrollment_available: true, recovery_codes_remaining: enabled ? 8 : 0 } }));
  await context.route('**/api/auth/mfa/enroll', route => route.fulfill({ json: { ok: true, enrollment_id: 'synthetic-only', secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: uri, expires_in: 900 } }));
  await context.route('**/api/auth/mfa/confirm', route => { confirmations++; enabled = true; return route.fulfill({ json: { ok: true, user: { ...base.user, two_factor_enabled: true }, recovery_codes: Array.from({ length: 8 }, (_, i) => `SYNTHETIC-ONLY-${i}`) } }); });
  await app.goto(origin + '/u/0/me?review=mfa-steps#security'); await frame.locator('#btn-mfa-settings').click();
  await frame.locator('#mfa-start').waitFor(); await frame.locator('#mfa-password').fill('Synthetic proof for UI only');
  await frame.locator('#mfa-start').click(); await frame.locator('#mfa-qr svg').waitFor();
  assert.equal(enabled, false); assert.equal(confirmations, 0);
  // Independently decode the actual displayed SVG, not a separately generated QR.
  const image = await app.evaluate(async () => {
    const svg = document.querySelector('#mfa-qr svg').outerHTML, image = new Image();
    image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 512, 512); ctx.drawImage(image, 0, 0, 512, 512);
    return Array.from(ctx.getImageData(0, 0, 512, 512).data);
  });
  assert.equal(jsQR(new Uint8ClampedArray(image), 512, 512)?.data, uri);
  await frame.locator('#mfa-code').fill('12'); await frame.locator('#mfa-confirm').click();
  assert.equal(await frame.locator('#mfa-code').getAttribute('aria-invalid'), 'true'); assert.equal(confirmations, 0);
  await frame.locator('#mfa-code').fill('123456'); await frame.locator('#mfa-confirm').click(); await frame.locator('#mfa-recovery-list').waitFor();
  assert.equal(confirmations, 1); assert.equal(await frame.locator('#mfa-done').isDisabled(), true);
  await page.keyboard.press('Escape'); await frame.locator('#discard-changes:not([hidden])').waitFor(); await frame.locator('#keep-editing').click();
  await frame.locator('#mfa-codes-saved').check(); await frame.locator('#mfa-done').click();
  await frame.getByRole('dialog').waitFor({ state: 'hidden' });
  await context.unroute('**/api/auth/mfa/status'); await context.unroute('**/api/auth/mfa/enroll'); await context.unroute('**/api/auth/mfa/confirm');
  // Two fictional accounts exercise the actual account-menu switch path and old-response suppression.
  const users = [base.user, { ...base.user, id: 'race-user-b', username: 'reviewsecond', first_name: 'Second', last_name: 'Reviewer', recovery_email: '', recovery_email_verified: null, has_password: false }];
  const accounts = users.map((user, i) => ({ id: i ? 'b' : 'a', authuser: i, username: user.username, firstName: user.first_name, lastName: user.last_name }));
  const session = index => ({ ok: true, authenticated: true, user: users[index], authuser: index, activeId: accounts[index].id, accounts });
  await context.route('**/api/auth/me', route => { const index = Number(route.request().headers()['x-gothwad-authuser'] || 0); return route.fulfill({ json: session(index) }); });
  await context.route('**/api/auth/switch', route => route.fulfill({ json: session(Number(route.request().postDataJSON().authuser || 0)) }));
  let releaseOld;
  const oldReady = new Promise(resolve => { releaseOld = resolve; });
  await context.route('**/api/auth/sessions', async route => {
    const index = Number(route.request().headers()['x-gothwad-authuser'] || 0);
    if (!index) await oldReady;
    await route.fulfill({ json: { sessions: [{ id: index ? 'new-session' : 'stale-session', is_current: true, device_name: index ? 'Second account session' : 'STALE FIRST ACCOUNT SESSION', browser: 'Chrome' }] } });
  });
  await app.goto(origin + '/u/0/me?review=races#security'); await frame.locator('#dash-root:not(.hidden)').waitFor();
  await frame.locator('#acct-switch-btn').click();
  await frame.locator('[data-gw-switch="b"]').click();
  await app.waitForFunction(() => location.pathname === '/u/1/me' && document.getElementById('device-list').textContent.includes('Second account session'));
  releaseOld();
  await app.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.doesNotMatch(await frame.locator('#device-list').innerText(), /STALE FIRST/);
  assert.match(await frame.locator('#security-account-context').innerText(), /reviewsecond/);
  assert.match(await frame.locator('#section-security [data-dialog="password"]').innerText(), /No password added/);
  await context.unroute('**/api/auth/sessions');
  // An in-flight personal-info response must not close or update a different account's dialog.
  await app.evaluate(async () => (await import('/me/js/nav.js')).showSection('personal'));
  await frame.locator('#section-personal [data-dialog="name"]').click(); await frame.locator('#dlg-first-name').fill('Unconfirmed old account edit');
  let releaseProfile;
  const profileReady = new Promise(resolve => { releaseProfile = resolve; });
  await context.route('**/api/auth/update-profile', async route => { await profileReady; await route.fulfill({ json: { ok: true, user: { ...users[1], first_name: 'STALE EDIT' } } }); });
  await frame.locator('#dlg-save').click();
  // Browser history is still available while a dialog has an inert background.
  await app.evaluate(() => history.go(-2));
  await app.waitForFunction(() => location.pathname === '/u/0/me' && !document.getElementById('dialog-root').querySelector('[role="dialog"]'));
  releaseProfile(); await app.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.doesNotMatch(await frame.locator('#pi-name').innerText(), /STALE EDIT/);
  assert.doesNotMatch(await frame.locator('#home-name').innerText(), /STALE EDIT/);
  assert.equal(await frame.locator('#dash-root').evaluate(node => node.inert), false);
  await context.unroute('**/api/auth/update-profile'); await context.unroute('**/api/auth/me'); await context.unroute('**/api/auth/switch');
  await app.goto(origin + '/u/0/me?review=restored#home'); await frame.locator('#home-activity .activity-item').waitFor();
  console.log('PASS: synthetic MFA steps, actual QR independently decoded, no enable before confirmation, offline-code acknowledgement; real menu-path account switching, stale session/profile suppression and dialog invalidation. No production/provider security verification claimed.');
}
