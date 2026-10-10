/**
 * /signup page main orchestrator — Google-style multi-step
 */

import { redirectIfAuthed, setupPasswordEyes } from '../../js/common.js';
import { GOTHWAD_CONFIG } from '../../js/config.js';
import { initUsernameCheck } from './modules/username-check.js';
import { initPasswordStrengthMeter } from './modules/password-strength.js';
import { initSignupSubmit } from './modules/signup-submit.js';

setupPasswordEyes();
redirectIfAuthed();

const domainSuffix = document.getElementById('domain-suffix');
if (domainSuffix) domainSuffix.textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;

const form = document.getElementById('signup-form');
const alertBox = document.getElementById('alert-signup');
const usernameInput = document.getElementById('username');
const usernameHint = document.getElementById('username-hint');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm_password');
const strengthFill = document.getElementById('strength-fill');
const strengthText = document.getElementById('strength-text');
const submitBtn = document.getElementById('signup-btn');
const headerDesc = document.getElementById('signup-header-desc');

function showError(message) {
  if (alertBox) {
    alertBox.textContent = message;
    alertBox.classList.remove('hidden');
  }
}

function clearError() {
  if (alertBox) {
    alertBox.classList.add('hidden');
  }
}

/* --------------------------------------------------- Multi-step navigation */
const steps = [
  { panel: document.getElementById('signup-step-1'), actions: document.getElementById('signup-step-1-actions'), desc: 'Basic information — enter your name and date of birth.' },
  { panel: document.getElementById('signup-step-2'), actions: document.getElementById('signup-step-2-actions'), desc: 'Choose your Gothwad email address.' },
  { panel: document.getElementById('signup-step-3'), actions: document.getElementById('signup-step-3-actions'), desc: 'Create a strong password with letters, numbers & symbols.' },
  { panel: document.getElementById('signup-step-4'), actions: document.getElementById('signup-step-4-actions'), desc: 'Recovery information to keep your account safe.' },
];

let currentStepIndex = 0;

function setStep(index) {
  clearError();
  currentStepIndex = index;
  steps.forEach((s, i) => {
    if (s.panel) s.panel.classList.toggle('hidden', i !== index);
    if (s.actions) s.actions.classList.toggle('hidden', i !== index);
  });
  if (headerDesc && steps[index]) {
    headerDesc.textContent = steps[index].desc;
  }
}

// Step 1 -> Step 2
document.getElementById('btn-step-1-next')?.addEventListener('click', () => {
  const firstName = document.getElementById('first_name')?.value.trim();
  const lastName = document.getElementById('last_name')?.value.trim();
  if (!firstName || !lastName) {
    return showError('Please enter both your first and last name.');
  }
  setStep(1);
  usernameInput?.focus();
});

// Step 2 -> Back
document.getElementById('btn-step-2-back')?.addEventListener('click', () => {
  setStep(0);
});

// Step 2 -> Step 3
document.getElementById('btn-step-2-next')?.addEventListener('click', () => {
  let username = usernameInput?.value.trim().toLowerCase();
  if (username && username.includes('@')) {
    username = username.split('@')[0];
    if (usernameInput) usernameInput.value = username;
  }
  if (!username || !/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username)) {
    return showError('Username must be 3–24 characters: a-z, 0-9, dot, dash, underscore.');
  }
  setStep(2);
  passwordInput?.focus();
});

// Step 3 -> Back
document.getElementById('btn-step-3-back')?.addEventListener('click', () => {
  setStep(1);
});

// Step 3 -> Step 4
document.getElementById('btn-step-3-next')?.addEventListener('click', () => {
  const pw = passwordInput?.value;
  const cpw = confirmInput?.value;
  if (!pw || pw.length < 8) {
    return showError('Password must be at least 8 characters long.');
  }
  if (pw !== cpw) {
    return showError('Passwords do not match. Please verify.');
  }
  setStep(3);
  document.getElementById('recovery_email')?.focus();
});

// Step 4 -> Back
document.getElementById('btn-step-4-back')?.addEventListener('click', () => {
  setStep(2);
});

initUsernameCheck(usernameInput, usernameHint);
initPasswordStrengthMeter(passwordInput, strengthFill, strengthText);
initSignupSubmit(form, submitBtn, showError, clearError);
