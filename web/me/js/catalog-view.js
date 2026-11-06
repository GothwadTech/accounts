/** Deduplicate by immutable app ID; catalog membership is not an OAuth grant or availability check. */
import { GOTHWAD_SERVICES, GOTHWAD_PRODUCTS, isCoreApp } from '../../js/gothwad-apps.js';
export function buildAppGroups(data) {
  const catalog = new Map([...GOTHWAD_SERVICES, ...GOTHWAD_PRODUCTS].map(app => [app.id, { ...app }]));
  for (const app of data.apps || []) {
    const previous = catalog.get(app.id) || {};
    catalog.set(app.id, { ...previous, ...app, url: app.homepage || app.url || previous.url, core: app.core || isCoreApp(app.id) });
  }
  const grants = new Map((data.connected || []).map(grant => [grant.app_id, grant]));
  for (const grant of grants.values()) if (!catalog.has(grant.app_id)) catalog.set(grant.app_id, { id: grant.app_id, name: grant.name || grant.app_id, icon: grant.icon });
  const included = [], connected = [], available = [];
  for (const app of catalog.values()) {
    if (isCoreApp(app.id) || app.core || grants.get(app.id)?.core) included.push(app);
    else if (grants.has(app.id)) connected.push({ ...app, grant: grants.get(app.id) });
    else available.push(app);
  }
  return { included, connected, available };
}
export function safeAppUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
