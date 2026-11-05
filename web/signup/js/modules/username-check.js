import { api } from '../../../js/api.js';
import { GOTHWAD_CONFIG } from '../../../js/config.js';

export function initUsernameCheck(usernameInput, usernameHint) {
  if (!usernameInput || !usernameHint) return;

  let usernameTimer = null, revision = 0;

  usernameInput.addEventListener('input', () => {
    const requestRevision = ++revision;
    let val = usernameInput.value.toLowerCase();
    if (val.includes('@')) {
      val = val.split('@')[0];
    }
    usernameInput.value = val.replace(/[^a-z0-9]/g, '');
    clearTimeout(usernameTimer);

    const username = usernameInput.value.trim();

    if (username.length < 3) {
      usernameHint.className = 'hint';
      usernameHint.textContent = '3–24 characters: letters and numbers only';
      return;
    }

    usernameHint.className = 'hint';
    usernameHint.textContent = 'Checking availability...';

    usernameTimer = setTimeout(async () => {
      const res = await api.get(`/auth/check-username?username=${encodeURIComponent(username)}`);
      if (requestRevision !== revision || usernameInput.value.trim() !== username) return;
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
