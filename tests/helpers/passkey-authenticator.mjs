/** Synthetic ES256 authenticator for cryptographic server tests; never a production implementation. */
import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
const hash = input => createHash('sha256').update(input).digest();
const b64 = value => Buffer.from(value).toString('base64url');
export function authenticator({ algorithm = 'ES256' } = {}) {
  const { publicKey, privateKey } = algorithm === 'RS256'
    ? generateKeyPairSync('rsa', { modulusLength: 2048 }) : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32);
  const bytes = value => new Uint8Array(Buffer.from(value, 'base64url'));
  const cose = isoCBOR.encode(algorithm === 'RS256'
    ? new Map([[1, 3], [3, -257], [-1, bytes(jwk.n)], [-2, bytes(jwk.e)]])
    : new Map([[1, 2], [3, -7], [-1, 1], [-2, bytes(jwk.x)], [-3, bytes(jwk.y)]]));
  function response(options, { origin = 'https://accounts.gothwadtech.com', register = false,
    counter = 1, uv = true, crossOrigin = false, rpID = options.rpId || options.rp?.id, userHandle } = {}) {
    const client = Buffer.from(JSON.stringify({ type: register ? 'webauthn.create' : 'webauthn.get',
      challenge: options.challenge, origin, crossOrigin }));
    const count = Buffer.alloc(4); count.writeUInt32BE(counter);
    let authData = Buffer.concat([hash(rpID), Buffer.from([(register ? 0x41 : 0x01) | (uv ? 0x04 : 0)]), count]);
    let data;
    if (register) {
      const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
      authData = Buffer.concat([authData, Buffer.alloc(16), length, id, cose]);
      data = { attestationObject: b64(isoCBOR.encode(new Map([
        ['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)],
      ]))), transports: ['internal'] };
    } else {
      data = { authenticatorData: b64(authData), signature: b64(sign('sha256', Buffer.concat([authData, hash(client)]), privateKey)),
        userHandle: userHandle || null };
    }
    return { id: b64(id), rawId: b64(id), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64(client), ...data } };
  }
  return { response, id: b64(id) };
}
