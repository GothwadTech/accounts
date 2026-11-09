/** Accessible settings combobox; Enter activates the selected exact destination. */
import { captureView } from './view-context.js';
import { findSettings } from './search-index.js';
import { escapeHtml } from '../../js/common.js';
import { showSection, focusSetting } from './nav.js';

export function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;
  const shortcut = document.getElementById('search-shortcut');
  if (shortcut) shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K';
  let matches = [], active = -1;
  const buttons = () => [...results.querySelectorAll('[role="option"]')];
  function close() {
    const status = document.getElementById('search-status'); if (status) status.textContent = '';
    results.classList.add('hidden'); input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant'); active = -1;
  }
  function select(index) {
    active = index;
    buttons().forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.classList.toggle('search-active', i === index);
    });
    const chosen = buttons()[index];
    if (chosen) { input.setAttribute('aria-activedescendant', chosen.id); chosen.scrollIntoView({ block: 'nearest' }); }
  }
  async function activate(item) {
    const valid = captureView();
    close(); input.value = '';
    showSection(item.section, { focus: true, target: item.target });
    if (item.dialog) {
      const row = document.querySelector(`#section-${item.section} [data-dialog="${item.dialog}"]`);
      if (row?.id) focusSetting(row.id);
      else if (row) { row.closest('details')?.setAttribute('open', ''); row.focus({ preventScroll: true }); }
      const dialogs = await import('./dialogs.js'); if (valid()) dialogs.openDialog(item.dialog);
    } else if (item.action === 'google') { const module = await import('./google-settings.js'); if (valid()) module.openGoogleSettings(); }
    else if (item.action === 'passkeys') { const module = await import('./passkey-settings.js'); if (valid()) module.openPasskeySettings(); }
    else if (item.action === 'mfa') { const module = await import('./mfa-settings.js'); if (valid()) module.openMfaSettings(); }
  }
  function render() {
    matches = findSettings(input.value); active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!input.value.trim()) return close();
    results.innerHTML = matches.length ? matches.map((item, i) =>
      `<button type="button" role="option" aria-selected="false" tabindex="-1" id="setting-result-${i}" class="me-search-item" data-search-index="${i}">
        <span class="msym">${item.icon}</span><span><span class="me-search-item-title">${escapeHtml(item.title)}</span>
        <span class="me-search-item-sub">${escapeHtml(item.sub)}</span></span></button>`).join('') :
      '<div class="me-search-empty" role="option" aria-disabled="true">No settings found. Try “password”, “2FA” or “devices”.</div>';
    const status = document.getElementById('search-status'); if (status) status.textContent = matches.length ? `${matches.length} settings found. Use arrow keys and Enter to choose.` : 'No settings found.';
    results.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (results.classList.contains('hidden')) render();
      if (matches.length) select(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && !results.classList.contains('hidden') && matches.length) {
      event.preventDefault(); void activate(matches[active < 0 ? 0 : active]);
    }
  });
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-search-index]');
    if (button) void activate(matches[Number(button.dataset.searchIndex)]);
  });
  document.addEventListener('click', event => { if (!event.target.closest('.me-search')) close(); });
  document.addEventListener('focusin', event => { if (!event.target.closest('.me-search')) close(); });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('[role="dialog"]:not(.hidden)')) {
      event.preventDefault(); input.focus(); input.select();
    }
  });
  close();
}
