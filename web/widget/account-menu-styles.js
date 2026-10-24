/**
 * =============================================================================
 * UNIVERSAL ACCOUNT WIDGET STYLES (`Shadow DOM` Encapsulated — Light & Dark)
 * Uniform Account Rows + Responsive Sheet/Popover
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
  --gw-surface: #212121;
  --gw-card: #2c2c2c;
  --gw-card-hover: #363636;
  --gw-text: #e3e3e3;
  --gw-subtext: #c4c7c5;
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
    min-height: 0;
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
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  margin-bottom: 10px;
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

/* Equal account rows; only the outermost corners form the rounded group. */
.gw-heading {
  margin: 0;
  padding-left: 8px;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.1px;
}
.gw-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.gw-account-row {
  display: flex;
  align-items: center;
  background: var(--gw-card);
  border-radius: 4px;
  overflow: hidden;
}
.gw-account-row:first-child { border-radius: 24px 24px 4px 4px; }
.gw-account-row:last-child { border-radius: 4px 4px 24px 24px; }
.gw-account-row:only-child { border-radius: 24px; }
.gw-account-row .gw-account-link {
  flex: 1;
  min-width: 0;
  min-height: 68px;
  padding: 12px 8px 12px 18px;
  gap: 12px;
  background: transparent;
}
.gw-account-link:hover { background: var(--gw-card-hover); }
.gw-current-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gw-subtext);
  flex-shrink: 0;
}
.gw-slot-signout {
  display: grid;
  place-items: center;
  width: 36px;
  height: 40px;
  margin-right: 8px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--gw-subtext);
  cursor: pointer;
  flex-shrink: 0;
}
.gw-slot-signout:hover { background: var(--gw-danger-bg); color: var(--gw-danger); }

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

.gw-primary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  flex-shrink: 0;
}
.gw-action-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.gw-brand-logo { display: block; flex-shrink: 0; border-radius: 50%; }

.gw-manage-pill {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 56px;
  margin: 0;
  padding: 12px 22px;
  border: 1px solid var(--gw-border);
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
.gw-signout-all {
  align-self: center;
  margin: 14px 0 0;
  padding: 9px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--gw-subtext);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.gw-signout-all:hover { background: var(--gw-danger-bg); color: var(--gw-danger); }
.gw-slot-signout:focus-visible, .gw-manage-pill:focus-visible, .gw-signout-all:focus-visible {
  outline: 2px solid var(--gw-accent);
  outline-offset: -3px;
}

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
  padding-top: 16px;
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
