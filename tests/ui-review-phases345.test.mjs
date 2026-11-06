/** Final UI phases: real metadata distinctions, bounded catalogs, account races and local QR encoding. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { qrcode } from '../web/vendor/qrcode.js';
import { factorState, fullDate, orderSessions, permissionLabel } from '../web/me/js/display-data.js';
import { buildAppGroups, safeAppUrl } from '../web/me/js/catalog-view.js';
import { bindViewAccount, captureView, beginView, invalidateViews } from '../web/me/js/view-context.js';
import { getActivity, getAuthorizations, resetMeStore } from '../web/me/js/store.js';

test('authenticator Off, On, unavailable, unknown and failed status are not conflated', () => {
  assert.equal(factorState({ ok: true, data: { enabled: false, enrollment_available: true } }).label, 'Off');
  assert.equal(factorState({ ok: true, data: { enabled: false, enrollment_available: false } }).label, 'Unavailable');
  assert.equal(factorState({ ok: false }).label, 'Unavailable');
  assert.equal(factorState({ ok: true, data: {} }).label, 'Unknown');
  const enabled = factorState({ ok: true, data: { enabled: true, enrollment_available: false, recovery_codes_remaining: 0 } });
  assert.equal(enabled.label, 'On'); assert.match(enabled.detail, /^0 unused/);
});

test('sessions put the current browser session first without inventing start times', () => {
  const rows = [{ id: 'latest', last_active: '2026-11-06T10:00:00Z' }, { id: 'current', is_current: true }, { id: 'older', last_active: '2026-10-01T10:00:00Z' }];
  assert.deepEqual(orderSessions(rows).map(row => row.id), ['current', 'latest', 'older']);
  assert.equal(rows[0].id, 'latest', 'Sorting does not mutate the API array');
  assert.equal(fullDate(null), 'Not available'); assert.equal(fullDate('invalid'), 'Not available');
  assert.match(fullDate('2026-11-06T02:00:00Z'), /2026/);
});

test('catalog membership, core identity access and actual optional grants are distinct and deduplicated', () => {
  const groups = buildAppGroups({ apps: [{ id: 'external', name: 'Real registry entry', publisher: 'Registry publisher' }, { id: 'external', name: 'Latest registry entry' }],
    connected: [{ app_id: 'external', scopes: ['profile'] }, { app_id: 'external', scopes: ['email'] }, { app_id: 'gothwad-mail', core: true }] });
  assert.equal(groups.connected.filter(app => app.id === 'external').length, 1);
  assert.deepEqual(groups.connected.find(app => app.id === 'external').grant.scopes, ['email']);
  assert.equal(groups.included.filter(app => app.id === 'gothwad-mail').length, 1);
  const ids = [...groups.included, ...groups.connected, ...groups.available].map(app => app.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(groups.available.some(app => app.id === 'external'), false);
  assert.equal(permissionLabel('profile'), 'Read your basic profile');
  assert.equal(permissionLabel('custom:read'), 'Permission: custom:read');
});

test('catalog links accept only credential-free HTTPS URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.test', 'https://user:password@example.test', '/relative', null]) assert.equal(safeAppUrl(url), '');
  assert.equal(safeAppUrl('https://service.example.test'), 'https://service.example.test/');
});

test('view tickets reject prior accounts, superseded same-section requests and changed URL selectors', t => {
  const previous = globalThis.location; t.after(() => { globalThis.location = previous; });
  globalThis.location = new URL('https://accounts.example.test/u/0/me#security'); bindViewAccount({ id: 'a' }, 0);
  const first = beginView('sessions'), account = captureView();
  const second = beginView('sessions'); assert.equal(first(), false); assert.equal(second(), true);
  location.pathname = '/u/1/me'; assert.equal(account(), false);
  bindViewAccount({ id: 'b' }, 1); location.pathname = '/u/0/me'; assert.equal(account(), false, 'Returning to an index cannot revive an earlier account epoch');
  const before = captureView(); invalidateViews(); assert.equal(before(), false);
});

test('cache shares current requests, rejects stale responses and cannot evict the newer account cache', async t => {
  const oldFetch = globalThis.fetch, previous = globalThis.location;
  t.after(() => { globalThis.fetch = oldFetch; globalThis.location = previous; resetMeStore(); });
  globalThis.location = new URL('https://accounts.example.test/u/0/me'); bindViewAccount({ id: 'cache-a' }, 0);
  const requests = [];
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
  const old = getActivity(); assert.equal(getActivity(), old); const rejected = assert.rejects(old, /superseded/);
  globalThis.location = new URL('https://accounts.example.test/u/1/me'); bindViewAccount({ id: 'cache-b' }, 1);
  const current = getActivity(); assert.equal(requests.length, 2); assert.equal(requests[1].options.headers['X-Gothwad-Authuser'], '1');
  requests[1].resolve(Response.json({ activity: [{ id: 'only-b' }] })); assert.deepEqual(await current, [{ id: 'only-b' }]);
  requests[0].resolve(Response.json({ activity: [{ id: 'only-a' }] })); await rejected;
  assert.equal(getActivity(), current, 'Late rejection cannot discard the newer account cache');
});

test('failed requests are not cached as empty successful histories or grants', async t => {
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; resetMeStore(); }); resetMeStore();
  let count = 0;
  globalThis.fetch = async () => { count++; return count === 1 ? Response.json({ error: 'Temporary failure' }, { status: 503 }) : Response.json({ connected: [{ app_id: 'actual' }] }); };
  await assert.rejects(getAuthorizations(), /Temporary failure/);
  assert.equal((await getAuthorizations()).connected[0].app_id, 'actual'); assert.equal(count, 2);
});

test('local MFA QR encoder is independently decodable and does not require a QR network service', () => {
  const uri = 'otpauth://totp/Accounts:review%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Accounts&algorithm=SHA1&digits=6&period=30';
  const qr = qrcode(0, 'M'); qr.addData(uri); qr.make();
  const count = qr.getModuleCount(), scale = 6, border = 4, size = (count + border * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) {
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
      const offset = (((y + border) * scale + j) * size + (x + border) * scale + i) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, size, size)?.data, uri);
  const source = readFileSync('web/me/js/mfa-settings.js', 'utf8');
  assert.match(source, /qr.addData\(enrollment.otpauth_uri\)/);
  assert.doesNotMatch(source, /https?:\/\/|localStorage|sessionStorage|console\.log/);
});

test('destructive, export and storage copy discloses actual Accounts-only limits', () => {
  const html = readFileSync('web/me/index.html', 'utf8'), deletion = readFileSync('web/me/js/dialogs-security.js', 'utf8');
  assert.match(html, /up to 100 recent activity records/); assert.match(html, /Not Mail messages, Drive files/);
  assert.match(html, /measurement time is not provided/); assert.match(html, /catalog listing is not an availability/);
  assert.match(deletion, /Other signed-in accounts are not deleted/); assert.match(deletion, /separate databases, backups or legal records/);
  assert.doesNotMatch(deletion, /strong password/); assert.match(deletion, /8–128 characters/);
});
