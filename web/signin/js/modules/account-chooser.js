import { toast } from '../../../js/common.js';
import {
  listAccounts,
  switchToAccount,
  initialsFor,
  canAddAccount,
  MAX_ACCOUNTS,
  safeNextUrl,
} from '../../../js/accounts.js';

function destAfterPick() {
  const next = new URLSearchParams(location.search).get('next');
  return safeNextUrl(next, '/me');
}

export function initAccountChooser() {
  const chooser = document.getElementById('mode-chooser');
  const signin = document.getElementById('mode-signin');
  const tabs = document.getElementById('auth-switcher-tabs');
  const listEl = document.getElementById('chooser-list');
  const sub = document.getElementById('auth-header-sub');
  if (!chooser || !listEl) return false;

  const accounts = listAccounts();
  const params = new URLSearchParams(location.search);
  const forceForm = params.get('add') === '1' || params.get('form') === '1';
  if (forceForm || accounts.length === 0) return false;

  chooser.classList.remove('hidden');
  if (signin) signin.classList.add('hidden');
  if (tabs) tabs.classList.add('hidden');
  if (sub) {
    sub.textContent = params.get('next')
      ? 'Choose a Gothwad Account to continue'
      : 'Choose an account';
  }

  listEl.innerHTML = accounts.map((a) => {
    const name = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.username;
    return `
      <button type="button" class="chooser-row" data-id="${escapeAttr(a.id)}">
        <span class="avatar sm">${escapeAttr(initialsFor(a))}</span>
        <span class="chooser-meta">
          <span class="chooser-name">${escapeAttr(name)}</span>
          <span class="chooser-email mono">${escapeAttr(a.email || a.username)}</span>
        </span>
      </button>`;
  }).join('');

  listEl.querySelectorAll('.chooser-row').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const acc = accounts.find((a) => a.id === btn.getAttribute('data-id'));
      if (!acc) return;
      btn.disabled = true;
      const sw = await switchToAccount(acc);
      if (!sw.ok) {
        toast(sw.error || 'Could not open this account. Try signing in again.', 'error');
        btn.remove();
        if (!listAccounts().length) showSigninForm();
        return;
      }
      location.href = destAfterPick();
    });
  });

  const addBtn = document.getElementById('chooser-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const gate = canAddAccount();
      if (!gate.ok) {
        toast(gate.error, 'error');
        return;
      }
      const q = new URLSearchParams(location.search);
      q.set('add', '1');
      q.delete('choose');
      location.href = `/signin?${q.toString()}`;
    });
    if (accounts.length >= MAX_ACCOUNTS) {
      addBtn.classList.add('is-disabled');
    }
  }

  const useOther = document.getElementById('chooser-other');
  if (useOther) {
    useOther.addEventListener('click', () => {
      const q = new URLSearchParams(location.search);
      q.set('form', '1');
      q.delete('choose');
      location.href = `/signin?${q.toString()}`;
    });
  }

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
