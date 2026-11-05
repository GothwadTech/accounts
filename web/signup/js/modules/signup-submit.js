import { readBirthDate } from './optional-details.js';
import { api, clearTokens } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';
import { safeNextUrl } from '../../../js/accounts.js';
import { isInternalAccountHubPath, mePathForAuthuser } from '../../../js/authuser.js';

export function createSignupSubmit(submitBtn, showError, clearError) {
  return async () => {
    clearError();

    const firstName = document.getElementById('first_name').value.trim();
    const lastName = document.getElementById('last_name').value.trim();
    let username = document.getElementById('username').value.trim().toLowerCase();
    if (username.includes('@')) {
      username = username.split('@')[0];
    }
    const password = document.getElementById('password').value;
    const birthday = readBirthDate();
    const birthDate = birthday.value;
    const recoveryEmail = document.getElementById('recovery_email').value.trim();
    const phoneNumber = document.getElementById('phone_number').value.trim();

    if (!firstName || !lastName) return showError('First and last name are required.', 0, !firstName ? 'first_name' : 'last_name');
    if (birthday.error) return showError(birthday.error, 0, birthday.focusId);
    if (!/^[a-z0-9]{3,24}$/.test(username)) {
      return showError('Username must be 3–24 characters: letters and numbers only.', 1, 'username');
    }
    if (password.length < 8) return showError('Password must be at least 8 characters.', 1, 'password');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      return showError('Please enter a valid recovery email (e.g. your Gmail).', 2, 'recovery_email');
    }

    const params = new URLSearchParams(location.search);
    const addMode = params.get('add') === '1';
    const path = addMode ? '/auth/signup?add=1' : '/auth/signup';

    setBusy(submitBtn, true, 'Creating your account...');
    clearTokens();

    const res = await api.post(path, {
      first_name: firstName,
      last_name: lastName,
      username,
      password,
      ...(birthDate ? { date_of_birth: birthDate } : {}),
      recovery_email: recoveryEmail,
      phone_number: phoneNumber || null,
      remember: true,
      add: addMode,
    });

    setBusy(submitBtn, false);

    if (!res.ok) {
      return showError(res.error || 'Could not create account. Please try again.');
    }

    toast(`Account created! Welcome to Gothwad, ${firstName}!`);

    setTimeout(() => {
      const authuser = Number.isInteger(res.data?.authuser) ? res.data.authuser : 0;
      const defaultMe = mePathForAuthuser(authuser);
      const next = params.get('next');
      location.href = !next || isInternalAccountHubPath(next) ? defaultMe : safeNextUrl(next, defaultMe);
    }, 600);
    return true;
  };
}
