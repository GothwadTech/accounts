import { api } from '../../../js/api.js';
import { setBusy, toast } from '../../../js/common.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

export function prefillProfile(u) {
  if (!u) return;
  const fName = document.getElementById('first_name');
  if (fName) fName.value = u.first_name || '';

  const lName = document.getElementById('last_name');
  if (lName) lName.value = u.last_name || '';

  const uName = document.getElementById('profile-username');
  if (uName) uName.value = u.username || '';

  const rEmail = document.getElementById('recovery_email');
  if (rEmail) rEmail.value = u.recovery_email || '';

  const phone = document.getElementById('phone_number');
  if (phone) phone.value = u.phone_number || '';

  const suffix = document.getElementById('domain-suffix-profile');
  if (suffix) suffix.textContent = `@${GOTHWAD_CONFIG.APP_DOMAIN}`;
}

export function initProfileForm(onUserUpdated) {
  const form = document.getElementById('profile-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profileAlert = document.getElementById('alert-profile');
    if (profileAlert) profileAlert.classList.add('hidden');

    const btn = document.getElementById('profile-save-btn');
    setBusy(btn, true, 'Saving...');

    const res = await api.post('/auth/update-profile', {
      first_name: document.getElementById('first_name').value.trim(),
      last_name: document.getElementById('last_name').value.trim(),
      recovery_email: document.getElementById('recovery_email').value.trim(),
      phone_number: document.getElementById('phone_number').value.trim(),
    });

    setBusy(btn, false);

    if (!res.ok) {
      if (profileAlert) {
        profileAlert.textContent = res.error || 'Could not save profile.';
        profileAlert.classList.remove('hidden');
      }
      return;
    }

    toast('Profile updated successfully');
    if (onUserUpdated && res.data && res.data.user) {
      onUserUpdated(res.data.user);
    }
  });
}
