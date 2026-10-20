/**
 * =============================================================================
 * `/u/<0..5>/me` — GOOGLE-GRADE MULTI-ACCOUNT ORCHESTRATOR
 * =============================================================================
 * - Single-call boot via `GET /api/auth/me` (returns `{ user, activeId, authuser, accounts }`)
 * - Canonical Google session URLs (`/u/0/me`, `/u/1/me`, `#personal`, `#security`, ...)
 * - `< 16ms` optimistic zero-reload account switching (`history.pushState` + live sync)
 * - Middle-click / Ctrl-click opens `/u/<n>/me` in an independent tab
 * - Browser Back / Forward (`popstate`) switches accounts seamlessly
 * =============================================================================
 */

import { requireAuth, getSession, signOut, escapeHtml, toast } from '../../js/common.js';
import {
  fetchAccounts,
  switchToAccount,
  initialsFor,
  addAccountHref,
  MAX_ACCOUNTS,
} from '../../js/accounts.js';
import { mePathForAuthuser, parsePageAuthuser, syncMeBrowserUrl } from '../../js/authuser.js';
import { renderAvatar } from './avatar.js';
import { mountThemeToggles } from '../../js/theme.js';
import { initNav } from './nav.js';
import { resetMeStore } from './store.js';
import { renderUserEverywhere, loadHome } from './tabs/home.js';
import { initPersonalInfo, syncPersonalUser } from './tabs/personal.js';
import { initSecurity, syncSecurityUser } from './tabs/security.js';
import { initDataPrivacy, syncDataUser } from './tabs/data.js';
import { initPeople, loadPeople } from './tabs/people.js';
import { loadConnectedApps } from './tabs/apps.js';
import { initSearch } from './search.js';

window.__GOTHWAD_ME_BOOTED = true;
mountThemeToggles();

let currentUser = null;
let currentAuthuser = 0;
let currentActiveSlot = null;
let cachedAccounts = [];

function showLoadFailure(message) {
  const box = document.getElementById('auth-loading');
  if (!box) return;
  box.innerHTML = `
    <p style="font-weight:500;color:var(--text);">${escapeHtml(message)}</p>
    <div style="display:flex;gap:10px;margin-top:8px;">
      <button type="button" class="btn btn-tonal" id="btn-retry-load">Reload</button>
      <a class="btn btn-primary" href="/signin?next=%2Fu%2F0%2Fme">Sign in</a>
    </div>`;
  document.getElementById('btn-retry-load')?.addEventListener('click', () => location.reload());
}

async function boot() {
  try {
    const session = await requireAuth();
    if (!session || !session.user) return;

    currentUser = session.user;
    currentAuthuser = Number.isInteger(session.authuser) ? session.authuser : 0;
    currentActiveSlot = session.activeId || null;
    cachedAccounts = session.accounts || [];

    syncMeBrowserUrl(currentAuthuser, { push: false });

    document.getElementById('auth-loading')?.classList.add('hidden');
    document.getElementById('dash-root')?.classList.remove('hidden');

    renderUserEverywhere(currentUser);
    renderAccountMenu(currentUser, cachedAccounts);

    initNav();
    initPersonalInfo(currentUser, onUserUpdated);
    initSecurity(currentUser, onUserUpdated);
    initDataPrivacy(currentUser, refreshAll);
    initPeople();
    loadConnectedApps(currentAuthuser);
    initSearch();
    loadPeople(currentUser);
    loadHome(currentUser);
  } catch {
    showLoadFailure('Could not finish loading your Gothwad Account.');
  }
}

function applyHydratedAccount(user, authuser, activeId, accounts) {
  currentUser = user;
  currentAuthuser = authuser;
  currentActiveSlot = activeId;
  if (Array.isArray(accounts)) cachedAccounts = accounts;

  resetMeStore();
  renderUserEverywhere(currentUser);
  renderAccountMenu(currentUser, cachedAccounts);
  syncPersonalUser(currentUser);
  syncSecurityUser(currentUser);
  syncDataUser(currentUser);
  loadConnectedApps(currentAuthuser);
  loadPeople(currentUser);
  loadHome(currentUser);
}

async function switchAccountInPlace(targetAccount, { updateHistory = true } = {}) {
  document.getElementById('acct-menu')?.classList.add('hidden');
  if (!targetAccount) return;

  const targetIndex = Number.isInteger(targetAccount.authuser) ? targetAccount.authuser : 0;
  if (targetAccount.id === currentActiveSlot && targetAccount.username === currentUser?.username) {
    syncMeBrowserUrl(targetIndex, { push: false });
    return;
  }

  // 1. `< 16ms` optimistic URL + header/profile paint (zero white reload flash!)
  if (updateHistory) {
    syncMeBrowserUrl(targetIndex, { push: true });
  }
  const optimisticUser = {
    ...currentUser,
    username: targetAccount.username,
    first_name: targetAccount.firstName || targetAccount.first_name || '',
    last_name: targetAccount.lastName || targetAccount.last_name || '',
    email: targetAccount.email,
    avatar_url: targetAccount.avatar_url || null,
  };
  currentActiveSlot = targetAccount.id;
  currentAuthuser = targetIndex;
  renderUserEverywhere(optimisticUser);
  renderAccountMenu(optimisticUser, cachedAccounts);

  // 2. Sync `.gothwadtech.com` active cookie + hydrate full D1 profile in 1 round-trip
  const sw = await switchToAccount({ id: targetAccount.id, authuser: targetIndex });
  if (!sw.ok) {
    toast(sw.error || 'Could not switch account', 'error');
    if (sw.status === 409) {
      location.href = addAccountHref(mePathForAuthuser(0));
    }
    return;
  }

  const hydratedUser = sw.user || optimisticUser;
  const resolvedIndex = Number.isInteger(sw.authuser) ? sw.authuser : targetIndex;
  syncMeBrowserUrl(resolvedIndex, { push: false });
  applyHydratedAccount(
    hydratedUser,
    resolvedIndex,
    sw.activeId || targetAccount.id,
    sw.accounts || cachedAccounts,
  );
}

function onUserUpdated(user) {
  currentUser = user;
  cachedAccounts = cachedAccounts.map((a) =>
    a.username === user.username
      ? {
          ...a,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          avatar_url: user.avatar_url || null,
        }
      : a,
  );
  renderUserEverywhere(user);
  renderAccountMenu(user, cachedAccounts);
}

function refreshAll() {
  if (currentUser) {
    renderUserEverywhere(currentUser);
    loadHome(currentUser);
    loadPeople(currentUser);
  }
}

async function renderAccountMenu(user, preloaded = null) {
  const avatarEl = document.getElementById('appbar-avatar');
  renderAvatar(avatarEl, user);
  const nameEl = document.getElementById('menu-name');
  const emailEl = document.getElementById('menu-email');
  if (nameEl) nameEl.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  if (emailEl) emailEl.textContent = user.email || user.username;

  let accounts = Array.isArray(preloaded) && preloaded.length > 0 ? preloaded : null;
  if (!accounts) {
    const fetched = await fetchAccounts();
    currentActiveSlot = currentActiveSlot || fetched.activeId;
    accounts = fetched.accounts;
    cachedAccounts = accounts;
  }

  const listEl = document.getElementById('menu-accounts');
  if (listEl) {
    listEl.innerHTML = accounts
      .map((a, idx) => {
        const idxNum = Number.isInteger(a.authuser) ? a.authuser : idx;
        const href = mePathForAuthuser(idxNum, globalThis.location?.hash || '');
        const isCurrent = a.username === user.username;
        return `
      <a href="${escapeHtml(href)}" class="acct-menu-item" data-switch="${escapeHtml(a.id)}" data-authuser="${idxNum}" role="menuitem">
        <span class="avatar sm">${escapeHtml(initialsFor(a))}</span>
        <span>
          <span class="acct-item-name">${escapeHtml(`${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username)}</span>
          <span class="acct-item-email mono">${escapeHtml(a.email || a.username)}</span>
        </span>
        ${isCurrent ? '<span class="acct-check"><span class="msym" style="font-size:18px;">check</span></span>' : ''}
      </a>`;
      })
      .join('');

    listEl.querySelectorAll('[data-switch]').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        // Preserve native Ctrl+Click / Cmd+Click / Middle-Click to open `/u/<n>/me` in a new tab!
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const slotId = itemEl.getAttribute('data-switch');
        const target = accounts.find((x) => x.id === slotId);
        switchAccountInPlace(target);
      });
    });
  }

  const addLink = document.getElementById('link-add-account');
  if (addLink) {
    addLink.setAttribute('href', addAccountHref(mePathForAuthuser(currentAuthuser)));
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

/* Browser Back / Forward between `/u/0/me` <-> `/u/1/me` */
globalThis.addEventListener?.('popstate', async () => {
  const rawIdx = parsePageAuthuser();
  if (rawIdx === null) return;
  const parsed = Number.parseInt(rawIdx, 10);
  if (!Number.isNaN(parsed) && parsed !== currentAuthuser) {
    const match = cachedAccounts.find((a) => a.authuser === parsed);
    if (match) {
      await switchAccountInPlace(match, { updateHistory: false });
      return;
    }
    const session = await getSession();
    if (session.authenticated && session.user) {
      applyHydratedAccount(session.user, session.authuser, session.activeId, session.accounts);
    }
  }
});

/* Menu open/close + signout bindings */
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
document.getElementById('btn-signout-one')?.addEventListener('click', () => signOut({ slotId: currentActiveSlot }));
document.getElementById('btn-signout-all')?.addEventListener('click', () => signOut({ all: true }));

/* Mobile sidebar drawer */
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
