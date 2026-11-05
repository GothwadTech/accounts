/** Progressively enable Google's additional sign-in option without replacing native auth. */
import { googleApi, startGoogle } from './google-auth.js';
import { setBusy } from './common.js';

const button = document.getElementById('btn-google-entry');
const error = document.getElementById('google-entry-error');
if (button) {
  googleApi('config').then(result => {
    button.disabled = !result.ok || !result.data.enabled;
    if (button.disabled && error) error.textContent = 'Google sign-in is not available yet. Native sign-in and sign-up remain available.';
  });
  button.addEventListener('click', async () => {
    const params = new URLSearchParams(location.search);
    setBusy(button, true, 'Connecting...');
    const result = await startGoogle({ add: params.get('add') === '1', next: params.get('next') || params.get('redirect') || '', remember: true });
    if (!result.ok) { setBusy(button, false); if (error) error.textContent = result.error; }
  });
}
