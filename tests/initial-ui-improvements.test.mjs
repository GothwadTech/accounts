/** Truthful security metadata: verification must match the current address and timestamps must be recorded events. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';
import { fetchProfile, presentUser } from '../cloudflare-worker/src/users.ts';
import { ICON_PATHS } from '../web/js/icon-paths.js';

test('security presentation distinguishes unrecorded password dates and unverified/current recovery addresses', async () => {
  const env = makeEnv();
  const owner = await seedAccount(env, { username: 'truthfului', firstName: 'Review', lastName: 'User' });
  const id = owner.data.user.id;
  const view = async () => presentUser(await fetchProfile(env.DB, id), env);
  assert.equal((await view()).password_changed_at, null);
  assert.equal((await view()).recovery_email_verified, false);
  await env.DB.prepare('INSERT INTO verified_recovery_emails (user_id, email, verified_at) VALUES (?, ?, ?)')
    .bind(id, 'old@example.test', '2026-10-01T10:00:00Z').run();
  assert.equal((await view()).recovery_email_verified, false, 'verification of an old address cannot verify the new address');
  await env.DB.prepare('UPDATE verified_recovery_emails SET email = ? WHERE user_id = ?')
    .bind('truthfului@personal.example', id).run();
  assert.equal((await view()).recovery_email_verified, true);
  await env.DB.prepare('INSERT INTO account_activity (id, user_id, type, title, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind('password-ui-event', id, 'password_change', 'Password changed', '2026-10-15T12:00:00Z').run();
  assert.equal((await view()).password_changed_at, '2026-10-15T12:00:00Z');
  assert.equal(presentUser({ id, username: 'truthfului' }, env).recovery_email_verified, null);
});

test('core UI icons have local vector geometry instead of requiring a third-party icon font', () => {
  for (const name of ['home', 'person', 'password', 'key', 'shield_lock', 'apps', 'search', 'menu', 'close']) {
    assert.match(ICON_PATHS[name], /<(path|circle|rect|line|polyline)/);
    assert.doesNotMatch(ICON_PATHS[name], /script|https:|onload/);
  }
});

test('five review phases cover the original remaining 98 recommendations once and exclude the initial twelve', async () => {
  const { readFileSync } = await import('node:fs');
  const doc = readFileSync('docs/UI_REVIEW_PHASES.md', 'utf8');
  const lists = [...doc.matchAll(/\*\*Backlog IDs:\*\* ([0-9, ]+)\./g)].map(match => match[1].split(',').map(Number));
  assert.equal(lists.length, 6);
  assert.deepEqual(lists[0], [1, 2, 3, 9, 11, 13, 21, 26, 31, 52, 54, 99]);
  assert.deepEqual(lists.slice(1).map(list => list.length), [20, 20, 20, 20, 18]);
  const all = lists.flat();
  assert.equal(new Set(all).size, 110);
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 110 }, (_, i) => i + 1));
});
