/**
 * =============================================================================
 * SHARED MULTI-ACCOUNT BROWSER HARNESS & MAIL COOKIE CONTRACT VALIDATOR
 * =============================================================================
 */

import assert from 'node:assert/strict';
import worker from '../../cloudflare-worker/src/index.ts';
import { createLocalD1 } from '../../tools/local-d1.mjs';

export function makeEnv(overrides = {}) {
  return {
    DB: createLocalD1(':memory:'),
    APP_DOMAIN: 'gothwadtech.com',
    AUTH_HUB_URL: 'https://accounts.gothwadtech.com',
    API_DOMAIN: 'api.gothwadtech.com',
    JWT_SECRET: 'test-multi-account-jwt-secret-key-2026-gothwad',
    SSO_PROXY_TOKEN: 'synthetic-proxy-secret-for-tests-only-2026',
    MAIL_INTERNAL_TOKEN: 'mail-internal-test-secret-2026',
    DEV_MODE: 'false',
    ...overrides,
  };
}

/**
 * Simulates a real browser cookie jar while validating Mail Worker cookie invariants
 * on EVERY single response emitted by the Accounts Worker.
 */
export class BrowserJar {
  constructor() {
    this.cookies = new Map();
    this.lastSetCookies = [];
  }

  ingest(response, { verifyMailContract = true } = {}) {
    const rawHeaders = response.headers.getSetCookie();
    this.lastSetCookies = rawHeaders;

    for (const header of rawHeaders) {
      if (verifyMailContract) {
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
    if (origin === undefined && !new Headers(headers).has('Origin') && !new Headers(headers).has('Referer')) {
      finalHeaders.Origin = env.AUTH_HUB_URL;
    }
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
    const res = await worker.fetch(
      new Request(`https://${host}${path}`, { method, headers: finalHeaders, body: payload }),
      env,
    );
    this.ingest(res);
    return res;
  }
}

export async function seedAccount(env, { username, firstName, lastName, password = 'StrongPassword!123' }) {
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
