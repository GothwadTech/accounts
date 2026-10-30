/** Freshly authorized passkey enrollment; verification and storage have one atomic winner. */
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { D1Database, Env } from './types.ts';
import { authorizeActionMfa, reserveMfaAttempt } from './mfa-proofs.ts';
import { randomToken, verifyPassword } from './crypto.ts';
import { passkeyConfig, savePasskeyChallenge, takePasskeyAttempt, livePasskeySql, rejectsEmbeddedResponse } from './passkey-core.ts';

export async function registrationOptions(db: D1Database, env: Env, userId: string, sid: string, body: Record<string, any>) {
  if (!(await reserveMfaAttempt(db, userId))) return null;
  const account = await db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').bind(userId).first();
  const password = String(body.current_password || '');
  if (!account || !password || password.length > 128 || !(await verifyPassword(password, account.password_hash))) return null;
  const gate = await authorizeActionMfa(db, env, userId, String(body.mfa_code || '').trim());
  if (!gate) return null;
  const keys = (await db.prepare('SELECT credential_id FROM auth_passkeys WHERE user_id = ?').bind(userId).all()).results || [];
  if (keys.length >= 10) return null;
  const { rpID } = passkeyConfig(env);
  const options = await generateRegistrationOptions({ rpName: 'Gothwad Accounts', rpID,
    userID: new TextEncoder().encode(userId), userName: account.username,
    userDisplayName: account.username, attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: keys.map(k => ({ id: k.credential_id })) });
  const handle = await savePasskeyChallenge(db, env, { id: userId, password_hash: account.password_hash },
    'register', options.challenge, { sessionId: sid, gate });
  return handle ? { challenge: handle, options } : null;
}
export async function verifyRegistration(db: D1Database, env: Env, userId: string, sid: string, body: Record<string, any>) {
  const challenge = await takePasskeyAttempt(db, String(body.challenge || ''), 'register');
  if (!challenge || challenge.user_id !== userId || challenge.session_id !== sid) return false;
  const configured = passkeyConfig(env);
  if (challenge.origin !== configured.origin || challenge.rp_id !== configured.rpID) return false;
  const response = body.response as RegistrationResponseJSON;
  if (!response || rejectsEmbeddedResponse(response)) return false;
  let result;
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge,
      expectedOrigin: configured.origin, expectedRPID: configured.rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
  } catch { return false; }
  if (!result.verified || !result.registrationInfo) return false;
  const credential = result.registrationInfo.credential;
  const marker = randomToken();
  const name = String(body.name || 'Passkey').trim().slice(0, 80) || 'Passkey';
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE auth_passkey_challenges SET used_by = ? WHERE token_hash = ? AND used_by IS NULL
      AND (${livePasskeySql()}) AND session_id = ?
      AND EXISTS (SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ?)
      AND (SELECT COUNT(*) FROM auth_passkeys WHERE user_id = ?) < 10 RETURNING user_id`)
      .bind(marker, challenge.token_hash, challenge.token_hash, now, sid, sid, userId, userId),
    db.prepare(`INSERT INTO auth_passkeys
      (id, credential_id, user_id, public_key, counter, transports, name, created_at, version)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM auth_passkey_challenges WHERE token_hash = ? AND used_by = ?)`)
      .bind(crypto.randomUUID(), credential.id, userId, credential.publicKey, credential.counter,
        JSON.stringify(credential.transports || []), name, now, crypto.randomUUID(), challenge.token_hash, marker),
  ]);
  return !!results[0].results?.length;
}
