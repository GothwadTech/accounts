/** Search describes only available settings, with explicit destinations and common synonyms. */
export const SETTINGS_INDEX = [
  { title: 'Google accounts', sub: 'Security · Sign-in methods', keywords: 'gmail connect linked google login', icon: 'account_circle', section: 'security', target: 'btn-google-settings', action: 'google' },
  { title: 'Passkeys', sub: 'Security · Sign-in methods', keywords: 'fingerprint face biometric security key passwordless', icon: 'key', section: 'security', target: 'btn-passkey-settings', action: 'passkeys' },
  { title: 'Change your name', sub: 'Personal info · Profile', keywords: 'first last surname display name', icon: 'person', section: 'personal', dialog: 'name' },
  { title: 'Change your photo', sub: 'Personal info · Profile', keywords: 'avatar picture image crop profile', icon: 'photo_camera', section: 'personal', dialog: 'photo' },
  { title: 'Date of birth', sub: 'Personal info · Optional details', keywords: 'birthday dob age birth date', icon: 'cake', section: 'personal', dialog: 'dob' },
  { title: 'Gender', sub: 'Personal info · Optional details', keywords: 'optional male female', icon: 'diversity_3', section: 'personal', dialog: 'gender' },
  { title: 'Phone number', sub: 'Personal info · Sign-in identifier', keywords: 'mobile telephone number sms', icon: 'call', section: 'personal', dialog: 'phone' },
  { title: 'Recovery email', sub: 'Personal info · Account recovery', keywords: 'backup email address verify recovery', icon: 'mark_email_read', section: 'personal', dialog: 'recovery' },
  { title: 'Account email address', sub: 'Personal info · Fixed identifier', keywords: 'gothwad email username mailbox address', icon: 'alternate_email', section: 'personal', target: 'pi-email' },
  { title: 'Add or change password', sub: 'Security · Sign-in methods', keywords: 'password reset update login', icon: 'password', section: 'security', dialog: 'password' },
  { title: '2-Step Verification', sub: 'Security · Authenticator', keywords: '2fa mfa two factor two step authenticator otp totp verification', icon: 'phonelink_lock', section: 'security', target: 'btn-mfa-settings', action: 'mfa' },
  { title: 'Recent security activity', sub: 'Security · Sign-in history', keywords: 'login history events activity', icon: 'history', section: 'security', target: 'sec-activity' },
  { title: 'Your devices', sub: 'Security · Active sessions', keywords: 'sessions browsers computers phones device', icon: 'devices', section: 'security', target: 'device-list' },
  { title: 'Sign out other devices', sub: 'Security · Active sessions', keywords: 'logout revoke sessions other devices', icon: 'logout', section: 'security', target: 'btn-revoke-others' },
  { title: 'Signing in with other sites', sub: 'Security · Connected apps', keywords: 'oauth permissions third party authorizations', icon: 'apps', section: 'security', target: 'sec-apps-summary' },
  { title: 'Storage', sub: 'Data & privacy · Shared quota', keywords: 'space quota drive mail usage', icon: 'cloud', section: 'data', target: 'dp-storage-card' },
  { title: 'Export your data', sub: 'Data & privacy · Account data', keywords: 'download export backup account data', icon: 'download', section: 'data', target: 'btn-export' },
  { title: 'Delete your account', sub: 'Data & privacy · Account data', keywords: 'remove close erase delete account', icon: 'warning', section: 'data', dialog: 'delete' },
  { title: 'Profile visibility', sub: 'Personal info · Sharing information', keywords: 'public private privacy sharing visibility', icon: 'person', section: 'personal', target: 'profile-visibility' },
  { title: 'Gothwad Contacts', sub: 'People & sharing', keywords: 'people contacts address book', icon: 'contacts', section: 'people', target: 'section-people' },
  { title: 'Gothwad Services', sub: 'Connected apps', keywords: 'services products applications', icon: 'apps', section: 'apps', target: 'section-apps' },
  { title: 'Disconnect an app', sub: 'Connected apps · Permissions', keywords: 'revoke permission disconnect third party app', icon: 'link_off', section: 'apps', target: 'connected-list' },
  { title: 'Home', sub: 'Overview', keywords: 'dashboard overview home', icon: 'home', section: 'home' },
];
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function findSettings(query) {
  const q = normalize(query);
  if (!q) return [];
  return SETTINGS_INDEX.filter(item => {
    const text = normalize(`${item.title} ${item.sub} ${item.keywords}`);
    return q.split(/\s+/).every(token => text.includes(token));
  }).sort((a, b) => Number(normalize(b.title).startsWith(q)) - Number(normalize(a.title).startsWith(q))).slice(0, 8);
}
