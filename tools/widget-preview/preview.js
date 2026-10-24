import { GothwadAccountMenu } from '/widget/account-menu.js';

const samples = [
  { id: 'a', authuser: 0, username: 'alex', firstName: 'Alex', lastName: 'Stone' },
  { id: 'b', authuser: 1, username: 'studio', firstName: 'Studio', lastName: 'Team' },
  { id: 'c', authuser: 2, username: 'work', firstName: 'Work', lastName: 'Account' },
  { id: 'd', authuser: 3, username: 'design', firstName: 'Design', lastName: 'Lab' },
  { id: 'e', authuser: 4, username: 'personal', firstName: 'Personal', lastName: 'Account' },
  { id: 'f', authuser: 5, username: 'archive', firstName: 'Archive', lastName: 'Team' },
].map((account) => ({ ...account, email: `${account.username}@example.com` }));
let accounts = samples.slice(0, 3);
let activeId = 'a';
let theme = 'dark';
let host = 'accounts';
const anchor = document.getElementById('avatar-trigger');
const status = document.getElementById('status');
function notify(message) { status.textContent = message; }
function openMenu() {
  const current = accounts.find((account) => account.id === activeId) || accounts[0];
  if (!current) return;
  activeId = current.id;
  anchor.textContent = current.firstName[0] + current.lastName[0];
  GothwadAccountMenu.open({ user: current, accounts, activeId, authuser: current.authuser }, {
    theme,
    accountsWebOrigin: location.origin,
    ecosystemName: 'Gothwad',
    anchorEl: anchor,
    badges: host === 'mail' ? { studio: 8, work: 2 } : {},
    extraActions: host === 'store' ? [{ label: 'Kiwi Console', onClick: () => notify('Preview: Kiwi Console selected.') }] : [],
    accountHref: (account) => `#account-${account.id}`,
    onSwitchAccount: (account) => { activeId = account.id; notify(`Preview: switched to ${account.email}.`); openMenu(); },
    onSignOutAccount: (slotId) => {
      accounts = accounts.filter((account) => account.id !== slotId);
      if (!accounts.length) { accounts = samples.slice(0, 1); activeId = 'a'; }
      notify('Preview only: sample account removed. No real account was changed.');
      openMenu();
    },
    onSignOutAll: () => notify('Preview only: sign out of all accounts selected. No real account was changed.'),
    onManageAccount: () => notify(`Preview: manage ${current.email}.`),
    onError: notify,
  });
  // Prevent navigating to sign-in from this local design-only fixture.
  GothwadAccountMenu.layerEl.querySelector('[data-gw-action="add-account"]').addEventListener('click', (event) => {
    event.preventDefault();
    if (accounts.length >= 6) return;
    accounts.push(samples.find((sample) => !accounts.some((account) => account.id === sample.id)));
    notify('Preview: one sample account added.');
    openMenu();
  });
}
document.querySelectorAll('[data-theme]').forEach((button) => {
  if (button.tagName !== 'BUTTON') return;
  button.addEventListener('click', () => {
    theme = button.dataset.theme;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('button[data-theme]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    openMenu();
  });
});
document.querySelectorAll('[data-count]').forEach((button) => button.addEventListener('click', () => {
  accounts = samples.slice(0, Number(button.dataset.count));
  activeId = accounts[0].id;
  document.querySelectorAll('[data-count]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  openMenu();
}));
document.getElementById('host-app').addEventListener('change', (event) => { host = event.target.value; openMenu(); });
anchor.addEventListener('click', () => GothwadAccountMenu.isOpen() ? GothwadAccountMenu.close() : openMenu());
document.getElementById('open-menu').addEventListener('click', openMenu);
openMenu();
