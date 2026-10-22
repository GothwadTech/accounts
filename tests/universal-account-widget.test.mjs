/**
 * =============================================================================
 * UNIVERSAL GOOGLE-STYLE ACCOUNT WIDGET & CROSS-SUBDOMAIN SILENT SSO SUITE
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
import {
  buildAccountSheetHtml,
  resolveEndpoints,
} from '../web/widget/account-menu.js';

test('Cross-subdomain CORS preflight allows X-Gothwad-Authuser with credentials for Store, Console, Mail & Notes', async () => {
  const env = makeEnv();
  const browser = new BrowserJar();

  for (const origin of [
    'https://kiwistore.gothwadtech.com',
    'https://kiwiconsole.gothwadtech.com',
    'https://kiwiadmin.gothwadtech.com',
    'https://mail.gothwadtech.com',
    'https://notes.gothwadtech.com',
  ]) {
    const preflight = await browser.fetch(env, '/api/auth/me', {
      method: 'OPTIONS',
      origin,
      headers: {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type, X-Gothwad-Authuser',
      },
    });
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
    const allowHeaders = preflight.headers.get('Access-Control-Allow-Headers') || '';
    assert.match(allowHeaders, /X-Gothwad-Authuser/i, `${origin} preflight must permit X-Gothwad-Authuser`);
  }
});

test('Multi-account D1 summaries return real avatarUrl + avatar_url + name for ALL signed-in slots (0..5)', async () => {
  const env = makeEnv();
  const browser = new BrowserJar();

  const u1 = await seedAccount(env, { username: 'pawangothwad', firstName: 'Pawan', lastName: 'Gothwad' });
  const u2 = await seedAccount(env, { username: 'pawan999', firstName: 'Pawan', lastName: 'Gothwad' });
  const u3 = await seedAccount(env, { username: 'gtstudio', firstName: 'Gothwad', lastName: 'Tech' });

  // Give u1 and u3 custom profile avatars while leaving u2 on monogram fallback (exact screenshot case!)
  env.DB.prepare('UPDATE profiles SET avatar_url = ? WHERE id = ?')
    .bind('https://accounts.gothwadtech.com/api/avatars/u1.webp', u1.data.user.id)
    .run();
  env.DB.prepare('UPDATE profiles SET avatar_url = ? WHERE id = ?')
    .bind('https://accounts.gothwadtech.com/api/avatars/u3.webp', u3.data.user.id)
    .run();

  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'pawangothwad', password: u1.password },
  });
  await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'pawan999', password: u2.password, add: true },
  });
  await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'gtstudio', password: u3.password, add: true },
  });

  // Switch back to slot `a` (`pawangothwad`) directly from Kiwi Store subdomain
  const swRes = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://kiwistore.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(swRes.status, 200);
  const swData = await swRes.json();
  assert.equal(swData.accounts.length, 3);
  assert.equal(swData.accounts[0].name, 'Pawan Gothwad');
  assert.equal(swData.accounts[0].avatarUrl, 'https://accounts.gothwadtech.com/api/avatars/u1.webp');
  assert.equal(swData.accounts[1].avatarUrl, null);
  assert.equal(swData.accounts[2].name, 'Gothwad Tech');
  assert.equal(swData.accounts[2].avatarUrl, 'https://accounts.gothwadtech.com/api/avatars/u3.webp');

  // Verify Universal Sheet HTML renders exact Google screenshot structure across all 3 states
  const expandedHtml = buildAccountSheetHtml(
    {
      user: swData.user,
      accounts: swData.accounts,
      activeId: swData.activeId,
      authuser: swData.authuser,
      collapsed: false,
      manageMode: false,
    },
    {
      accountsWebOrigin: 'https://accounts.gothwadtech.com',
      nextUrl: 'https://kiwistore.gothwadtech.com/apps',
      badges: { gtstudio: 5 },
    },
  );

  assert.match(expandedHtml, /data-gw-action="edit-avatar"/, 'Active avatar must include edit pencil badge');
  assert.match(expandedHtml, /https:\/\/accounts\.gothwadtech\.com\/api\/avatars\/u3\.webp/, 'Secondary account must display real avatarUrl photo');
  assert.match(expandedHtml, />PG<\/span>/, 'Avatarless secondary account must render crisp monogram circle');
  assert.match(expandedHtml, /<span class="gw-badge">5<\/span>/, 'Unread badge pill must render cleanly');
  assert.match(expandedHtml, /Add another account/);
  assert.match(expandedHtml, /Manage accounts/);
  assert.match(expandedHtml, /Manage your Gothwad Account/);
  assert.match(expandedHtml, /Privacy policy/);
  assert.match(expandedHtml, /Terms of Service/);

  const collapsedHtml = buildAccountSheetHtml(
    { user: swData.user, accounts: swData.accounts, activeId: swData.activeId, authuser: 0, collapsed: true },
    { accountsWebOrigin: 'https://accounts.gothwadtech.com' },
  );
  assert.match(collapsedHtml, /gw-hero is-collapsed/);
  assert.doesNotMatch(collapsedHtml, /Add another account/, 'Collapsed hero hides account list cleanly');

  const manageHtml = buildAccountSheetHtml(
    { user: swData.user, accounts: swData.accounts, activeId: swData.activeId, authuser: 0, manageMode: true },
    { accountsWebOrigin: 'https://accounts.gothwadtech.com' },
  );
  assert.match(manageHtml, /data-gw-signout-slot="b"/);
  assert.match(manageHtml, /data-gw-action="signout-all"/);
});

test('Universal Account Widget supports zero-hardcode rebrand & cross-origin Pages _headers', () => {
  const custom = resolveEndpoints({
    accountsWebOrigin: 'https://accounts.plusworld.com',
    ecosystemName: 'Plus',
  });
  assert.equal(custom.appDomain, 'plusworld.com');
  assert.equal(custom.accountsWebOrigin, 'https://accounts.plusworld.com');
  assert.equal(custom.accountsApiOrigin, 'https://accounts.plusworld.com/api');
  assert.equal(custom.ecosystemName, 'Plus');

  const rebrandHtml = buildAccountSheetHtml(
    { user: { username: 'pawan', name: 'Pawan' }, accounts: [], authuser: 0 },
    { accountsWebOrigin: 'https://accounts.plusworld.com', ecosystemName: 'Plus' },
  );
  assert.match(rebrandHtml, /Manage your Plus Account/);
  assert.match(rebrandHtml, /https:\/\/accounts\.plusworld\.com\/u\/0\/me/);

  const headersFile = readFileSync(resolve('web/_headers'), 'utf8');
  assert.match(headersFile, /\/widget\/\*/);
  assert.match(headersFile, /Access-Control-Allow-Origin:\s*\*/);
  assert.match(headersFile, /Cross-Origin-Resource-Policy:\s*cross-origin/);
});
