/** UI-only regressions: clear account creation, optional signup birthday, step-scoped methods. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bindFormSubmit } from '../web/js/form-submit.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  return { value: '', textContent: '', required: true, disabled: false, dataset: {}, listeners: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() {}, querySelector() { return this; } };
}

function signinFixture() {
  const ids = ['signin-form', 'step-identifier', 'step-password', 'btn-back-to-identifier', 'chip-user-text',
    'identifier', 'identifier-box', 'identifier-error-note', 'password', 'signin-btn', 'step-mfa',
    'signin-mfa-code', 'signin-passkey', 'signin-mfa-restart', 'signin-passkey-options', 'google-entry-options'];
  const elements = Object.fromEntries(ids.map(id => [id, element(['step-password', 'step-mfa', 'signin-passkey', 'signin-passkey-options'].includes(id))]));
  const context = vm.createContext({ document: { getElementById: id => elements[id] || null },
    location: { search: '' }, URLSearchParams, GOTHWAD_CONFIG: { APP_DOMAIN: 'example.test' },
    bindFormSubmit, passkeysSupported: () => true, setBusy() {}, clearTokens() {}, toast() {},
    api: { post: async path => ({ ok: true, data: path === '/auth/check-identifier' ? { exists: true } : { mfa_required: true, challenge: 'test-challenge' } }) },
  });
  const source = read('web/signin/js/modules/signin-form.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\ninitSigninForm(() => {}, () => {});', context);
  const submit = () => elements['signin-form'].listeners.submit({ preventDefault() {} });
  return { elements, submit };
}

test('entry tabs say Create New while preserving the existing signup route', () => {
  for (const page of ['signin', 'signup']) {
    const html = read(`web/${page}/index.html`);
    assert.match(html, /href="\/signup"[^>]*>Create New<\/a>/);
    assert.doesNotMatch(html, />Sign Up<\/a>/);
  }
});

test('native birthday is optional and collapsed; Google onboarding still asks for no birthday', () => {
  const html = read('web/signup/index.html');
  assert.match(html, /id="signup-optional-toggle" aria-expanded="false" aria-controls="signup-optional-details"/);
  assert.match(html, /id="signup-optional-details" hidden inert/);
  assert.match(html, /id="date_of_birth" type="hidden"/);
  for (const part of ['day', 'month', 'year']) assert.match(html, new RegExp(`id="birth-${part}" type="text" inputmode="numeric"`));
  assert.doesNotMatch(html, /type="date"/);
  assert.doesNotMatch(html, /id="date_of_birth"[^>]*required/);
  assert.ok(html.indexOf('id="last_name"') < html.indexOf('id="signup-optional-toggle"'));
  assert.ok(html.indexOf('id="signup-optional-toggle"') < html.indexOf('id="btn-step-1-next"'));
  for (const path of ['web/signin/google/index.html', 'web/signin/google/google.js']) {
    assert.doesNotMatch(read(path), /date_of_birth|google-dob|date of birth/i, path);
  }
});

test('Create New combines email and one password without confirmation, strength meter or an extra step', () => {
  const html = read('web/signup/index.html');
  const credentials = html.slice(html.indexOf('id="signup-step-2"'), html.indexOf('id="signup-step-3"'));
  assert.match(credentials, /id="username"/);
  assert.match(credentials, /id="password"/);
  assert.doesNotMatch(html, /confirm_password|strength-fill|strength-text|signup-step-4|mixed case/i);
  assert.doesNotMatch(read('web/signup/js/signup.js'), /confirmInput|initPasswordStrengthMeter|strong password/);
});

test('Create New places Google below Next and inside first-step actions only', () => {
  const html = read('web/signup/index.html');
  const firstActions = html.slice(html.indexOf('id="signup-step-1-actions"'), html.indexOf('id="signup-step-2-actions"'));
  assert.ok(firstActions.indexOf('btn-step-1-next') < firstActions.indexOf('btn-google-entry'));
  assert.match(firstActions, /id="google-entry-options"/);
  assert.match(firstActions, /auth-separator/);
  assert.equal((html.match(/id="btn-google-entry"/g) || []).length, 1);
});

test('sign-in shows Google only on identifier step, passkeys on password step, neither on MFA, and restores on Back', async () => {
  const { elements: el, submit } = signinFixture();
  const hidden = id => el[id].classList.contains('hidden');
  assert.equal(hidden('google-entry-options'), false);
  el.identifier.value = 'entryuser';
  await submit();
  assert.equal(hidden('google-entry-options'), true);
  assert.equal(hidden('signin-passkey-options'), false);
  el['btn-back-to-identifier'].listeners.click();
  assert.equal(hidden('google-entry-options'), false);
  assert.equal(hidden('signin-passkey-options'), true);
  await submit();
  el.password.value = 'SyntheticPassword!123';
  await submit();
  assert.equal(hidden('step-mfa'), false);
  assert.equal(hidden('google-entry-options'), true);
  assert.equal(hidden('signin-passkey-options'), true);
  el['signin-mfa-restart'].listeners.click();
  assert.equal(hidden('google-entry-options'), false);
  assert.equal(hidden('signin-passkey-options'), true);
});

test('Sign In and Create New share a field rhythm without stacked recovery/action margins', () => {
  const shared = read('web/css/legacy/auth.css');
  assert.match(shared, /--auth-field-gap: 12px/);
  assert.match(shared, /--auth-label-gap: 6px/);
  const html = read('web/signin/index.html');
  assert.equal((html.match(/class="auth-recovery-action"/g) || []).length, 2);
  assert.doesNotMatch(html, /margin-top: 4px; margin-bottom: 14px/);
  const css = read('web/signin/css/signin.css');
  assert.match(css, /\.auth-recovery-action\s*\{[^}]*margin: 0 0 var\(--auth-field-gap, 12px\)/);
  assert.match(css, /#signin-btn\s*\{[^}]*margin-top: 0/);
  assert.match(read('web/signup/css/signup.css'), /#signup-form \.auth-btn-outside\s*\{[^}]*margin-top: 0/);
});
