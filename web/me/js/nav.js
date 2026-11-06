import { loadSectionData } from './section-data.js';

/** Section navigation preserves the account URL, history entry and reading position. */
const SECTIONS = ['home', 'personal', 'security', 'data', 'people', 'apps'];
const LABELS = ['Home', 'Personal info', 'Security', 'Data & privacy', 'People & sharing', 'Connected apps'];
let activeKey = '';
let scrollFrame = false;
let pendingRestore = null;
function cancelRestore() { pendingRestore?.(); pendingRestore = null; }

// A refreshed section may still be shorter while activity/devices are loading.
function restorePosition(top, name) {
  cancelRestore();
  window.scrollTo?.({ top, behavior: 'instant' });
  if (top <= 0 || Math.abs((window.scrollY || 0) - top) < 2 || typeof ResizeObserver === 'undefined') return;
  const section = document.getElementById('section-' + name);
  if (!section) return;
  const observer = new ResizeObserver(() => {
    window.scrollTo?.({ top, behavior: 'instant' });
    if (Math.abs(window.scrollY - top) < 2) { cancelRestore(); saveScroll(); }
  });
  const timeout = setTimeout(() => { cancelRestore(); saveScroll(); }, 8000);
  pendingRestore = () => { observer.disconnect(); clearTimeout(timeout); };
  observer.observe(section);
}

const pageKey = name => location.pathname + location.search + '#' + name;
function saveScroll() {
  if (pendingRestore || !activeKey || activeKey !== location.pathname + location.search + location.hash) return;
  history.replaceState({ ...history.state, sectionKey: activeKey, sectionScroll: window.scrollY || 0 }, '');
}

export function initNav() {
  document.querySelectorAll('.me-nav-item').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section, { focus: true }));
  });
  document.querySelectorAll('[data-goto-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.gotoSection, { focus: true, target: btn.dataset.focusTarget }));
  });
  // Browsers emit both events for a history traversal across hashes. Render only once.
  const restore = () => showSection(location.hash.slice(1), { historyMode: 'none', restoreScroll: true });
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = true;
    (window.requestAnimationFrame || (fn => setTimeout(fn, 0)))(() => { scrollFrame = false; saveScroll(); });
  }, { passive: true });
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(event, cancelRestore, { passive: true });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  showSection(location.hash.slice(1), { historyMode: 'replace', restoreScroll: true });
}

/** Focus an exact setting without changing the account path or query. */
export function focusSetting(id) {
  const target = document.getElementById(id);
  if (!target) return;
  // A search result may point inside the optional profile disclosure.
  let parent = target.parentElement;
  while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
  if (!target.matches?.('button, a, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
  target.focus?.({ preventScroll: true });
  target.scrollIntoView?.({ block: 'center', behavior: 'instant' });
}

export function showSection(name, { historyMode = 'push', restoreScroll = false, focus = false, target } = {}) {
  if (!SECTIONS.includes(name)) name = 'home';
  const key = pageKey(name);
  const changed = activeKey !== key;
  const url = new URL(location.href);
  if (historyMode !== 'none') saveScroll();
  if (url.hash !== '#' + name) {
    url.hash = name;
    // Invalid hashes are normalized in place; real navigation gets a new entry.
    const method = historyMode === 'push' ? 'pushState' : 'replaceState';
    history[method]({ ...history.state, sectionKey: key, sectionScroll: 0 }, '', url.pathname + url.search + url.hash);
  }
  if (changed) cancelRestore();
  activeKey = key;
  document.querySelectorAll('.me-nav-item').forEach(btn => {
    const current = btn.dataset.section === name;
    btn.classList.toggle('active', current);
    if (current) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.me-section').forEach(section => section.classList.toggle('hidden', section.id !== `section-${name}`));
  const context = document.getElementById('current-section-context');
  if (context) context.textContent = LABELS[SECTIONS.indexOf(name)];
  if (changed) {
    void loadSectionData(name);
    const scroll = restoreScroll && history.state?.sectionKey === key ? Number(history.state.sectionScroll) || 0 : 0;
    restorePosition(scroll, name);
  }
  if (target) focusSetting(target);
  else if (focus) {
    const heading = document.querySelector(`#section-${name} h1`);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus?.({ preventScroll: true });
  }
}
