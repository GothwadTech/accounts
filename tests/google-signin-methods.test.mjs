/** Many-to-many Google access: explicit authority, cap, unlink revocation and no lockout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { googleEnv, GoogleJar, mockGoogle, googleAccount, googlePost, verifyGoogle, beginGoogle, reauth } from './helpers/google-harness.mjs';
import { seedAccount } from './helpers/multi-account-harness.mjs';
import { TEST_MFA_KEY, enroll } from './helpers/mfa-harness.mjs';
import { currentOAuthBinding } from '../cloudflare-worker/src/oauth-state.ts';
import { getDb } from '../cloudflare-worker/src/db.ts';
import { createLocalD1 } from '../tools/local-d1.mjs';

const backup = { sub: 'backup-google-subject', email: 'backup@gmail.com' };
const third = { sub: 'third-google-subject', email: 'third@gmail.com' };
const links = async (env, jar) => (await (await jar.fetch(env, '/api/auth/google/links')).json()).links;
const unlink = (env, owner, id, extra = {}) => googlePost(env, owner.jar, 'google/unlink', {
  id, expected_user_id: owner.data.user.id, current_password: owner.password || '', ...extra,
});
async function connect(env, owner, identity = backup, extra = {}) {
  if (!owner.password) await reauth(env, owner.jar);
  const flow = await beginGoogle(env, owner.jar, { purpose: 'link', expected_user_id: owner.data.user.id,
    current_password: owner.password || '', ...extra }, identity);
  const response = await owner.jar.fetch(env, flow.callback, { origin: null });
  assert.doesNotMatch(response.headers.get('Location'), /error=1/);
  return flow;
}
async function native(env) {
  const user = await seedAccount(env, { username: 'methodowner', firstName: 'Method', lastName: 'Owner' });
  return { ...user, jar: new GoogleJar(user.jar) };
}
async function signIn(env, id, identity = {}) {
  const jar = new GoogleJar(); await verifyGoogle(env, jar, {}, identity);
  const status = await (await jar.fetch(env, '/api/auth/google/status')).json();
  assert.ok(status.accounts.some(row => row.id === id));
  return { jar, response: await googlePost(env, jar, 'google/finish', { action: 'select', account_id: id }) };
}

test('one Gothwad account accepts two Google subjects, and each subject can still authorize separate Gothwad accounts', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env);
  await connect(env, owner);
  const list = await links(env, owner.jar);
  assert.equal(list.length, 2); assert.equal(list[0].is_recovery, true);
  assert.doesNotMatch(JSON.stringify(list), /subject|password|token|snapshot/);
  for (const identity of [{}, backup]) {
    const result = await signIn(env, owner.data.user.id, identity);
    assert.equal(result.response.status, 200);
    assert.equal((await result.response.json()).user.id, owner.data.user.id);
  }
  const other = await native(env); await connect(env, other, backup);
  const jar = new GoogleJar(); await verifyGoogle(env, jar, {}, backup);
  const accounts = (await (await jar.fetch(env, '/api/auth/google/status')).json()).accounts;
  assert.deepEqual(new Set(accounts.map(row => row.id)), new Set([owner.data.user.id, other.data.user.id]));
});

test('linking requires existing authority, exact account, MFA and single-use fresh Google proof for passwordless users', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env);
  assert.equal((await googlePost(env, owner.jar, 'google/start', { purpose: 'link' })).status, 400);
  await reauth(env, owner.jar);
  assert.equal((await googlePost(env, owner.jar, 'google/start', { purpose: 'link', expected_user_id: 'another-account' })).status, 409);
  await connect(env, owner);
  assert.equal((await googlePost(env, owner.jar, 'google/start', { purpose: 'link' })).status, 400);
  const listing = await (await owner.jar.fetch(env, '/api/auth/google/links')).json();
  assert.equal(listing.user_id, owner.data.user.id);
  const stranger = new GoogleJar();
  assert.equal((await stranger.fetch(env, '/api/auth/google/links')).status, 401);
  assert.equal((await googlePost(env, stranger, 'google/unlink', { id: (await links(env, owner.jar))[0].id })).status, 401);
});

test('duplicate and fourth methods cannot replace a link; concurrent third-method callbacks have one winner', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await native(env);
  await connect(env, owner, {}); await connect(env, owner, backup);
  const jarA = new GoogleJar(owner.jar), jarB = new GoogleJar(owner.jar);
  const body = { purpose: 'link', current_password: owner.password };
  const a = await beginGoogle(env, jarA, body, third);
  const b = await beginGoogle(env, jarB, body, { sub: 'fourth-subject', email: 'fourth@gmail.com' });
  const callbacks = await Promise.all([[jarA, a], [jarB, b]].map(([jar, flow]) => jar.fetch(env, flow.callback, { origin: null })));
  assert.equal(callbacks.filter(response => !response.headers.get('Location').includes('error=1')).length, 1);
  assert.equal((await links(env, owner.jar)).length, 3);
  assert.equal((await googlePost(env, owner.jar, 'google/start', body)).status, 409);
  // Replaying a successful callback never issues another link.
  assert.match((await jarA.fetch(env, a.callback, { origin: null })).headers.get('Location'), /error=1/);
});

test('duplicate linking below the cap fails without changing existing method IDs', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await native(env); await connect(env, owner, {});
  const before = await links(env, owner.jar);
  const flow = await beginGoogle(env, owner.jar, { purpose: 'link', current_password: owner.password });
  assert.match((await owner.jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  assert.deepEqual(await links(env, owner.jar), before);
});

test('passwordless users cannot remove their last Google even with a passkey; a password permits final removal', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env);
  const [{ id }] = await links(env, owner.jar);
  await env.DB.prepare(`INSERT INTO auth_passkeys (id, credential_id, user_id, public_key, counter, transports, name, created_at, version)
    VALUES ('key', 'key', ?, ?, 0, '[]', 'Backup passkey', '2020-01-01', 'v1')`).bind(owner.data.user.id, new Uint8Array([1])).run();
  assert.equal((await unlink(env, owner, id)).status, 409);
  await reauth(env, owner.jar);
  assert.equal((await googlePost(env, owner.jar, 'add-password', { new_password: 'aaaaaaaa' })).status, 200);
  owner.password = 'aaaaaaaa';
  const removed = await unlink(env, owner, id); assert.equal(removed.status, 200);
  assert.equal((await removed.json()).user.google_linked, false);
  assert.equal((await links(env, owner.jar)).length, 0);
  const fresh = new GoogleJar();
  assert.equal((await googlePost(env, fresh, 'signin', { identifier: 'googleowner', password: owner.password })).status, 200);
  await verifyGoogle(env, fresh);
  assert.deepEqual((await (await fresh.fetch(env, '/api/auth/google/status')).json()).accounts, []);
});

test('unlink signs out other devices and invalidates OAuth bindings, pending Google/MFA proofs and replays', async t => {
  mockGoogle(t); const env = googleEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY }), owner = await native(env);
  await connect(env, owner, {}); await connect(env, owner, backup);
  const { codes } = await enroll(env, owner);
  const oldHash = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(owner.data.user.id).first()).password_hash;
  await env.DB.prepare("INSERT INTO app_authorizations (id, user_id, app_id) VALUES ('grant', ?, 'gothwad-mail')").bind(owner.data.user.id).run();
  await env.DB.prepare(`INSERT INTO oauth_credential_bindings VALUES ('oauth-hash', 'access', ?, 'gothwad-mail', 'grant', ?, '2099-01-01')`)
    .bind(owner.data.user.id, oldHash).run();
  assert.ok(await currentOAuthBinding(env.DB, 'oauth-hash', 'access'));
  const remote = await signIn(env, owner.data.user.id);
  assert.equal(remote.response.status, 202);
  const remoteChallenge = (await remote.response.json()).challenge;
  assert.equal((await googlePost(env, remote.jar, 'mfa/verify', { challenge: remoteChallenge, code: codes[0] })).status, 200);
  assert.equal((await remote.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.ok(await currentOAuthBinding(env.DB, 'oauth-hash', 'access'));
  await reauth(env, owner.jar); const oldProof = owner.jar.cookies.get('gothwad_google_reauth');
  const pending = await signIn(env, owner.data.user.id, backup);
  assert.equal(pending.response.status, 202); const challenge = (await pending.response.json()).challenge;
  const id = (await links(env, owner.jar)).find(row => row.email === backup.email).id;
  const removed = await unlink(env, owner, id, { mfa_code: codes[1] }); assert.equal(removed.status, 200);
  assert.equal((await remote.jar.fetch(env, '/api/auth/me')).status, 401);
  assert.equal((await owner.jar.fetch(env, '/api/auth/me')).status, 200);
  assert.equal(await currentOAuthBinding(env.DB, 'oauth-hash', 'access'), null);
  assert.equal((await googlePost(env, pending.jar, 'mfa/verify', { challenge, code: codes[2] })).status, 401);
  owner.jar.cookies.set('gothwad_google_reauth', oldProof);
  assert.equal((await (await owner.jar.fetch(env, '/api/auth/google/status?reauth=1')).json()).ready, false);
  assert.equal((await unlink(env, owner, id, { mfa_code: codes[3] })).status, 404);
});

test('removing either method in a passwordless account leaves one working method, not two concurrent deletions', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env); await connect(env, owner);
  const list = await links(env, owner.jar);
  const remote = await signIn(env, owner.data.user.id);
  await reauth(env, owner.jar); await reauth(env, remote.jar);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_google_tickets WHERE purpose = 'reauth' AND used_by IS NULL").first()).n, 2);
  const clone = { ...owner, jar: remote.jar };
  const responses = await Promise.all([unlink(env, owner, list[0].id), unlink(env, clone, list[1].id)]);
  assert.equal(responses.filter(row => row.status === 200).length, 1);
  const winner = responses[0].status === 200 ? owner.jar : clone.jar;
  assert.equal((await links(env, winner)).length, 1);
  const surviving = (await links(env, winner))[0].email === backup.email ? backup : {};
  assert.equal((await signIn(env, owner.data.user.id, surviving)).response.status, 200);
});

test('removed subjects cannot reauthenticate; unlink/relink never resurrects an old proof or pending link callback', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env); await connect(env, owner);
  await reauth(env, owner.jar, backup); const proof = owner.jar.cookies.get('gothwad_google_reauth');
  const flow = await beginGoogle(env, owner.jar, { purpose: 'link' }, third);
  await reauth(env, owner.jar, backup);
  const id = (await links(env, owner.jar)).find(row => row.email === backup.email).id;
  assert.equal((await unlink(env, owner, id)).status, 200);
  assert.match((await owner.jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  const wrong = await beginGoogle(env, owner.jar, { purpose: 'reauth' }, backup);
  assert.match((await owner.jar.fetch(env, wrong.callback, { origin: null })).headers.get('Location'), /error=1/);
  await connect(env, owner);
  owner.jar.cookies.set('gothwad_google_reauth', proof);
  assert.equal((await googlePost(env, owner.jar, 'add-password', { new_password: 'aaaaaaaa' })).status, 400);
});

test('local MFA is required for linking and removal, including changes via backup Google sign-in', async t => {
  mockGoogle(t); const env = googleEnv({ MFA_ENCRYPTION_KEY: TEST_MFA_KEY }), owner = await native(env);
  const { codes } = await enroll(env, owner);
  assert.equal((await googlePost(env, owner.jar, 'google/start', { purpose: 'link', current_password: owner.password })).status, 400);
  await connect(env, owner, backup, { mfa_code: codes[0] });
  const signed = await signIn(env, owner.data.user.id, backup); assert.equal(signed.response.status, 202);
  const challenge = (await signed.response.json()).challenge;
  assert.equal((await googlePost(env, signed.jar, 'mfa/verify', { challenge, code: codes[1] })).status, 200);
  const id = (await links(env, owner.jar))[0].id;
  assert.equal((await unlink(env, owner, id)).status, 400);
  assert.equal((await unlink(env, owner, id, { mfa_code: codes[2] })).status, 200);
});

test('passwordless origin/recovery requirements survive removal of the original Google method', async t => {
  mockGoogle(t); const env = googleEnv({ DEV_MODE: 'true' });
  const owner = await googleAccount(env, new GoogleJar(), { email: 'person@thirdparty.example' });
  await connect(env, owner, backup);
  await reauth(env, owner.jar, { email: 'person@thirdparty.example' });
  assert.equal((await googlePost(env, owner.jar, 'add-password', { new_password: 'aaaaaaaa' })).status, 200);
  owner.password = 'aaaaaaaa';
  const id = (await links(env, owner.jar)).find(row => row.email === 'person@thirdparty.example').id;
  assert.equal((await unlink(env, owner, id)).status, 200);
  await googlePost(env, new GoogleJar(), 'forgot-password', { username: 'googleowner' });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT created_passwordless FROM auth_google_account_origins').first()).created_passwordless, 1);
});

test('alerts reach existing/new Google and verified recovery addresses; failed delivery is explicit and contains no secrets', async t => {
  mockGoogle(t); const upstream = globalThis.fetch, emails = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') { emails.push(JSON.parse(options.body)); return Response.json({ id: 'mail' }); }
    return upstream(url, options);
  };
  const env = googleEnv({ RESEND_API_KEY: 'synthetic-key', RESEND_FROM: 'Security <security@example.test>' });
  const owner = await googleAccount(env); await connect(env, owner);
  assert.deepEqual(new Set(emails.flatMap(mail => mail.to)), new Set(['verified@gmail.com', backup.email]));
  assert.doesNotMatch(JSON.stringify(emails), /synthetic-key|token=|code=|password_hash|token_hash/);
  await reauth(env, owner.jar);
  const id = (await links(env, owner.jar)).find(row => row.email === backup.email).id;
  env.RESEND_API_KEY = '';
  const result = await unlink(env, owner, id); assert.equal(result.status, 200);
  assert.equal((await result.json()).notification_sent, false);
  const activity = (await env.DB.prepare("SELECT * FROM account_activity WHERE type = 'google_method_removed'").all()).results;
  assert.equal(activity.length, 1); assert.match(JSON.stringify(activity), /could not be delivered/);
  // A post-commit contact lookup outage reports an alert failure, not a failed link.
  await reauth(env, owner.jar);
  const flow = await beginGoogle(env, owner.jar, { purpose: 'link', expected_user_id: owner.data.user.id }, backup);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => {
    if (sql.includes('SELECT p.username, CASE')) throw new Error('Synthetic notification lookup outage');
    return prepare(sql);
  };
  const callback = await owner.jar.fetch(env, flow.callback, { origin: null });
  env.DB.prepare = prepare;
  assert.match(callback.headers.get('Location'), /google=linked&notification=failed/);
  assert.equal((await links(env, owner.jar)).length, 2);
});

test('foreign IDs, changed account selection and missing Origin cannot unlink methods', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env), other = await native(env);
  await connect(env, other, backup); const id = (await links(env, owner.jar))[0].id;
  assert.equal((await unlink(env, other, id)).status, 404);
  assert.equal((await unlink(env, owner, id, { expected_user_id: other.data.user.id })).status, 409);
  assert.equal((await owner.jar.fetch(env, '/api/auth/google/unlink', { method: 'POST', origin: null, body: { id } })).status, 403);
});

test('migration 13 preserves legacy methods, origin, IDs and sessions and never resurrects removed links', async () => {
  const db = createLocalD1(':memory:');
  for (const name of ['01_core_schema', '11_google_identities', '12_google_account_links']) await db.exec(readFileSync(`sql/${name}.sql`, 'utf8'));
  await db.prepare("INSERT INTO users (id, username, password_hash) VALUES ('old-user', 'olduser', '!no-password:legacy')").run();
  await db.prepare("INSERT INTO profiles (id, username, first_name, last_name) VALUES ('old-user', 'olduser', 'Old', 'User')").run();
  await db.prepare("INSERT INTO user_sessions (id, user_id) VALUES ('old-session', 'old-user')").run();
  await db.prepare(`INSERT INTO auth_external_account_links VALUES ('https://accounts.google.com', 'old-subject', 'old-user', 'old@gmail.com', '2020-01-01', 1)`).run();
  await getDb(googleEnv({ DB: db }));
  const first = await db.prepare('SELECT * FROM auth_google_methods').first(); assert.equal(first.provider_email, 'old@gmail.com');
  assert.equal(first.created_at, '2020-01-01');
  const migration = readFileSync('sql/13_google_signin_methods.sql', 'utf8'); await db.exec(migration); await db.exec(migration);
  assert.deepEqual(await db.prepare('SELECT * FROM auth_google_methods').first(), first);
  assert.ok(await db.prepare("SELECT id FROM user_sessions WHERE id = 'old-session'").first());
  await db.prepare('DELETE FROM auth_google_methods').run(); await db.exec(migration);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_google_methods').first()).n, 0);
  assert.equal((await db.prepare('SELECT created_passwordless FROM auth_google_account_origins').first()).created_passwordless, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_external_account_links').first()).n, 1);
  db.close();
});

test('adding a Google method invalidates previously issued security proofs on another still-live device', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env);
  const remote = await signIn(env, owner.data.user.id);
  await reauth(env, remote.jar);
  const oldHash = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(owner.data.user.id).first()).password_hash;
  await connect(env, owner);
  assert.equal((await remote.jar.fetch(env, '/api/auth/me')).status, 200, 'Adding does not sign out a live device');
  assert.equal((await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(owner.data.user.id).first()).password_hash, oldHash);
  assert.equal((await googlePost(env, remote.jar, 'add-password', { new_password: 'aaaaaaaa' })).status, 400, 'Link-set snapshot changed');
});

test('Google email changes update method display without changing identity, recovery or immutable origin', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env); await connect(env, owner);
  const before = (await links(env, owner.jar)).find(row => row.email === backup.email);
  const updated = { ...backup, email: 'changedbackup@gmail.com' };
  assert.equal((await signIn(env, owner.data.user.id, updated)).response.status, 200);
  const after = (await links(env, owner.jar)).find(row => row.id === before.id);
  assert.equal(after.email, updated.email);
  assert.equal((await (await owner.jar.fetch(env, '/api/auth/me')).json()).user.recovery_email, 'verified@gmail.com');
});

test('expired link flow and expired backup reauthentication cannot mutate security methods', async t => {
  mockGoogle(t); const env = googleEnv(), owner = await googleAccount(env); await connect(env, owner);
  await reauth(env, owner.jar, backup);
  await env.DB.prepare("UPDATE auth_google_tickets SET expires_at = '2000-01-01' WHERE purpose = 'reauth'").run();
  const before = await links(env, owner.jar);
  assert.equal((await unlink(env, owner, before[0].id)).status, 400);
  await reauth(env, owner.jar);
  const flow = await beginGoogle(env, owner.jar, { purpose: 'link' }, third);
  await env.DB.prepare("UPDATE auth_google_flows SET expires_at = '2000-01-01' WHERE purpose = 'link'").run();
  assert.match((await owner.jar.fetch(env, flow.callback, { origin: null })).headers.get('Location'), /error=1/);
  assert.deepEqual(await links(env, owner.jar), before);
});
