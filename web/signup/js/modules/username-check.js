import { api } from '../../../js/api.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

export function initUsernameCheck(usernameInput, usernameHint) {
  if (!usernameInput || !usernameHint) return;

  let usernameTimer = null;

  usernameInput.addEventListener('input', () => {
    let val = usernameInput.value.toLowerCase();
    if (val.includes('@')) {
      val = val.split('@')[0];
    }
    usernameInput.value = val.replace(/[^a-z0-9._-]/g, '');
    clearTimeout(usernameTimer);

    const username = usernameInput.value.trim();

    if (username.length < 3) {
      usernameHint.className = 'hint';
      usernameHint.textContent = '3–24 characters: a-z, 0-9, dot (.), dash (-), underscore (_)';
      return;
    }

    usernameHint.className = 'hint';
    usernameHint.textContent = 'Checking availability...';

    usernameTimer = setTimeout(async () => {
      const res = await api.get(`/auth/check-username?username=${encodeURIComponent(username)}`);
      if (res.ok && res.data) {
        if (res.data.available) {
          usernameHint.className = 'hint ok';
          usernameHint.textContent = `✓ ${username}@${GOTHWAD_CONFIG.APP_DOMAIN} is available!`;
        } else {
          usernameHint.className = 'hint bad';
          usernameHint.textContent = res.data.error
            ? `✗ ${res.data.error}`
            : `✗ "${username}" is already taken.`;
        }
      }
    }, 450);
  });
}
