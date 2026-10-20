import { toast } from '../../../js/common.js';
import {
  fetchAccounts,
  switchToAccount,
  signOutAccount,
  initialsFor,
  MAX_ACCOUNTS,
  safeNextUrl,
  addAccountHref,
} from '../../../js/accounts.js';

function destAfterPick() {
  const next = new URLSearchParams(location.search).get('next');
  return safeNextUrl(next, '/me');
}

export async function initAccountChooser(preloadedState = null) {
  const chooser = document.getElementById('mode-chooser');
  const signin = document.getElementById('mode-signin');
  const tabs = document.getElementById('auth-switcher-tabs');
  const listEl = document.getElementById('chooser-list');
  const sub = document.getElementById('auth-header-sub');
  if (!chooser || !listEl) return false;

  const params = new URLSearchParams(location.search);
  const forceForm = params.get('add') === '1' || params.get('form') === '1';
  if (forceForm) return false;

  let state = preloadedState || (await fetchAccounts());
  if (!state.accounts || state.accounts.length === 0) return false;

  chooser.classList.remove('hidden');
  if (signin) signin.classList.add('hidden');
  if (tabs) tabs.classList.add('hidden');
  if (sub) {
    sub.textContent = params.get('next')
      ? 'Choose a Gothwad Account to continue'
      : 'Choose an account';
  }

  function renderRows() {
    const { activeId, accounts } = state;

    listEl.innerHTML = accounts
      .map((a) => {
        const name = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username;
        const activeBadge = a.id === activeId ? ' · Signed in' : '';
        return `
      <div class="chooser-row" style="cursor:default;gap:10px;">
        <button type="button" class="chooser-pick" data-id="${escapeAttr(a.id)}"
          style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;background:none;border:0;padding:0;color:inherit;text-align:left;cursor:pointer;font:inherit;">
          <span class="avatar sm">${escapeAttr(initialsFor(a))}</span>
          <span class="chooser-meta">
            <span class="chooser-name">${escapeAttr(name)}<span style="opacity:.65;font-weight:400;font-size:12px;">${escapeAttr(activeBadge)}</span></span>
            <span class="chooser-email mono">${escapeAttr(a.email || a.username)}</span>
          </span>
        </button>
        <button type="button" class="chooser-signout" data-signout-id="${escapeAttr(a.id)}"
          aria-label="Sign out ${escapeAttr(a.email || a.username)}" title="Sign out of this account"
          style="background:transparent;border:1px solid var(--border);border-radius:999px;padding:5px 10px;font-size:12px;color:var(--text-secondary, inherit);cursor:pointer;flex-shrink:0;">
          Sign out
        </button>
      </div>`;
      })
      .join('');

    listEl.querySelectorAll('.chooser-pick').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-id');
        if (!slotId) return;
        btn.disabled = true;
        const sw = await switchToAccount(slotId);
        if (!sw.ok) {
          toast(sw.error || 'Could not open this account. Try signing in again.', 'error');
          if (sw.status === 409) {
            location.href = addAccountHref(params.get('next') || '');
            return;
          }
          btn.disabled = false;
          return;
        }
        location.href = destAfterPick();
      });
    });

    listEl.querySelectorAll('.chooser-signout').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slotId = btn.getAttribute('data-signout-id');
        if (!slotId) return;
        btn.disabled = true;
        const out = await signOutAccount(slotId);
        if (!out.ok) {
          btn.disabled = false;
          toast(out.error || 'Could not sign out of that account.', 'error');
          return;
        }
        state = { activeId: out.activeId, accounts: out.accounts };
        if (state.accounts.length === 0) {
          showSigninForm();
          return;
        }
        renderRows();
      });
    });

    const addBtn = document.getElementById('chooser-add');
    if (addBtn) {
      addBtn.classList.toggle('is-disabled', state.accounts.length >= MAX_ACCOUNTS);
    }
  }

  renderRows();

  const goAddAnother = () => {
    if (state.accounts.length >= MAX_ACCOUNTS) {
      toast(
        `Maximum ${MAX_ACCOUNTS} accounts can stay signed in on one browser. Sign out of one first.`,
        'error',
      );
      return;
    }
    location.href = addAccountHref(params.get('next') || '');
  };

  const addBtn = document.getElementById('chooser-add');
  if (addBtn) addBtn.onclick = goAddAnother;

  // "Use another account" -> routes to `/signin?choose=1&add=1` (preserving `&next=`)
  const useOther = document.getElementById('chooser-other');
  if (useOther) useOther.onclick = goAddAnother;

  return true;
}

function showSigninForm() {
  document.getElementById('mode-chooser')?.classList.add('hidden');
  document.getElementById('mode-signin')?.classList.remove('hidden');
  document.getElementById('auth-switcher-tabs')?.classList.remove('hidden');
}

function escapeAttr(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
