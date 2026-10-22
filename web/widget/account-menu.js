/**
 * =============================================================================
 * UNIVERSAL GOOGLE-STYLE ACCOUNT WIDGET & SILENT SSO SDK
 * Hosted once at `https://accounts.<domain>/widget/account-menu.js`
 * Used across Accounts (`/me`), Mail, Kiwi Store, Console, Admin, Notes & Drive.
 * =============================================================================
 */

import { ACCOUNT_MENU_CSS } from './account-menu-styles.js';
import {
  MAX_BROWSER_ACCOUNTS,
  avatarColorFor,
  buildAccountSheetHtml,
  detectHostTheme,
  esc,
  initialsFrom,
  normalizeMenuAccount,
  renderAvatarMarkup,
  resolveEndpoints,
} from './account-menu-template.js';

export {
  MAX_BROWSER_ACCOUNTS,
  avatarColorFor,
  buildAccountSheetHtml,
  detectHostTheme,
  initialsFrom,
  normalizeMenuAccount,
  renderAvatarMarkup,
  resolveEndpoints,
};

async function callAccountsApi(opts, path, method = 'GET', body = undefined) {
  const { accountsApiOrigin } = resolveEndpoints(opts);
  const headers = { Accept: 'application/json' };
  if (Number.isInteger(opts.authuser) && opts.authuser >= 0 && opts.authuser <= 5) {
    headers['X-Gothwad-Authuser'] = String(opts.authuser);
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${accountsApiOrigin}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

class SheetOverlayController {
  constructor() {
    this.hostEl = null;
    this.shadow = null;
    this.layerEl = null;
    this.state = { user: null, accounts: [], activeId: null, authuser: 0, collapsed: false, manageMode: false };
    this.opts = {};
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.close(); };
  }

  isOpen() {
    return Boolean(this.hostEl);
  }

  ensureMounted() {
    if (this.hostEl || !globalThis.document?.body) return;
    this.hostEl = document.createElement('div');
    this.hostEl.setAttribute('data-gothwad-account-overlay', '1');
    if (typeof this.hostEl.attachShadow === 'function') {
      this.shadow = this.hostEl.attachShadow({ mode: 'open' });
    } else {
      this.shadow = this.hostEl;
    }
    const styleEl = document.createElement('style');
    styleEl.textContent = ACCOUNT_MENU_CSS;
    this.layerEl = document.createElement('div');
    this.layerEl.className = 'gw-layer';
    this.shadow.appendChild(styleEl);
    this.shadow.appendChild(this.layerEl);
    document.body.appendChild(this.hostEl);
    globalThis.window?.addEventListener?.('keydown', this._onKeyDown);
  }

  open(nextState = {}, nextOpts = {}) {
    this.state = { ...this.state, ...nextState, collapsed: false, manageMode: false };
    this.opts = { ...nextOpts };
    this.ensureMounted();
    this.render();
  }

  update(patchState = {}, patchOpts = null) {
    this.state = { ...this.state, ...patchState };
    if (patchOpts) this.opts = { ...this.opts, ...patchOpts };
    if (this.isOpen()) this.render();
  }

  close() {
    if (!this.hostEl) return;
    this.hostEl.remove();
    this.hostEl = null;
    this.shadow = null;
    this.layerEl = null;
    globalThis.window?.removeEventListener?.('keydown', this._onKeyDown);
    this.opts.onClose?.();
  }

  render() {
    if (!this.layerEl) return;
    this.layerEl.setAttribute('data-theme', detectHostTheme(this.opts.theme));
    const anchorRect = this.opts.anchorEl?.getBoundingClientRect?.();
    if (anchorRect && globalThis.innerWidth) {
      const top = Math.max(12, Math.round(anchorRect.bottom + 10));
      const right = Math.max(12, Math.round(globalThis.innerWidth - anchorRect.right));
      this.layerEl.style?.setProperty?.('--gw-top', `${top}px`);
      this.layerEl.style?.setProperty?.('--gw-right', `${right}px`);
    }
    this.layerEl.innerHTML = buildAccountSheetHtml(this.state, this.opts);
    this.bindEvents();
  }

  bindEvents() {
    if (!this.layerEl?.querySelectorAll) return;

    this.layerEl.querySelectorAll('[data-gw-avatar-img]').forEach((img) => {
      img.addEventListener('error', () => {
        const parent = img.parentElement;
        if (parent) parent.textContent = img.getAttribute('data-gw-avatar-img') || '?';
      });
    });

    this.layerEl.querySelectorAll('[data-gw-action="close"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    });

    this.layerEl.querySelector('[data-gw-action="toggle-collapse"]')?.addEventListener('click', () => {
      this.state.collapsed = !this.state.collapsed;
      if (this.state.collapsed) this.state.manageMode = false;
      this.render();
    });

    this.layerEl.querySelector('[data-gw-action="toggle-manage"]')?.addEventListener('click', () => {
      this.state.manageMode = !this.state.manageMode;
      this.render();
    });

    this.layerEl.querySelector('[data-gw-action="edit-avatar"]')?.addEventListener('click', (e) => {
      if (typeof this.opts.onEditAvatar === 'function') {
        e.preventDefault();
        this.close();
        this.opts.onEditAvatar();
      }
    });

    this.layerEl.querySelector('[data-gw-action="manage-account"]')?.addEventListener('click', (e) => {
      if (typeof this.opts.onManageAccount === 'function') {
        e.preventDefault();
        this.close();
        this.opts.onManageAccount();
      }
    });

    this.layerEl.querySelector('[data-gw-action="add-account"]')?.addEventListener('click', (e) => {
      const count = Array.isArray(this.state.accounts) ? this.state.accounts.length : 0;
      if (count >= MAX_BROWSER_ACCOUNTS) {
        e.preventDefault();
        this.opts.onError?.(`Maximum ${MAX_BROWSER_ACCOUNTS} accounts can stay signed in on one browser.`);
      }
    });

    this.layerEl.querySelectorAll('[data-gw-signout-slot]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slotId = btn.getAttribute('data-gw-signout-slot');
        const { appDomain } = resolveEndpoints(this.opts);
        const accounts = (this.state.accounts || []).map((a, i) => normalizeMenuAccount(a, i, appDomain));
        const target = accounts.find((a) => a.id === slotId) || null;
        this.close();
        if (typeof this.opts.onSignOutAccount === 'function') {
          await this.opts.onSignOutAccount(slotId, target);
          return;
        }
        await callAccountsApi(this.opts, `/auth/accounts/${encodeURIComponent(slotId)}/signout`, 'POST', {});
        globalThis.location?.reload?.();
      });
    });

    this.layerEl.querySelector('[data-gw-action="signout-all"]')?.addEventListener('click', async () => {
      this.close();
      if (typeof this.opts.onSignOutAll === 'function') {
        await this.opts.onSignOutAll();
        return;
      }
      await callAccountsApi(this.opts, '/auth/signout', 'POST', {});
      globalThis.location?.reload?.();
    });

    this.layerEl.querySelectorAll('[data-gw-extra]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const idx = Number(el.getAttribute('data-gw-extra'));
        const action = this.opts.extraActions?.[idx];
        if (action?.href && typeof action.onClick !== 'function') {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
          this.close();
          return;
        }
        if (action?.href) e.preventDefault();
        this.close();
        action?.onClick?.(e);
      });
    });

    this.layerEl.querySelectorAll('[data-gw-switch]').forEach((row) => {
      row.addEventListener('click', async (e) => {
        if (e.target?.closest?.('[data-gw-signout-slot]')) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const slotId = row.getAttribute('data-gw-switch');
        const { appDomain } = resolveEndpoints(this.opts);
        const accounts = (this.state.accounts || []).map((a, i) => normalizeMenuAccount(a, i, appDomain));
        const target = accounts.find((a) => a.id === slotId);
        if (!target) return;
        this.close();
        if (typeof this.opts.onSwitchAccount === 'function') {
          await this.opts.onSwitchAccount(target);
          return;
        }
        const sw = await callAccountsApi(this.opts, '/auth/switch', 'POST', {
          id: target.id,
          authuser: target.authuser,
        });
        if (sw.ok) globalThis.location?.reload?.();
      });
    });
  }
}

export const GothwadAccountMenu = new SheetOverlayController();

if (globalThis.window) {
  globalThis.window.GothwadAccountMenu = GothwadAccountMenu;
}

if (typeof globalThis.HTMLElement !== 'undefined' && globalThis.customElements && !globalThis.customElements.get('gothwad-account-menu')) {
  class GothwadAccountMenuElement extends globalThis.HTMLElement {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._session = { authenticated: false, user: null, accounts: [], activeId: null, authuser: 0 };
      this._options = {};
    }

    connectedCallback() {
      this.renderButton();
      if (this.hasAttribute('auto-sso')) void this.refreshSession();
    }

    setSession(session, options = {}) {
      this._session = { ...this._session, ...session, authenticated: Boolean(session?.user) };
      this._options = { ...this._options, ...options };
      this.renderButton();
    }

    async refreshSession() {
      const res = await callAccountsApi(this._options, '/auth/me', 'GET');
      if (res.ok && res.data?.authenticated && res.data.user) {
        this._session = {
          authenticated: true,
          user: res.data.user,
          accounts: res.data.accounts || [],
          activeId: res.data.activeId || null,
          authuser: Number.isInteger(res.data.authuser) ? res.data.authuser : 0,
        };
      } else {
        this._session = { authenticated: false, user: null, accounts: [], activeId: null, authuser: 0 };
      }
      this.renderButton();
      this.dispatchEvent(new CustomEvent('gothwad-session', { detail: this._session, bubbles: true }));
      return this._session;
    }

    renderButton() {
      const size = Number(this.getAttribute('size') || 36);
      const { appDomain, accountsWebOrigin } = resolveEndpoints(this._options);
      const signInHref = `${accountsWebOrigin}/signin?next=${encodeURIComponent(globalThis.location?.href || accountsWebOrigin)}`;

      if (!this._session.authenticated || !this._session.user) {
        this._root.innerHTML = `<style>${ACCOUNT_MENU_CSS}</style>
          <a class="gw-signin-pill" href="${esc(signInHref)}">Sign in</a>`;
        return;
      }

      const acct = normalizeMenuAccount(this._session.user, this._session.authuser, appDomain);
      this._root.innerHTML = `<style>${ACCOUNT_MENU_CSS}</style>
        <button type="button" class="gw-trigger" style="--gw-avatar-size:${size}px" aria-label="Account menu">
          ${renderAvatarMarkup(acct, size - 4)}
        </button>`;
      this._root.querySelector('.gw-trigger')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (GothwadAccountMenu.isOpen()) GothwadAccountMenu.close();
        else GothwadAccountMenu.open(this._session, { ...this._options, anchorEl: this });
      });
    }
  }
  globalThis.customElements.define('gothwad-account-menu', GothwadAccountMenuElement);
}
