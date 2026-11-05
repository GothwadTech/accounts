import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { birthDateError } from '../web/signup/js/modules/optional-details.js';
import { bindFormSubmit } from '../web/js/form-submit.js';

function signup() {
  const nodes = {}, document = { activeElement: null, getElementById: id => nodes[id] };
  const ids = readFileSync(new URL('../web/signup/index.html', import.meta.url), 'utf8').matchAll(/id="([^"]+)"/g);
  for (const [, id] of ids) {
    const classes = new Set(), attrs = {};
    nodes[id] = { id, value: '', disabled: false, hidden: false, listeners: {}, tagName: 'INPUT', type: 'text',
      classList: { add: name => classes.add(name), remove: name => classes.delete(name),
        toggle: (name, flag) => flag ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      closest() { let node = this; while (node) { if (node.hidden || node.inert) return node; node = node.parent; } return null; },
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      focus() { document.activeElement = this; },
    };
  }
  for (const id of Object.keys(nodes).filter(id => id.startsWith('btn-') || id === 'signup-btn')) nodes[id].tagName = 'BUTTON';
  const fields = [['first_name', 'last_name', 'date_of_birth', 'birth-day', 'birth-month', 'birth-year'], ['username', 'password'], ['recovery_email', 'phone_number']];
  fields.forEach((ids, index) => ids.forEach(id => { nodes[id].parent = nodes[`signup-step-${index + 1}`]; }));
  const form = nodes['signup-form'];
  form.querySelectorAll = () => Object.values(nodes).filter(node => node.tagName === 'BUTTON');
  form.requestSubmit = () => form.listeners.submit({ preventDefault() {} });
  let posts = 0, release;
  const context = vm.createContext({ document, bindFormSubmit, setupPasswordEyes() {}, carryNextOnAuthLinks() {},
    redirectIfAuthed() {}, GOTHWAD_CONFIG: { APP_DOMAIN: 'example.test' }, initUsernameCheck() {},
    createSignupSubmit: () => async () => { posts++; await new Promise(resolve => { release = resolve; }); },
  });
  vm.runInContext(readFileSync(new URL('../web/signup/js/modules/optional-details.js', import.meta.url), 'utf8').replace(/^export /gm, ''), context);
  const source = readFileSync(new URL('../web/signup/js/signup.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context);
  const key = async (id, repeat = false) => {
    form.listeners.keydown({ key: 'Enter', target: nodes[id], repeat, preventDefault() {} });
    await Promise.resolve(); await Promise.resolve();
  };
  return { nodes, document, form, key, posts: () => posts, release: () => release() };
}

test('Create New Enter validates only names, then visibly advances one step with correct focus', async () => {
  const f = signup();
  f.nodes.first_name.value = 'Keyboard';
  await f.key('first_name');
  assert.equal(f.nodes['signup-step-1'].hidden, false);
  assert.equal(f.document.activeElement.id, 'last_name');
  assert.match(f.nodes['alert-signup'].textContent, /first and last name/);
  assert.equal(f.posts(), 0);
  f.nodes.last_name.value = 'Tester';
  await f.key('last_name');
  assert.equal(f.nodes['signup-step-1'].inert, true);
  assert.equal(f.nodes['signup-step-2'].hidden, false);
  assert.equal(f.document.activeElement.id, 'username');
  assert.equal(f.posts(), 0);
  await f.key('username');
  assert.equal(f.nodes['signup-step-2'].hidden, false);
  assert.match(f.nodes['alert-signup'].textContent, /Username/);
});

test('autofilled hidden fields, repeat Enter and hidden Next clicks cannot skip steps or create early', async () => {
  const f = signup();
  for (const [id, value] of Object.entries({ first_name: 'Keyboard', last_name: 'Tester', username: 'keyboardtester',
    password: 'aaaaaaaa', recovery_email: 'synthetic@example.test' })) {
    f.nodes[id].value = value;
  }
  await f.key('last_name'); await f.key('username', true);
  assert.equal(f.nodes['signup-step-2'].hidden, false);
  f.nodes['btn-step-1-next'].listeners.click();
  assert.equal(f.nodes['signup-step-2'].hidden, false);
  await f.key('password'); await f.key('recovery_email', true);
  assert.equal(f.nodes['signup-step-3'].hidden, false);
  assert.equal(f.document.activeElement.id, 'recovery_email');
  assert.equal(f.posts(), 0);
  await f.key('recovery_email');
  await f.form.requestSubmit(); await f.key('recovery_email');
  assert.equal(f.posts(), 1);
  f.release(); await Promise.resolve();
});

test('optional details disclosure expands/collapses without advancing and preserves an entered birthday', async () => {
  const f = signup(), toggle = f.nodes['signup-optional-toggle'], details = f.nodes['signup-optional-details'];
  assert.equal(details.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  f.document.activeElement = toggle;
  toggle.listeners.click();
  assert.equal(details.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(f.document.activeElement.id, 'signup-optional-toggle');
  f.nodes['birth-day'].value = '29'; f.nodes['birth-month'].value = '02'; f.nodes['birth-year'].value = '2000';
  f.nodes['birth-year'].listeners.input({ target: f.nodes['birth-year'] });
  toggle.listeners.click();
  assert.equal(details.inert, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(f.nodes.date_of_birth.value, '2000-02-29');
  assert.equal(f.nodes['signup-step-1'].hidden, false);
  assert.equal(f.posts(), 0);
});

test('blank birthday is valid, but impossible/future dates and partial date input are not', () => {
  assert.equal(birthDateError(''), '');
  assert.equal(birthDateError('2000-02-29'), '');
  for (const value of ['2023-02-29', '2024-02-31', '2999-01-01', 'not-a-date']) {
    assert.match(birthDateError(value), /valid date of birth/);
  }
  assert.match(birthDateError('', true), /valid date of birth/);
});

test('an invalid birthday entered earlier is revealed and focused instead of validating a hidden field', async () => {
  const f = signup();
  f.nodes.first_name.value = 'Keyboard'; f.nodes.last_name.value = 'Tester';
  f.nodes['birth-day'].value = '01'; f.nodes['birth-month'].value = '01'; f.nodes['birth-year'].value = '2999';
  await f.key('last_name');
  assert.equal(f.nodes['signup-step-1'].hidden, false);
  assert.equal(f.nodes['signup-optional-details'].hidden, false);
  assert.equal(f.nodes['signup-optional-toggle'].getAttribute('aria-expanded'), 'true');
  assert.equal(f.document.activeElement.id, 'birth-day');
  assert.match(f.nodes['alert-signup'].textContent, /valid date of birth/);
  assert.equal(f.posts(), 0);
});

test('segmented birthday rejects partial and impossible dates, accepts leap day and remains optional', async () => {
  const f = signup();
  f.nodes.first_name.value = 'Birthday'; f.nodes.last_name.value = 'Test';
  f.nodes['birth-day'].value = '29'; f.nodes['birth-month'].value = '2';
  await f.key('last_name');
  assert.equal(f.document.activeElement.id, 'birth-year');
  assert.equal(f.nodes['signup-step-2'].hidden, true);
  f.nodes['birth-year'].value = '2001'; await f.key('birth-year');
  assert.equal(f.nodes['signup-step-2'].hidden, true);
  assert.match(f.nodes['alert-signup'].textContent, /valid date of birth/);
  f.nodes['birth-year'].value = '2000'; await f.key('birth-year');
  assert.equal(f.nodes['signup-step-2'].hidden, false);
  assert.equal(f.nodes.date_of_birth.value, '2000-02-29');
});
