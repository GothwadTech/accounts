/** Approved phase 1–2 regressions: truthful summaries, exact search and URL/reading context. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeRecommendations, storageSummary } from '../web/me/js/home-summary.js';
import { SETTINGS_INDEX, findSettings } from '../web/me/js/search-index.js';
import { cropRectangle } from '../web/me/js/photo-crop.js';
import { formatProfileBirthday } from '../web/me/js/profile-date.js';
import { syncMeBrowserUrl } from '../web/js/authuser.js';

test('Home suggestions are actionable, optional and never treat passwordless or missing profile data as insecure', () => {
  const items = homeRecommendations({ has_password: false, google_linked: true, two_factor_enabled: false });
  assert.equal(items.length, 2);
  assert.equal(items[0].dialog, 'recovery');
  assert.equal(items[1].target, 'btn-mfa-settings');
  assert.match(items[1].detail, /optional/);
  assert.doesNotMatch(JSON.stringify(items), /birthday|gender|password|score|looks secure/i);
  assert.equal(homeRecommendations({ recovery_email: 'review@example.test', recovery_email_verified: true }).length, 0);
  assert.match(homeRecommendations({ recovery_email: 'review@example.test' })[0].detail, /not confirmed/);
});

test('storage starts at exactly zero, preserves fractional usage and does not fabricate missing quotas', () => {
  assert.deepEqual(storageSummary({ storage_used_bytes: 0, storage_limit_bytes: 100 }), { used: 0, limit: 100, percent: 0 });
  assert.equal(storageSummary({ storage_used_bytes: 1, storage_limit_bytes: 1000 }).percent, 0.1);
  assert.equal(storageSummary({ storage_used_bytes: 200, storage_limit_bytes: 100 }).percent, 100);
  for (const invalid of [null, undefined, -1, 'invalid', Infinity]) {
    const result = storageSummary({ storage_used_bytes: invalid, storage_limit_bytes: invalid });
    assert.equal(result.used, null); assert.equal(result.limit, null); assert.equal(result.percent, 0);
  }
  assert.equal(storageSummary({ storage_used_bytes: 0, storage_limit_bytes: 0 }).limit, null);
});

test('settings synonyms lead to real exact controls without adding unsupported settings', () => {
  for (const [query, target] of [['2fa', 'btn-mfa-settings'], ['MFA', 'btn-mfa-settings'], ['two factor', 'btn-mfa-settings'], ['sessions', 'device-list'], ['quota', 'dp-storage-card'], ['download export', 'btn-export'], ['mailbox', 'pi-email']]) {
    assert.equal(findSettings(query)[0]?.target, target, query);
  }
  assert.equal(findSettings('birthday')[0].dialog, 'dob');
  assert.equal(findSettings('avatar')[0].dialog, 'photo');
  assert.equal(findSettings('fingerprint')[0].action, 'passkeys');
  assert.equal(findSettings('gmail')[0].action, 'google');
  assert.deepEqual(findSettings(''), []); assert.deepEqual(findSettings('nonexistent-setting'), []);
  const html = readFileSync('web/me/index.html', 'utf8');
  for (const item of SETTINGS_INDEX) {
    if (item.target) assert.ok(html.includes(`id="${item.target}"`), `${item.title}: missing exact target`);
    assert.ok(html.includes(`id="section-${item.section}"`));
  }
});

test('photo framing remains within landscape/portrait/square inputs at every zoom and offset', () => {
  assert.deepEqual(cropRectangle(540, 240), { x: 150, y: 0, side: 240 });
  assert.deepEqual(cropRectangle(240, 540), { x: 0, y: 150, side: 240 });
  for (const [width, height] of [[540, 240], [240, 540], [256, 256]]) {
    for (const zoom of [0, 1, 2, 3, 8]) for (const x of [-200, -100, 0, 100, 200]) for (const y of [-200, 0, 200]) {
      const crop = cropRectangle(width, height, zoom, x, y);
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.side > 0);
      assert.ok(crop.x + crop.side <= width + 0.001 && crop.y + crop.side <= height + 0.001);
    }
  }
});

test('birthday display uses a named month and UTC, with missing/invalid dates kept distinct', () => {
  assert.equal(formatProfileBirthday(null), 'Not set');
  assert.equal(formatProfileBirthday('2000-02-31'), 'Not available');
  assert.equal(formatProfileBirthday('2000-02-29'), 'February 29, 2000');
  assert.equal(formatProfileBirthday('2000-01-01'), 'January 1, 2000');
});

test('account URL synchronization retains unrelated query/hash/history state and updates an explicit selector', t => {
  const oldLocation = globalThis.location, oldHistory = globalThis.history;
  t.after(() => { globalThis.location = oldLocation; globalThis.history = oldHistory; });
  let target;
  globalThis.location = new URL('https://accounts.example.test/u/0/me?review=history&authuser=0#security');
  globalThis.history = { state: { sectionKey: 'previous', sectionScroll: 300 }, pushState(state, _, url) { this.state = state; target = url; } };
  syncMeBrowserUrl(2, { push: true });
  assert.equal(target, '/u/2/me?review=history&authuser=2#security');
  assert.equal(history.state.sectionScroll, 300);
  assert.equal(history.state.authuser, 2);
});

test('section history restores scroll once for paired browser events and keeps current semantics', async t => {
  const previous = Object.fromEntries(['window', 'document', 'history', 'location', 'ResizeObserver'].map(key => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) globalThis[key] = value; });
  const listeners = {}, scrolls = [];
  const button = name => ({ dataset: { section: name }, attributes: {}, classList: { toggle() {} }, addEventListener() {},
    setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } });
  const buttons = ['home', 'personal', 'security', 'data', 'people', 'apps'].map(button);
  const sections = buttons.map(btn => ({ id: 'section-' + btn.dataset.section, classList: { toggle() {} } }));
  let context = {};
  globalThis.document = { querySelectorAll: selector => selector === '.me-nav-item' ? buttons : selector === '.me-section' ? sections : [], getElementById: () => context };
  globalThis.location = new URL('https://accounts.example.test/u/2/me?review=yes&authuser=2#home');
  let entries = [{ url: location.href, state: null }], index = 0;
  globalThis.history = { state: null, scrollRestoration: 'auto',
    replaceState(state, _, url) { this.state = state; if (url) globalThis.location = new URL(url, location); entries[index] = { url: location.href, state }; },
    pushState(state, _, url) { this.state = state; globalThis.location = new URL(url, location); entries = entries.slice(0, ++index); entries.push({ url: location.href, state }); } };
  globalThis.window = { scrollY: 0, requestAnimationFrame: fn => fn(), addEventListener(name, fn) { listeners[name] = fn; },
    scrollTo({ top }) { this.scrollY = top; scrolls.push(top); } };
  const { initNav, showSection } = await import('../web/me/js/nav.js?phase12-regression');
  initNav(); assert.equal(history.scrollRestoration, 'manual');
  window.scrollY = 300; listeners.scroll();
  showSection('people');
  assert.equal(location.pathname, '/u/2/me'); assert.equal(location.search, '?review=yes&authuser=2');
  assert.equal(buttons[4].attributes['aria-current'], 'page'); assert.equal(buttons[0].attributes['aria-current'], undefined);
  const count = scrolls.length; showSection('people'); assert.equal(scrolls.length, count, 'Repeated section does not reset reading position');
  --index; globalThis.location = new URL(entries[index].url); history.state = entries[index].state;
  listeners.popstate(); listeners.hashchange();
  assert.equal(scrolls.length, count + 1, 'Paired events restore only once'); assert.equal(window.scrollY, 300);
  assert.equal(context.textContent, 'Home');
  location.hash = '#not-a-section'; listeners.hashchange();
  assert.equal(location.hash, '#home'); assert.equal(location.search, '?review=yes&authuser=2');
  // Loading can temporarily shorten the section; retry restoration only until it fits.
  let observer, maxScroll = 100;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {} disconnect() { this.disconnected = true; }
  };
  window.scrollTo = ({ top }) => { window.scrollY = Math.min(top, maxScroll); };
  const peopleKey = '/u/2/me?review=yes&authuser=2#people';
  history.replaceState({ sectionKey: peopleKey, sectionScroll: 600 }, '', peopleKey);
  showSection('people', { historyMode: 'none', restoreScroll: true });
  assert.equal(window.scrollY, 100);
  listeners.scroll(); assert.equal(history.state.sectionScroll, 600, 'Temporary clamping does not destroy saved position');
  maxScroll = 1000; observer.callback();
  assert.equal(window.scrollY, 600); assert.equal(observer.disconnected, true);
  maxScroll = 100;
  const homeKey = '/u/2/me?review=yes&authuser=2#home';
  history.replaceState({ sectionKey: homeKey, sectionScroll: 600 }, '', homeKey);
  showSection('home', { historyMode: 'none', restoreScroll: true });
  listeners.pointerdown(); assert.equal(observer.disconnected, true, 'User interaction cancels delayed restoration');
});

test('profile copy is accurate about optional data, mailbox uncertainty and unsupported sharing controls', () => {
  const html = readFileSync('web/me/index.html', 'utf8');
  assert.match(html, /no public\/private sharing switch/);
  assert.match(html, /does not confirm that a Mail mailbox has been created/);
  assert.match(html, /Phone ownership is not verified; SMS recovery is not available/);
  assert.match(html, /optional-profile/);
  const dialogs = readFileSync('web/me/js/dialogs.js', 'utf8');
  assert.doesNotMatch(dialogs, /It is kept private|Please select a gender/);
  const photo = readFileSync('web/me/js/photo-editor.js', 'utf8');
  assert.match(photo, /up to 8 MB/); assert.match(photo, /under 2 MB/); assert.match(photo, /Save photo/);
});
