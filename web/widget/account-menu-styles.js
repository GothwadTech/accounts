/**
 * =============================================================================
 * UNIVERSAL ACCOUNT WIDGET STYLES (`Shadow DOM` Encapsulated — Light & Dark)
 * Material 3 Expressive Segmented Stack + Responsive Sheet/Popover
 * =============================================================================
 */

export const ACCOUNT_MENU_CSS = `
:host {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  font-family: 'Roboto', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.4;
  box-sizing: border-box;
}

*, *::before, *::after { box-sizing: border-box; }

.gw-trigger {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--gw-avatar-size, 36px);
  height: var(--gw-avatar-size, 36px);
  padding: 0;
  border: 2px solid rgba(11, 87, 208, 0.16);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: transform 0.14s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}
.gw-trigger:hover {
  border-color: rgba(11, 87, 208, 0.45);
  box-shadow: 0 0 0 4px rgba(11, 87, 208, 0.10);
}
.gw-trigger:focus-visible {
  outline: 2px solid #0b57d0;
  outline-offset: 2px;
}

.gw-signin-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 18px;
  border-radius: 999px;
  background: #0b57d0;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.15s ease, transform 0.12s ease;
}
.gw-signin-pill:hover { filter: brightness(1.07); }

.gw-avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  overflow: hidden;
  color: #ffffff;
  font-weight: 500;
  user-select: none;
  flex-shrink: 0;
}
.gw-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Sheet Overlay & Surface Tokens */
.gw-layer {
  --gw-surface: #eef3f8;
  --gw-card: #ffffff;
  --gw-card-hover: #f5f8fc;
  --gw-text: #1f1f1f;
  --gw-subtext: #444746;
  --gw-chevron-bg: #e6edf5;
  --gw-plus-bg: #e8f0fe;
  --gw-accent: #0b57d0;
  --gw-danger: #b3261e;
  --gw-danger-bg: #fceeee;
  --gw-border: rgba(0, 0, 0, 0.06);
  --gw-shadow: 0 12px 36px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  font-family: 'Roboto', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--gw-text);
}

.gw-layer[data-theme="dark"] {
  --gw-surface: #1b1f26;
  --gw-card: #282c34;
  --gw-card-hover: #323741;
  --gw-text: #e3e3e3;
  --gw-subtext: #c4c7c5;
  --gw-chevron-bg: #363c48;
  --gw-plus-bg: #243856;
  --gw-accent: #8ab4f8;
  --gw-danger: #f28b82;
  --gw-danger-bg: #3c2525;
  --gw-border: rgba(255, 255, 255, 0.08);
  --gw-shadow: 0 16px 42px rgba(0, 0, 0, 0.56), 0 2px 8px rgba(0, 0, 0, 0.35);
}

.gw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  animation: gwFadeIn 0.16s ease-out;
}

.gw-sheet {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--gw-surface);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px max(18px, env(safe-area-inset-bottom));
  animation: gwSlideUp 0.18s cubic-bezier(0.2, 0, 0, 1);
}

@media (min-width: 640px) {
  .gw-backdrop { background: transparent; }
  .gw-sheet {
    inset: auto;
    top: var(--gw-top, 58px);
    right: var(--gw-right, 16px);
    width: 396px;
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 74px);
    min-height: 420px;
    border-radius: 28px;
    border: 1px solid var(--gw-border);
    box-shadow: var(--gw-shadow);
    animation: gwPopIn 0.15s cubic-bezier(0.2, 0, 0, 1);
  }
}

@keyframes gwFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes gwSlideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes gwPopIn { from { opacity: 0; transform: scale(0.97) translateY(-6px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.gw-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 40px;
  margin-bottom: 4px;
}

.gw-close {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--gw-subtext);
  cursor: pointer;
  transition: background 0.14s ease;
}
.gw-close:hover { background: rgba(127, 127, 127, 0.14); }
.gw-close:focus-visible { outline: 2px solid var(--gw-accent); }

/* Material 3 Expressive Segmented Stack (24px outer, 4px inner, 2px gap) */
.gw-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gw-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--gw-card);
  padding: 18px 16px 18px 20px;
  border-radius: 24px 24px 4px 4px;
  transition: border-radius 0.16s ease;
}
.gw-hero.is-collapsed {
  border-radius: 24px;
}

.gw-hero-avatar-wrap {
  position: relative;
  width: 68px;
  height: 68px;
  flex-shrink: 0;
}

.gw-edit-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 1px solid var(--gw-border);
  background: var(--gw-card);
  color: var(--gw-text);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: transform 0.14s ease, background 0.14s ease;
}
.gw-edit-badge:hover { background: var(--gw-card-hover); transform: scale(1.06); }

.gw-hero-meta {
  flex: 1;
  min-width: 0;
}
.gw-hero-name {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.25;
  color: var(--gw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gw-hero-email {
  margin-top: 2px;
  font-size: 13.5px;
  color: var(--gw-subtext);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gw-chevron-btn {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--gw-chevron-bg);
  color: var(--gw-text);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.gw-chevron-btn:hover { filter: brightness(0.96); }
.gw-chevron-icon { transition: transform 0.18s ease; }
.gw-chevron-icon.is-collapsed { transform: rotate(180deg); }

.gw-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 60px;
  padding: 11px 20px;
  border: none;
  border-radius: 4px;
  background: var(--gw-card);
  color: var(--gw-text);
  text-align: left;
  text-decoration: none;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.13s ease;
}
.gw-row:hover { background: var(--gw-card-hover); }
.gw-row:focus-visible { outline: 2px solid var(--gw-accent); outline-offset: -2px; }
.gw-row.is-last { border-radius: 4px 4px 24px 24px; }

.gw-icon-slot {
  width: 40px;
  height: 40px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
}
.gw-plus-circle {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--gw-plus-bg);
  color: var(--gw-accent);
  display: grid;
  place-items: center;
}

.gw-acct-meta {
  flex: 1;
  min-width: 0;
}
.gw-acct-name {
  display: block;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--gw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gw-acct-email {
  display: block;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--gw-subtext);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gw-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--gw-accent);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.gw-mini-signout {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--gw-border);
  background: var(--gw-danger-bg);
  color: var(--gw-danger);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}
.gw-mini-signout:hover { filter: brightness(0.95); }

.gw-manage-pill {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 56px;
  margin-top: 14px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: var(--gw-card);
  color: var(--gw-text);
  text-decoration: none;
  font-size: 14.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s ease;
}
.gw-manage-pill:hover { background: var(--gw-card-hover); }

.gw-extra-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 12px;
}
.gw-extra-group .gw-row:first-child { border-radius: 20px 20px 4px 4px; }
.gw-extra-group .gw-row:last-child { border-radius: 4px 4px 20px 20px; }
.gw-extra-group .gw-row:only-child { border-radius: 20px; }

.gw-footer {
  margin-top: auto;
  padding-top: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--gw-subtext);
}
.gw-footer a {
  color: var(--gw-subtext);
  text-decoration: none;
  padding: 4px 6px;
  border-radius: 6px;
}
.gw-footer a:hover { background: rgba(127, 127, 127, 0.12); }
`;
