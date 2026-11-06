/** Final-phase browser acceptance. Synthetic routes exercise UI states, never real security/provider writes. */
import assert from 'node:assert/strict';
export async function checkFinalReviewPhases({ page, frame, app, context, origin }) {
  let navigation = 0;
  const navigate = async section => { await app.goto(origin + '/u/0/me?review=final-' + section + '&run=' + (++navigation) + '#' + section); await frame.locator('#section-' + section + ':not(.hidden)').waitFor(); };
  await page.setViewportSize({ width: 1280, height: 900 });
  let activityRequests = 0, methodRequests = 0;
  const count = request => { if (new URL(request.url()).pathname === '/api/auth/activity') activityRequests++; if (/\/api\/auth\/(sessions|mfa|passkeys)/.test(new URL(request.url()).pathname)) methodRequests++; };
  context.on('request', count);
  await navigate('personal');
  assert.equal(activityRequests, 0); assert.equal(methodRequests, 0, 'Hidden sections must not fetch security/session data');
  context.off('request', count);
  const original = await app.evaluate(async () => (await fetch('/api/auth/me')).json());
  // Focus containment, unchanged Save, associated errors, dirty close, Enter and one pending mutation.
  const nameRow = frame.locator('#section-personal [data-dialog="name"]');
  await nameRow.click();
  assert.equal(await frame.locator('#dash-root').evaluate(node => node.inert), true);
  assert.equal(await frame.locator('#dlg-save').isDisabled(), true);
  await frame.locator('[data-close-modal]').focus(); await page.keyboard.press('Tab');
  assert.equal(await frame.locator('#dlg-first-name').evaluate(node => node === document.activeElement), true);
  await frame.locator('#dlg-first-name').fill(''); await frame.locator('#dlg-save').click();
  assert.equal(await frame.locator('#dlg-first-name').getAttribute('aria-invalid'), 'true');
  assert.match(await frame.locator('#dlg-first-name').getAttribute('aria-describedby'), /modal-error/);
  await frame.locator('#dlg-first-name').fill(original.user.first_name + ' Review');
  await page.keyboard.press('Escape'); await frame.locator('#discard-changes:not([hidden])').waitFor();
  await frame.locator('#keep-editing').click();
  let releaseSave, saves = 0;
  const saving = new Promise(resolve => { releaseSave = resolve; });
  await context.route('**/api/auth/update-profile', async route => { saves++; await saving; await route.continue(); });
  await frame.locator('#dlg-last-name').press('Enter');
  await app.waitForFunction(() => document.getElementById('dialog-root').getAttribute('aria-busy') === 'true');
  await app.evaluate(() => { document.getElementById('dlg-save').click(); document.getElementById('dlg-save').click(); });
  await page.keyboard.press('Escape'); assert.equal(await frame.getByRole('dialog', { name: 'Name', exact: true }).isVisible(), true);
  assert.equal(saves, 1); releaseSave();
  await frame.getByRole('dialog', { name: 'Name', exact: true }).waitFor({ state: 'hidden' }); await context.unroute('**/api/auth/update-profile');
  assert.equal(await frame.locator('#dash-root').evaluate(node => node.inert), false);
  assert.equal(await nameRow.evaluate(node => node === document.activeElement), true);
  assert.match(await frame.locator('#page-status').innerText(), /Name updated/);
  // Failed writes preserve the form and are retried explicitly, never automatically.
  await nameRow.click(); await frame.locator('#dlg-first-name').fill(original.user.first_name);
  await context.route('**/api/auth/update-profile', route => route.fulfill({ status: 503, json: { error: 'Temporary update failure' } }));
  await frame.locator('#dlg-save').click(); await frame.locator('#modal-error').filter({ hasText: 'Temporary update failure' }).waitFor();
  assert.equal(await frame.locator('#dlg-first-name').inputValue(), original.user.first_name);
  await context.unroute('**/api/auth/update-profile'); await frame.locator('#dlg-save').click();
  await frame.getByRole('dialog', { name: 'Name', exact: true }).waitFor({ state: 'hidden' });
  // Discard is explicit, with focus restored; short viewports still keep actions reachable.
  await nameRow.click(); await frame.locator('#dlg-first-name').fill('Unsaved review'); await frame.locator('[data-close-modal]').click();
  await frame.locator('#discard-editing').click(); await frame.getByRole('dialog', { name: 'Name', exact: true }).waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 320, height: 450 }); await nameRow.click(); await frame.locator('#dlg-last-name').focus();
  assert.equal(await frame.locator('[role="dialog"]').evaluate(node => node.getBoundingClientRect().height <= innerHeight), true);
  await frame.locator('[data-close-modal]').click(); await page.setViewportSize({ width: 1280, height: 900 });
  // Model a software keyboard reducing only the visual viewport, not the layout viewport.
  assert.equal(await app.evaluate(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const viewport = new EventTarget(); Object.assign(viewport, { height: 300, offsetTop: 50 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const dialogs = await import('/me/js/dialogs.js');
    try {
      dialogs.openDialog('name'); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      viewport.height = 260; viewport.offsetTop = 80; viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
      const rect = document.querySelector('[role="dialog"]').getBoundingClientRect();
      return rect.top >= 79 && rect.bottom <= 341;
    } finally { dialogs.closeDialog(); Object.defineProperty(window, 'visualViewport', descriptor); }
  }), true, 'Dialog fits the keyboard-reduced visual viewport');
  await frame.locator('#skip-to-content').focus(); await page.keyboard.press('Enter');
  assert.equal(await frame.locator('#me-content').evaluate(node => node === document.activeElement), true);
  // Sessions, current-session ordering, explicit bulk confirmation and selected-account scope.
  let others = true, revocations = 0;
  await context.route('**/api/auth/sessions', route => route.fulfill({ json: { sessions: [
    ...(others ? [{ id: 'other-review', device_name: 'Other browser', browser: 'Firefox', last_active: '2026-11-06T10:00:00Z' }] : []),
    { id: 'current-review', is_current: true, device_name: 'Current browser', browser: 'Chrome', created_at: '2026-10-01T10:00:00Z', last_active: '2026-11-01T10:00:00Z' },
  ] } }));
  await context.route('**/api/auth/sessions/revoke-others', route => { revocations++; others = false; return route.fulfill({ json: { ok: true } }); });
  await navigate('security'); await frame.locator('#device-list .current-session').waitFor();
  assert.match(await frame.locator('#device-list .device').first().innerText(), /This session/);
  assert.match(await frame.locator('#device-list .device').nth(1).innerText(), /Started: Not available/);
  await frame.locator('#btn-revoke-others').click(); await frame.getByRole('dialog', { name: 'Sign out other sessions?' }).waitFor();
  assert.match(await frame.locator('[role="dialog"]').innerText(), /other accounts stay signed in/);
  assert.equal(revocations, 0); await frame.locator('#confirm-session-signout').click();
  await app.waitForFunction(() => document.getElementById('btn-revoke-others').disabled && document.querySelectorAll('#device-list .device').length === 1);
  assert.equal(revocations, 1); await context.unroute('**/api/auth/sessions/revoke-others'); await context.unroute('**/api/auth/sessions');
  // A failed method status is not Off and exposes Retry. Unavailable configuration remains friendly.
  await context.route('**/api/auth/mfa/status', route => route.fulfill({ status: 503, json: { error: 'Status unavailable' } }));
  await navigate('security'); await frame.locator('#btn-retry-security').waitFor();
  assert.equal(await frame.locator('#sec-mfa-badge').innerText(), 'Unavailable');
  await context.unroute('**/api/auth/mfa/status');
  await context.route('**/api/auth/mfa/status', route => route.fulfill({ json: { enabled: false, enrollment_available: false } }));
  await frame.locator('#btn-retry-security').click(); await frame.locator('#sec-mfa-status').filter({ hasText: 'not available' }).waitFor();
  await frame.locator('#btn-mfa-settings').click(); await frame.getByRole('dialog', { name: 'Authenticator verification' }).waitFor();
  assert.match(await frame.locator('#modal-body').innerText(), /Setup is unavailable/); await frame.locator('[data-close-modal]').click();
  await context.unroute('**/api/auth/mfa/status');
  // Provider availability and passkey registration counts have explicit explanations.
  await frame.locator('#btn-google-settings').click(); await frame.locator('#google-method-add').waitFor();
  assert.equal(await frame.locator('#google-method-add').isDisabled(), true);
  assert.match(await frame.locator('#google-method-form').innerText(), /not available on this site/);
  await frame.locator('[data-close-modal]').click();
  // Client-side filters and pagination never imply access to unreturned history.
  const history = Array.from({ length: 25 }, (_, i) => ({ id: 'history-' + i, type: i % 2 ? 'profile_update' : 'signin', title: i % 2 ? 'Profile updated' : 'Signed in', created_at: `2026-11-${String(6 - Math.floor(i / 6)).padStart(2, '0')}T02:00:00Z` }));
  await context.route('**/api/auth/activity', route => route.fulfill({ json: { activity: history } }));
  await navigate('data'); await frame.locator('#dp-activity-more').waitFor();
  assert.equal(await frame.locator('#dp-activity .activity-item').count(), 10);
  await frame.locator('#dp-activity-more').click(); assert.equal(await frame.locator('#dp-activity .activity-item').count(), 20);
  await frame.locator('#dp-activity-filter').selectOption('profile'); assert.equal(await frame.locator('#dp-activity .activity-item').count(), 10);
  assert.match(await frame.locator('#dp-activity-count').innerText(), /12 matching/);
  await frame.locator('#dp-activity-filter').selectOption('apps'); assert.match(await frame.locator('#dp-activity-rows').innerText(), /No retained events match/);
  await context.unroute('**/api/auth/activity');
  // Actual permission grants are separate from included services and unconnected catalog entries.
  let connected = true, disconnects = 0;
  await context.route('**/api/oauth/authorizations', route => route.fulfill({ json: { apps: [{ id: 'review-external', name: 'Review App', homepage: 'https://app.example.test' }, { id: 'review-external', name: 'Review App' }], connected: connected ? [{ app_id: 'review-external', name: 'Review App', scopes: ['profile', 'email'], granted_at: '2026-10-01T10:00:00Z' }] : [] } }));
  await context.route('**/api/oauth/revoke', route => { disconnects++; connected = false; return route.fulfill({ json: { ok: true } }); });
  await navigate('apps'); await frame.locator('[data-disconnect="review-external"]').waitFor();
  assert.equal(await frame.locator('[data-disconnect="review-external"]').count(), 1);
  await frame.locator('.app-permissions summary').click(); assert.match(await frame.locator('.app-permissions').innerText(), /Read your basic profile/);
  assert.match(await frame.locator('.app-permissions').innerText(), /Not provided by the app registry/);
  await frame.locator('[data-disconnect="review-external"]').click(); assert.equal(disconnects, 0);
  assert.match(await frame.locator('[role="dialog"]').innerText(), /Data already copied/);
  await frame.locator('#confirm-disconnect').click(); await frame.locator('#connected-list').filter({ hasText: 'No optional apps' }).waitFor();
  assert.equal(disconnects, 1); await context.unroute('**/api/oauth/revoke'); await context.unroute('**/api/oauth/authorizations');
  // Deletion requires explicit acknowledgement and username; cancel never writes.
  await navigate('data'); await frame.locator('#btn-open-delete').click();
  await frame.locator('#dlg-confirm-delete').click(); assert.match(await frame.locator('#modal-error').innerText(), /exact username/);
  assert.match(await frame.locator('[role="dialog"]').innerText(), /separate databases, backups or legal records/);
  await frame.locator('[data-close-modal]').click();
  // The real preview intentionally rejects security writes. No production claim is made.
  await page.emulateMedia({ reducedMotion: 'reduce' }); await navigate('personal'); await nameRow.click();
  assert.equal(await frame.locator('[role="dialog"]').evaluate(node => parseFloat(getComputedStyle(node).animationDuration) <= 0.001), true);
  await frame.locator('[data-close-modal]').click(); await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('PASS: final UI phases: lazy data, modal focus/inertness/discard/Enter/pending/retry, durable success, short viewport/skip link, session scope/ordering, truthful failed/unavailable factors, provider explanation, retained history filters/paging, grant permissions/dedup/disconnect, deletion scope and reduced motion.');
}
