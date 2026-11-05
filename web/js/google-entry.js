import { isActiveForm } from './form-submit.js';
/** Progressively enable Google's additional sign-in option without replacing native auth. */
import { startGoogle } from './google-auth.js';
import { setBusy } from './common.js';

const button = document.getElementById('btn-google-entry');
const error = document.getElementById('google-entry-error');
if (button) {
  button.disabled = false;
  button.addEventListener('click', async () => {
    if (button.disabled || !isActiveForm(button) || button.form?.getAttribute('aria-busy') === 'true') return;
    const params = new URLSearchParams(location.search);
    setBusy(button, true, 'Connecting...');
    const result = await startGoogle({ add: params.get('add') === '1', next: params.get('next') || params.get('redirect') || '', remember: true });
    if (!result.ok) { setBusy(button, false); if (error) error.textContent = result.error; }
  });
}
