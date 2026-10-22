/**
 * `/me` — "Search Gothwad Account" instant settings search.
 * Filters account settings as the user types and jumps straight to the target section or dialog.
 */

const SETTINGS_INDEX = [
  { title: 'Change your name', sub: 'Personal info', icon: 'person', section: 'personal', dialog: 'name' },
  { title: 'Change your photo', sub: 'Personal info', icon: 'photo_camera', section: 'personal', dialog: 'photo' },
  { title: 'Date of birth', sub: 'Personal info', icon: 'cake', section: 'personal', dialog: 'dob' },
  { title: 'Gender', sub: 'Personal info', icon: 'diversity_3', section: 'personal', dialog: 'gender' },
  { title: 'Phone number', sub: 'Personal info · Contact info', icon: 'call', section: 'personal', dialog: 'phone' },
  { title: 'Recovery email', sub: 'Personal info · Security', icon: 'mark_email_read', section: 'personal', dialog: 'recovery' },
  { title: 'Your Gothwad email', sub: 'Personal info', icon: 'alternate_email', section: 'personal' },
  { title: 'Change password', sub: 'Security', icon: 'password', section: 'security', dialog: 'password' },
  { title: '2-Step Verification', sub: 'Security', icon: 'phonelink_lock', section: 'security' },
  { title: 'Recent security activity', sub: 'Security', icon: 'history', section: 'security' },
  { title: 'Your devices', sub: 'Security', icon: 'devices', section: 'security' },
  { title: 'Sign out other devices', sub: 'Security', icon: 'logout', section: 'security' },
  { title: 'Signing in with other sites', sub: 'Security', icon: 'apps', section: 'security' },
  { title: 'Storage', sub: 'Data & privacy', icon: 'cloud', section: 'data' },
  { title: 'Export your data', sub: 'Data & privacy', icon: 'download', section: 'data' },
  { title: 'Delete your account', sub: 'Data & privacy', icon: 'warning', section: 'data', dialog: 'delete' },
  { title: 'Gothwad Contacts', sub: 'People & sharing', icon: 'contacts', section: 'people' },
  { title: 'Gothwad Services', sub: 'Connected apps', icon: 'apps', section: 'apps' },
  { title: 'Disconnect an app', sub: 'Connected apps', icon: 'link_off', section: 'apps' },
  { title: 'Home', sub: 'Overview', icon: 'home', section: 'home' },
];

export function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.classList.add('hidden');
      return;
    }
    timer = setTimeout(() => {
      const matches = SETTINGS_INDEX.filter(
        (s) => s.title.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q),
      ).slice(0, 8);
      results.innerHTML =
        matches.length === 0
          ? `<div class="me-search-item" style="cursor:default;"><span class="msym">search_off</span>
             <span><span class="me-search-item-title">No results found</span>
             <span class="me-search-item-sub">Try "password", "photo", "devices"…</span></span></div>`
          : matches
              .map(
                (s) => `
        <button type="button" class="me-search-item" data-section-go="${s.section}" data-dialog-go="${s.dialog || ''}">
          <span class="msym">${s.icon}</span>
          <span>
            <span class="me-search-item-title">${s.title}</span>
            <span class="me-search-item-sub">${s.sub}</span>
          </span>
        </button>`,
              )
              .join('');
      results.classList.remove('hidden');

      results.querySelectorAll('[data-section-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const section = btn.dataset.sectionGo;
          const dialog = btn.dataset.dialogGo;
          results.classList.add('hidden');
          input.value = '';
          input.blur();
          import('./nav.js').then((m) => m.showSection(section));
          if (dialog) {
            // Open target modal right after section transition completes
            setTimeout(() => {
              import('./dialogs.js').then((m) => m.openDialog(dialog));
            }, 120);
          }
        });
      });
    }, 120);
  });

  // Dismiss dropdown when clicking outside search bar
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#me-search')) results.classList.add('hidden');
  });

  // Escape → band
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      results.classList.add('hidden');
      input.blur();
    }
  });
}
