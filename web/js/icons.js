/** Local inline SVGs for existing icon slots, including dynamically rendered dialogs and open shadow roots. */
import { ICON_PATHS } from './icon-paths.js';
const watched = new WeakSet();
function paint(node) {
  if (!node?.matches?.('.msym') || node.querySelector('svg')) return;
  const key = node.textContent.trim();
  if (!key) return;
  node.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[key] || ICON_PATHS.fallback}</svg>`;
  node.setAttribute('aria-hidden', 'true');
  node.style.fontFamily = 'inherit';
  node.style.display = 'inline-flex';
  node.style.alignItems = 'center';
  node.style.justifyContent = 'center';
}
function scan(root) {
  if (root.nodeType === 3) paint(root.parentElement);
  paint(root);
  root.querySelectorAll?.('.msym').forEach(paint);
  if (root.shadowRoot) mountIcons(root.shadowRoot);
  root.querySelectorAll?.('*').forEach(node => { if (node.shadowRoot) mountIcons(node.shadowRoot); });
}
export function mountIcons(root = document) {
  if (watched.has(root)) return;
  watched.add(root);
  scan(root);
  if (typeof MutationObserver === 'undefined') return;
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)))
    .observe(root, { childList: true, subtree: true });
}
if (typeof document !== 'undefined') mountIcons();
