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
  addAccountHref,
} from '../../js/accounts.js';
import { mePathForAuthuser, parsePageAuthuser, syncMeBrowserUrl } from '../../js/authuser.js';
import { GothwadAccountMenu } from '../../widget/account-menu.js';
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
  GothwadAccountMenu.close();
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
  const nextAvatar = targetAccount.avatarUrl || targetAccount.avatar_url || null;
  const optimisticUser = {
    ...currentUser,
    username: targetAccount.username,
    first_name: targetAccount.firstName || targetAccount.first_name || '',
    last_name: targetAccount.lastName || targetAccount.last_name || '',
    email: targetAccount.email,
    avatar_url: nextAvatar,
    avatarUrl: nextAvatar,
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
          avatarUrl: user.avatar_url || null,
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
  }
  cachedAccounts = accounts;

  if (GothwadAccountMenu.isOpen()) {
    GothwadAccountMenu.update({
      user,
      accounts: cachedAccounts,
      activeId: currentActiveSlot,
      authuser: currentAuthuser,
    });
  }
}

function openUniversalAccountSheet() {
  if (!currentUser) return;
  const menuBtnEl = document.getElementById('acct-switch-btn');
  if (GothwadAccountMenu.isOpen()) {
    GothwadAccountMenu.close();
    return;
  }
  GothwadAccountMenu.open(
    {
      user: currentUser,
      accounts: cachedAccounts,
      activeId: currentActiveSlot,
      authuser: currentAuthuser,
    },
    {
      anchorEl: menuBtnEl,
      nextUrl: globalThis.location?.href || mePathForAuthuser(currentAuthuser),
      accountHref: (acct) => mePathForAuthuser(acct.authuser, globalThis.location?.hash || ''),
      onSwitchAccount: (target) => switchAccountInPlace(target),
      onSignOutAccount: (slotId) => signOut({ slotId: slotId || currentActiveSlot }),
      onSignOutAll: () => signOut({ all: true }),
      onEditAvatar: () => {
        document.querySelector('[data-section="personal"]')?.click();
        document.getElementById('btn-change-avatar')?.click();
      },
      onManageAccount: () => {
        document.querySelector('[data-section="home"]')?.click();
      },
      onError: (msg) => toast(msg, 'error'),
    },
  );
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

/* Universal Google-grade Account Sheet trigger */
const menuBtn = document.getElementById('acct-switch-btn');
if (menuBtn) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openUniversalAccountSheet();
  });
}

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
