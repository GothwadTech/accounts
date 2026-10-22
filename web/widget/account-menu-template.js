/**
 * =============================================================================
 * UNIVERSAL ACCOUNT WIDGET — PURE DATA NORMALIZERS & HTML TEMPLATE
 * =============================================================================
 */

export const MAX_BROWSER_ACCOUNTS = 6;

const AVATAR_PALETTE = [
  '#9334a6', '#0b57d0', '#0d652d', '#c5221f', '#00639b', '#b06000', '#7627bb', '#185abc',
];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function avatarColorFor(seed) {
  const s = String(seed || 'u').toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initialsFrom(item) {
  const full = `${item?.firstName || item?.first_name || ''} ${item?.lastName || item?.last_name || ''}`.trim()
    || String(item?.name || item?.username || '?').trim();
  const parts = full.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return full.slice(0, 1).toUpperCase() || '?';
}

export function resolveEndpoints(opts = {}) {
  const scriptOrigin = (() => {
    try {
      const u = new URL(import.meta.url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
    } catch {
      return '';
    }
  })();
  const locHost = globalThis.location?.hostname || 'localhost';
  const locOrigin = globalThis.location?.origin || 'http://localhost:3000';

  const accountsWebOrigin = (
    opts.accountsWebOrigin
    || scriptOrigin
    || locOrigin
  ).replace(/\/+$/, '');

  const inferredDomain = (() => {
    if (opts.appDomain) return String(opts.appDomain).toLowerCase();
    try {
      const host = new URL(accountsWebOrigin).hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.e2b.app')) {
        return 'gothwadtech.com';
      }
      return host.startsWith('accounts.') ? host.slice('accounts.'.length) : host;
    } catch {
      return locHost || 'gothwadtech.com';
    }
  })();

  const accountsApiOrigin = (
    opts.accountsApiOrigin || `${accountsWebOrigin}/api`
  ).replace(/\/+$/, '');

  const ecosystemName = String(opts.ecosystemName || 'Gothwad').trim() || 'Gothwad';
  return { appDomain: inferredDomain, accountsWebOrigin, accountsApiOrigin, ecosystemName };
}

export function normalizeMenuAccount(raw, idx = 0, appDomain = 'gothwadtech.com') {
  const username = String(raw?.username || '').trim().toLowerCase();
  const firstName = String(raw?.firstName ?? raw?.first_name ?? '').trim();
  const lastName = String(raw?.lastName ?? raw?.last_name ?? '').trim();
  const name = String(raw?.name || `${firstName} ${lastName}`.trim() || username || 'Account').trim();
  const authuser = Number.isInteger(raw?.authuser) ? raw.authuser : idx;
  const avatarUrl = raw?.avatarUrl || raw?.avatar_url || raw?.picture || null;
  const email = String(raw?.email || (username ? `${username}@${appDomain}` : '')).trim().toLowerCase();
  return {
    id: String(raw?.id || raw?.slot || authuser),
    authuser,
    username,
    name,
    firstName,
    lastName,
    email,
    avatarUrl: avatarUrl ? String(avatarUrl) : null,
    accountUrl: raw?.accountUrl || null,
  };
}

export function renderAvatarMarkup(acct, sizePx = 40) {
  const bg = avatarColorFor(acct?.username || acct?.email || acct?.name);
  const label = esc(initialsFrom(acct));
  const fontSize = Math.max(13, Math.round(sizePx * 0.42));
  const url = acct?.avatarUrl || acct?.avatar_url || acct?.picture || '';
  if (url) {
    return `<span class="gw-avatar" style="width:${sizePx}px;height:${sizePx}px;background:${bg};font-size:${fontSize}px;">
      <img src="${esc(url)}" alt="" referrerpolicy="no-referrer" data-gw-avatar-img="${label}" />
    </span>`;
  }
  return `<span class="gw-avatar" style="width:${sizePx}px;height:${sizePx}px;background:${bg};font-size:${fontSize}px;">${label}</span>`;
}

const SVG = {
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  pencil: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  chevronUp: '<svg class="gw-chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  plus: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  manageAccounts: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3.5"/><path d="M3 19c0-3 2.7-5 6-5 1.1 0 2.1.2 3 .7"/><circle cx="17.5" cy="16.5" r="2.3"/><path d="M17.5 12.8v1M17.5 19.2v1M13.8 16.5h1M20.2 16.5h1M14.9 13.9l.7.7M19.4 18.4l.7.7M20.1 13.9l-.7.7M15.6 18.4l-.7.7"/></svg>',
  logout: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  brandMark: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M21.6 12.23c0-.7-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z" fill="#4285F4"/><path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A9.99 9.99 0 0 0 12 22Z" fill="#34A853"/><path d="M6.41 13.92A6.02 6.02 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.5H3.06A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.06 4.5l3.35-2.58Z" fill="#FBBC05"/><path d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A9.99 9.99 0 0 0 3.06 7.5l3.35 2.58c.79-2.36 2.99-4.12 5.59-4.12Z" fill="#EA4335"/></svg>',
};

export function detectHostTheme(explicitTheme) {
  if (explicitTheme === 'dark' || explicitTheme === 'light') return explicitTheme;
  const docEl = globalThis.document?.documentElement;
  if (docEl) {
    const attr = docEl.getAttribute?.('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    if (docEl.classList?.contains('dark')) return 'dark';
  }
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

export function buildAccountSheetHtml(state, opts = {}) {
  const { appDomain, accountsWebOrigin, ecosystemName } = resolveEndpoints(opts);
  const rawAccounts = Array.isArray(state.accounts) ? state.accounts : [];
  const normalized = rawAccounts.map((a, i) => normalizeMenuAccount(a, i, appDomain));
  const activeUser = normalizeMenuAccount(
    state.user || normalized.find((a) => a.id === state.activeId) || normalized[0] || {},
    state.authuser ?? 0,
    appDomain,
  );
  if (normalized.length === 0 && activeUser.username) normalized.push(activeUser);

  const others = normalized.filter(
    (a) => a.username.toLowerCase() !== activeUser.username.toLowerCase(),
  );
  const collapsed = Boolean(state.collapsed);
  const manageMode = Boolean(state.manageMode);
  const authuser = Number.isInteger(state.authuser) ? state.authuser : activeUser.authuser;
  const nextUrl = opts.nextUrl || globalThis.location?.href || `${accountsWebOrigin}/u/${authuser}/me`;
  const addHref = `${accountsWebOrigin}/signin?choose=1&add=1&next=${encodeURIComponent(nextUrl)}`;
  const manageHref = opts.manageAccountHref || `${accountsWebOrigin}/u/${authuser}/me`;
  const editAvatarHref = `${accountsWebOrigin}/u/${authuser}/me#personal`;
  const badges = opts.badges || {};
  const extraActions = Array.isArray(opts.extraActions) ? opts.extraActions : [];

  const otherRowsHtml = others
    .map((acct) => {
      const unread = Number(badges[acct.username] || 0);
      const href = typeof opts.accountHref === 'function' ? opts.accountHref(acct) : '#';
      return `<a href="${esc(href)}" class="gw-row" data-gw-switch="${esc(acct.id)}" data-gw-authuser="${acct.authuser}">
        ${renderAvatarMarkup(acct, 40)}
        <span class="gw-acct-meta">
          <span class="gw-acct-name">${esc(acct.name)}</span>
          <span class="gw-acct-email">${esc(acct.email)}</span>
        </span>
        ${unread > 0 ? `<span class="gw-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        ${manageMode ? `<button type="button" class="gw-mini-signout" data-gw-signout-slot="${esc(acct.id)}">Sign out</button>` : ''}
      </a>`;
    })
    .join('');

  const managePanelHtml = manageMode
    ? `<button type="button" class="gw-row" data-gw-signout-slot="${esc(activeUser.id)}">
        <span class="gw-icon-slot">${SVG.logout}</span>
        <span>Sign out of ${esc(activeUser.email || activeUser.username)}</span>
      </button>
      ${normalized.length > 1
        ? `<button type="button" class="gw-row is-last" data-gw-action="signout-all" style="color:var(--gw-danger);">
            <span class="gw-icon-slot">${SVG.logout}</span>
            <span>Sign out of all accounts</span>
          </button>`
        : `<button type="button" class="gw-row is-last" data-gw-action="toggle-manage">
            <span class="gw-icon-slot">${SVG.manageAccounts}</span>
            <span>Done managing accounts</span>
          </button>`}`
    : `<button type="button" class="gw-row is-last" data-gw-action="toggle-manage">
        <span class="gw-icon-slot">${SVG.manageAccounts}</span>
        <span>Manage accounts</span>
      </button>`;

  const extraHtml = extraActions.length > 0
    ? `<div class="gw-extra-group">
        ${extraActions.map((act, idx) => `<button type="button" class="gw-row" data-gw-extra="${idx}">
          <span class="gw-acct-meta"><span class="gw-acct-name">${esc(act.label)}</span></span>
        </button>`).join('')}
      </div>`
    : '';

  return `<div class="gw-backdrop" data-gw-action="close"></div>
  <div class="gw-sheet" role="dialog" aria-modal="true" aria-label="${esc(ecosystemName)} Account menu">
    <div class="gw-topbar">
      <button type="button" class="gw-close" data-gw-action="close" aria-label="Close account menu">${SVG.close}</button>
    </div>
    <div class="gw-stack">
      <div class="gw-hero ${collapsed ? 'is-collapsed' : ''}">
        <div class="gw-hero-avatar-wrap">
          ${renderAvatarMarkup(activeUser, 68)}
          <a href="${esc(editAvatarHref)}" class="gw-edit-badge" data-gw-action="edit-avatar" aria-label="Change profile picture" title="Change profile picture">${SVG.pencil}</a>
        </div>
        <div class="gw-hero-meta">
          <div class="gw-hero-name">${esc(activeUser.name)}</div>
          <div class="gw-hero-email">${esc(activeUser.email)}</div>
        </div>
        <button type="button" class="gw-chevron-btn" data-gw-action="toggle-collapse" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Show more accounts' : 'Hide accounts'}">
          ${SVG.chevronUp.replace('class="gw-chevron-icon"', `class="gw-chevron-icon ${collapsed ? 'is-collapsed' : ''}"`)}
        </button>
      </div>
      ${collapsed ? '' : `${otherRowsHtml}
      <a href="${esc(addHref)}" class="gw-row" data-gw-action="add-account">
        <span class="gw-icon-slot"><span class="gw-plus-circle">${SVG.plus}</span></span>
        <span>Add another account</span>
      </a>
      ${managePanelHtml}`}
    </div>
    <a href="${esc(manageHref)}" class="gw-manage-pill" data-gw-action="manage-account">
      ${SVG.brandMark}
      <span>Manage your ${esc(ecosystemName)} Account</span>
    </a>
    ${extraHtml}
    <footer class="gw-footer">
      <a href="${esc(accountsWebOrigin)}/privacy" target="_blank" rel="noopener">Privacy policy</a>
      <span aria-hidden="true">&bull;</span>
      <a href="${esc(accountsWebOrigin)}/terms" target="_blank" rel="noopener">Terms of Service</a>
    </footer>
  </div>`;
}
