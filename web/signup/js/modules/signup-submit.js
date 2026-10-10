import { api } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';

export function initSignupSubmit(form, submitBtn, showError, clearError) {
  if (!form || !submitBtn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const firstName = document.getElementById('first_name').value.trim();
    const lastName = document.getElementById('last_name').value.trim();
    let username = document.getElementById('username').value.trim().toLowerCase();
    if (username.includes('@')) {
      username = username.split('@')[0];
    }
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;
    const recoveryEmail = document.getElementById('recovery_email').value.trim();
    const phoneNumber = document.getElementById('phone_number').value.trim();

    if (!firstName || !lastName) return showError('First and last name are required.');
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username)) {
      return showError('Username must be 3–24 characters: a-z, 0-9, dot, dash, underscore.');
    }
    if (password.length < 8) return showError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return showError('Passwords do not match.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      return showError('Please enter a valid recovery email (e.g. your Gmail).');
    }

    setBusy(submitBtn, true, 'Creating your account...');

    const res = await api.post('/auth/signup', {
      first_name: firstName,
      last_name: lastName,
      username,
      password,
      recovery_email: recoveryEmail,
      phone_number: phoneNumber || null,
      remember: true,
    });

    setBusy(submitBtn, false);

    if (!res.ok) {
      return showError(res.error || 'Could not create account. Please try again.');
    }

    toast(`Account created! Welcome to Gothwad, ${firstName}!`);

    setTimeout(() => {
      location.href = '/me';
    }, 600);
  });
}
