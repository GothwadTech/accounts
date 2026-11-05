/** Google authorization-code/OIDC client. Provider tokens never leave the server. */
import type { Env } from './types.ts';
import { b64urlToBytes } from './crypto.ts';

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export function googleConfig(env: Env) {
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) return null;
  try {
    const hub = new URL(env.AUTH_HUB_URL);
    if (hub.username || hub.password || hub.search || hub.hash || hub.pathname !== '/') return null;
    const local = env.DEV_MODE === 'true' && ['localhost', '127.0.0.1'].includes(hub.hostname);
    if (hub.protocol !== 'https:' && !(local && hub.protocol === 'http:')) return null;
    return { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET,
      origin: hub.origin, redirectUri: `${hub.origin}/api/auth/google/callback` };
  } catch { return null; }
}

// Fixed endpoints only: neither JWT headers nor caller input can select a key URL.
let keyCache: { keys: JsonWebKey[]; until: number } | undefined;
async function googleKeys(refresh = false): Promise<JsonWebKey[]> {
  if (!refresh && keyCache && keyCache.until > Date.now()) return keyCache.keys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Google signing keys unavailable');
  const data = await response.json() as { keys?: JsonWebKey[] };
  if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error('Invalid Google signing keys');
  keyCache = { keys: data.keys, until: Date.now() + 5 * 60_000 };
  return data.keys;
}
export async function validateGoogleIdToken(token: string, clientId: string, nonce: string) {
  if (typeof token !== 'string' || token.length > 20_000) throw new Error('Invalid Google token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid Google token');
  const decode = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
  const header = decode(parts[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit) throw new Error('Invalid Google algorithm');
  let keys = await googleKeys();
  let key = keys.find(k => (k as JsonWebKey & { kid: string }).kid === header.kid);
  if (!key) {
    keys = await googleKeys(true);
    key = keys.find(k => (k as JsonWebKey & { kid: string }).kid === header.kid);
  }
  if (!key || key.kty !== 'RSA' || (key.use && key.use !== 'sig') || (key.alg && key.alg !== 'RS256')) throw new Error('Invalid signing key');
  const imported = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))) throw new Error('Invalid Google signature');
  const claims = decode(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (![GOOGLE_ISSUER, 'accounts.google.com'].includes(claims.iss) || !audiences.includes(clientId) ||
    (audiences.length > 1 && claims.azp !== clientId) || (claims.azp && claims.azp !== clientId) ||
    typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' ||
    claims.iat > now + 60 || claims.iat < now - 600 || (claims.nbf !== undefined && claims.nbf > now + 60) ||
    claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
    claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw new Error('Invalid Google claims');
  const email = claims.email.toLowerCase();
  // A verified third-party Google address is not proof Google still controls that mailbox.
  const domain = email.split('@')[1];
  const authoritative = ['gmail.com', 'googlemail.com'].includes(domain) ||
    (typeof claims.hd === 'string' && claims.hd.toLowerCase() === domain);
  return { subject: claims.sub as string, email, authoritative,
    firstName: String(claims.given_name || '').trim().slice(0, 100),
    lastName: String(claims.family_name || '').trim().slice(0, 100) };
}
export async function exchangeGoogleCode(env: Env, code: string, verifier: string, nonce: string) {
  const config = googleConfig(env);
  if (!config || !code || code.length > 4096) throw new Error('Invalid Google exchange');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  if (!response.ok) throw new Error('Google exchange failed');
  const result = await response.json() as { id_token: string };
  return validateGoogleIdToken(result.id_token, config.clientId, nonce);
}
