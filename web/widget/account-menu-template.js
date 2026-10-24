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
  plus: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  logout: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
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

  const activeIndex = normalized.findIndex((acct) =>
    acct.id === state.activeId || (activeUser.username && acct.username === activeUser.username));
  // Present the current account first without changing its server authuser index.
  const accounts = activeIndex > 0
    ? [normalized[activeIndex], ...normalized.filter((_, index) => index !== activeIndex)]
    : normalized;
  const authuser = Number.isInteger(state.authuser) ? state.authuser : activeUser.authuser;
  const nextUrl = opts.nextUrl || globalThis.location?.href || `${accountsWebOrigin}/u/${authuser}/me`;
  const addHref = `${accountsWebOrigin}/signin?choose=1&add=1&next=${encodeURIComponent(nextUrl)}`;
  const manageHref = opts.manageAccountHref || `${accountsWebOrigin}/u/${authuser}/me`;
  const badges = opts.badges || {};
  const extraActions = Array.isArray(opts.extraActions) ? opts.extraActions : [];

  const accountRowsHtml = accounts.map((acct, index) => {
    const current = activeIndex >= 0 ? acct === normalized[activeIndex] : index === 0;
    const unread = Number(badges[acct.username] || 0);
    const href = typeof opts.accountHref === 'function'
      ? opts.accountHref(acct)
      : `${accountsWebOrigin}/u/${acct.authuser}/me`;
    return `<div class="gw-account-row">
      <a href="${esc(href)}" class="gw-row gw-account-link" data-gw-switch="${esc(acct.id)}" data-gw-authuser="${acct.authuser}"${current ? ' aria-current="true"' : ''}>
        ${renderAvatarMarkup(acct, 40)}
        <span class="gw-acct-meta">
          <span class="gw-acct-name">${esc(acct.name)}</span>
          <span class="gw-acct-email">${esc(acct.email)}</span>
        </span>
        ${unread > 0 ? `<span class="gw-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        ${current ? '<span class="gw-current-dot" role="img" aria-label="Current account"></span>' : ''}
      </a>
      <button type="button" class="gw-slot-signout" data-gw-signout-slot="${esc(acct.id)}" aria-label="Sign out of ${esc(acct.email || acct.username)}" title="Sign out of ${esc(acct.email || acct.username)}">${SVG.logout}</button>
    </div>`;
  }).join('');

  const extraHtml = extraActions.length > 0
    ? `<div class="gw-extra-group">
        ${extraActions.map((act, idx) => (act.href
          ? `<a href="${esc(act.href)}"${act.target ? ` target="${esc(act.target)}" rel="noopener noreferrer"` : ''} class="gw-row" data-gw-extra="${idx}">
            <span class="gw-acct-meta"><span class="gw-acct-name">${esc(act.label)}</span></span>
          </a>`
          : `<button type="button" class="gw-row" data-gw-extra="${idx}">
            <span class="gw-acct-meta"><span class="gw-acct-name">${esc(act.label)}</span></span>
          </button>`)).join('')}
      </div>`
    : '';

  return `<div class="gw-backdrop" data-gw-action="close"></div>
  <div class="gw-sheet" role="dialog" aria-modal="true" aria-label="${esc(ecosystemName)} Account menu">
    <div class="gw-topbar">
      <h2 class="gw-heading">${esc(ecosystemName)} Accounts</h2>
      <button type="button" class="gw-close" data-gw-action="close" aria-label="Close account menu">${SVG.close}</button>
    </div>
    <div class="gw-stack" aria-label="Signed-in accounts">
      ${accountRowsHtml}
    </div>
    <div class="gw-primary-actions">
      <a href="${esc(manageHref)}" class="gw-manage-pill" data-gw-action="manage-account">
        <img class="gw-brand-logo" src="${esc(accountsWebOrigin)}/icon-192.png" width="24" height="24" alt="" />
        <span>Manage your ${esc(ecosystemName)} Account</span>
      </a>
      <a href="${esc(addHref)}" class="gw-manage-pill" data-gw-action="add-account">
        <span class="gw-action-icon">${SVG.plus}</span>
        <span>Add another account</span>
      </a>
    </div>
    ${extraHtml}
    ${accounts.length > 1 ? `<button type="button" class="gw-signout-all" data-gw-action="signout-all">Sign out of all accounts</button>` : ''}
    <footer class="gw-footer">
      <a href="${esc(accountsWebOrigin)}/privacy" target="_blank" rel="noopener">Privacy policy</a>
      <span aria-hidden="true">&bull;</span>
      <a href="${esc(accountsWebOrigin)}/terms" target="_blank" rel="noopener">Terms of Service</a>
    </footer>
  </div>`;
}
