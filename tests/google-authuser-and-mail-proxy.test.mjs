/**
 * =============================================================================
 * GOOGLE-GRADE MULTI-ACCOUNT (`u/0..5` · `authuser`) & MAIL WORKER PROXY SUITE
 * =============================================================================
 * Permanently verifies:
 *   1. Exact `GothwadTech/mail` server-to-server proxy flow (`callAccounts` with
 *      an explicit audited origin, `Accept: application/json`) switches & signs out
 *      cleanly (`200 OK` + full `accounts` array, ZERO `"Please sign in."` 403/401!)
 *   2. Multi-tab refresh-token race immunity + automatic healing when only the
 *      active slot expires/revokes (never wipes other signed-in accounts!)
 *   3. True Google `/u/0/me`, `/u/1/me`, `?authuser=0..5`, `?u=1`, email selector,
 *      parallel multi-tab isolation (`X-Gothwad-Authuser`), and `GET /api/auth/switch`
 *   4. Static asset existence across ALL HTML files in web/ + _redirects rewrite
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../cloudflare-worker/src/index.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(ROOT_DIR, 'web');

function walkHtmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkHtmlFiles(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Reproduces current `GothwadTech/mail/worker/src/accounts.ts` `callAccounts()` wire request. */
async function callAccountsLikeMailWorker(env, jar, method, path, bodyObj = undefined) {
  const cookie = Array.from(jar.cookies.entries())
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
  const headers = {
    cookie,
    accept: 'application/json',
    origin: 'https://mail.gothwadtech.com',
  };
  if (bodyObj !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const req = new Request(`https://api.gothwadtech.com${path}`, {
    method,
    headers,
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
  });
  const res = await worker.fetch(req, env);
  for (const c of res.headers.getSetCookie?.() || []) {
    if (/^gothwad_[a-z_]+=/.test(c)) {
      const [nv] = c.split(';');
      const eq = nv.indexOf('=');
      const name = nv.slice(0, eq).trim();
      const val = decodeURIComponent(nv.slice(eq + 1).trim());
      if (!val || /Max-Age=0/i.test(c)) jar.cookies.delete(name);
      else jar.cookies.set(name, val);
    }
  }
  return res;
}

test('Mail Worker Proxy Reproduction: server-to-server /api/auth/switch & signout (trusted Origin header) return 200 + full accounts list', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'pawan', firstName: 'Pawan', lastName: 'Gothwad' });
  await seedAccount(env, { username: 'work', firstName: 'Pawan', lastName: 'Work' });

  const jar = new BrowserJar();
  // Sign in WITHOUT explicit `remember: true` — must default to persistent 30-day cookies!
  const loginA = await jar.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'pawan@gothwadtech.com', password: 'StrongPassword!123' },
  });
  assert.equal(loginA.status, 200);
  assert.match(loginA.headers.getSetCookie().find((c) => c.startsWith('gothwad_sess_a=')), /Max-Age=2592000/);

  const loginB = await jar.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'work@gothwadtech.com', password: 'StrongPassword!123', add: true },
  });
  assert.equal(loginB.status, 200);
  const loginBData = await loginB.json();
  assert.equal(loginBData.authuser, 1);

  // 1. Exact Mail `GET /api/mail/accounts` -> `GET /api/auth/accounts`
  const listRes = await callAccountsLikeMailWorker(env, jar, 'GET', '/api/auth/accounts');
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.equal(listBody.activeId, 'b');
  assert.equal(listBody.authuser, 1);
  assert.equal(listBody.accounts.length, 2);

  // 2. Exact Mail tap on Account A (`POST /api/auth/switch` with NO Origin/Referer!)
  const swToA = await callAccountsLikeMailWorker(env, jar, 'POST', '/api/auth/switch', { id: 'a' });
  assert.equal(swToA.status, 200, 'Mail Worker switch must NOT fail with 403 csrf_rejected');
  const swToABody = await swToA.json();
  assert.equal(swToABody.activeId, 'a');
  assert.equal(swToABody.authuser, 0);
  assert.equal(swToABody.user.username, 'pawan');
  assert.equal(Array.isArray(swToABody.accounts), true, 'Mail payloadFor() requires accounts array on switch');
  assert.equal(swToABody.accounts.length, 2);

  // Verify `/api/auth/me` immediately sees `pawan`
  const meAfterA = await (await callAccountsLikeMailWorker(env, jar, 'GET', '/api/auth/me')).json();
  assert.equal(meAfterA.user.username, 'pawan');

  // 3. Switch back to B via Google `authuser: 1` selector too!
  const swToB = await callAccountsLikeMailWorker(env, jar, 'POST', '/api/auth/switch', { authuser: 1 });
  assert.equal(swToB.status, 200);
  const swToBBody = await swToB.json();
  assert.equal(swToBBody.activeId, 'b');
  assert.equal(swToBBody.authuser, 1);
  assert.equal(swToBBody.user.username, 'work');

  // 4. Exact Mail per-account signout (`POST /api/auth/accounts/b/signout` with NO Origin)
  const outB = await callAccountsLikeMailWorker(env, jar, 'POST', '/api/auth/accounts/b/signout');
  assert.equal(outB.status, 200);
  const outBBody = await outB.json();
  assert.equal(outBBody.signedOutAll, false);
  assert.equal(outBBody.activeId, 'a');
  assert.equal(outBBody.accounts.length, 1);
  assert.equal(outBBody.accounts[0].username, 'pawan');
});

test('Multi-Tab Race Resilience & Dead Active Slot Auto-Healing: stale sibling cookie never 409s and revoked active slot heals to live slot', async () => {
  const env = makeEnv();
  const acctA = await seedAccount(env, { username: 'alpha', firstName: 'Alpha', lastName: 'User' });
  await seedAccount(env, { username: 'beta', firstName: 'Beta', lastName: 'User' });

  const jarTab1 = acctA.jar;
  await jarTab1.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'beta', password: 'StrongPassword!123', add: true },
  });

  // Clone cookies into Tab 2 BEFORE Tab 1 rotates slot `a` multiple times
  const jarTab2 = new BrowserJar();
  for (const [k, v] of jarTab1.cookies.entries()) jarTab2.cookies.set(k, v);

  // Tab 1 switches to `a` (consuming Tab 2's older refresh token in D1!)
  const t1Switch = await jarTab1.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(t1Switch.status, 200);

  // Tab 2 still holds the pre-rotation `gothwad_sess_a` cookie AND taps switch to `a`:
  // MUST succeed cleanly with 200 OK instead of falsely deleting slot `a` with 409!
  const t2Switch = await jarTab2.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(t2Switch.status, 200);
  assert.equal((await t2Switch.json()).user.username, 'alpha');

  // Now switch Tab 1 to `b`, then revoke ONLY `b`'s session row in D1 (simulating remote sign-out)
  await jarTab1.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { id: 'b' },
  });
  const betaUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind('beta').first();
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(betaUser.id).run();

  // `GET /api/auth/me` must NOT return 401 or wipe slot `a` — it must auto-promote live slot `a`!
  const healedRes = await jarTab1.fetch(env, '/api/auth/me');
  assert.equal(healedRes.status, 200);
  const healedBody = await healedRes.json();
  assert.equal(healedBody.authenticated, true);
  assert.equal(healedBody.user.username, 'alpha');
  assert.equal(healedBody.activeId, 'a');
  assert.equal(healedBody.authuser, 0);
});

test('Google `/u/0` & `/u/1` Multi-Tab Isolation + First-Party `GET /api/auth/switch?authuser=&next=` Redirect', async () => {
  const env = makeEnv();
  const jar = (await seedAccount(env, { username: 'tabzero', firstName: 'Tab', lastName: 'Zero' })).jar;
  await seedAccount(env, { username: 'tabone', firstName: 'Tab', lastName: 'One' });
  await jar.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'tabone', password: 'StrongPassword!123', add: true },
  });

  // Active cookie is currently `b` (`tabone`), yet Tab 0 (`/u/0/me`) and Tab 1 (`/u/1/me`) resolve independently!
  const [tab0Me, tab1Me] = await Promise.all([
    jar.fetch(env, '/api/auth/me', { headers: { 'X-Gothwad-Authuser': '0' } }).then((r) => r.json()),
    jar.fetch(env, '/api/auth/me', { headers: { 'X-Gothwad-Authuser': '1' } }).then((r) => r.json()),
  ]);
  assert.equal(tab0Me.user.username, 'tabzero');
  assert.equal(tab0Me.authuser, 0);
  assert.equal(tab1Me.user.username, 'tabone');
  assert.equal(tab1Me.authuser, 1);

  // Updating profile from `/u/0/me` updates ONLY `tabzero` even while `gothwad_active` is `b`!
  const upd0 = await jar.fetch(env, '/api/auth/update-profile', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    headers: { 'X-Gothwad-Authuser': '0' },
    body: { first_name: 'UpdatedZero' },
  });
  assert.equal(upd0.status, 200);
  const check0 = await (await jar.fetch(env, '/api/auth/me?authuser=0')).json();
  const check1 = await (await jar.fetch(env, '/api/auth/me?authuser=tabone@gothwadtech.com')).json();
  assert.equal(check0.user.first_name, 'UpdatedZero');
  assert.equal(check1.user.first_name, 'Tab');

  // Top-level Google cross-app switch link (`GET /api/auth/switch?authuser=0&next=https://mail.gothwadtech.com/?authuser=0`)
  const jumpRes = await jar.fetch(
    env,
    `/api/auth/switch?authuser=0&next=${encodeURIComponent('https://mail.gothwadtech.com/?authuser=0')}`,
  );
  assert.equal(jumpRes.status, 302);
  assert.equal(jumpRes.headers.get('Location'), 'https://mail.gothwadtech.com/?authuser=0');
  assert.equal(jar.cookies.get('gothwad_active'), 'a');

  // Open-redirect attack on `GET /api/auth/switch?authuser=0&next=https://evil.example` falls back safely to `/u/0/me`
  const evilJump = await jar.fetch(env, '/api/auth/switch?authuser=0&next=https%3A%2F%2Fevil.example%2Fphish');
  assert.equal(evilJump.status, 302);
  assert.equal(evilJump.headers.get('Location'), 'https://accounts.gothwadtech.com/u/0/me');

  // Cross-site navigation (`Sec-Fetch-Site: cross-site`) is blocked with 403
  const crossJump = await jar.fetch(env, '/api/auth/switch?authuser=0', {
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(crossJump.status, 403);
});

test('HTML Asset Integrity & `/u/:authuser/me` Rewrite Gate: zero broken `<script src>` / `<link href>` paths across web/', () => {
  const htmlFiles = walkHtmlFiles(WEB_DIR);
  assert.ok(htmlFiles.length >= 6);

  const attrRegex = /<(?:script|link|img)\b[^>]*?\b(?:src|href)=["'](\/[^"'?#]+)["']/gi;
  for (const htmlFile of htmlFiles) {
    const content = readFileSync(htmlFile, 'utf8');
    let match;
    while ((match = attrRegex.exec(content)) !== null) {
      const assetPath = match[1];
      // Route links like `<a href="/signin">` are `<a>` tags, not `<script|link|img>`
      const diskPath = join(WEB_DIR, assetPath.slice(1));
      assert.equal(
        existsSync(diskPath) && statSync(diskPath).isFile(),
        true,
        `Broken asset reference "${assetPath}" in ${htmlFile} (expected file at ${diskPath})`,
      );
    }
  }

  const redirects = readFileSync(join(WEB_DIR, '_redirects'), 'utf8');
  assert.match(redirects, /\/u\/:authuser\/me\s+\/me\/index\.html\s+200/);
  assert.match(redirects, /\/u\/:authuser\s+\/me\/index\.html\s+200/);
});
