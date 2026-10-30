import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

async function fixture(t, configured = true) {
  const env = makeEnv(configured ? { RESEND_API_KEY: 'test-email-key-not-real', RESEND_FROM: 'Security <security@example.test>' } : {});
  const owner = await seedAccount(env, { username: 'recoveryowner', firstName: 'Recovery', lastName: 'Owner' });
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    sent.push(JSON.parse(options.body));
    return new Response('{}', { status: 200 });
  });
  return { env, owner, sent };
}

async function requestChange(env, owner, email = 'replacement@example.test', password = owner.password) {
  return owner.jar.fetch(env, '/api/auth/recovery-email/request', {
    method: 'POST', origin: 'https://accounts.gothwadtech.com',
    body: { recovery_email: email, current_password: password },
  });
}
function tokenFrom(message) {
  const link = message.text.match(/https:\/\/\S+/)[0];
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token');
}
async function verify(env, token, jar = new BrowserJar()) {
  return jar.fetch(env, '/api/auth/recovery-email/verify', {
    method: 'POST', origin: 'https://accounts.gothwadtech.com', body: { token },
  });
}
async function address(env) {
  return (await env.DB.prepare('SELECT recovery_email FROM profiles WHERE username = ?').bind('recoveryowner').first()).recovery_email;
}

test('recovery schema migration is idempotent and legacy addresses are not marked verified', async (t) => {
  const { env } = await fixture(t);
  const sql = readFileSync(new URL('../sql/07_verified_recovery_changes.sql', import.meta.url), 'utf8');
  await env.DB.exec(sql);
  await env.DB.exec(sql);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM verified_recovery_emails').first()).n, 0);
  assert.equal(await address(env), 'recoveryowner@personal.example');
});

test('existing session alone cannot replace recovery through generic profile updates or the new flow', async (t) => {
  const { env, owner, sent } = await fixture(t);
  const generic = await owner.jar.fetch(env, '/api/auth/update-profile', {
    method: 'POST', body: { first_name: 'ShouldNotChange', recovery_email: 'attacker@example.test' },
  });
  assert.equal(generic.status, 400);
  assert.equal((await generic.json()).error, 'verification_required');
  assert.equal((await requestChange(env, owner, undefined, '')).status, 400);
  assert.equal((await requestChange(env, owner, undefined, 'wrong-password')).status, 400);
  assert.equal((await requestChange(env, owner, '')).status, 400);
  assert.equal(sent.length, 0);
  assert.equal(await address(env), 'recoveryowner@personal.example');
  assert.equal((await env.DB.prepare('SELECT first_name FROM profiles WHERE id = ?').bind(owner.data.user.id).first()).first_name, 'Recovery');
});

test('missing or failing email delivery leaves actual recovery unchanged and never returns verification tokens', async (t) => {
  const { env, owner, sent } = await fixture(t, false);
  const missing = await requestChange(env, owner);
  assert.equal(missing.status, 503);
  assert.equal(sent.length, 0);
  env.RESEND_API_KEY = 'test-email-key-not-real';
  env.RESEND_FROM = 'security@example.test';
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  const failed = await requestChange(env, owner);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /token|https:\/\//);
  assert.equal(await address(env), 'recoveryowner@personal.example');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_email_changes').first()).n, 0);
});

test('replacement stays pending until verification, then notifies previous address and invalidates old reset links', async (t) => {
  const { env, owner, sent } = await fixture(t);
  const requested = await requestChange(env, owner, ' Replacement@Example.Test ');
  assert.equal(requested.status, 200);
  const responseText = await requested.text();
  assert.equal(JSON.parse(responseText).pending, true);
  const token = tokenFrom(sent[0]);
  assert.equal(responseText.includes(token), false);
  assert.equal(await address(env), 'recoveryowner@personal.example');
  const row = await env.DB.prepare('SELECT * FROM recovery_email_changes').first();
  assert.notEqual(row.token_hash, token);
  await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('old-reset-link-hash', owner.data.user.id, new Date(Date.now() + 60_000).toISOString()).run();
  const verified = await verify(env, token);
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).notification_sent, true);
  assert.equal(await address(env), 'replacement@example.test');
  assert.equal(sent[1].to[0], 'recoveryowner@personal.example');
  assert.equal((await env.DB.prepare('SELECT email FROM verified_recovery_emails WHERE user_id = ?').bind(owner.data.user.id).first()).email, 'replacement@example.test');
  assert.equal((await env.DB.prepare('SELECT used FROM password_reset_tokens WHERE token_hash = ?').bind('old-reset-link-hash').first()).used, 1);
  assert.equal((await verify(env, token)).status, 400);
});

test('superseded and expired links cannot activate a recovery address', async (t) => {
  const { env, owner, sent } = await fixture(t);
  await requestChange(env, owner, 'first@example.test');
  const first = tokenFrom(sent[0]);
  await requestChange(env, owner, 'second@example.test');
  const second = tokenFrom(sent[1]);
  assert.equal((await verify(env, first)).status, 400);
  await env.DB.prepare('UPDATE recovery_email_changes SET expires_at = ?').bind(new Date(0).toISOString()).run();
  assert.equal((await verify(env, second)).status, 400);
  assert.equal(await address(env), 'recoveryowner@personal.example');
});

for (const invalidation of ['session', 'password']) {
  test(`requesting ${invalidation} change invalidates pending recovery proof`, async (t) => {
    const { env, owner, sent } = await fixture(t);
    await requestChange(env, owner);
    const token = tokenFrom(sent[0]);
    if (invalidation === 'session') await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(owner.data.user.id).run();
    else await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind('different-password-version', owner.data.user.id).run();
    assert.equal((await verify(env, token)).status, 400);
    assert.equal(await address(env), 'recoveryowner@personal.example');
  });
}

test('concurrent verification has one winner and sends one previous-address notification', async (t) => {
  const { env, owner, sent } = await fixture(t);
  await requestChange(env, owner);
  const token = tokenFrom(sent[0]);
  const responses = await Promise.all(Array.from({ length: 8 }, () => verify(env, token)));
  assert.equal(responses.filter((r) => r.status === 200).length, 1);
  assert.equal(responses.filter((r) => r.status === 400).length, 7);
  assert.equal(sent.length, 2);
});

test('verification storage failure rolls back token use and profile update, permitting safe retry', async (t) => {
  const { env, owner, sent } = await fixture(t);
  await requestChange(env, owner);
  const token = tokenFrom(sent[0]);
  const original = env.DB.batch.bind(env.DB);
  env.DB.batch = (statements) => original([...statements, env.DB.prepare('INSERT INTO missing_verification_table VALUES (1)')]);
  assert.equal((await verify(env, token)).status, 503);
  env.DB.batch = original;
  assert.equal(await address(env), 'recoveryowner@personal.example');
  assert.equal((await env.DB.prepare('SELECT consumed_by FROM recovery_email_changes').first()).consumed_by, null);
  assert.equal((await verify(env, token)).status, 200);
});

test('a notification failure is reported without misrepresenting a committed verified change', async (t) => {
  const { env, owner, sent } = await fixture(t);
  await requestChange(env, owner);
  const token = tokenFrom(sent[0]);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Delivery unavailable'); });
  const response = await verify(env, token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).notification_sent, false);
  assert.equal(await address(env), 'replacement@example.test');
});

test('unconfigured production reset delivery fails consistently without pretending a message was sent', async (t) => {
  const { env, owner } = await fixture(t, false);
  for (const username of ['recoveryowner', 'unknownaccount']) {
    const response = await owner.jar.fetch(env, '/api/auth/forgot-password', {
      method: 'POST', body: { username },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'email_unavailable');
  }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').first()).n, 0);
});

test('phone identifier changes and removal require a fresh password, not only a session', async (t) => {
  const { env, owner } = await fixture(t);
  const update = body => owner.jar.fetch(env, '/api/auth/update-profile', { method: 'POST', body });
  assert.equal((await update({ phone_number: '+919876543210' })).status, 400);
  assert.equal((await update({ phone_number: '+919876543210', current_password: 'wrong-password' })).status, 400);
  assert.equal((await update({ phone_number: '+919876543210', current_password: owner.password })).status, 200);
  assert.equal((await update({ phone_number: '' })).status, 400);
  assert.equal((await update({ phone_number: '', current_password: owner.password })).status, 200);
});
