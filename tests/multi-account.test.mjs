/**
 * =============================================================================
 * MULTI-ACCOUNT SESSIONS — SLOT LIST, SWITCHING, PRUNING & SIGNOUT (SCENARIOS 1–6)
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccountsCookieValue } from '../cloudflare-worker/src/index.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

test('1 & 2. Two accounts signed in -> GET /api/auth/accounts lists both & POST /api/auth/switch flips GET /api/auth/me without credentials', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'pawan', firstName: 'Pawan', lastName: 'Gothwad' });
  await seedAccount(env, { username: 'work', firstName: 'Pawan', lastName: 'Work' });

  const browser = new BrowserJar();

  const loginA = await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'pawan', password: 'StrongPassword!123', remember: true },
  });
  assert.equal(loginA.status, 200);
  assert.equal(browser.cookies.get('gothwad_active'), 'a');

  const loginB = await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'work', password: 'StrongPassword!123', remember: true, add: true },
  });
  assert.equal(loginB.status, 200);
  assert.equal(browser.cookies.get('gothwad_active'), 'b');

  const rawAccountsCookie = browser.cookies.get('gothwad_accounts');
  assert.match(rawAccountsCookie, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const decodedEntries = await verifyAccountsCookieValue(rawAccountsCookie, env);
  assert.equal(decodedEntries.length, 2);
  for (const entry of decodedEntries) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'addedAt',
      'firstName',
      'lastName',
      'lastUsedAt',
      'slot',
      'username',
    ]);
  }

  const listRes = await browser.fetch(env, '/api/auth/accounts', {
    origin: 'https://mail.gothwadtech.com',
  });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.headers.get('Access-Control-Allow-Origin'), 'https://mail.gothwadtech.com');
  assert.equal(listRes.headers.get('Access-Control-Allow-Credentials'), 'true');
  const listJson = await listRes.json();
  assert.equal(listJson.activeId, 'b');
  assert.equal(listJson.accounts.length, 2);
  assert.deepEqual(
    listJson.accounts.map((a) => ({
      id: a.id,
      username: a.username,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
    })),
    [
      {
        id: 'a',
        username: 'pawan',
        firstName: 'Pawan',
        lastName: 'Gothwad',
        email: 'pawan@gothwadtech.com',
      },
      {
        id: 'b',
        username: 'work',
        firstName: 'Pawan',
        lastName: 'Work',
        email: 'work@gothwadtech.com',
      },
    ],
  );
  assert.ok(listJson.accounts[0].lastUsedAt && listJson.accounts[1].lastUsedAt);

  const meBeforeSwitch = await (await browser.fetch(env, '/api/auth/me')).json();
  assert.equal(meBeforeSwitch.authenticated, true);
  assert.equal(meBeforeSwitch.user.username, 'work');

  const switchToA = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(switchToA.status, 200);
  const switchToAData = await switchToA.json();
  assert.equal(switchToAData.ok, true);
  assert.equal(switchToAData.activeId, 'a');
  assert.equal(switchToAData.user.username, 'pawan');
  assert.equal(switchToAData.access_token, undefined, 'No JWT returned in switch JSON body');

  const meAfterA = await (await browser.fetch(env, '/api/auth/me')).json();
  assert.equal(meAfterA.authenticated, true);
  assert.equal(meAfterA.user.username, 'pawan');

  const switchAgainA = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(switchAgainA.status, 200);
  assert.equal((await switchAgainA.json()).activeId, 'a');

  const switchBackToB = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'b' },
  });
  assert.equal(switchBackToB.status, 200);
  assert.equal((await switchBackToB.json()).activeId, 'b');

  const meAfterB = await (await browser.fetch(env, '/api/auth/me')).json();
  assert.equal(meAfterB.authenticated, true);
  assert.equal(meAfterB.user.username, 'work');
});

test('3. Switch to a slot whose session was revoked -> 409 account_not_signed_in, dead slot removed from gothwad_accounts, active account unchanged', async () => {
  const env = makeEnv();
  const seededA = await seedAccount(env, { username: 'alice', firstName: 'Alice', lastName: 'One' });
  const seededB = await seedAccount(env, { username: 'bob', firstName: 'Bob', lastName: 'Two' });

  const browser = new BrowserJar();
  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'alice', password: seededA.password, remember: true },
  });
  await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'bob', password: seededB.password, remember: true, add: true },
  });

  await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'a' },
  });

  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(seededB.data.user.id).run();

  const switchDead = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'b' },
  });
  assert.equal(switchDead.status, 409);
  assert.deepEqual(await switchDead.json(), { error: 'account_not_signed_in' });

  assert.equal(browser.cookies.has('gothwad_sess_b'), false);
  const updatedCookieList = await verifyAccountsCookieValue(browser.cookies.get('gothwad_accounts'), env);
  assert.deepEqual(updatedCookieList.map((e) => e.slot), ['a']);

  const meStillAlice = await browser.fetch(env, '/api/auth/me');
  assert.equal(meStillAlice.status, 200);
  assert.equal((await meStillAlice.json()).user.username, 'alice');
});

test('4 & 5. Sign out one account keeps the other signed in; signing out last account makes GET /api/auth/me return 401', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'primary', firstName: 'Primary', lastName: 'User' });
  await seedAccount(env, { username: 'secondary', firstName: 'Secondary', lastName: 'User' });

  const browser = new BrowserJar();
  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'primary', password: 'StrongPassword!123', remember: true },
  });
  await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'secondary', password: 'StrongPassword!123', remember: true, add: true },
  });

  const signOutB = await browser.fetch(env, '/api/auth/accounts/b/signout', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
  });
  assert.equal(signOutB.status, 200);
  const signOutBJson = await signOutB.json();
  assert.equal(signOutBJson.ok, true);
  assert.equal(signOutBJson.signedOutAll, false);
  assert.equal(signOutBJson.activeId, 'a');
  assert.equal(signOutBJson.accounts.length, 1);
  assert.equal(signOutBJson.accounts[0].username, 'primary');
  assert.equal(browser.cookies.has('gothwad_sess_b'), false);
  assert.equal(browser.cookies.get('gothwad_active'), 'a');

  const meAfterFirstSignout = await browser.fetch(env, '/api/auth/me');
  assert.equal(meAfterFirstSignout.status, 200);
  assert.equal((await meAfterFirstSignout.json()).user.username, 'primary');

  const signOutLast = await browser.fetch(env, '/api/auth/accounts/a/signout', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
  });
  assert.equal(signOutLast.status, 200);
  const signOutLastJson = await signOutLast.json();
  assert.equal(signOutLastJson.ok, true);
  assert.equal(signOutLastJson.signedOutAll, true);
  assert.equal(signOutLastJson.activeId, null);
  assert.deepEqual(signOutLastJson.accounts, []);

  const meAfterAllOut = await browser.fetch(env, '/api/auth/me');
  assert.equal(meAfterAllOut.status, 401);
  assert.deepEqual(await meAfterAllOut.json(), { authenticated: false });

  const accountsAfterAllOut = await browser.fetch(env, '/api/auth/accounts');
  assert.equal(accountsAfterAllOut.status, 401);
  assert.deepEqual(await accountsAfterAllOut.json(), { authenticated: false });
});

test('6. Tampered gothwad_accounts cookie (1-byte flip in signature or payload) -> treated as absent, legacy fallback works, zero 500s', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'intact', firstName: 'Intact', lastName: 'Session' });

  const browser = new BrowserJar();
  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'intact', password: 'StrongPassword!123', remember: true },
  });

  const validSigned = browser.cookies.get('gothwad_accounts');
  const [ver, payloadB64, sigB64] = validSigned.split('.');

  const flippedChar = sigB64[0] === 'A' ? 'B' : 'A';
  browser.cookies.set('gothwad_accounts', `${ver}.${payloadB64}.${flippedChar}${sigB64.slice(1)}`);
  assert.equal(await verifyAccountsCookieValue(browser.cookies.get('gothwad_accounts'), env), null);

  const meWithTamperedSig = await browser.fetch(env, '/api/auth/me');
  assert.equal(meWithTamperedSig.status, 200);
  assert.equal((await meWithTamperedSig.json()).user.username, 'intact');

  const healedRes = await browser.fetch(env, '/api/auth/accounts');
  assert.equal(healedRes.status, 200);
  assert.equal((await healedRes.json()).accounts[0].username, 'intact');

  const legacyPlusGarbage = new BrowserJar();
  legacyPlusGarbage.cookies.set('gothwad_at', browser.cookies.get('gothwad_at'));
  legacyPlusGarbage.cookies.set('gothwad_rt', browser.cookies.get('gothwad_rt'));
  legacyPlusGarbage.cookies.set('gothwad_sid', browser.cookies.get('gothwad_sid'));
  legacyPlusGarbage.cookies.set('gothwad_accounts', 'v1.corrupted_payload_bytes.bad_hmac');

  const meLegacyWithGarbage = await legacyPlusGarbage.fetch(env, '/api/auth/me');
  assert.equal(meLegacyWithGarbage.status, 200);
  assert.equal((await meLegacyWithGarbage.json()).user.username, 'intact');
});
