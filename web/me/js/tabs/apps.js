/** Included services, actual app grants and optional catalog entries are three distinct things. */
import { api } from '../../../js/api.js';
import { escapeHtml } from '../../../js/common.js';
import { buildEcosystemAppHref, parsePageAuthuser } from '../../../js/authuser.js';
import { getAuthorizations } from '../store.js';
import { beginView } from '../view-context.js';
import { renderDataFailure } from '../data-failure.js';
import { buildAppGroups, safeAppUrl } from '../catalog-view.js';
import { fullDate, permissionLabel } from '../display-data.js';
import { modal } from '../dialogs.js';
import { bindDialogForm } from '../dialog-form.js';
const icons = { mail: 'mail', 'hard-drive': 'cloud', video: 'videocam', store: 'storefront', users: 'group', play: 'play_circle', send: 'send', 'message-circle': 'chat', calendar: 'calendar_month', 'file-text': 'description' };
function appInfo(app) {
  return `<div class="device-info"><div class="device-icon"><span class="msym">${icons[app.icon] || 'apps'}</span></div><div><div class="device-name">${escapeHtml(app.name || app.id)}</div><div class="device-meta">${escapeHtml(app.description || '')}</div></div></div>`;
}
function includedRow(app, authuser) {
  const development = app.id === 'gothwad-contacts', url = safeAppUrl(app.url);
  return `<div class="device">${appInfo(app)}<div class="app-access"><span class="tag">${development ? 'In development' : 'Included identity service'}</span>
    ${!development && url ? `<a class="btn btn-text" href="${escapeHtml(buildEcosystemAppHref(url, authuser))}" target="_blank" rel="noopener">Visit service<span class="sr-only"> (opens a new tab)</span></a>` : ''}</div></div>`;
}
function grantRow(app) {
  const grant = app.grant;
  return `<div class="device app-grant">${appInfo(app)}<details class="app-permissions"><summary>Permissions and connection details</summary>
    <p>Publisher: ${escapeHtml(app.publisher || 'Not provided by the app registry')}. A listed publisher name is not independent verification.</p>
    <ul>${(grant.scopes || []).map(scope => `<li>${escapeHtml(permissionLabel(scope))}</li>`).join('') || '<li>Permission metadata unavailable</li>'}</ul>
    <p>Connected: ${escapeHtml(fullDate(grant.granted_at))}<br />Last used: ${escapeHtml(fullDate(grant.last_used_at))}</p></details>
    <button type="button" class="btn btn-text" data-disconnect="${escapeHtml(app.id)}">Disconnect app</button></div>`;
}
export function confirmDisconnect(app) {
  modal({ title: 'Disconnect this app?', sub: `Remove the selected account’s permission grant for ${app.name || app.id}.`,
    body: '<p>This revokes its Accounts grant and refresh access. Data already copied to the app is not deleted, and an app’s own signed-in session may remain. Visit the app to manage that data or delete its separate account.</p>',
    actions: '<button type="button" class="btn btn-danger" id="confirm-disconnect">Disconnect confirmed app</button>' });
  bindDialogForm({ buttonId: 'confirm-disconnect', read: () => ({ app_id: app.id }), unchanged: false,
    submit: body => api.post('/oauth/revoke', body), success: 'App grant revoked. Previously shared data must be managed with the app.' });
}
export async function loadConnectedApps(authuser = Number(parsePageAuthuser() || 0)) {
  const current = beginView('apps');
  try {
    const data = await getAuthorizations(); if (!current()) return;
    const { included, connected, available } = buildAppGroups(data);
    const services = document.getElementById('gothwad-services-list'), grants = document.getElementById('connected-list'), catalog = document.getElementById('apps-grid');
    if (services) services.innerHTML = included.map(app => includedRow(app, authuser)).join('') || '<p>No included services were returned.</p>';
    if (grants) {
      grants.innerHTML = connected.map(grantRow).join('') || '<p>No optional apps have a permission grant for this account.</p>';
      grants.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', () => confirmDisconnect(connected.find(app => app.id === button.dataset.disconnect))));
    }
    if (catalog) catalog.innerHTML = available.map(app => `<div class="app-card">${appInfo(app)}<p class="text-sm text-muted">Not connected. Availability has not been checked.</p></div>`).join('') || '<p>No other catalog entries.</p>';
  } catch { if (current()) ['connected-list', 'gothwad-services-list', 'apps-grid'].forEach(id => renderDataFailure(id, () => loadConnectedApps(authuser))); }
}
