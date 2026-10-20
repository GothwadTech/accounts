/**
 * =============================================================================
 * MULTI-ACCOUNT SESSIONS — FULL CONTRACT, SECURITY & COMPATIBILITY SUITE
 * =============================================================================
 * Covers all 8 required scenarios + Mail proxy invariants + storage audit:
 *   1. Two accounts signed in -> `GET /api/auth/accounts` returns both, `activeId` right
 *   2. Switch `a` -> `b` & `b` -> `a` & idempotent `a` -> `a` -> `GET /api/auth/me` flips with zero password re-entry
 *   3. Switch to revoked slot -> `409 { error: "account_not_signed_in" }`, dead slot pruned from `gothwad_accounts`, active unchanged
 *   4. Sign out of one account when two are active -> other account stays signed in
 *   5. Sign out of the last account -> `GET /api/auth/me` returns `401`
 *   6. Tampered `gothwad_accounts` cookie -> treated as absent, legacy fallback works, zero `500`
 *   7. Legacy browser (only pre-existing `gothwad_at`/`gothwad_rt`/`gothwad_sid` cookies) -> byte-identical `/api/auth/me` + OAuth + internal lookup
 *   8. CSRF protection -> `POST /api/auth/switch` & `POST /api/auth/accounts/:id/signout` reject missing/evil/null/http Origins with `403`
 *   9. Mail proxy cookie contract (`^gothwad_[a-z_]+=`, slots `^gothwad_sess_[a-z]$`, individual `Set-Cookie` headers, `503` on DB failure, zero `localStorage`/`sessionStorage` tokens in `web/`)
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import worker, { verifyAccountsCookieValue } from '../cloudflare-worker/src/index.ts';
import { createLocalD1 } from '../tools/local-d1.mjs';

function makeEnv(overrides = {}) {
  return {
    DB: createLocalD1(':memory:'),
    APP_DOMAIN: 'gothwadtech.com',
    AUTH_HUB_URL: 'https://accounts.gothwadtech.com',
    API_DOMAIN: 'api.gothwadtech.com',
    JWT_SECRET: 'test-multi-account-jwt-secret-key-2026-gothwad',
    MAIL_INTERNAL_TOKEN: 'mail-internal-test-secret-2026',
    DEV_MODE: 'false',
    ...overrides,
  };
}

/**
 * Simulates a real browser cookie jar while validating Mail Worker cookie invariants
 * on EVERY single response emitted by the Accounts Worker!
 */
class BrowserJar {
  constructor() {
    this.cookies = new Map();
    this.lastSetCookies = [];
  }

  ingest(response, { verifyMailContract = true } = {}) {
    const rawHeaders = response.headers.getSetCookie();
    this.lastSetCookies = rawHeaders;

    for (const header of rawHeaders) {
      if (verifyMailContract) {
        // Mail Worker `worker/src/session.ts` filter invariant:
        assert.match(
          header,
          /^gothwad_[a-z_]+=/,
          `Cookie name must strictly match /^gothwad_[a-z_]+=/ (got: ${header})`,
        );
        assert.ok(!header.startsWith('__Host-') && !header.startsWith('__Secure-'));

        const name = header.slice(0, header.indexOf('='));
        if (name.startsWith('gothwad_sess_')) {
          assert.match(name, /^gothwad_sess_[a-z]$/, `Slot cookie must match ^gothwad_sess_[a-z]$: ${name}`);
        }
        assert.match(header, /;\s*Path=\/(?:;|$)/);
        assert.match(header, /;\s*HttpOnly(?:;|$)/i);
        assert.match(header, /;\s*SameSite=Lax(?:;|$)/i);
        assert.match(header, /;\s*Secure(?:;|$)/i);
        assert.match(header, /;\s*Domain=\.gothwadtech\.com(?:;|$)/i);
      }

      const segments = header.split(';').map((s) => s.trim());
      const eqIdx = segments[0].indexOf('=');
      const name = segments[0].slice(0, eqIdx);
      const val = segments[0].slice(eqIdx + 1);
      const maxAgeSeg = segments.find((s) => /^max-age=/i.test(s));
      if (maxAgeSeg && Number(maxAgeSeg.split('=')[1]) <= 0) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
    }
  }

  headerValue() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async fetch(env, path, { method = 'GET', body, headers = {}, host = 'api.gothwadtech.com', origin } = {}) {
    const finalHeaders = { ...headers };
    const cookieStr = this.headerValue();
    if (cookieStr && finalHeaders.Cookie === undefined) {
      finalHeaders.Cookie = cookieStr;
    }
    if (origin !== null && origin !== undefined) {
      finalHeaders.Origin = origin;
    }
    let payload = body;
    if (body && typeof body === 'object') {
      finalHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await worker.fetch(new Request(`https://${host}${path}`, { method, headers: finalHeaders, body: payload }), env);
    this.ingest(res);
    return res;
  }
}

async function seedAccount(env, { username, firstName, lastName, password = 'StrongPassword!123' }) {
  const jar = new BrowserJar();
  const res = await jar.fetch(env, '/api/auth/signup', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: {
      first_name: firstName,
      last_name: lastName,
      username,
      password,
      recovery_email: `${username}@personal.example`,
    },
  });
  assert.equal(res.status, 201);
  return { data: await res.json(), jar, password };
}

test('1 & 2. Two accounts signed in -> GET /api/auth/accounts lists both & POST /api/auth/switch flips GET /api/auth/me without credentials', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'pawan', firstName: 'Pawan', lastName: 'Gothwad' });
  await seedAccount(env, { username: 'work', firstName: 'Pawan', lastName: 'Work' });

  const browser = new BrowserJar();

  // Sign in first account (`pawan` -> slot `a`)
  const loginA = await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'pawan', password: 'StrongPassword!123', remember: true },
  });
  assert.equal(loginA.status, 200);
  assert.equal(browser.cookies.get('gothwad_active'), 'a');

  // Sign in second account via add-account flow (`work` -> slot `b`)
  const loginB = await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'work', password: 'StrongPassword!123', remember: true, add: true },
  });
  assert.equal(loginB.status, 200);
  assert.equal(browser.cookies.get('gothwad_active'), 'b');

  // Verify `gothwad_accounts` cookie format `v1.<base64url(json)>.<hmac>` with ZERO tokens inside
  const rawAccountsCookie = browser.cookies.get('gothwad_accounts');
  assert.match(rawAccountsCookie, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const decodedEntries = await verifyAccountsCookieValue(rawAccountsCookie, env);
  assert.equal(decodedEntries.length, 2);
  for (const entry of decodedEntries) {
    assert.deepEqual(Object.keys(entry).sort(), ['addedAt', 'firstName', 'lastName', 'lastUsedAt', 'slot', 'username']);
  }

  // Test #1: GET /api/auth/accounts returns both accounts + exact `activeId: "b"`
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

  // Active account right now is `work` (`b`)
  const meBeforeSwitch = await (await browser.fetch(env, '/api/auth/me')).json();
  assert.equal(meBeforeSwitch.authenticated, true);
  assert.equal(meBeforeSwitch.user.username, 'work');

  // Test #2: Switch `b` -> `a` in 1 single request with ZERO password!
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

  // Idempotent switch `a` -> `a`
  const switchAgainA = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'a' },
  });
  assert.equal(switchAgainA.status, 200);
  assert.equal((await switchAgainA.json()).activeId, 'a');

  // Switch `a` -> `b` again in 1 request with ZERO password!
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

  // Make `a` (`alice`) the active account
  await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'a' },
  });

  // Remotely revoke ALL sessions for `bob` in D1 (e.g. remote sign-out from another device)
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(seededB.data.user.id).run();

  // Attempt to switch to revoked slot `b`
  const switchDead = await browser.fetch(env, '/api/auth/switch', {
    method: 'POST',
    origin: 'https://mail.gothwadtech.com',
    body: { id: 'b' },
  });
  assert.equal(switchDead.status, 409);
  assert.deepEqual(await switchDead.json(), { error: 'account_not_signed_in' });

  // Dead slot `b` was removed from `gothwad_accounts` AND `gothwad_sess_b` cleared
  assert.equal(browser.cookies.has('gothwad_sess_b'), false);
  const updatedCookieList = await verifyAccountsCookieValue(browser.cookies.get('gothwad_accounts'), env);
  assert.deepEqual(updatedCookieList.map((e) => e.slot), ['a']);

  // Active account `alice` (`a`) remains 100% untouched & signed in!
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

  // `b` (`secondary`) is active; sign out active slot `b` -> `a` (`primary`) automatically stays signed in & active!
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

  // Test #4 verification: `primary` stays signed in on `GET /api/auth/me`!
  const meAfterFirstSignout = await browser.fetch(env, '/api/auth/me');
  assert.equal(meAfterFirstSignout.status, 200);
  assert.equal((await meAfterFirstSignout.json()).user.username, 'primary');

  // Test #5: Sign out last remaining account (`a`) -> browser completely signed out, `/api/auth/me` returns 401!
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

  // Flip 1 character in the HMAC signature
  const flippedChar = sigB64[0] === 'A' ? 'B' : 'A';
  browser.cookies.set('gothwad_accounts', `${ver}.${payloadB64}.${flippedChar}${sigB64.slice(1)}`);
  assert.equal(await verifyAccountsCookieValue(browser.cookies.get('gothwad_accounts'), env), null);

  // Neither `/api/auth/me` nor `/api/auth/accounts` throws 500; user stays seamlessly signed in!
  const meWithTamperedSig = await browser.fetch(env, '/api/auth/me');
  assert.equal(meWithTamperedSig.status, 200);
  assert.equal((await meWithTamperedSig.json()).user.username, 'intact');

  const healedRes = await browser.fetch(env, '/api/auth/accounts');
  assert.equal(healedRes.status, 200);
  assert.equal((await healedRes.json()).accounts[0].username, 'intact');

  // Also test completely garbage / truncated cookie bytes WITH ONLY legacy cookies present!
  const legacyPlusGarbage = new BrowserJar();
  legacyPlusGarbage.cookies.set('gothwad_at', browser.cookies.get('gothwad_at'));
  legacyPlusGarbage.cookies.set('gothwad_rt', browser.cookies.get('gothwad_rt'));
  legacyPlusGarbage.cookies.set('gothwad_sid', browser.cookies.get('gothwad_sid'));
  legacyPlusGarbage.cookies.set('gothwad_accounts', 'v1.corrupted_payload_bytes.bad_hmac');

  const meLegacyWithGarbage = await legacyPlusGarbage.fetch(env, '/api/auth/me');
  assert.equal(meLegacyWithGarbage.status, 200);
  assert.equal((await meLegacyWithGarbage.json()).user.username, 'intact');
});

test('7. Legacy browser (ONLY pre-existing gothwad_at/gothwad_rt/gothwad_sid cookies) -> byte-compatible /api/auth/me + OAuth + internal lookup', async () => {
  const env = makeEnv();
  const seeded = await seedAccount(env, { username: 'legacyuser', firstName: 'Legacy', lastName: 'Browser' });

  // Capture `/api/auth/me` with multi-account cookies first
  const multiJar = seeded.jar;
  const meMultiRaw = await (await multiJar.fetch(env, '/api/auth/me')).text();

  // Construct an old single-account browser with ONLY legacy `gothwad_at`, `gothwad_rt`, `gothwad_sid`
  const oldBrowser = new BrowserJar();
  oldBrowser.cookies.set('gothwad_at', multiJar.cookies.get('gothwad_at'));
  oldBrowser.cookies.set('gothwad_rt', multiJar.cookies.get('gothwad_rt'));
  oldBrowser.cookies.set('gothwad_sid', multiJar.cookies.get('gothwad_sid'));
  assert.equal(oldBrowser.cookies.has('gothwad_accounts'), false);
  assert.equal(oldBrowser.cookies.has('gothwad_active'), false);
  assert.equal(oldBrowser.cookies.has('gothwad_sess_a'), false);

  // Proof of 100% byte-for-byte identical `/api/auth/me` body!
  const meLegacyRes = await oldBrowser.fetch(env, '/api/auth/me');
  assert.equal(meLegacyRes.status, 200);
  const meLegacyRaw = await meLegacyRes.text();
  assert.equal(meLegacyRaw, meMultiRaw, '/api/auth/me response must be 100% byte-identical for single-account browser');

  // Verify `/api/oauth/authorize` still renders consent screen for legacy browser
  const verifier = 'v'.repeat(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authzRes = await oldBrowser.fetch(
    env,
    `/api/oauth/authorize?client_id=gothwad-mail&redirect_uri=${encodeURIComponent(
      'https://mail.gothwadtech.com/auth/callback',
    )}&response_type=code&scope=profile+email&code_challenge=${challenge}&code_challenge_method=S256`,
    { host: 'accounts.gothwadtech.com' },
  );
  assert.equal(authzRes.status, 200);
  assert.match(await authzRes.text(), /legacyuser@gothwadtech\.com/);

  // Verify `/api/internal/usernames/:username` still returns exact `{ exists: true }`
  const internalRes = await worker.fetch(
    new Request('https://api.gothwadtech.com/api/internal/usernames/legacyuser', {
      headers: { Authorization: `Bearer ${env.MAIL_INTERNAL_TOKEN}` },
    }),
    env,
  );
  assert.equal(internalRes.status, 200);
  assert.deepEqual(await internalRes.json(), { exists: true });

  // Verify legacy browser seamlessly upgrades to slot `a` when adding a 2nd account without re-entering legacy password!
  await seedAccount(env, { username: 'secondacct', firstName: 'Second', lastName: 'Account' });
  const addRes = await oldBrowser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'secondacct', password: 'StrongPassword!123', remember: true, add: true },
  });
  assert.equal(addRes.status, 200);

  const promotedAccounts = await (await oldBrowser.fetch(env, '/api/auth/accounts')).json();
  assert.equal(promotedAccounts.activeId, 'b');
  assert.deepEqual(promotedAccounts.accounts.map((a) => a.username), ['legacyuser', 'secondacct']);
});

test('8. CSRF protection: POST /api/auth/switch and POST /api/auth/accounts/:id/signout reject missing, null, evil, and insecure Origins with 403', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'csrf_a', firstName: 'Csrf', lastName: 'One' });
  await seedAccount(env, { username: 'csrf_b', firstName: 'Csrf', lastName: 'Two' });

  const browser = new BrowserJar();
  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'csrf_a', password: 'StrongPassword!123', remember: true },
  });
  await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'csrf_b', password: 'StrongPassword!123', remember: true, add: true },
  });

  const rejectedOrigins = [
    undefined, // No Origin / No Referer header at all
    'null', // Sandboxed iframe Origin: null
    'https://evil.example', // Cross-site attacker domain
    'https://gothwadtech.com.evil.example', // Suffix-spoofed domain
    'http://mail.gothwadtech.com', // Insecure HTTP scheme on production domain
  ];

  for (const badOrigin of rejectedOrigins) {
    const swRes = await browser.fetch(env, '/api/auth/switch', {
      method: 'POST',
      origin: badOrigin,
      body: { id: 'a' },
    });
    assert.equal(swRes.status, 403, `Expected 403 for switch with Origin=${badOrigin}`);
    assert.equal((await swRes.json()).error, 'csrf_rejected');

    const outRes = await browser.fetch(env, '/api/auth/accounts/a/signout', {
      method: 'POST',
      origin: badOrigin,
    });
    assert.equal(outRes.status, 403, `Expected 403 for signout with Origin=${badOrigin}`);
    assert.equal((await outRes.json()).error, 'csrf_rejected');
  }

  // Confirm active account is STILL `b` (`csrf_b`) — none of the cross-site attacks changed state!
  assert.equal((await (await browser.fetch(env, '/api/auth/me')).json()).user.username, 'csrf_b');
});

test('9. Resilience & security invariants: 6-slot max cap, 503 JSON on DB error (never false 401), and zero client storage tokens across web/', async () => {
  const env = makeEnv();
  const browser = new BrowserJar();

  // Fill all 6 slots (`a`..`f`)
  for (let i = 0; i < 6; i++) {
    const uname = `slotuser_${i}`;
    await seedAccount(env, { username: uname, firstName: 'Slot', lastName: String(i) });
    const res = await browser.fetch(env, i === 0 ? '/api/auth/signin' : '/api/auth/signin?add=1', {
      method: 'POST',
      origin: 'https://accounts.gothwadtech.com',
      body: { identifier: uname, password: 'StrongPassword!123', remember: true, add: i > 0 },
    });
    assert.equal(res.status, 200);
  }

  // 7th account returns 409 `max_accounts_reached` cleanly without corrupting existing 6 slots
  await seedAccount(env, { username: 'slotuser_7', firstName: 'Overflow', lastName: 'Seven' });
  const seventhRes = await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'slotuser_7', password: 'StrongPassword!123', remember: true, add: true },
  });
  assert.equal(seventhRes.status, 409);
  assert.equal((await seventhRes.json()).error, 'max_accounts_reached');

  // Transient D1 query error returns 503 JSON (NEVER a false 401 and NEVER clears slot cookies!)
  const brokenDbEnv = {
    ...env,
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            throw new Error('D1_TRANSIENT_TIMEOUT');
          },
          async all() {
            throw new Error('D1_TRANSIENT_TIMEOUT');
          },
          async run() {
            throw new Error('D1_TRANSIENT_TIMEOUT');
          },
        };
      },
      async batch() {
        throw new Error('D1_TRANSIENT_TIMEOUT');
      },
    },
  };
  const cookieCountBeforeOutage = browser.cookies.size;
  const outageAccounts = await browser.fetch(brokenDbEnv, '/api/auth/accounts');
  assert.equal(outageAccounts.status, 503);
  assert.equal(outageAccounts.headers.getSetCookie().length, 0);
  assert.equal(browser.cookies.size, cookieCountBeforeOutage, 'Transient 503 must never wipe browser slot cookies');

  // Also simulate mid-flight query error AFTER cold-start bootstrap succeeded
  const realDb = env.DB;
  let failQueries = true;
  const flakyEnv = {
    ...env,
    DB: {
      prepare(sql) {
        if (!failQueries) return realDb.prepare(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            throw new Error('D1_QUERY_TIMEOUT');
          },
          async all() {
            throw new Error('D1_QUERY_TIMEOUT');
          },
          async run() {
            throw new Error('D1_QUERY_TIMEOUT');
          },
        };
      },
      batch: (...args) => realDb.batch(...args),
    },
  };
  await worker.fetch(new Request('https://api.gothwadtech.com/api/health'), { ...flakyEnv, DB: realDb });
  const midFlightMe = await browser.fetch(flakyEnv, '/api/auth/me');
  assert.equal(midFlightMe.status, 503);
  assert.equal(midFlightMe.headers.getSetCookie().length, 0);
  failQueries = false;

  // Static audit across EVERY file in `web/`: ZERO `localStorage.setItem` or `sessionStorage.setItem` except theme preference!
  function walkFiles(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkFiles(full, acc);
      else if (/\.(?:js|mjs|html)$/i.test(full)) acc.push(full);
    }
    return acc;
  }

  for (const file of walkFiles('web')) {
    const src = readFileSync(file, 'utf8');
    assert.equal(
      /sessionStorage\.setItem\s*\(/.test(src),
      false,
      `Forbidden sessionStorage.setItem found in ${file}`,
    );
    const localWrites = [...src.matchAll(/localStorage\.setItem\s*\(\s*([^,)]+)/g)].map((m) => m[1].trim());
    for (const keyExpr of localWrites) {
      assert.equal(
        keyExpr === 'THEME_KEY' || keyExpr === "'gothwad-theme'" || keyExpr === '"gothwad-theme"',
        true,
        `Forbidden localStorage.setItem(${keyExpr}) found in ${file}`,
      );
    }
  }
});
