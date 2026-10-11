/**
 * /me — DATA & PRIVACY section (storage, activity, export, delete account).
 */

import { api, getTokens, clearTokens } from '../../../js/api.js';
import { toast } from '../../../js/common.js';
import { renderActivity } from './activity.js';
import { setDialogUser, openDialog } from '../dialogs.js';
import { getActivity } from '../store.js';

let user = null;
let refreshAll = () => {};

export function initDataPrivacy(currentUser, cb) {
  user = currentUser;
  if (cb) refreshAll = cb;

  setDialogUser(user, (updated) => {
    user = updated;
    refreshAll();
  });

  // Export button
  document.getElementById('btn-export')?.addEventListener('click', exportData);

  // Delete account
  document.getElementById('btn-open-delete')?.addEventListener('click', () => openDialog('delete'));
}

/** Poora account data JSON download (Google-style "Export your data"). */
async function exportData() {
  const btn = document.getElementById('btn-export');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Preparing...';

  try {
    // Bearer token ke saath direct fetch (attachment response download hota hai)
    const { apiUrl } = await import('../../../js/config.js');
    const tokens = getTokens();
    const res = await fetch(apiUrl('/auth/export'), {
      credentials: 'include',
      headers: tokens.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : {},
    });
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

/** Activity feed (Data & privacy). */
export async function loadActivity() {
  const rows = await getActivity();
  renderActivity('dp-activity', rows);
}
