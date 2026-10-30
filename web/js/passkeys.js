/** Native WebAuthn JSON conversion. No third-party scripts or credential persistence. */
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const passkeysSupported = () => !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
export async function performPasskey(options, register = false) {
  if (!passkeysSupported()) throw new Error('Passkeys require a supported browser and a secure connection.');
  const publicKey = { ...options, challenge: decode(options.challenge) };
  if (register) publicKey.user = { ...options.user, id: decode(options.user.id) };
  for (const key of ['allowCredentials', 'excludeCredentials']) {
    if (options[key]) publicKey[key] = options[key].map(item => ({ ...item, id: decode(item.id) }));
  }
  const credential = await navigator.credentials[register ? 'create' : 'get']({ publicKey });
  if (!credential) throw new Error('Passkey verification was cancelled.');
  if (typeof credential.toJSON === 'function') return credential.toJSON();
  const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
  for (const key of register ? ['attestationObject'] : ['authenticatorData', 'signature', 'userHandle']) {
    const value = credential.response[key];
    response[key] = value ? encode(value) : null;
  }
  if (register) response.transports = credential.response.getTransports?.() || [];
  return { id: credential.id, rawId: encode(credential.rawId), type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(), response };
}
