/** Real SQLite/browser/session integration; only Google's HTTP provider is simulated. */
import assert from 'node:assert/strict';
import { BrowserJar, makeEnv } from './multi-account-harness.mjs';
import { b64url, randomToken, sha256Hex } from '../../cloudflare-worker/src/crypto.ts';

export class GoogleJar extends BrowserJar {
  constructor(source) { super(); if (source) this.cookies = new Map(source.cookies); }
  ingest(response) {
    for (const cookie of response.headers.getSetCookie()) {
      assert.match(cookie, /^gothwad_[a-z_]+=/);
      assert.match(cookie, /; Path=\//);
      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
      assert.match(cookie, /; Secure/);
      if (cookie.startsWith('gothwad_google_')) assert.doesNotMatch(cookie, /; Domain=/i);
      else assert.match(cookie, /; Domain=\.gothwadtech\.com/);
    }
    super.ingest(response, { verifyMailContract: false });
  }
  fetch(env, path, options = {}) {
    return super.fetch(env, path, { host: new URL(env.AUTH_HUB_URL).host, ...options });
  }
}
export const googleEnv = (extra = {}) => makeEnv({ GOOGLE_CLIENT_ID: 'synthetic-google-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret-not-a-real-credential', ...extra });

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
const publicKey = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-google-key', use: 'sig', alg: 'RS256' };
export async function googleJwt(claims, header = {}) {
  const payload = `${b64url(JSON.stringify({ alg: 'RS256', kid: 'test-google-key', ...header }))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload));
  return payload + '.' + b64url(new Uint8Array(signature));
}
export function claims(env, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: 'google-subject-one',
    email: 'verified@gmail.com', email_verified: true, given_name: 'Google', family_name: 'Owner',
    iat: now, exp: now + 3600, nonce: 'test-nonce', ...extra };
}
const codes = new Map();
export function mockGoogle(t) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicKey] });
    assert.equal(url, 'https://oauth2.googleapis.com/token', 'No unexpected outbound HTTP');
    const params = new URLSearchParams(options.body);
    const plan = codes.get(params.get('code'));
    assert.ok(plan, 'Authorization code must exist');
    codes.delete(params.get('code'));
    assert.equal(params.get('client_id'), plan.env.GOOGLE_CLIENT_ID);
    assert.equal(params.get('client_secret'), plan.env.GOOGLE_CLIENT_SECRET);
    assert.equal(params.get('redirect_uri'), plan.env.AUTH_HUB_URL + '/api/auth/google/callback');
    assert.equal(b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(params.get('code_verifier'))))), plan.challenge);
    if (plan.reject) return Response.json({ error: 'invalid_grant' }, { status: 400 });
    return Response.json({ id_token: await googleJwt(plan.claims), access_token: 'never-return-this-provider-token' });
  };
  t.after(() => { globalThis.fetch = original; codes.clear(); });
}
export async function beginGoogle(env, jar, body = {}, overrides = {}) {
  const start = await jar.fetch(env, '/api/auth/google/start', { method: 'POST', body });
  assert.equal(start.status, 200, JSON.stringify(await start.clone().json()));
  const auth = new URL((await start.json()).url);
  const code = randomToken();
  codes.set(code, { env, challenge: auth.searchParams.get('code_challenge'),
    claims: claims(env, { nonce: auth.searchParams.get('nonce'), ...overrides }) });
  return { auth, code, callback: '/api/auth/google/callback?' + new URLSearchParams({ state: auth.searchParams.get('state'), code }) };
}
export async function verifyGoogle(env, jar, body = {}, overrides = {}) {
  const flow = await beginGoogle(env, jar, body, overrides);
  const callback = await jar.fetch(env, flow.callback, { origin: null });
  assert.equal(callback.status, 303);
  assert.doesNotMatch(callback.headers.get('Location'), /error=1/);
  return flow;
}
export const onboarding = (username = 'googleowner') => ({ action: 'create', username, first_name: 'Google', last_name: 'Owner',
  confirm_recovery_email: true, accept_terms: true });
export async function googleAccount(env, jar = new GoogleJar(), overrides = {}, username = 'googleowner') {
  await verifyGoogle(env, jar, {}, overrides);
  const status = await (await jar.fetch(env, '/api/auth/google/status')).json();
  const selected = status.accounts?.find(account => account.username === username) || status.accounts?.[0];
  const body = selected ? { action: 'select', account_id: selected.id } : onboarding(username);
  const response = await jar.fetch(env, '/api/auth/google/finish', { method: 'POST', body });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return { jar, data: await response.json(), response };
}
export async function reauth(env, jar, overrides = {}) { return verifyGoogle(env, jar, { purpose: 'reauth' }, overrides); }
export const googlePost = (env, jar, path, body = {}) => jar.fetch(env, '/api/auth/' + path, { method: 'POST', body });
export async function ticketCount(env) { return (await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_google_tickets').first()).n; }
export { sha256Hex };
/** Browser QA can register the simulated provider's next authorization-code response. */
export function planGoogleCode(code, env, challenge, tokenClaims) {
  codes.set(code, { env, challenge, claims: tokenClaims });
}
