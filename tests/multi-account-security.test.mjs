/**
 * =============================================================================
 * MULTI-ACCOUNT SESSIONS — LEGACY UPGRADE, CSRF, DB OUTAGE & STORAGE AUDIT (7–9)
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import worker from '../cloudflare-worker/src/index.ts';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

test('7. Legacy browser (ONLY pre-existing gothwad_at/gothwad_rt/gothwad_sid cookies) -> byte-compatible /api/auth/me + OAuth + internal lookup', async () => {
  const env = makeEnv();
  const seeded = await seedAccount(env, { username: 'legacyuser', firstName: 'Legacy', lastName: 'Browser' });

  const multiJar = seeded.jar;
  const meMultiRaw = await (await multiJar.fetch(env, '/api/auth/me')).text();

  const oldBrowser = new BrowserJar();
  oldBrowser.cookies.set('gothwad_at', multiJar.cookies.get('gothwad_at'));
  oldBrowser.cookies.set('gothwad_rt', multiJar.cookies.get('gothwad_rt'));
  oldBrowser.cookies.set('gothwad_sid', multiJar.cookies.get('gothwad_sid'));
  assert.equal(oldBrowser.cookies.has('gothwad_accounts'), false);
  assert.equal(oldBrowser.cookies.has('gothwad_active'), false);
  assert.equal(oldBrowser.cookies.has('gothwad_sess_a'), false);

  const meLegacyRes = await oldBrowser.fetch(env, '/api/auth/me');
  assert.equal(meLegacyRes.status, 200);
  const meLegacyRaw = await meLegacyRes.text();
  assert.equal(
    meLegacyRaw,
    meMultiRaw,
    '/api/auth/me response must be 100% byte-identical for single-account browser',
  );

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

  const internalRes = await worker.fetch(
    new Request('https://api.gothwadtech.com/api/internal/usernames/legacyuser', {
      headers: { Authorization: `Bearer ${env.MAIL_INTERNAL_TOKEN}` },
    }),
    env,
  );
  assert.equal(internalRes.status, 200);
  assert.deepEqual(await internalRes.json(), { exists: true });

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
    undefined,
    'null',
    'https://evil.example',
    'https://gothwadtech.com.evil.example',
    'http://mail.gothwadtech.com',
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

  assert.equal((await (await browser.fetch(env, '/api/auth/me')).json()).user.username, 'csrf_b');
});

test('9. Resilience & security invariants: 6-slot max cap, 503 JSON on DB error (never false 401), and zero client storage tokens across web/', async () => {
  const env = makeEnv();
  const browser = new BrowserJar();

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

  await seedAccount(env, { username: 'slotuser_7', firstName: 'Overflow', lastName: 'Seven' });
  const seventhRes = await browser.fetch(env, '/api/auth/signin?add=1', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'slotuser_7', password: 'StrongPassword!123', remember: true, add: true },
  });
  assert.equal(seventhRes.status, 409);
  assert.equal((await seventhRes.json()).error, 'max_accounts_reached');

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
