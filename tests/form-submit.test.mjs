import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFormSubmit } from '../web/js/form-submit.js';

function fixture(action) {
  const listeners = {}, buttons = [{ disabled: false }, { disabled: true }];
  const form = { hidden: false, isConnected: true, listeners, buttons,
    closest() { return this.hidden ? this : null; },
    querySelectorAll: () => buttons,
    addEventListener: (type, callback) => { listeners[type] = callback; },
    requestSubmit: () => listeners.submit({ preventDefault() {} }),
  };
  const alternate = bindFormSubmit(form, action);
  const key = (overrides = {}) => {
    const event = { key: 'Enter', target: { tagName: 'INPUT', type: 'text' },
      preventDefault() { this.prevented = true; }, ...overrides };
    listeners.keydown(event);
    return event;
  };
  return { form, key, alternate, submit: () => form.requestSubmit() };
}

test('pending submissions and alternate passkey actions share one lock and restore button states', async () => {
  let calls = 0, release;
  const f = fixture(async () => { calls++; await new Promise(resolve => { release = resolve; }); });
  const pending = f.submit();
  assert.deepEqual(f.form.buttons.map(b => b.disabled), [true, true]);
  await f.submit(); await f.alternate(() => { calls++; }); f.key();
  assert.equal(calls, 1);
  release(); await pending;
  assert.deepEqual(f.form.buttons.map(b => b.disabled), [false, true]);
  await f.alternate(() => { calls++; });
  assert.equal(calls, 2);
});

test('repeat Enter never advances another input or repeatedly activates a focused button', async () => {
  let calls = 0;
  const f = fixture(() => { calls++; });
  assert.equal(f.key().prevented, true);
  await Promise.resolve();
  assert.equal(f.key({ repeat: true }).prevented, true);
  assert.equal(f.key({ repeat: true, target: { tagName: 'BUTTON' } }).prevented, true);
  assert.equal(calls, 1);
  f.key(); await Promise.resolve(); assert.equal(calls, 2);
});

test('IME, textarea, select, checkbox, and a normal button keep native keyboard behavior', () => {
  let calls = 0;
  const f = fixture(() => { calls++; });
  for (const overrides of [{ isComposing: true }, { keyCode: 229 }, { key: 'Tab' },
    { target: { tagName: 'TEXTAREA' } }, { target: { tagName: 'SELECT' } },
    { target: { tagName: 'BUTTON' } }, { target: { tagName: 'INPUT', type: 'checkbox' } }]) {
    assert.equal(f.key(overrides).prevented, undefined);
  }
  assert.equal(calls, 0);
});

test('hidden, inert or removed forms cannot submit; hidden inputs cannot trigger visible actions', async () => {
  let calls = 0;
  const f = fixture(() => { calls++; });
  f.form.hidden = true;
  await f.submit(); f.key(); assert.equal(calls, 0);
  f.form.hidden = false; f.form.isConnected = false;
  await f.submit(); assert.equal(calls, 0);
  f.form.isConnected = true;
  f.key({ target: { tagName: 'INPUT', type: 'text', closest: () => ({ inert: true }) } });
  assert.equal(calls, 0);
});

test('a terminal success stays locked during delayed navigation, even if an action reenables its button', async () => {
  let calls = 0;
  const f = fixture(() => { calls++; f.form.buttons[0].disabled = false; return true; });
  await f.submit(); await f.submit(); f.key(); await f.alternate(() => { calls++; });
  assert.equal(calls, 1);
  assert.equal(f.form.buttons[0].disabled, true);
});

test('a failed action releases the lock for an explicit retry', async () => {
  const f = fixture(() => { throw new Error('test failure'); });
  await assert.rejects(f.submit(), /test failure/);
  let retried = false;
  await f.alternate(() => { retried = true; });
  assert.equal(retried, true);
  assert.equal(f.form.buttons[0].disabled, false);
});
