/**
 * =============================================================================
 * /me — MAIN ORCHESTRATOR (Google-style My Account)
 * =============================================================================
 * Kaam: auth check → data load → sidebar navigation → search → account menu.
 * Sections apne modules mein hain (tabs/ folder): home, personal, security,
 * data, people, apps. Dialogs dialogs.js se khulte hain.
 */

import { requireAuth, signOut, escapeHtml } from '../../js/common.js';
import { listAccounts, switchToAccount, initialsFor } from '../../js/accounts.js';
import { renderAvatar } from './avatar.js';
import { mountThemeToggles } from '../../js/theme.js';
import { initNav, showSection } from './nav.js';
import { renderUserEverywhere, loadHome } from './tabs/home.js';
import { initPersonalInfo } from './tabs/personal.js';
import { initSecurity } from './tabs/security.js';
import { initDataPrivacy } from './tabs/data.js';
import { initPeople, loadPeople } from './tabs/people.js';
import { loadConnectedApps } from './tabs/apps.js';
import { initSearch } from './search.js';

mountThemeToggles();

let currentUser = null;

async function boot() {
  currentUser = await requireAuth();
  if (!currentUser) return; // /signin par redirect ho gaya

  // Loader hatao, dashboard dikhao
  document.getElementById('auth-loading')?.classList.add('hidden');
  document.getElementById('dash-root')?.classList.remove('hidden');

  renderUserEverywhere(currentUser);
  renderAccountMenu(currentUser);

  // Modules init
  initNav();
  initPersonalInfo(currentUser, onUserUpdated);
  initSecurity(currentUser, onUserUpdated);
  initDataPrivacy(currentUser, refreshAll);
  initPeople();
  loadConnectedApps();
  initSearch();
  loadPeople(currentUser);

  // Pehla data load (store.js cache se sab sections share karte hain)
  loadHome(currentUser);
}

/** Profile update hone par har jagah fresh data dikha do. */
function onUserUpdated(user) {
  currentUser = user;
  renderUserEverywhere(user);
  renderAccountMenu(user);
}

function refreshAll() {
  if (currentUser) {
    renderUserEverywhere(currentUser);
    loadHome(currentUser);
    loadPeople(currentUser);
  }
}

/* ------------------------------------------------------ account menu */
function renderAccountMenu(user) {
  const avatarEl = document.getElementById('appbar-avatar');
  renderAvatar(avatarEl, user);
  document.getElementById('menu-name').textContent =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('menu-email').textContent = user.email || user.username;

  const accounts = listAccounts();
  const listEl = document.getElementById('menu-accounts');
  listEl.innerHTML = accounts.map((a) => `
    <button type="button" class="acct-menu-item" data-switch="${escapeHtml(a.id)}" role="menuitem">
      <span class="avatar sm">${escapeHtml(initialsFor(a))}</span>
      <span>
        <span class="acct-item-name">${escapeHtml(`${a.first_name || ''} ${a.last_name || ''}`.trim() || a.username)}</span>
        <span class="acct-item-email mono">${escapeHtml(a.email || a.username)}</span>
      </span>
      ${a.username === user.username ? '<span class="acct-check"><span class="msym" style="font-size:18px;">check</span></span>' : ''}
    </button>`).join('');

  listEl.querySelectorAll('[data-switch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const acc = accounts.find((a) => a.id === btn.getAttribute('data-switch'));
      if (!acc || acc.username === user.username) {
        document.getElementById('acct-menu')?.classList.add('hidden');
        return;
      }
      const sw = await switchToAccount(acc);
      if (!sw.ok) return;
      location.reload();
    });
  });

  document.getElementById('btn-signout-all')?.classList.toggle('hidden', accounts.length <= 1);
}

/* ------------------------------------------- menu open/close bindings */
const menuBtn = document.getElementById('acct-switch-btn');
const menu = document.getElementById('acct-menu');
if (menuBtn && menu) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));
  menu.addEventListener('click', (e) => e.stopPropagation());
}
document.getElementById('btn-signout-one')?.addEventListener('click', () => signOut());
document.getElementById('btn-signout-all')?.addEventListener('click', () => signOut({ all: true }));

/* ------------------------------------------------- mobile sidebar drawer */
const sidebar = document.getElementById('me-sidebar');
const backdrop = document.getElementById('me-backdrop');
document.getElementById('btn-menu')?.addEventListener('click', () => {
  sidebar?.classList.add('open');
  backdrop?.classList.add('show');
});
backdrop?.addEventListener('click', closeDrawer);
function closeDrawer() {
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('show');
}
// Sidebar nav click par drawer band (mobile)
document.getElementById('me-nav')?.addEventListener('click', () => closeDrawer());

boot();
