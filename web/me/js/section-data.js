/** Section data is fetched only for the visible section; account changes invalidate all render tickets. */
import { captureView } from './view-context.js';
let getUser = () => null, getIndex = () => 0;
export function configureSectionData(user, index) { getUser = user; getIndex = index; }
export async function loadSectionData(name = location.hash.slice(1)) {
  const valid = captureView(), user = getUser();
  if (!user) return;
  if (name === 'home') { const tab = await import('./tabs/home.js'); if (valid()) await tab.loadHome(user); }
  else if (name === 'personal') { const tab = await import('./tabs/personal.js'); if (valid()) tab.refreshRows(); }
  else if (name === 'security') {
    const tab = await import('./tabs/security.js');
    if (valid()) await Promise.all([tab.loadSessions(), tab.loadActivity(), tab.loadAppsSummary(), tab.loadMethodSummary()]);
  } else if (name === 'data') { const tab = await import('./tabs/data.js'); if (valid()) await tab.loadActivity(); }
  else if (name === 'apps') { const tab = await import('./tabs/apps.js'); if (valid()) await tab.loadConnectedApps(getIndex()); }
  else if (name === 'people') { const tab = await import('./tabs/people.js'); if (valid()) await tab.loadPeople(user); }
}
