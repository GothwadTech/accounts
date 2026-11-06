/** Browser acceptance for the two explicitly approved UI phases; no production actions. */
import assert from 'node:assert/strict';

export async function checkReviewPhases({ page, frame, app, context, origin }) {
  const search = frame.locator('#search-input');
  const visible = section => frame.locator(`#section-${section}:not(.hidden)`).waitFor();
  async function navigate(section) {
    if (await frame.locator('#btn-menu').isVisible()) {
      await frame.locator('#btn-menu').click();
      assert.equal(await frame.locator('#btn-menu').getAttribute('aria-expanded'), 'true');
    }
    await frame.locator(`.me-nav-item[data-section="${section}"]`).click();
    await visible(section);
    assert.equal(await frame.locator('.me-nav-item[aria-current="page"]').count(), 1);
    assert.equal(await frame.locator('.me-nav-item[aria-current="page"]').getAttribute('data-section'), section);
    assert.equal(await frame.locator('#btn-menu').getAttribute('aria-expanded'), 'false');
  }
  for (const theme of ['light', 'dark']) {
    if (await app.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light') !== theme) await frame.locator('[data-theme-toggle]').click();
    assert.equal(await app.evaluate(() => document.documentElement.getAttribute('data-theme')), theme);
    await app.waitForFunction(value => getComputedStyle(document.getElementById('search-input')).backgroundColor === (value === 'dark' ? 'rgb(19, 19, 20)' : 'rgb(255, 255, 255)'), theme);
    const contrast = await app.evaluate(() => {
      const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = color => rgb(color).map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      const helper = document.getElementById('home-security-sub'), search = document.getElementById('search-input');
      return [ratio(getComputedStyle(helper).color, getComputedStyle(helper.closest('.card')).backgroundColor), ratio(getComputedStyle(search, '::placeholder').color, getComputedStyle(search).backgroundColor)];
    });
    assert.ok(contrast.every(value => value >= 4.5), `${theme}: helper/placeholder contrast below 4.5:1 (${contrast.join(', ')})`);
    for (const width of [1280, 800, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of ['home', 'personal', 'security', 'data', 'people', 'apps']) {
        await navigate(section);
        const fits = await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        if (!fits) console.log(await app.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => ({ tag: node.tagName, id: node.id, class: node.className?.baseVal ?? node.className, width: node.getBoundingClientRect().width })).slice(0, 15)));
        assert.equal(fits, true, `${theme}/${width}/${section} overflows`);
      }
      assert.equal(await frame.locator('#acct-switch-btn').evaluate(node => node.getBoundingClientRect().width >= 48 && node.getBoundingClientRect().height >= 48), true);
    }
  }
  console.log('PASS: responsive theme/section matrix');
  // Drawer: Escape restores the trigger, arrow navigation works, Tab wraps, closed content is inert.
  await page.setViewportSize({ width: 390, height: 900 });
  await frame.locator('#btn-menu').focus(); await page.keyboard.press('Enter');
  assert.equal(await frame.locator('#me-sidebar').evaluate(node => node.contains(document.activeElement)), true);
  await page.keyboard.press('Home');
  assert.equal(await frame.locator('.me-nav-item[data-section="home"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await frame.locator('.me-nav-item[data-section="personal"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#btn-menu').evaluate(node => node === document.activeElement), true);
  assert.equal(await frame.locator('#me-sidebar').evaluate(node => node.inert), true);
  await frame.locator('#btn-menu').click();
  await frame.locator('.me-nav-item[data-section="apps"]').focus(); await page.keyboard.press('Tab');
  assert.equal(await frame.locator('#btn-close-nav').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await frame.locator('.me-nav-item[data-section="apps"]').evaluate(node => node === document.activeElement), true);
  await frame.locator('#btn-close-nav').click();
  // Breakpoint changes must not leave a scroll lock or inaccessible desktop sidebar.
  await frame.locator('#btn-menu').click(); await page.setViewportSize({ width: 1280, height: 900 });
  await app.waitForFunction(() => !document.getElementById('me-sidebar').inert && document.body.style.overflow !== 'hidden');
  assert.equal(await frame.locator('#me-sidebar').getAttribute('aria-modal'), null);
  // Precise destinations and keyboard-only search; no destructive action is automatically executed.
  await search.focus(); await page.keyboard.press('Control+k');
  assert.equal(await search.evaluate(node => node === document.activeElement), true);
  await search.fill('2fa'); await page.keyboard.press('ArrowDown');
  assert.equal(await search.getAttribute('aria-activedescendant'), 'setting-result-0');
  await page.keyboard.press('Enter'); await frame.getByRole('dialog', { name: 'Authenticator verification' }).waitFor();
  await frame.locator('[data-close-modal]').click();
  for (const [query, target] of [['sessions', 'device-list'], ['quota', 'dp-storage-card'], ['download export', 'btn-export'], ['mailbox', 'pi-email']]) {
    await search.fill(query); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await app.waitForFunction(id => document.activeElement?.id === id, target);
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await search.fill('security'); await page.keyboard.press('ArrowUp');
  assert.equal(await search.getAttribute('aria-activedescendant'), 'setting-result-' + (await frame.getByRole('option').count() - 1));
  await page.keyboard.press('Escape');
  await search.fill('no-setting-matches-this'); assert.equal(await frame.getByRole('status').filter({ hasText: 'No settings found' }).count(), 1);
  await page.keyboard.press('Escape'); assert.equal(await search.getAttribute('aria-expanded'), 'false');
  await search.fill('photo'); await page.keyboard.press('Tab'); assert.equal(await search.getAttribute('aria-expanded'), 'false');
  await navigate('home');
  assert.equal(await frame.locator('.account-details').evaluate(node => node.open), false);
  await frame.locator('.account-details summary').click(); assert.equal(await frame.locator('#home-stat-created').isVisible(), true);
  await frame.locator('.account-details summary').click();
  // Clipboard APIs can be restricted by the iframe. The fallback selects the address for copying.
  await app.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Restricted iframe'); } } }));
  await frame.locator('#btn-copy-email').click();
  assert.equal(await app.evaluate(() => getSelection().toString()), await frame.locator('#home-email').innerText());
  await frame.getByRole('button', { name: 'Review email', exact: true }).click();
  await frame.getByRole('dialog', { name: 'Recovery email' }).waitFor(); await frame.locator('[data-close-modal]').click();
  // Profile disclosure and optional value removal; none of these fields is a security requirement.
  await navigate('personal');
  assert.equal(await frame.locator('.optional-profile').evaluate(node => node.open), false);
  assert.equal(await frame.locator('#pi-photo-edit').evaluate(node => node.getBoundingClientRect().width >= 48 && node.getBoundingClientRect().height >= 48), true);
  assert.match(await frame.locator('#profile-visibility').innerText(), /no public\/private sharing switch/);
  await search.fill('birthday'); await page.keyboard.press('Enter');
  await frame.getByRole('dialog', { name: 'Date of birth' }).waitFor();
  assert.equal(await frame.locator('.profile-birthday').evaluate(node => getComputedStyle(node).height), '48px');
  assert.equal(await frame.locator('#dlg-dob-day').getAttribute('type'), null);
  await frame.locator('#dlg-dob-day').fill('31'); await frame.locator('#dlg-dob-month').fill('2'); await frame.locator('#dlg-dob-year').fill('2000');
  await frame.locator('#dlg-save').click(); assert.equal(await frame.getByRole('dialog', { name: 'Date of birth' }).isVisible(), true);
  await frame.locator('#dlg-dob-day').fill('29'); await frame.locator('#dlg-save').click();
  await frame.getByRole('dialog', { name: 'Date of birth' }).waitFor({ state: 'hidden' });
  assert.match(await frame.locator('#pi-dob').innerText(), /February.*29.*2000/);
  await frame.locator('[data-dialog="dob"]').click();
  for (const part of ['day', 'month', 'year']) await frame.locator('#dlg-dob-' + part).fill('');
  await frame.locator('#dlg-save').click(); await frame.getByRole('dialog', { name: 'Date of birth' }).waitFor({ state: 'hidden' });
  assert.equal(await frame.locator('#pi-dob').innerText(), 'Not set');
  await frame.locator('[data-dialog="gender"]').click(); await frame.locator('#dlg-gender').selectOption('Rather not say');
  await frame.locator('#dlg-save').click(); await frame.getByRole('dialog', { name: 'Gender', exact: true }).waitFor({ state: 'hidden' });
  await frame.locator('[data-dialog="gender"]').click(); await frame.locator('#dlg-gender').selectOption('');
  await frame.locator('#dlg-save').click(); await frame.getByRole('dialog', { name: 'Gender', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await frame.locator('#pi-gender').innerText(), 'Not set');
  console.log('PASS: drawer/search/Home/optional profile controls');
  // Photo preparation stays local until Save; framing changes the actual resulting pixels.
  await frame.locator('#pi-photo-edit').click();
  const picture = await app.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ['#ff0000', '#00ff00', '#0000ff'].forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i * 180, 0, 180, 240); });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  let uploads = 0;
  const countUpload = request => { if (new URL(request.url()).pathname === '/api/auth/avatar') uploads++; };
  context.on('request', countUpload);
  await frame.locator('#photo-file').setInputFiles({ name: 'framing.png', mimeType: 'image/png', buffer: Buffer.from(picture, 'base64') });
  await frame.locator('#photo-canvas').waitFor({ state: 'visible' });
  assert.equal(uploads, 0);
  assert.deepEqual(await frame.locator('#photo-canvas').evaluate(node => [...node.getContext('2d').getImageData(128, 128, 1, 1).data].slice(0, 3)), [0, 255, 0]);
  await frame.locator('#photo-horizontal').fill('100');
  assert.deepEqual(await frame.locator('#photo-canvas').evaluate(node => [...node.getContext('2d').getImageData(128, 128, 1, 1).data].slice(0, 3)), [0, 0, 255]);
  await frame.locator('#btn-save-photo').click(); await frame.getByRole('dialog', { name: 'Profile photo' }).waitFor({ state: 'hidden' });
  assert.equal(uploads, 1); context.off('request', countUpload);
  assert.equal(await frame.locator('#pi-photo img').getAttribute('src').then(value => value.startsWith('data:image/jpeg;base64,')), true);
  await frame.locator('#pi-photo-edit').click(); await frame.locator('#btn-remove-photo').click();
  await frame.getByRole('dialog', { name: 'Profile photo' }).waitFor({ state: 'hidden' });
  console.log('PASS: local photo framing and explicit save/removal');
  // Account URL/query, history scroll, refresh and invalid-hash normalization.
  await app.goto(origin + '/u/0/me?review=history&authuser=0#security'); await visible('security');
  assert.equal(new URL(app.url()).searchParams.get('review'), 'history');
  await app.evaluate(() => window.scrollTo(0, 400));
  await app.waitForFunction(() => history.state?.sectionScroll >= 300);
  const before = await app.evaluate(() => scrollY);
  await navigate('apps');
  await app.evaluate(() => history.back()); await visible('security');
  await app.waitForFunction(value => Math.abs(scrollY - value) < 3, before);
  await Promise.all([app.waitForNavigation(), app.evaluate(() => location.reload())]); await visible('security');
  await app.waitForFunction(value => Math.abs(scrollY - value) < 3, before);
  assert.equal(new URL(app.url()).searchParams.get('review'), 'history');
  await app.evaluate(() => { location.hash = 'unknown-setting'; }); await visible('home');
  assert.equal(new URL(app.url()).hash, '#home');
  // Refresh with deliberately delayed, taller device data must restore the original reading point.
  let releaseSessions;
  const sessionsReady = new Promise(resolve => { releaseSessions = resolve; });
  await context.route('**/api/auth/sessions', async route => {
    await sessionsReady;
    await route.fulfill({ json: { sessions: Array.from({ length: 40 }, (_, i) => ({ id: 'reading-' + i, device_name: 'Review desktop ' + i, browser: 'Chrome', os: 'Windows', last_active: '2026-11-06T02:00:00Z' })) } });
  });
  await app.evaluate(() => {
    history.replaceState({ ...history.state, sectionKey: location.pathname + location.search + '#security', sectionScroll: 1200 }, '', '#security');
  });
  await Promise.all([app.waitForNavigation(), app.evaluate(() => location.reload())]); await visible('security');
  assert.equal(await app.evaluate(() => scrollY < 1200), true);
  releaseSessions();
  await app.waitForFunction(() => document.querySelectorAll('#device-list .device').length === 40);
  await app.waitForFunction(() => Math.abs(scrollY - 1200) < 3);
  await context.unroute('**/api/auth/sessions');
  // Adversarial legacy display fixture and zero quota use are browser-local, not persisted identities.
  const fixture = await app.evaluate(async () => (await fetch('/api/auth/me')).json());
  await context.route('**/api/auth/me', async route => {
    const data = structuredClone(fixture);
    data.user = { ...data.user, first_name: 'A'.repeat(140), last_name: 'B'.repeat(140), username: 'longlegacy'.repeat(18), recovery_email: 'review'.repeat(24) + '@example.test', storage_used_bytes: 0 };
    await route.fulfill({ json: data });
  });
  await app.goto(origin + '/u/0/me?review=long-values#home'); await visible('home');
  assert.equal(await frame.locator('#home-storage-used').innerText(), '0 B used');
  assert.equal(await frame.locator('#home-storage-fill').evaluate(node => node.style.width), '0%');
  assert.equal(await frame.locator('#dp-storage-fill').evaluate(node => node.style.width), '0%');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['home', 'personal', 'security', 'people']) {
      await navigate(section);
      assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Long values overflow ${width}/${section}`);
    }
  }
  await page.setViewportSize({ width: 640, height: 450 });
  await navigate('personal');
  // Half-width CSS viewport models 200% browser zoom/reflow at a 1280px desktop size.
  assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await context.unroute('**/api/auth/me');
  await app.goto(origin + '/u/0/me?review=complete#home'); await visible('home');
  await app.evaluate(async () => (await import('/js/theme.js')).setTheme('light'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/accounts-phase12-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: '/tmp/accounts-phase12-mobile.png', animations: 'disabled' });
  await app.evaluate(async () => (await import('/js/theme.js')).setTheme('dark'));
  await page.screenshot({ path: '/tmp/accounts-phase12-mobile-dark.png', animations: 'disabled' });
  await app.evaluate(async () => (await import('/js/theme.js')).setTheme('light'));
  console.log('PASS: both themes at 1280/800/390/320px; drawer keyboard/focus/breakpoints; exact keyboard search; Home actions/copy fallback; optional profile/date validation/removal; photo pixels/save/removal; query/history/scroll/refresh; long values, zero storage and 200%-equivalent reflow.');
}
