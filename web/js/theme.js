/**
 * =============================================================================
 * THEME — Google-style light/dark toggle
 * =============================================================================
 * Default LIGHT (Google Account jaisa). User toggle kar sakta hai — choice
 * localStorage mein save hoti hai aur har page-load par turant lag jaati hai
 * (FOUC se bachne ke liye har HTML ke <head> mein chhota inline snippet hai).
 *
 * Usage:
 *   import { mountThemeToggles } from '/js/theme.js';
 *   mountThemeToggles();  // page par saare [data-theme-toggle] buttons bind
 */

const THEME_KEY = 'gothwad-theme';

/** Abhi ka active theme ('light' | 'dark'). */
export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Theme set karo (attribute + localStorage). */
export function setTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch { /* private mode — koi baat nahi */ }
  updateToggles(t);
}

/** Toggle karo. */
export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Saare toggle buttons ka icon/aria update karo. */
function updateToggles(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', theme === 'dark' ? 'Light theme' : 'Dark theme');
    const icon = btn.querySelector('.msym');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  });
}

/**
 * Page par jo bhi [data-theme-toggle] buttons hon, unko bind karo.
 * Button markup:
 *   <button type="button" class="theme-toggle" data-theme-toggle>
 *     <span class="msym">dark_mode</span>
 *   </button>
 */
export function mountThemeToggles() {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });
  updateToggles(getTheme());
}
