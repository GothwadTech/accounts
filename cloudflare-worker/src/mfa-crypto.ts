/** Standard TOTP via OTPAuth; encrypted seed storage and high-entropy recovery codes. */
import * as OTPAuth from 'otpauth';
import type { Env } from './types.ts';
import { b64url, b64urlToBytes, randomToken, sha256Hex } from './crypto.ts';
import { DatabaseUnavailableError } from './db.ts';

export function mfaConfigured(env: Env): boolean {
  try { encryptionBytes(env); return true; } catch { return false; }
}
function encryptionBytes(env: Env): Uint8Array<ArrayBuffer> {
  const encoded = env.MFA_ENCRYPTION_KEY || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new DatabaseUnavailableError('MFA encryption is not configured');
  const bytes = b64urlToBytes(encoded);
  if (bytes.length !== 32 || b64url(bytes) !== encoded) throw new DatabaseUnavailableError('MFA encryption is not configured');
  return bytes;
}
async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encryptionBytes(env), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const aad = (userId: string) => new TextEncoder().encode(`gothwad:mfa-seed:v1:${userId}`);
export async function encryptMfaSeed(env: Env, userId: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId) },
    await key(env), new TextEncoder().encode(secret));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(encrypted))}`;
}
export async function decryptMfaSeed(env: Env, userId: string, value: string): Promise<string> {
  const [version, iv, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext || extra) throw new DatabaseUnavailableError('MFA seed storage is unavailable');
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlToBytes(iv), additionalData: aad(userId) },
      await key(env), b64urlToBytes(ciphertext));
    return new TextDecoder().decode(decrypted);
  } catch { throw new DatabaseUnavailableError('MFA seed could not be decrypted; verify encryption configuration'); }
}
export function newAuthenticator(username: string, domain: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({ issuer: 'Gothwad Accounts', label: `${username}@${domain}`,
    algorithm: 'SHA1', digits: 6, period: 30, secret });
  return { secret: secret.base32, uri: totp.toString() };
}
export function totpCounter(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
    .validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 30_000) + delta;
}
export async function recoveryCodeHash(userId: string, code: string): Promise<string | null> {
  const normalized = code.toLowerCase().replace(/-/g, '');
  return /^[a-f0-9]{32}$/.test(normalized) ? sha256Hex(`gothwad:mfa-recovery:v1:${userId}:${normalized}`) : null;
}
export async function newRecoveryCodes(userId: string) {
  return Promise.all(Array.from({ length: 10 }, async () => {
    const code = randomToken().slice(0, 32).match(/.{8}/g)!.join('-');
    return { code, hash: (await recoveryCodeHash(userId, code))! };
  }));
}
