/** User-verified WebAuthn login. Passwordless assertions remain bound to account and factor state. */
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { D1Database, Env, ResponseWrapper } from './types.ts';
import { b64url, randomToken } from './crypto.ts';
import { lookupAccount } from './users.ts';
import { json } from './http.ts';
import { reserveMfaAttempt } from './mfa-proofs.ts';
import { completeSignIn } from './signin-session.ts';
import { passkeyConfig, savePasskeyChallenge, takePasskeyAttempt, livePasskeySql, rejectsEmbeddedResponse } from './passkey-core.ts';

export async function passkeyLoginOptions(db: D1Database, env: Env, body: Record<string, any>) {
  const identifier = String(body.identifier || '').trim();
  if (!identifier || identifier.length > 254) return null;
  const account = await lookupAccount(db, identifier);
  if (!account.exists || !(await reserveMfaAttempt(db, account.userId))) return null;
  const keys = (await db.prepare('SELECT credential_id, transports FROM auth_passkeys WHERE user_id = ?')
    .bind(account.userId).all()).results || [];
  if (!keys.length) return null;
  const { rpID } = passkeyConfig(env);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required',
    allowCredentials: keys.map(k => ({ id: k.credential_id, transports: JSON.parse(k.transports) })) });
  const handle = await savePasskeyChallenge(db, env, { id: account.userId, password_hash: account.passwordHash },
    'login', options.challenge, { remember: body.remember !== false, addMode: body.add === true });
  return handle ? { challenge: handle, options } : null;
}
export async function verifyPasskeyLogin(request: Request, db: D1Database, env: Env, body: Record<string, any>, wrap: ResponseWrapper) {
  const fail = () => wrap(json({ error: 'invalid_passkey', message: 'Passkey verification failed or expired.' }, 401));
  const challenge = await takePasskeyAttempt(db, String(body.challenge || ''), 'login');
  if (!challenge || !(await reserveMfaAttempt(db, challenge.user_id))) return fail();
  const config = passkeyConfig(env);
  if (challenge.origin !== config.origin || challenge.rp_id !== config.rpID) return fail();
  const response = body.response as AuthenticationResponseJSON;
  if (!response || rejectsEmbeddedResponse(response)) return fail();
  const credential = await db.prepare('SELECT * FROM auth_passkeys WHERE user_id = ? AND credential_id = ?')
    .bind(challenge.user_id, String(response.id || '')).first();
  if (!credential) return fail();
  const userHandle = response.response?.userHandle;
  if (userHandle && userHandle !== b64url(new TextEncoder().encode(challenge.user_id))) return fail();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true,
      credential: { id: credential.credential_id, publicKey: new Uint8Array(credential.public_key),
        counter: credential.counter, transports: JSON.parse(credential.transports) } });
  } catch { return fail(); }
  if (!verification.verified || !verification.authenticationInfo.userVerified) return fail();
  const account = await db.prepare('SELECT id, username, password_hash FROM users WHERE id = ? AND password_hash = ?')
    .bind(challenge.user_id, challenge.password_hash_snapshot).first();
  if (!account) return fail();
  const marker = randomToken();
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`UPDATE auth_passkeys SET counter = ?, last_used_at = ?, last_proof = ?
      WHERE id = ? AND user_id = ? AND version = ? AND counter = ? AND (${livePasskeySql()}) RETURNING id`)
      .bind(verification.authenticationInfo.newCounter, now, marker, credential.id, account.id,
        credential.version, credential.counter, challenge.token_hash, now),
    db.prepare(`UPDATE auth_passkey_challenges SET used_by = ? WHERE token_hash = ? AND used_by IS NULL
      AND EXISTS (SELECT 1 FROM auth_passkeys WHERE id = ? AND last_proof = ?) RETURNING user_id`)
      .bind(marker, challenge.token_hash, credential.id, marker),
  ];
  return completeSignIn(request, db, env, { userId: account.id, username: account.username, passwordHash: account.password_hash },
    { remember: !!challenge.remember_me, addMode: !!challenge.add_mode }, wrap,
    { statements, sql: 'EXISTS (SELECT 1 FROM auth_passkey_challenges WHERE token_hash = ? AND used_by = ?)',
      bindings: [challenge.token_hash, marker], version: challenge.factor_version, method: 'passkey' });
}
