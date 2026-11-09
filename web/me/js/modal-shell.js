/** Shared modal lifecycle: focus, background inertness, discard/pending guards and keyboard viewport. */
import { escapeHtml } from '../../js/common.js';
import { gothwadEmail } from '../../js/config.js';
import { onViewInvalidated, captureView } from './view-context.js';
let generation = 0, trigger = null, cleanup = null, snapshot = '', dirty = false;
let getOwner = () => null;
export function configureModalOwner(getter) { getOwner = getter; }
const rootNode = () => document.getElementById('dialog-root');
const values = root => JSON.stringify([...root.querySelectorAll('input,select,textarea')].filter(input => !input.readOnly && input.type !== 'hidden').map(input => [input.id, input.type === 'checkbox' ? input.checked : input.value]));
export function markDialogDirty(value = true) { dirty = value; }
export function dialogPending() { const root = rootNode(); return root?.getAttribute('aria-busy') === 'true' || !!root?.querySelector('[aria-busy="true"], [data-busy="true"]'); }
export function closeDialog() {
  const root = rootNode();
  cleanup?.(); cleanup = null;
  if (root) { root.innerHTML = ''; delete root.dataset.dialogGeneration; }
  const previous = trigger; trigger = null; dirty = false;
  if (previous?.isConnected && !previous.closest?.('[inert],.hidden')) previous.focus?.({ preventScroll: true });
}
onViewInvalidated(closeDialog);
export function dialogError(message, fields = []) {
  const root = rootNode(), box = document.getElementById('modal-error');
  if (!box) return;
  box.textContent = message; box.hidden = !message;
  root.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
  for (const id of fields) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [...new Set((input.getAttribute('aria-describedby') || '').split(' ').concat('modal-error'))].filter(Boolean).join(' '));
  }
  if (message) (document.getElementById(fields[0]) || box).focus?.({ preventScroll: true });
}
export function modal({ title, sub, body, actions, danger = false }) {
  const root = rootNode();
  const originalTrigger = trigger || document.activeElement;
  cleanup?.();
  trigger = originalTrigger; dirty = false;
  const valid = captureView();
  root.removeAttribute('aria-busy');
  root.dataset.dialogGeneration = String(++generation);
  const version = root.dataset.dialogGeneration;
  const user = getOwner();
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" tabindex="-1">
    <div class="modal-title" id="modal-title" ${danger ? 'style="color:var(--danger)"' : ''}>${escapeHtml(title)}</div>
    <p class="modal-account">For <strong>${escapeHtml(user ? gothwadEmail(user.username) : 'the selected account')}</strong></p>
    <div class="modal-sub" id="modal-description">${escapeHtml(sub || 'Manage settings for the selected account.')}</div>
    <div id="modal-body">${body}</div><p id="modal-error" class="dialog-error" role="alert" tabindex="-1" hidden></p>
    <div class="modal-actions"><button type="button" class="btn btn-text" data-close-modal>Cancel</button>${actions || ''}</div>
    <div id="discard-changes" class="discard-changes" hidden role="alert"><p>Discard unsaved changes?</p><button type="button" class="btn btn-tonal" id="keep-editing">Keep editing</button><button type="button" class="btn btn-danger-text" id="discard-editing">Discard changes</button></div>
    </div></div>`;
  const dialog = root.querySelector('[role="dialog"]');
  const background = [...(document.body.children || [])].filter(node => node !== root && !['SCRIPT', 'STYLE'].includes(node.tagName)).map(node => [node, node.inert]);
  background.forEach(([node]) => { node.inert = true; });
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const focusable = () => [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node => !node.disabled && node.type !== 'hidden' && node.tabIndex >= 0 && node.getClientRects().length);
  function requestClose() {
    if (dialogPending()) { dialogError('Please wait for the current request to finish.'); return; }
    if (dirty || values(root) !== snapshot) {
      document.getElementById('discard-changes').hidden = false;
      document.getElementById('keep-editing').focus(); return;
    }
    closeDialog();
  }
  root.querySelector('#modal-body').addEventListener('click', event => {
    const button = event.target.closest('[data-eye]'); if (!button) return;
    const input = document.getElementById(button.dataset.eye); if (!input) return;
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); button.setAttribute('aria-pressed', String(show));
    const icon = button.querySelector('.msym'); if (icon) icon.textContent = show ? 'visibility_off' : 'visibility';
  });
  root.querySelector('[data-close-modal]').addEventListener('click', requestClose);
  root.querySelector('#modal-backdrop').addEventListener('mousedown', event => { if (event.target.id === 'modal-backdrop') requestClose(); });
  document.getElementById('keep-editing').addEventListener('click', () => { document.getElementById('discard-changes').hidden = true; (focusable()[0] || dialog).focus(); });
  document.getElementById('discard-editing').addEventListener('click', () => { if (!dialogPending()) closeDialog(); });
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); }
    if (event.key === 'Tab') {
      const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
      if (!nodes.length || !root.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
    if (event.key === 'Enter' && !event.defaultPrevented && !event.isComposing && event.target.tagName === 'INPUT' && !['file', 'range', 'checkbox'].includes(event.target.type) && !event.target.closest('form')) {
      event.preventDefault();
      if (!event.repeat && !dialogPending()) root.querySelector('.modal-actions .btn-primary:not(:disabled)')?.click();
    }
  }
  function focusin(event) { if (!root.contains(event.target)) (focusable()[0] || dialog).focus(); }
  const viewport = () => { if (window.visualViewport) { root.style.setProperty('--modal-viewport', `${window.visualViewport.height}px`); root.style.setProperty('--modal-offset', `${window.visualViewport.offsetTop || 0}px`); } };
  viewport(); window.visualViewport?.addEventListener('resize', viewport); window.visualViewport?.addEventListener('scroll', viewport);
  document.addEventListener('keydown', keydown); document.addEventListener('focusin', focusin);
  cleanup = () => {
    background.forEach(([node, inert]) => { node.inert = inert; }); document.body.style.overflow = previousOverflow;
    document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focusin);
    window.visualViewport?.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('scroll', viewport);
    root.style.removeProperty('--modal-viewport'); root.style.removeProperty('--modal-offset');
  };
  queueMicrotask(() => {
    if (!valid() || root.dataset.dialogGeneration !== version) return;
    snapshot = values(root);
    (focusable().find(node => ['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) || focusable()[0] || dialog).focus();
  });
  return root;
}

/** An in-dialog confirmation keeps warnings and keyboard focus in the same account context. */
export function stageConfirmation(message, confirmAction) {
  const root = rootNode(), body = document.getElementById('modal-body');
  document.getElementById('action-confirmation')?.remove();
  const panel = document.createElement('div'); panel.id = 'action-confirmation'; panel.className = 'discard-changes'; panel.setAttribute('role', 'alert');
  panel.innerHTML = `<p>${escapeHtml(message)}</p><button type="button" class="btn btn-danger-text" id="confirm-method-removal">Confirm removal</button><button type="button" class="btn btn-tonal" id="cancel-method-removal">Keep method</button>`;
  body.appendChild(panel);
  panel.querySelector('#cancel-method-removal').addEventListener('click', () => { panel.remove(); root.querySelector('[data-close-modal]')?.focus(); });
  panel.querySelector('#confirm-method-removal').addEventListener('click', confirmAction);
  panel.querySelector('#cancel-method-removal').focus();
}
