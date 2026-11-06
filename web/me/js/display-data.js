/** Pure presentation helpers: missing metadata stays unavailable, not fabricated. */
export function fullDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
}
export function localDay(value) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}
export function orderSessions(rows) {
  return [...rows].sort((a, b) => Number(!!b.is_current) - Number(!!a.is_current) || (Date.parse(b.last_active) || 0) - (Date.parse(a.last_active) || 0));
}
export function factorState(response) {
  if (!response?.ok) return { label: 'Unavailable', detail: 'Could not load authenticator status. Retry to check it.' };
  const status = response.data;
  if (status?.enabled === true) return { label: 'On', detail: `${Number.isInteger(status.recovery_codes_remaining) ? status.recovery_codes_remaining : 'Unknown number of'} unused offline recovery codes` };
  if (status?.enabled !== false) return { label: 'Unknown', detail: 'Authenticator status was not provided.' };
  return status.enrollment_available ? { label: 'Off', detail: 'Optional authenticator verification is available.' } : { label: 'Unavailable', detail: 'Setup is not available on this site. Existing sign-in methods are unchanged.' };
}
export function permissionLabel(scope) {
  return ({ openid: 'Identify your account', profile: 'Read your basic profile', email: 'Read your account email address', offline_access: 'Keep access using refresh tokens' })[scope] || `Permission: ${scope}`;
}
