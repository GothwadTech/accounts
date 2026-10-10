import { api } from '../../../js/api.js';
import { setBusy, toast, escapeHtml, formatDate } from '../../../js/common.js';
import { GOTHWAD_SERVICES, GOTHWAD_PRODUCTS, isCoreApp } from '../../../js/gothwad-apps.js';

const APP_ICONS = {
  mail: '📧', 'hard-drive': '☁️', 'message-circle': '💬', 'file-text': '📝',
  calendar: '📅', compass: '🌐', video: '📹', store: '🛍️', users: '👥',
  play: '▶️', send: '✈️',
};

function iconFor(key) {
  return APP_ICONS[key] || '🔐';
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
        <div class="device-icon">${iconFor(a.icon)}</div>
        <div>
          <div class="device-name">${escapeHtml(a.name)}</div>
          <div class="device-meta">${escapeHtml(a.description || '')}${link}</div>
        </div>
      </div>
      <span class="tag tag-success">Always on</span>
    </div>`;
}

function productRow(a, connected) {
  const c = connected.find((x) => x.app_id === a.id);
  return `
    <div class="device">
      <div class="device-info">
        <div class="device-icon">${iconFor(a.icon)}</div>
        <div>
          <div class="device-name">${escapeHtml(a.name)}</div>
          <div class="device-meta">${escapeHtml(a.description || '')}${c ? ` · Last used ${escapeHtml(formatDate(c.last_used_at))}` : ' · Not connected yet'}</div>
        </div>
      </div>
      ${c
        ? `<button class="btn btn-danger btn-disconnect" data-app="${escapeHtml(a.id)}" style="padding:8px 14px;">Disconnect</button>`
        : '<span class="tag">Optional</span>'}
    </div>`;
}

export async function loadConnectedApps() {
  const servicesList = document.getElementById('gothwad-services-list');
  const connectedList = document.getElementById('connected-list');
  const appsGrid = document.getElementById('apps-grid');
  if (!connectedList) return;

  const res = await api.get('/oauth/authorizations');
  const data = res.ok ? res.data : { connected: [], apps: [] };
  const connected = (data.connected || []).filter((c) => !isCoreApp(c.app_id) && !c.core);
  const { services, products } = mergeCatalog(data.apps || []);

  if (servicesList) {
    servicesList.innerHTML = services.map(serviceRow).join('');
  }

  const extraConnected = connected.filter((c) => !products.some((p) => p.id === c.app_id));
  connectedList.innerHTML =
    products.map((p) => productRow(p, connected)).join('') +
    extraConnected.map((c) => productRow({
      id: c.app_id,
      name: c.name,
      icon: c.icon,
      description: `Scopes: ${(c.scopes || []).join(', ')}`,
    }, connected)).join('');

  connectedList.querySelectorAll('.btn-disconnect').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (isCoreApp(btn.dataset.app)) {
        toast('Gothwad Services cannot be disconnected.', 'error');
        return;
      }
      setBusy(btn, true, '...');
      const r = await api.post('/oauth/revoke', { app_id: btn.dataset.app });
      if (r.ok) {
        toast('App disconnected');
        loadConnectedApps();
      } else {
        setBusy(btn, false);
        toast(r.error || 'Could not disconnect', 'error');
      }
    });
  });

  if (appsGrid) {
    const all = [...services, ...products];
    appsGrid.innerHTML = all.map((a) => `
      <a class="app-tile" href="${escapeHtml(a.url || '#')}" ${a.url ? 'target="_blank" rel="noopener"' : ''}>
        <div class="app-icon">${iconFor(a.icon)}</div>
        <div style="flex:1;">
          <div class="app-name">${escapeHtml(a.name)}</div>
          <div class="app-desc">${escapeHtml(a.description || '')}</div>
        </div>
        ${isCoreApp(a.id) ? '<span class="tag tag-accent">Service</span>' : (connected.some((c) => c.app_id === a.id) ? '<span class="tag tag-success">Connected</span>' : '')}
      </a>`).join('');
  }
}
