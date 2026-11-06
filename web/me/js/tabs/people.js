import { beginView } from '../view-context.js';
import { buildAppGroups } from '../catalog-view.js';
import { renderDataFailure } from '../data-failure.js';
/**
 * /me — PEOPLE & SHARING section (contacts info, sharing summary).
 */

import { getAuthorizations } from '../store.js';
import { gothwadEmail } from '../../../js/config.js';
import { GOTHWAD_SERVICES, GOTHWAD_PRODUCTS } from '../../../js/gothwad-apps.js';

export function initPeople() {
  const emailEl = document.getElementById('people-email');
  if (emailEl) emailEl.textContent = '—'; // populated once user profile loads
}

/** Refreshes the People & Sharing section with current user and connected app counts. */
export async function loadPeople(user) {
  const current = beginView('people');
  try {
    if (!user) return;
    const emailEl = document.getElementById('people-email');
    if (emailEl) emailEl.textContent = gothwadEmail(user.username);

    const countEl = document.getElementById('people-apps-count');
    if (!countEl) return;

    const data = await getAuthorizations();
    if (!current()) return;
    const { included, connected } = buildAppGroups(data);
    countEl.textContent = `${included.length} included identity services · ${connected.length} optional app grants. Inclusion is not a mailbox or service-availability guarantee.`;

  } catch { if (current()) renderDataFailure('people-apps-count', () => loadPeople(user)); }
}
