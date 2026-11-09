/** Account export, retained history and honest scope; never claim sibling-service deletion/export. */
import { renderDataFailure } from '../data-failure.js';
import { buildAuthHeaders, refreshOnce } from '../../../js/api.js';
import { apiUrl } from '../../../js/config.js';
import { toast } from '../../../js/common.js';
import { renderActivity } from './activity.js';
import { setDialogUser, openDialog } from '../dialogs.js';
import { getActivity } from '../store.js';
import { captureView, beginView, onViewInvalidated } from '../view-context.js';
let user = null, refreshAll = () => {}, bound = false, exporting = false;
onViewInvalidated(() => { exporting = false; });
export function syncDataUser(nextUser) {
  user = nextUser;
  setDialogUser(user, updated => { user = updated; refreshAll(); }, 'data');
  const btn = document.getElementById('btn-export'); if (btn && !exporting) { btn.disabled = false; btn.textContent = 'Download Accounts JSON'; }
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
  if (exporting) return;
  const valid = captureView(), btn = document.getElementById('btn-export');
  exporting = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Preparing download…';
  try {
    const options = { credentials: 'include', headers: buildAuthHeaders() };
    let response = await fetch(apiUrl('/auth/export'), options);
    if (!valid()) return;
    if (response.status === 401 && await refreshOnce()) { if (!valid()) return; response = await fetch(apiUrl('/auth/export'), options); }
    if (!valid()) return;
    if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || 'Export could not be prepared. Try again.'); }
    const blob = await response.blob(); if (!valid()) return;
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'gothwad-account-data.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Accounts JSON download prepared. Check your browser downloads; keep the file private.');
  } catch (error) { if (valid()) toast(error.message || 'Export failed. Use Download to retry.', 'error'); }
  finally { if (valid()) { exporting = false; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'Download Accounts JSON'; } }
}
export async function loadActivity() {
  const current = beginView('data-activity');
  try { const rows = await getActivity(); if (current()) renderActivity('dp-activity', rows); }
  catch { if (current()) renderDataFailure('dp-activity', loadActivity); }
}
