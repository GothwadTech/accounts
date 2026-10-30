/** Optional second-factor field for sensitive actions; never persists codes. */
export function mfaActionField(user, id) {
  if (!user?.two_factor_enabled) return '';
  return `<div class="auth-field-group">
    <label for="${id}">Authenticator or unused recovery code</label>
    <input class="input" id="${id}" type="text" autocomplete="one-time-code" maxlength="128" />
    <p class="auth-helper">Use a fresh code. An authenticator code cannot be reused after sign-in.</p>
  </div>`;
}
export function mfaActionCode(id) {
  return document.getElementById(id)?.value.trim() || '';
}
