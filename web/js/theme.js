/**
 * =============================================================================
 * THEME — Google-style light/dark appearance toggle
 * =============================================================================
 * Defaults to LIGHT mode and persists the user's preference in `localStorage`.
 * Each HTML `<head>` runs a tiny inline script before paint to prevent FOUC.
 */

const THEME_KEY = 'gothwad-theme';

/** Returns the active theme ('light' | 'dark'). */
export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Applies a theme to `<html data-theme>` and saves it to `localStorage`. */
export function setTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch { /* storage unavailable in restricted private browsing */ }
  updateToggles(t);
}

/** Toggles between light and dark themes. */
export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Syncs icon and accessible labels across all `[data-theme-toggle]` buttons. */
function updateToggles(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', theme === 'dark' ? 'Light theme' : 'Dark theme');
    const icon = btn.querySelector('.msym');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  });
}

/** Binds click listeners to every `[data-theme-toggle]` element on the page. */
export function mountThemeToggles() {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });
  updateToggles(getTheme());
}
