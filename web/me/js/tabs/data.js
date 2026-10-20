/**
 * /me — DATA & PRIVACY section (storage, activity, export, delete account).
 */

import { buildAuthHeaders, refreshOnce } from '../../../js/api.js';
import { apiUrl } from '../../../js/config.js';
import { toast } from '../../../js/common.js';
import { renderActivity } from './activity.js';
import { setDialogUser, openDialog } from '../dialogs.js';
import { getActivity } from '../store.js';

let user = null;
let refreshAll = () => {};
let bound = false;

export function syncDataUser(nextUser) {
  user = nextUser;
  setDialogUser(user, (updated) => {
    user = updated;
    refreshAll();
  });
  loadActivity();
}

export function initDataPrivacy(currentUser, cb) {
  if (cb) refreshAll = cb;

  if (!bound) {
    bound = true;
    document.getElementById('btn-export')?.addEventListener('click', exportData);
    document.getElementById('btn-open-delete')?.addEventListener('click', () => openDialog('delete'));
  }

  syncDataUser(currentUser);
}

async function exportData() {
  const btn = document.getElementById('btn-export');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Preparing...';

  try {
    const reqInit = { credentials: 'include', headers: buildAuthHeaders() };
    let res = await fetch(apiUrl('/auth/export'), reqInit);
    if (res.status === 401 && (await refreshOnce())) {
      res = await fetch(apiUrl('/auth/export'), reqInit);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gothwad-account-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Your data has been downloaded');
  } catch (err) {
    toast(err.message || 'Could not export data.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

export async function loadActivity() {
  const rows = await getActivity();
  renderActivity('dp-activity', rows);
}
