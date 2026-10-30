/** Verification requires an explicit click; fragments never enter server request URLs. */
import { api } from './api.js';

const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
history.replaceState(null, '', location.pathname + location.search);
const button = document.getElementById('verify-recovery');
const status = document.getElementById('verification-status');

if (!/^[a-f0-9]{64}$/.test(token)) {
  button.disabled = true;
  status.textContent = 'This verification link is invalid. Request a new one from your account settings.';
}
button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Verifying your replacement recovery email…';
  const response = await api.post('/auth/recovery-email/verify', { token });
  if (!response.ok) {
    status.textContent = response.error || 'Could not verify this link. Request a new one from your account settings.';
    button.disabled = false;
    return;
  }
  status.textContent = response.data.message;
  if (response.data.notification_sent === false) {
    status.textContent += ' The notification to your previous address could not be delivered.';
  }
  button.textContent = 'Recovery email verified';
});
