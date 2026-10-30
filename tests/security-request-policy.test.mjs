import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../cloudflare-worker/src/index.ts';
import { buildCorsHeaders } from '../cloudflare-worker/src/http.ts';
import { consentPageHtml } from '../cloudflare-worker/src/oauth-helpers.ts';
import { makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

const request = new Request('https://api.gothwadtech.com/api/auth/me');

for (const origin of [
  'http://mail.gothwadtech.com', 'http://localhost:3000', 'http://localhost.attacker.example',
  'http://127.0.0.1.attacker.example', 'https://gothwadtech.com.attacker.example',
  'https://user:password@mail.gothwadtech.com', 'https://mail.gothwadtech.com/path',
  'https://mail.gothwadtech.com:8443', 'null', 'not-an-origin',
]) {
  test(`production CORS refuses unsafe origin ${origin}`, () => {
    const req = new Request(request, { headers: { Origin: origin } });
    const headers = buildCorsHeaders(req, makeEnv());
    assert.equal(headers.has('Access-Control-Allow-Origin'), false);
    assert.equal(headers.has('Access-Control-Allow-Credentials'), false);
    assert.equal(headers.get('Vary'), 'Origin');
  });
}

test('CORS preserves HTTPS sibling SSO, exact HTTPS previews, and local development', () => {
  const env = makeEnv({ ALLOWED_ORIGINS: 'https://preview.example' });
  for (const origin of ['https://accounts.gothwadtech.com', 'https://mail.gothwadtech.com',
    'https://gothwadtech.com', 'https://preview.example']) {
    const headers = buildCorsHeaders(new Request(request, { headers: { Origin: origin } }), env);
    assert.equal(headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(headers.get('Access-Control-Allow-Credentials'), 'true');
  }
  const local = buildCorsHeaders(new Request(request, { headers: { Origin: 'http://localhost:3000' } }),
    { ...env, DEV_MODE: 'true' });
  assert.equal(local.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  const insecureExtra = buildCorsHeaders(new Request(request, { headers: { Origin: 'http://remote.example' } }),
    { ...env, ALLOWED_ORIGINS: 'http://remote.example' });
  assert.equal(insecureExtra.has('Access-Control-Allow-Origin'), false);
});

test('hostile browser mutations are rejected before database access across auth and OAuth', async () => {
  const env = makeEnv({ DB: undefined });
  for (const path of ['/auth/signin', '/auth/signup', '/auth/refresh', '/auth/signout',
    '/auth/update-profile', '/auth/change-password', '/auth/delete-account',
    '/auth/forgot-password', '/auth/reset-password', '/auth/recovery-email/request',
    '/auth/recovery-email/verify', '/auth/mfa/enroll', '/auth/mfa/confirm',
    '/auth/mfa/verify', '/auth/mfa/disable', '/auth/mfa/recovery-codes', '/oauth/decision', '/oauth/token']) {
    for (const evidence of [
      { Origin: 'https://evil.example' }, { Origin: 'null' },
      { Referer: 'https://evil.example/attack' }, { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const response = await worker.fetch(new Request(`https://api.gothwadtech.com/api${path}`, {
        method: 'POST', headers: evidence, body: '{}',
      }), env);
      assert.equal(response.status, 403, `${path}: ${JSON.stringify(evidence)}`);
      assert.equal((await response.json()).error, 'csrf_rejected');
      assert.equal(response.headers.getSetCookie().length, 0);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
});

test('trusted browser requests and authenticated headerless proxies retain compatibility', async () => {
  const env = makeEnv();
  const { jar } = await seedAccount(env, { username: 'trustedbrowser', firstName: 'Trusted', lastName: 'Browser' });
  for (const headers of [
    { Origin: 'https://accounts.gothwadtech.com' },
    { Referer: 'https://mail.gothwadtech.com/inbox?authuser=0' },
    { Accept: 'application/json', 'X-Gothwad-Proxy-Token': env.SSO_PROXY_TOKEN },
  ]) {
    const response = await jar.fetch(env, '/api/auth/update-profile', {
      method: 'POST', headers, origin: null, body: { first_name: 'Updated' },
    });
    assert.equal(response.status, 200);
  }
});

test('static CSP disallows inline script execution and static HTML has no inline scripts/handlers', () => {
  const headers = readFileSync(new URL('../web/_headers', import.meta.url), 'utf8');
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /script-src 'self';/);
  assert.doesNotMatch(headers, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /object-src 'none'/);
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
          assert.match(tag[1], /\bsrc=/, path);
          assert.equal(tag[2].trim(), '', path);
        }
        assert.doesNotMatch(html, /\son(?:click|error|load|change|submit)\s*=/i, path);
      }
    }
  }
  scan(fileURLToPath(new URL('../web', import.meta.url)));
});

test('OAuth consent uses a fresh CSP script nonce and escapes hostile state', async () => {
  const env = makeEnv();
  const params = new URLSearchParams({ scope: 'profile', state: '</script><script>alert(1)</script>' });
  const render = () => consentPageHtml(env, { name: 'Example app' },
    { id: 'u1', username: 'example', sessionId: 's1' }, null, params);
  const first = render();
  const second = render();
  const html = await first.text();
  const nonce = html.match(/<script nonce="([a-f0-9]+)">/)[1];
  assert.match(first.headers.get('Content-Security-Policy'), new RegExp(`script-src 'nonce-${nonce}'`));
  assert.notEqual(second.headers.get('Content-Security-Policy'), first.headers.get('Content-Security-Policy'));
  assert.equal(first.headers.get('X-Frame-Options'), 'DENY');
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(html, /\sonerror=/);
  assert.equal(html.includes('</script><script>alert(1)</script>'), false);
});
