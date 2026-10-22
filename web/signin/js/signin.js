/**
 * /signin page main orchestrator
 */

import { redirectIfAuthed, setupPasswordEyes, carryNextOnAuthLinks } from '../../js/common.js';
import { GOTHWAD_CONFIG } from '../../js/config.js';
import { initSigninForm } from './modules/signin-form.js';
import { initForgotPassword } from './modules/forgot-password.js';
import { extractResetToken, initResetPassword } from './modules/reset-password.js';
import { initAccountChooser } from './modules/account-chooser.js';

setupPasswordEyes();
carryNextOnAuthLinks();

const resetTokenEarly = extractResetToken();
if (!resetTokenEarly) {
  redirectIfAuthed().then((state) => {
    if (state && state.showChooser) {
      initAccountChooser(state.accountsState || null);
    }
  });
}

if (new URLSearchParams(location.search).get('add') === '1') {
  const sub = document.getElementById('auth-header-sub');
  if (sub) sub.textContent = 'Add another Gothwad Account on this device.';
}

const suffixText = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;
const suffixEl = document.getElementById('domain-suffix');
if (suffixEl) suffixEl.textContent = suffixText;
document.querySelectorAll('.suffix-copy').forEach((el) => {
  el.textContent = suffixText;
});

/* ------------------------------------------------------------ mode switch */
const modes = {
  signin: document.getElementById('mode-signin'),
  forgot: document.getElementById('mode-forgot'),
  reset: document.getElementById('mode-reset'),
  chooser: document.getElementById('mode-chooser'),
};

export function showMode(name) {
  Object.entries(modes).forEach(([key, el]) => {
    if (el) el.classList.toggle('hidden', key !== name);
  });
  const tabs = document.getElementById('auth-switcher-tabs');
  const sub = document.getElementById('auth-header-sub');
  if (tabs) tabs.classList.toggle('hidden', name !== 'signin');
  if (sub) {
    if (name === 'forgot') sub.textContent = 'Reset your password to regain access to your account.';
    else if (name === 'reset') sub.textContent = 'Your reset link is verified. Choose a new password below.';
    else if (new URLSearchParams(location.search).get('add') === '1') {
      sub.textContent = 'Add another Gothwad Account on this device.';
    } else {
      sub.textContent = 'Connecting you to your world, one identity for Mail, Drive, Chat, Notes & more.';
    }
  }
}

const linkForgot = document.getElementById('link-forgot');
if (linkForgot) linkForgot.addEventListener('click', () => showMode('forgot'));

const btnForgotAction = document.getElementById('btn-forgot-action');
if (btnForgotAction) btnForgotAction.addEventListener('click', () => showMode('forgot'));

document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => showMode(btn.dataset.goto));
});

export function showAlert(id, message) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

export function hideAlert(id) {
  const box = document.getElementById(id);
  if (box) box.classList.add('hidden');
}

initSigninForm(showAlert, hideAlert);
initForgotPassword(showAlert, hideAlert);

const resetToken = extractResetToken();
if (resetToken) {
  showMode('reset');
  history.replaceState(null, '', location.pathname);
  initResetPassword(resetToken, showAlert, hideAlert);
}
