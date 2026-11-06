/** One pending mutation, associated errors, unchanged Save and account-bound completion. */
import { captureView } from './view-context.js';
import { dialogError, closeDialog } from './modal-shell.js';
import { getDialogUser, notifyUpdated } from './dialogs.js';
import { setBusy, toast } from '../../js/common.js';
import { resetMeStore } from './store.js';
export function changedAccountData() {
  resetMeStore();
  window.dispatchEvent?.(new Event('account-data-changed'));
}
export function bindDialogForm({ buttonId = 'dlg-save', read, validate = () => null, submit, success = 'Changes saved', unchanged = true, onSuccess }) {
  const root = document.getElementById('dialog-root'), button = document.getElementById(buttonId);
  const generation = root.dataset.dialogGeneration, owner = getDialogUser()?.id, valid = captureView();
  const current = () => valid() && getDialogUser()?.id === owner && root.dataset.dialogGeneration === generation;
  const initial = JSON.stringify(read());
  let busy = false;
  const update = () => { if (!busy && current()) button.disabled = unchanged && JSON.stringify(read()) === initial; };
  root.addEventListener('input', update); root.addEventListener('change', update); update();
  button.addEventListener('click', async () => {
    if (busy || !current() || root.getAttribute('aria-busy') === 'true') return;
    const body = read(), problem = validate(body);
    if (problem) return dialogError(problem.message || problem, problem.fields || []);
    if (unchanged && JSON.stringify(body) === initial) return;
    busy = true; dialogError(''); root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll('button,input,select,textarea')].map(node => [node, node.disabled]);
    controls.forEach(([node]) => { node.disabled = true; }); setBusy(button, true, 'Saving...');
    try {
      const result = await submit(body);
      if (!current()) return;
      if (!result.ok) return dialogError(result.error || 'Could not save. Please try again.');
      if (result.data?.user) notifyUpdated(result.data.user);
      if (onSuccess) { await onSuccess(result); return; }
      changedAccountData(); closeDialog(); toast(typeof success === 'function' ? success(body) : success);
    } catch { if (current()) dialogError('Could not reach Accounts. Your changes have not been confirmed. Try again.'); }
    finally {
      if (current()) {
        busy = false; root.removeAttribute('aria-busy'); setBusy(button, false);
        controls.forEach(([node, disabled]) => { node.disabled = disabled; }); update();
      }
    }
  });
  return current;
}
