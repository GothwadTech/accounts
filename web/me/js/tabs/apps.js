/**
 * /me — CONNECTED APPS section.
 * Gothwad Services (always on) + Gothwad products (disconnect possible) +
 * sab products ka grid. /oauth/authorizations se real data aata hai.
 */

import { api } from '../../../js/api.js';
import { toast, escapeHtml, formatDate } from '../../../js/common.js';
import { getAuthorizations } from '../store.js';
import { GOTHWAD_SERVICES, GOTHWAD_PRODUCTS, isCoreApp } from '../../../js/gothwad-apps.js';

/* Material Symbols icon mapping (ecosystem_apps.icon values se) */
const APP_ICONS = {
  mail: 'mail',
  'hard-drive': 'cloud',
  'message-circle': 'chat',
  'file-text': 'description',
  calendar: 'calendar_month',
  compass: 'explore',
  video: 'videocam',
  store: 'storefront',
  users: 'group',
  play: 'play_circle',
  send: 'send',
};

function iconFor(key) {
  return APP_ICONS[key] || 'key';
}

function hostOf(url) {
  return String(url || '').replace('https://', '').replace('http://', '');
}

function mergeCatalog(apiApps) {
  const byId = new Map((apiApps || []).map((a) => [a.id, a]));
  const fill = (row) => {
    const extra = byId.get(row.id) || {};
    return {
      ...row,
      ...extra,
      name: extra.name || row.name,
      description: extra.description || row.description,
      icon: extra.icon || row.icon,
      url: row.url || extra.homepage || extra.url,
    };
  };
  return {
    services: GOTHWAD_SERVICES.map(fill),
    products: GOTHWAD_PRODUCTS.map(fill),
  };
}

function serviceRow(a) {
  const host = hostOf(a.url);
  const link = a.url
    ? ` · <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(host)}</a>`
    : '';
  return `
    <div class="device">
      <div class="device-info">
        <div class="device-icon"><span class="msym">${iconFor(a.icon)}</span></div>
        <div>
          <div class="device-name">${escapeHtml(a.name)}</div>
          <div class="device-meta">${escapeHtml(a.description || '')}${link}</div>
        </div>
      </div>
      <span class="tag tag-success"><span class="msym" style="font-size:13px;">check_circle</span> Always on</span>
    </div>`;
}

function productRow(a, connected) {
  const c = connected.find((x) => x.app_id === a.id);
  return `
    <div class="device">
      <div class="device-info">
        <div class="device-icon"><span class="msym">${iconFor(a.icon)}</span></div>
        <div>
          <div class="device-name">${escapeHtml(a.name)}</div>
          <div class="device-meta">${escapeHtml(a.description || '')}${c ? ` · Last used ${escapeHtml(formatDate(c.last_used_at))}` : ' · Not connected yet'}</div>
        </div>
      </div>
      ${c
        ? `<button class="btn btn-ghost btn-sm btn-disconnect" data-app="${escapeHtml(a.id)}">Disconnect</button>`
        : '<span class="tag">Optional</span>'}
    </div>`;
}

function appCard(a) {
  const host = hostOf(a.url);
  return `
    <div class="app-card">
      <div class="app-icon"><span class="msym">${iconFor(a.icon)}</span></div>
      <div style="font-weight:500;margin-bottom:2px;">${escapeHtml(a.name)}</div>
      <div class="text-muted text-xs" style="margin-bottom:8px;">${escapeHtml(a.description || '')}</div>
      ${a.url ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener" class="text-xs">${escapeHtml(host)}</a>` : ''}
    </div>`;
}

export async function loadConnectedApps() {
  const servicesList = document.getElementById('gothwad-services-list');
  const connectedList = document.getElementById('connected-list');
  const appsGrid = document.getElementById('apps-grid');
  if (!connectedList) return;

  const data = await getAuthorizations();
  const connected = (data.connected || []).filter((c) => !isCoreApp(c.app_id) && !c.core);
  const { services, products } = mergeCatalog(data.apps || []);

  if (servicesList) servicesList.innerHTML = services.map(serviceRow).join('');

  const extraConnected = connected.filter((c) => !products.some((p) => p.id === c.app_id));
  connectedList.innerHTML =
    products.map((p) => productRow(p, connected)).join('') +
    extraConnected
      .map((c) =>
        productRow(
          {
            id: c.app_id,
            name: c.name,
            icon: c.icon,
            description: `Scopes: ${(c.scopes || []).join(', ')}`,
          },
          connected,
        ),
      )
      .join('');

  if (appsGrid) {
    appsGrid.innerHTML = [...services, ...products].map(appCard).join('');
  }

  connectedList.querySelectorAll('.btn-disconnect').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (isCoreApp(btn.dataset.app)) {
        toast('Gothwad Services cannot be disconnected.', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = '...';
      const r = await api.post('/oauth/revoke', { app_id: btn.dataset.app });
      if (r.ok) {
        toast('App disconnected');
        getAuthorizations(true); // cache refresh
        loadConnectedApps();
      } else {
        btn.disabled = false;
        btn.textContent = 'Disconnect';
        toast(r.error || 'Could not disconnect.', 'error');
      }
    });
  });
}
