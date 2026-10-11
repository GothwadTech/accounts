/**
 * /me — PEOPLE & SHARING section (contacts info, sharing summary).
 */

import { escapeHtml } from '../../../js/common.js';
import { getAuthorizations } from '../store.js';
import { gothwadEmail } from '../../../js/config.js';
import { GOTHWAD_SERVICES, GOTHWAD_PRODUCTS } from '../../../js/gothwad-apps.js';

export function initPeople() {
  const emailEl = document.getElementById('people-email');
  if (emailEl) emailEl.textContent = '—'; // user load hone par set hota hai
}

/** User + apps data ke saath section refresh (me.js se call hota hai). */
export async function loadPeople(user) {
  if (!user) return;
  const emailEl = document.getElementById('people-email');
  if (emailEl) emailEl.textContent = gothwadEmail(user.username);

  const countEl = document.getElementById('people-apps-count');
  if (!countEl) return;

  const data = await getAuthorizations();
  const connected = data.connected || [];
  const nonCore = connected.filter((c) => !c.core);
  const total = GOTHWAD_SERVICES.length + GOTHWAD_PRODUCTS.length;
  countEl.textContent = `${GOTHWAD_SERVICES.length} Gothwad services always connected · ${nonCore.length} product${nonCore.length === 1 ? '' : 's'} connected (out of ${GOTHWAD_PRODUCTS.length})`;
}
