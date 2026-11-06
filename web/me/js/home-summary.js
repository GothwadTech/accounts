/** No invented scores, forced passwords or recommendations for optional profile fields. */
export function homeRecommendations(user) {
  const items = [];
  if (!user.recovery_email) items.push({ title: 'Add a recovery email', detail: 'Choose an address you can access if you need account recovery.', dialog: 'recovery', action: 'Add email' });
  else if (user.recovery_email_verified !== true) items.push({ title: 'Check your recovery email', detail: 'Verification of the current address is not confirmed.', dialog: 'recovery', action: 'Review email' });
  if (user.two_factor_enabled === false) items.push({ title: 'Consider 2-Step Verification', detail: 'An optional authenticator adds another step when signing in.', target: 'btn-mfa-settings', action: 'Review option' });
  return items;
}

/** A missing quota is unknown, not one byte; zero usage must have an empty bar. */
export function storageSummary(user) {
  const used = Number(user.storage_used_bytes);
  const limit = Number(user.storage_limit_bytes);
  const knownUsed = user.storage_used_bytes != null && Number.isFinite(used) && used >= 0;
  const knownLimit = user.storage_limit_bytes != null && Number.isFinite(limit) && limit > 0;
  return { used: knownUsed ? used : null, limit: knownLimit ? limit : null,
    percent: knownUsed && knownLimit ? Math.min(100, used / limit * 100) : 0 };
}
