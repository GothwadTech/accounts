/** Local embedded-cookie transport must not alter production SSO or security guards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSetCookie } from '../tools/preview-cookies.mjs';
import { makeCookie } from '../cloudflare-worker/src/cookies.ts';

const local = { DEV_MODE: 'true', LOCAL_PREVIEW_PROXY: 'true', E2B_SANDBOX_ID: 'syntheticpreview' };
const cookie = 'gothwad_sess_a=synthetic; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=123';

test('cookie adaptation requires explicit local Arena preview, not ordinary dev or production', () => {
  for (const env of [{}, { DEV_MODE: 'true' }, { ...local, LOCAL_PREVIEW_PROXY: 'false' },
    { ...local, E2B_SANDBOX_ID: '' }, { NODE_ENV: 'production' }]) {
    assert.equal(previewSetCookie(cookie, env), cookie);
  }
  for (const override of [{ NODE_ENV: 'production' }, { DEV_MODE: 'false' }, { CI: 'true' }, { CF_PAGES: '1' }]) {
    assert.throws(() => previewSetCookie(cookie, { ...local, ...override }));
  }
});

test('preview uses host-only Secure HttpOnly partitioned cookies while retaining values and lifetimes', () => {
  const adapted = previewSetCookie(cookie, local);
  assert.equal(adapted, 'gothwad_sess_a=synthetic; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=123; Partitioned');
  assert.equal(previewSetCookie(adapted, local), adapted);
  for (const name of ['gothwad_sess_f', 'gothwad_active', 'gothwad_accounts', 'gothwad_at', 'gothwad_rt', 'gothwad_sid']) {
    const clearing = previewSetCookie(`${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`, local);
    assert.match(clearing, /; Max-Age=0; Partitioned$/);
    assert.match(clearing, /; SameSite=None;/);
  }
  assert.equal(previewSetCookie('unrelated=value; SameSite=Lax', local), 'unrelated=value; SameSite=Lax');
});

test('preview refuses parent-domain or weakened authentication cookies', () => {
  for (const malformed of [cookie + '; Domain=.example.test', cookie.replace('; Secure', ''),
    cookie.replace('; HttpOnly', ''), cookie.replace('; Path=/', ''), cookie.replace('SameSite=Lax', 'SameSite=None')]) {
    assert.throws(() => previewSetCookie(malformed, local));
  }
});

test('production Worker still emits parent-domain SameSite=Lax SSO cookies without Partitioned', () => {
  const request = new Request('https://accounts.example.test/api/auth/signin');
  const emitted = makeCookie(request, { DEV_MODE: 'false', APP_DOMAIN: 'example.test' }, 'gothwad_sess_a', 'synthetic', 123);
  assert.match(emitted, /; Domain=\.example\.test/);
  assert.match(emitted, /; SameSite=Lax/);
  assert.match(emitted, /; HttpOnly/);
  assert.match(emitted, /; Secure/);
  assert.doesNotMatch(emitted, /Partitioned|SameSite=None/);
  assert.equal(previewSetCookie(emitted, {}), emitted);
});
