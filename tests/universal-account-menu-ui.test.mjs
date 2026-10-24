import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSheetHtml } from '../web/widget/account-menu.js';
import { ACCOUNT_MENU_CSS } from '../web/widget/account-menu-styles.js';

const samples = Array.from({ length: 6 }, (_, index) => ({
  id: String.fromCharCode(97 + index), authuser: index,
  username: `sample${index}`, firstName: 'Sample', lastName: String(index),
  email: `sample${index}@example.com`,
}));
const options = { accountsWebOrigin: 'https://accounts.example.com' };

for (const count of [1, 3, 6]) {
  test(`${count} accounts have equal rows and avatars; legacy flags cannot hide them`, () => {
    const html = buildAccountSheetHtml({
      user: samples[0], accounts: samples.slice(0, count), activeId: 'a',
      authuser: 0, collapsed: true, manageMode: true,
    }, options);
    assert.equal((html.match(/class="gw-account-row"/g) || []).length, count);
    assert.equal((html.match(/data-gw-switch=/g) || []).length, count);
    assert.equal((html.match(/width:40px;height:40px/g) || []).length, count);
    assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
    assert.equal((html.match(/data-gw-signout-slot=/g) || []).length, count);
    assert.doesNotMatch(html, /gw-hero|edit-avatar|toggle-collapse|toggle-manage|Manage accounts/);
    assert.equal(html.includes('data-gw-action="signout-all"'), count > 1);
    // Sibling sign-out buttons never create an interactive button inside a link.
    assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/);
  });
}

test('current account appears first without renumbering server authuser indices', () => {
  const html = buildAccountSheetHtml({
    user: samples[2], accounts: samples.slice(0, 3), activeId: 'c', authuser: 2,
  }, options);
  assert.deepEqual([...html.matchAll(/data-gw-switch="([a-f])" data-gw-authuser="(\d)"/g)]
    .map((match) => [match[1], match[2]]), [['c', '2'], ['a', '0'], ['b', '1']]);
  assert.match(html, /href="https:\/\/accounts\.example\.com\/u\/2\/me"[^>]*data-gw-action="manage-account"/);
});

test('separate matching action pills, branded logo, and title replace old menu controls', () => {
  const html = buildAccountSheetHtml({ user: samples[0], accounts: samples }, options);
  assert.match(html, /<h2 class="gw-heading">Gothwad Accounts<\/h2>/);
  assert.match(html, /<div class="gw-topbar">[\s\S]*gw-heading[\s\S]*aria-label="Close account menu"/);
  assert.match(html, /src="https:\/\/accounts\.example\.com\/icon-192\.png"/);
  assert.equal((html.match(/class="gw-manage-pill"/g) || []).length, 2);
  assert.match(html, /<\/div>\s*<div class="gw-primary-actions">/);
  assert.match(html, /Manage your Gothwad Account/);
  assert.match(html, /Add another account/);
  assert.doesNotMatch(html, /Google|#4285F4|#34A853|#FBBC05|#EA4335/);
  assert.match(html, /Privacy policy/);
  assert.match(html, /Terms of Service/);
});

test('neutral dark surface and first/last/only account curvature are defined centrally', () => {
  assert.match(ACCOUNT_MENU_CSS, /data-theme="dark"[\s\S]*--gw-surface: #212121;/);
  assert.doesNotMatch(ACCOUNT_MENU_CSS, /#1b1f26|#282c34|gw-hero|gw-chevron/);
  for (const pseudo of ['first-child', 'last-child', 'only-child']) {
    assert.ok(ACCOUNT_MENU_CSS.includes(`.gw-account-row:${pseudo}`));
  }
  assert.match(ACCOUNT_MENU_CSS, /\.gw-slot-signout:focus-visible/);
});

test('the fallback single account, custom brand, badges, and escaped labels remain supported', () => {
  const html = buildAccountSheetHtml({
    user: { ...samples[0], firstName: '<script>alert(1)</script>' }, accounts: [], authuser: 0,
  }, { ...options, ecosystemName: 'Example', badges: { sample0: 100 } });
  assert.equal((html.match(/class="gw-account-row"/g) || []).length, 1);
  assert.match(html, /Example Accounts/);
  assert.match(html, /Manage your Example Account/);
  assert.match(html, /99\+/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
