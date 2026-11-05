/** Password-bearing accounts keep passwords; Google-only accounts use a fresh proof. */
import { api } from '../../js/api.js';
import { googleApi, verifyWithGoogle } from '../../js/google-auth.js';
import { field, getDialogUser } from './dialogs.js';
import { parsePageAuthuser } from '../../js/authuser.js';

export function credentialField(user, id) {
  return user?.has_password === false
    ? `<input id="${id}" type="hidden" value="" /><p>No password added. You will verify with Google to continue.</p>`
    : field(id, 'Current password', { type: 'password', autocomplete: 'current-password', eye: true });
}
export async function securityPost(path, body, owner = getDialogUser()) {
  const selector = parsePageAuthuser();
  if (!owner || owner.id !== getDialogUser()?.id) return { ok: false, error: 'The selected account changed. Please try again.' };
  if (owner?.has_password === false) {
    const proof = await verifyWithGoogle(owner.id);
    if (!proof.ok) return proof;
    if (owner.id !== getDialogUser()?.id || selector !== parsePageAuthuser()) {
      return { ok: false, error: 'The selected account changed. Please try again.' };
    }
    return googleApi(path, body);
  }
  return api.post(path, body);
}
