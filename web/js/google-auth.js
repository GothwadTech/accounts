/** Google uses Accounts' same-origin API and HttpOnly proofs, never browser tokens. */
import { buildAuthHeaders } from './api.js';

export async function googleApi(path, body) {
  try {
    const response = await fetch(path.startsWith('/') ? `/api${path}` : `/api/auth/google/${path}`, { method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    return { ok: response.ok, data, error: data.message || data.error };
  } catch { return { ok: false, error: 'Could not reach Accounts. Please try again.' }; }
}
export async function startGoogle(body = {}) {
  const result = await googleApi('start', body);
  if (result.ok) location.assign(result.data.url);
  return result;
}

let verificationInFlight = false;
export async function verifyWithGoogle(expectedUserId) {
  if (verificationInFlight) return { ok: false, error: 'Finish the current Google verification before starting another.' };
  verificationInFlight = true;
  try { return await runGoogleVerification(expectedUserId); }
  finally { verificationInFlight = false; }
}

/** Fresh verification in a popup preserves unsaved settings and enrollment state. */
async function runGoogleVerification(expectedUserId) {
  const popup = window.open('about:blank', 'gothwad-google-verification', 'popup,width=520,height=700');
  if (!popup) return { ok: false, error: 'Allow popups to verify with Google, then try again.' };
  // Do not give Google's intermediate pages access to the originating settings window.
  popup.opener = null;
  const started = await googleApi('start', { purpose: 'reauth', expected_user_id: expectedUserId });
  if (!started.ok) { popup.close(); return started; }
  popup.location.replace(started.data.url);
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const status = await googleApi('status?reauth=1');
    if (status.ok && status.data.ready) { popup.close(); return { ok: true }; }
    if (status.data?.failed) { popup.close(); return { ok: false, error: 'Google verification failed. Please try again.' }; }
  }
  popup.close();
  return { ok: false, error: 'Google verification expired. Try again.' };
}
