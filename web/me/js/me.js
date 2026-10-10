/**
 * /me page main orchestrator
 */

import { renderTopbar, requireAuth, signOut } from '../../js/common.js';
import { updateOverview } from './tabs/overview.js';
import { prefillProfile, initProfileForm } from './tabs/profile.js';
import { initSecurityForm, loadSessions } from './tabs/security.js';
import { loadConnectedApps } from './tabs/apps.js';

let currentUser = null;

async function loadUser() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  renderTopbar({ authenticated: true, user: currentUser });

  const loadingEl = document.getElementById('auth-loading');
  if (loadingEl) loadingEl.classList.add('hidden');

  const dashContent = document.getElementById('dash-content');
  if (dashContent) dashContent.classList.remove('hidden');

  // Populate modular tabs
  updateOverview(currentUser);
  prefillProfile(currentUser);
}

loadUser();

/* ---------------------------------------------------------------- tabs */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`tab-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');
    if (tab.dataset.tab === 'security') loadSessions();
    if (tab.dataset.tab === 'apps') loadConnectedApps();
  });
});

/* ------------------------------------------------------------- sign out */
const signoutBtn = document.getElementById('btn-signout');
if (signoutBtn) signoutBtn.addEventListener('click', () => signOut());

// Initialize forms
initProfileForm((updatedUser) => {
  currentUser = updatedUser;
  updateOverview(currentUser);
  prefillProfile(currentUser);
});

initSecurityForm();
loadConnectedApps();
