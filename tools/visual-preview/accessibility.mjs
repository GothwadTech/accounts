/** Automated accessibility checks supplement, but do not replace, keyboard and manual review. */
import assert from 'node:assert/strict';
import axe from 'axe-core';
export async function checkDashboardAccessibility({ page, frame, app, origin }) {
  await app.goto(origin + '/u/0/me?review=accessibility#home'); await frame.locator('#home-activity .activity-item').waitFor();
  await app.evaluate(source => { (0, eval)(source); }, axe.source);
  async function audit(label) {
    await app.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    const result = await app.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
    const violations = result.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
    if (violations.length) console.log(label, JSON.stringify(violations, null, 2));
    assert.deepEqual(violations, [], label + ': automated accessibility violations');
  }
  for (const [theme, width] of [['light', 1280], ['dark', 320]]) {
    await page.setViewportSize({ width, height: 900 });
    await app.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
    await app.waitForFunction(value => getComputedStyle(document.getElementById('search-input')).backgroundColor === (value === 'dark' ? 'rgb(19, 19, 20)' : 'rgb(255, 255, 255)'), theme);
    for (const section of ['home', 'personal', 'security', 'data', 'people', 'apps']) {
      await app.evaluate(async value => (await import('/me/js/nav.js')).showSection(value), section);
      if (section === 'security') await frame.locator('#sec-mfa-status').filter({ hasText: 'available' }).waitFor();
      if (section === 'apps') await frame.locator('#gothwad-services-list .device').first().waitFor();
      await audit(`${theme}/${width}/${section}`);
    }
    await app.evaluate(async () => (await import('/me/js/nav.js')).showSection('personal'));
    await frame.locator('#section-personal [data-dialog="name"]').click(); await audit(`${theme}/${width}/name-dialog`);
    await frame.locator('[data-close-modal]').click();
  }
  await frame.locator('#search-input').fill('not-a-setting'); await audit('search-no-results'); await page.keyboard.press('Escape');
  await app.evaluate(async () => (await import('/js/theme.js')).setTheme('light'));
  console.log('PASS: axe-core automated WCAG A/AA checks on six sections and name dialog in desktop/light and narrow/dark layouts, plus empty search. Manual and production accessibility validation remain separate.');
}
