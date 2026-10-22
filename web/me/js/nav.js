/**
 * `/me` — Sidebar and cross-card section navigation.
 * Supports `.me-nav-item[data-section]` and `[data-goto-section]` triggers.
 */

const SECTIONS = ['home', 'personal', 'security', 'data', 'people', 'apps'];

export function initNav() {
  document.querySelectorAll('.me-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
  document.querySelectorAll('[data-goto-section]').forEach((el) => {
    el.addEventListener('click', () => showSection(el.dataset.gotoSection));
  });
}

/**
 * Switches the active dashboard section and runs lazy data loaders.
 * @param {string} name home|personal|security|data|people|apps
 */
export function showSection(name) {
  if (!SECTIONS.includes(name)) name = 'home';

  document.querySelectorAll('.me-nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  document.querySelectorAll('.me-section').forEach((s) => {
    s.classList.toggle('hidden', s.id !== `section-${name}`);
  });

  // Section-specific lazy loads (fresh data)
  if (name === 'security') {
    import('./tabs/security.js').then((m) => {
      m.loadActivity();
      m.loadSessions();
    });
  } else if (name === 'data') {
    import('./tabs/data.js').then((m) => m.loadActivity());
  } else if (name === 'apps') {
    import('./tabs/apps.js').then((m) => m.loadConnectedApps());
  } else if (name === 'personal') {
    import('./tabs/personal.js').then((m) => m.refreshRows());
  }

  // Scroll to top after switching sections
  window.scrollTo({ top: 0 });
}
