/**
 * =============================================================================
 * /me — MAIN ORCHESTRATOR (Google-style My Account)
 * =============================================================================
 */

import { requireAuth, signOut, escapeHtml, toast } from '../../js/common.js';
import { fetchAccounts, switchToAccount, initialsFor, addAccountHref, MAX_ACCOUNTS } from '../../js/accounts.js';
import { renderAvatar } from './avatar.js';
import { mountThemeToggles } from '../../js/theme.js';
import { initNav } from './nav.js';
import { renderUserEverywhere, loadHome } from './tabs/home.js';
import { initPersonalInfo } from './tabs/personal.js';
import { initSecurity } from './tabs/security.js';
import { initDataPrivacy } from './tabs/data.js';
import { initPeople, loadPeople } from './tabs/people.js';
import { loadConnectedApps } from './tabs/apps.js';
import { initSearch } from './search.js';

window.__GOTHWAD_ME_BOOTED = true;
mountThemeToggles();

let currentUser = null;

function showLoadFailure(message) {
  const box = document.getElementById('auth-loading');
  if (!box) return;
  box.innerHTML = `
    <p style="font-weight:500;color:var(--text);">${escapeHtml(message)}</p>
    <div style="display:flex;gap:10px;margin-top:8px;">
      <button type="button" class="btn btn-tonal" id="btn-retry-load">Reload</button>
      <a class="btn btn-primary" href="/signin?next=%2Fme">Sign in</a>
    </div>`;
  document.getElementById('btn-retry-load')?.addEventListener('click', () => location.reload());
}

async function boot() {
  try {
    currentUser = await requireAuth();
    if (!currentUser) return;

    document.getElementById('auth-loading')?.classList.add('hidden');
    document.getElementById('dash-root')?.classList.remove('hidden');

    renderUserEverywhere(currentUser);
    renderAccountMenu(currentUser);

    initNav();
    initPersonalInfo(currentUser, onUserUpdated);
    initSecurity(currentUser, onUserUpdated);
    initDataPrivacy(currentUser, refreshAll);
    initPeople();
    loadConnectedApps();
    initSearch();
    loadPeople(currentUser);
    loadHome(currentUser);
  } catch {
    showLoadFailure('Could not finish loading your Gothwad Account.');
  }
}

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
async function renderAccountMenu(user) {
  const avatarEl = document.getElementById('appbar-avatar');
  renderAvatar(avatarEl, user);
  document.getElementById('menu-name').textContent =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('menu-email').textContent = user.email || user.username;

  const { activeId, accounts } = await fetchAccounts();
  const listEl = document.getElementById('menu-accounts');
  if (listEl) {
    listEl.innerHTML = accounts
      .map((a) => `
      <button type="button" class="acct-menu-item" data-switch="${escapeHtml(a.id)}" role="menuitem">
        <span class="avatar sm">${escapeHtml(initialsFor(a))}</span>
        <span>
          <span class="acct-item-name">${escapeHtml(`${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username)}</span>
          <span class="acct-item-email mono">${escapeHtml(a.email || a.username)}</span>
        </span>
        ${a.id === activeId || a.username === user.username ? '<span class="acct-check"><span class="msym" style="font-size:18px;">check</span></span>' : ''}
      </button>`)
      .join('');

    listEl.querySelectorAll('[data-switch]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-switch');
        if (!slotId || slotId === activeId) {
          document.getElementById('acct-menu')?.classList.add('hidden');
          return;
        }
        btn.disabled = true;
        const sw = await switchToAccount(slotId);
        if (!sw.ok) {
          btn.disabled = false;
          toast(sw.error || 'Could not switch account', 'error');
          if (sw.status === 409) {
            location.href = addAccountHref('/me');
          }
          return;
        }
        location.reload();
      });
    });
  }

  const addLink = document.getElementById('link-add-account');
  if (addLink) {
    addLink.setAttribute('href', addAccountHref('/me'));
    addLink.onclick = (e) => {
      if (accounts.length >= MAX_ACCOUNTS) {
        e.preventDefault();
        toast(
          `Maximum ${MAX_ACCOUNTS} accounts can stay signed in on one browser. Sign out of one first.`,
          'error',
        );
      }
    };
  }

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
document.getElementById('me-nav')?.addEventListener('click', () => closeDrawer());

boot();
