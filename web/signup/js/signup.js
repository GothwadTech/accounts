import { bindFormSubmit } from '../../js/form-submit.js';
/**
 * /signup page main orchestrator — Google-style multi-step
 */

import { redirectIfAuthed, setupPasswordEyes, carryNextOnAuthLinks } from '../../js/common.js';
import { initUsernameCheck } from './modules/username-check.js';
import { initOptionalDetails, readBirthDate } from './modules/optional-details.js';
import { createSignupSubmit } from './modules/signup-submit.js';

setupPasswordEyes();
carryNextOnAuthLinks();
redirectIfAuthed();

const form = document.getElementById('signup-form');
const alertBox = document.getElementById('alert-signup');
const usernameInput = document.getElementById('username');
const usernameHint = document.getElementById('username-hint');
const passwordInput = document.getElementById('password');
const revealOptionalDetails = initOptionalDetails();
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
  { panel: document.getElementById('signup-step-1'), actions: document.getElementById('signup-step-1-actions'), desc: 'Enter your first and last name.' },
  { panel: document.getElementById('signup-step-2'), actions: document.getElementById('signup-step-2-actions'), desc: 'Choose your Gothwad email address and password.' },
  { panel: document.getElementById('signup-step-3'), actions: document.getElementById('signup-step-3-actions'), desc: 'Recovery information to keep your account safe.' },
];

let currentStepIndex = 0;

function setStep(index, focus = true) {
  clearError();
  currentStepIndex = index;
  steps.forEach((s, i) => {
    for (const node of [s.panel, s.actions]) {
      if (!node) continue;
      node.classList.toggle('hidden', i !== index);
      node.hidden = i !== index;
      node.inert = i !== index;
    }
  });
  if (headerDesc && steps[index]) {
    headerDesc.textContent = steps[index].desc;
  }
  if (focus) document.getElementById(['first_name', 'username', 'recovery_email'][index])?.focus();
}

function advanceStep() {
  if (currentStepIndex === 0) {
    const first = document.getElementById('first_name'), last = document.getElementById('last_name');
    if (!first.value.trim() || !last.value.trim()) {
      showError('Please enter both your first and last name.');
      (!first.value.trim() ? first : last).focus();
      return;
    }
    if (showBirthDateError()) return;
    setStep(1);
  } else if (currentStepIndex === 1) {
    const username = usernameInput.value.trim().toLowerCase().split('@')[0];
    usernameInput.value = username;
    if (!/^[a-z0-9]{3,24}$/.test(username)) {
      showError('Username must be 3–24 characters: letters and numbers only.');
      usernameInput.focus();
      return;
    }
    if (passwordInput.value.length < 8) {
      showError('Password must be at least 8 characters long.');
      passwordInput.focus();
      return;
    }
    setStep(2);
  }
}

function showBirthDateError() {
  const { error, focusId } = readBirthDate();
  if (!error) return false;
  revealOptionalDetails();
  showError(error);
  document.getElementById(focusId).focus();
  return true;
}

const finishSignup = createSignupSubmit(submitBtn, (message, step, field) => {
  if (Number.isInteger(step)) setStep(step);
  if (field?.startsWith('birth-')) revealOptionalDetails();
  showError(message);
  if (field) document.getElementById(field)?.focus();
}, clearError);
bindFormSubmit(form, () => currentStepIndex < 2 ? advanceStep() : finishSignup());

for (let step = 0; step < 2; step++) {
  document.getElementById(`btn-step-${step + 1}-next`)?.addEventListener('click', () => {
    if (currentStepIndex === step) form.requestSubmit();
  });
  document.getElementById(`btn-step-${step + 2}-back`)?.addEventListener('click', () => {
    if (currentStepIndex === step + 1) setStep(step);
  });
}
setStep(0, false);

initUsernameCheck(usernameInput, usernameHint);
