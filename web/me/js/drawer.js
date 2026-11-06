/** Keyboard and focus behavior for the existing responsive navigation drawer. */
export function initDrawer() {
  const sidebar = document.getElementById('me-sidebar');
  const menu = document.getElementById('btn-menu');
  const backdrop = document.getElementById('me-backdrop');
  if (!sidebar || !menu || !backdrop) return;
  const mobile = window.matchMedia('(max-width: 960px)');
  let open = false, previousFocus = null, previousOverflow = '';
  const focusable = () => [...sidebar.querySelectorAll('button, a[href], [tabindex="0"]')]
    .filter(node => !node.disabled && node.getClientRects().length);
  function close(restoreFocus = true) {
    if (open) document.body.style.overflow = previousOverflow;
    open = false;
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.inert = mobile.matches;
    menu.setAttribute('aria-expanded', 'false');
    if (restoreFocus) (previousFocus?.isConnected ? previousFocus : menu).focus();
  }
  menu.addEventListener('click', () => {
    if (open) return close();
    if (!mobile.matches) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    open = true;
    sidebar.inert = false;
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Account navigation');
    menu.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    (sidebar.querySelector('[aria-current="page"]') || focusable()[0])?.focus();
  });
  backdrop.addEventListener('click', () => close());
  document.getElementById('btn-close-nav')?.addEventListener('click', () => close());
  document.getElementById('me-nav')?.addEventListener('click', event => {
    if (event.target.closest('[data-section]')) close(false);
  });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    const buttons = focusable();
    if (event.key === 'Tab') {
      const first = buttons[0], last = buttons.at(-1);
      if (!sidebar.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && document.activeElement?.matches('.me-nav-item')) {
      const nav = buttons.filter(node => node.matches('.me-nav-item'));
      const index = nav.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? nav.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + nav.length) % nav.length;
      event.preventDefault(); nav[next]?.focus();
    }
  });
  mobile.addEventListener?.('change', () => close(false));
  close(false);
}
