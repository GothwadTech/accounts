/** Multiple Gothwad accounts per verified Google subject, without merging credentials or MFA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocalD1 } from '../tools/local-d1.mjs';
import { getDb } from '../cloudflare-worker/src/db.ts';
import { GOOGLE_ISSUER } from '../cloudflare-worker/src/google-oidc.ts';
import { TEST_MFA_KEY, mfaCode } from './helpers/mfa-harness.mjs';
import { googleEnv, GoogleJar, mockGoogle, googleAccount, googlePost, verifyGoogle, reauth, onboarding } from './helpers/google-harness.mjs';

const status = async (env, jar) => (await jar.fetch(env, '/api/auth/google/status')).json();
const select = (env, jar, id) => googlePost(env, jar, 'google/finish', { action: 'select', account_id: id });
async function createSecond(env, username = 'googlesecond') {
  const jar = new GoogleJar(); await verifyGoogle(env, jar);
  const response = await googlePost(env, jar, 'google/finish', onboarding(username));
  assert.equal(response.status, 200);
  return { jar, data: await response.json() };
}

test('one and then two existing accounts are listed without a session until the user explicitly chooses', async t => {
  mockGoogle(t); const env = googleEnv(); const first = await googleAccount(env);
  const visitor = new GoogleJar(); await verifyGoogle(env, visitor);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n;
  const one = await status(env, visitor);
  assert.equal(one.new_user, false);
  assert.deepEqual(one.accounts.map(a => a.id), [first.data.user.id]);
  assert.equal((await googlePost(env, visitor, 'google/finish')).status, 400);
  assert.equal((await visitor.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, before);
  const second = await createSecond(env);
  const two = await status(env, visitor);
  assert.deepEqual(new Set(two.accounts.map(a => a.id)), new Set([first.data.user.id, second.data.user.id]));
  assert.doesNotMatch(JSON.stringify(two), /password_hash|token_hash|recovery_email|session_id|subject/);
  assert.equal((await select(env, visitor, second.data.user.id)).status, 200);
  assert.equal((await (await visitor.fetch(env, '/api/auth/me')).json()).user.id, second.data.user.id);
  assert.equal((await select(env, visitor, first.data.user.id)).status, 401, 'One proof cannot sign into multiple accounts');
  await verifyGoogle(env, visitor);
  assert.equal((await (await select(env, visitor, first.data.user.id)).json()).user.id, first.data.user.id);
});

test('foreign subjects, matching emails and expired proofs cannot select another identity’s accounts', async t => {
  mockGoogle(t); const env = googleEnv(); const first = await googleAccount(env);
  const stranger = new GoogleJar();
  assert.equal((await stranger.fetch(env, '/api/auth/google/status')).status, 401);
  await verifyGoogle(env, stranger, {}, { sub: 'different-google-subject' });
  assert.deepEqual((await status(env, stranger)).accounts, []);
  assert.equal((await select(env, stranger, first.data.user.id)).status, 400);
  assert.equal((await stranger.fetch(env, '/api/auth/me')).status, 401);
  const visitor = new GoogleJar(); await verifyGoogle(env, visitor, {}, { email: 'changed@gmail.com' });
  assert.equal((await status(env, visitor)).accounts[0].id, first.data.user.id);
  await env.DB.prepare("UPDATE auth_google_tickets SET expires_at = '2000-01-01' WHERE purpose = 'auth'").run();
  assert.equal((await select(env, visitor, first.data.user.id)).status, 401);
});

test('one browser-bound proof has one creation winner even though a subject may now own multiple accounts', async t => {
  mockGoogle(t); const env = googleEnv(); const jar = new GoogleJar(); await verifyGoogle(env, jar);
  const results = await Promise.all(['racefirst', 'racesecond'].map(username =>
    googlePost(env, jar, 'google/finish', onboarding(username))));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  for (const table of ['users', 'profiles', 'auth_google_methods']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 1);
  }
});

test('simultaneous account selections consume only one proof and issue only one session', async t => {
  mockGoogle(t); const env = googleEnv(); const first = await googleAccount(env), second = await createSecond(env);
  const jar = new GoogleJar(); await verifyGoogle(env, jar);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n;
  const results = await Promise.all([first.data.user.id, second.data.user.id].map(id => select(env, jar, id)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, before + 1);
});

test('shared Google does not share MFA, security reauthentication proofs, or account deletion', async t => {
  mockGoogle(t); const env = googleEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY });
  const first = await googleAccount(env), second = await createSecond(env);
  await reauth(env, first.jar);
  const enrolled = await googlePost(env, first.jar, 'mfa/enroll'); assert.equal(enrolled.status, 200);
  const setup = await enrolled.json(); await reauth(env, first.jar);
  const confirmed = await googlePost(env, first.jar, 'mfa/confirm', { enrollment_id: setup.enrollment_id, code: mfaCode(setup.secret) });
  const codes = (await confirmed.json()).recovery_codes;
  const visitor = new GoogleJar(); await verifyGoogle(env, visitor);
  const mfa = await select(env, visitor, first.data.user.id); assert.equal(mfa.status, 202);
  assert.equal((await visitor.fetch(env, '/api/auth/me')).status, 401);
  const challenge = (await mfa.json()).challenge;
  const verified = await googlePost(env, visitor, 'mfa/verify', { challenge, code: codes[0] });
  assert.equal((await verified.json()).user.id, first.data.user.id);
  const plain = new GoogleJar(); await verifyGoogle(env, plain);
  assert.equal((await select(env, plain, second.data.user.id)).status, 200);
  await reauth(env, second.jar);
  const stolen = second.jar.cookies.get('gothwad_google_reauth');
  first.jar.cookies.set('gothwad_google_reauth', stolen);
  assert.equal((await googlePost(env, first.jar, 'add-password', { new_password: 'aaaaaaaa', mfa_code: codes[1] })).status, 400);
  assert.equal((await googlePost(env, second.jar, 'delete-account')).status, 200);
  await verifyGoogle(env, plain);
  assert.deepEqual((await status(env, plain)).accounts.map(a => a.id), [first.data.user.id]);
});

test('add-mode keeps separate browser slots and the six-session maximum still rejects a seventh creation', async t => {
  mockGoogle(t); const env = googleEnv(); const first = await googleAccount(env), second = await createSecond(env);
  const jar = first.jar;
  await verifyGoogle(env, jar, { add: true });
  assert.equal((await select(env, jar, second.data.user.id)).status, 200);
  assert.equal((await (await jar.fetch(env, '/api/auth/accounts')).json()).accounts.length, 2);
  for (let i = 2; i < 6; i++) {
    await verifyGoogle(env, jar, { add: true });
    assert.equal((await googlePost(env, jar, 'google/finish', onboarding(`googleslot${i}`))).status, 200);
  }
  await verifyGoogle(env, jar, { add: true });
  assert.equal((await googlePost(env, jar, 'google/finish', onboarding('googleseventh'))).status, 409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 6);
  const selected = await select(env, jar, first.data.user.id);
  assert.equal(selected.status, 200, 'Existing signed-in account can be selected at capacity');
  assert.equal((await selected.json()).authuser, 0, 'Selecting an existing account preserves its public index');
  const listed = await (await jar.fetch(env, '/api/auth/accounts')).json();
  assert.equal(listed.accounts[0].username, first.data.user.username);
  assert.equal(listed.accounts[1].username, second.data.user.username);
});

test('SQL 12 and runtime upgrade preserve legacy identity metadata and import it only once', async () => {
  const db = createLocalD1(':memory:');
  await db.exec(readFileSync('sql/01_core_schema.sql', 'utf8'));
  await db.exec(readFileSync('sql/11_google_identities.sql', 'utf8'));
  await db.prepare("INSERT INTO users (id, username, password_hash) VALUES ('legacy-user', 'legacygoogle', '!no-password:legacy')").run();
  await db.prepare("INSERT INTO profiles (id, username, first_name, last_name) VALUES ('legacy-user', 'legacygoogle', 'Legacy', 'User')").run();
  await db.prepare(`INSERT INTO auth_external_identities (issuer, subject, user_id, provider_email, created_at, created_passwordless)
    VALUES (?, 'legacy-subject', 'legacy-user', 'legacy@gmail.com', '2020-01-01', 1)`).bind(GOOGLE_ISSUER).run();
  await getDb(googleEnv({ DB: db }));
  const expected = await db.prepare('SELECT * FROM auth_external_identities').first();
  assert.deepEqual(await db.prepare('SELECT * FROM auth_external_account_links').first(), expected);
  const migration = readFileSync('sql/12_google_account_links.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_external_account_links').first()).n, 1);
  assert.deepEqual(await db.prepare('SELECT * FROM auth_external_identities').first(), expected);
  await db.prepare("DELETE FROM auth_external_account_links WHERE user_id = 'legacy-user'").run();
  await db.exec(migration);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_external_account_links').first()).n, 0, 'A later removed link must not be silently resurrected');
  db.close();
});
