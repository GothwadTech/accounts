import { api } from '../../../js/api.js';
import { setBusy, toast, escapeHtml, formatDate } from '../../../js/common.js';

const APP_ICONS = { mail: '📧', 'hard-drive': '☁️', 'message-circle': '💬', 'file-text': '📝', calendar: '📅', compass: '🌐' };

export async function loadConnectedApps() {
  const connectedList = document.getElementById('connected-list');
  const appsGrid = document.getElementById('apps-grid');
  if (!connectedList || !appsGrid) return;

  const res = await api.get('/oauth/authorizations');
  if (!res.ok) {
    connectedList.innerHTML = `<div class="text-sm text-danger">${escapeHtml(res.error || 'Could not load apps.')}</div>`;
    return;
  }

  const { connected = [], apps = [] } = res.data;

  if (connected.length === 0) {
    connectedList.innerHTML = `
      <div class="text-sm text-muted" style="padding:8px 2px;">
        Abhi koi app connected nahi hai. Jab aap kisi app mein
        "Sign in with Gothwad" se login karoge, wo yahan dikhegi.
      </div>`;
  } else {
    connectedList.innerHTML = connected.map((c) => `
      <div class="device">
        <div class="device-info">
          <div class="device-icon">${APP_ICONS[c.icon] || '🔐'}</div>
          <div>
            <div class="device-name">${escapeHtml(c.name)}</div>
            <div class="device-meta">Scopes: ${escapeHtml((c.scopes || []).join(', '))} · Last used ${escapeHtml(formatDate(c.last_used_at))}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-disconnect" data-app="${escapeHtml(c.app_id)}" style="padding:8px 14px;">
          Disconnect
        </button>
      </div>`).join('');

    connectedList.querySelectorAll('.btn-disconnect').forEach((btn) => {
      btn.addEventListener('click', async () => {
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
  }

  appsGrid.innerHTML = apps.map((a) => {
    const isConnected = connected.some((c) => c.app_id === a.id);
    return `
      <div class="app-tile">
        <div class="app-icon">${APP_ICONS[a.icon] || '🔐'}</div>
        <div style="flex:1;">
          <div class="app-name">${escapeHtml(a.name)}</div>
          <div class="app-desc">${escapeHtml(a.description || '')}</div>
        </div>
        ${isConnected ? '<span class="tag tag-success">Connected</span>' : ''}
      </div>`;
  }).join('');
}
