/** Sessions are not physical devices. Mutations are explicitly confirmed for the selected account. */
import { api } from '../../../js/api.js';
import { escapeHtml } from '../../../js/common.js';
import { beginView } from '../view-context.js';
import { fullDate, orderSessions } from '../display-data.js';
import { renderDataFailure } from '../data-failure.js';
import { modal } from '../dialogs.js';
import { bindDialogForm } from '../dialog-form.js';
let bound = false;
export function initSessionActions() {
  if (bound) return; bound = true;
  document.getElementById('btn-revoke-others')?.addEventListener('click', () => confirmSessionSignout());
}
export function confirmSessionSignout(session) {
  const bulk = !session;
  modal({ title: bulk ? 'Sign out other sessions?' : 'Sign out this session?',
    sub: bulk ? 'Only other sessions of the selected account are affected. This session and other accounts stay signed in.' : 'The selected browser/app session will lose account access. Another session on the same physical device may remain signed in.',
    body: `<p>${bulk ? 'Save unfinished work in other sessions before continuing.' : escapeHtml(session.device_name || 'Unnamed session') + ' · ' + escapeHtml(session.browser || 'Browser unavailable')}</p><p>This does not delete device data or separately revoke connected app grants.</p>`,
    actions: '<button type="button" class="btn btn-danger" id="confirm-session-signout">Sign out confirmed sessions</button>' });
  bindDialogForm({ buttonId: 'confirm-session-signout', read: () => (bulk ? {} : { session_id: session.id }), unchanged: false,
    submit: body => api.post(bulk ? '/auth/sessions/revoke-others' : '/auth/sessions/revoke', body), success: bulk ? 'Other sessions were signed out. This session remains active.' : 'The selected session was signed out.' });
}
export async function loadSessions() {
  const current = beginView('sessions'), list = document.getElementById('device-list'), bulk = document.getElementById('btn-revoke-others');
  if (!list) return;
  if (bulk) bulk.disabled = true;
  list.setAttribute('aria-busy', 'true');
  try {
    const result = await api.get('/auth/sessions');
    if (!current()) return;
    if (!result.ok) throw new Error('Session request failed');
    const sessions = orderSessions(result.data.sessions || []);
    if (bulk) bulk.disabled = !sessions.some(session => !session.is_current);
    list.innerHTML = sessions.length ? sessions.map(session => `<div class="device ${session.is_current ? 'current-session' : ''}">
      <div class="device-info"><div class="device-icon"><span class="msym">${/mobile|android|ios/i.test(`${session.device_name} ${session.os}`) ? 'smartphone' : 'laptop'}</span></div><div>
      <div class="device-name">${escapeHtml(session.device_name || 'Unnamed session')} ${session.is_current ? '<span class="tag tag-accent">This session</span>' : ''}</div>
      <div class="device-meta">${escapeHtml(session.browser || 'Browser unavailable')} · ${escapeHtml(session.os || 'OS unavailable')}</div>
      <div class="device-meta">Started: ${escapeHtml(fullDate(session.created_at))}</div><div class="device-meta">Last active: ${escapeHtml(fullDate(session.last_active))}</div></div></div>
      ${session.is_current ? '' : `<button type="button" class="btn btn-text" data-session-id="${escapeHtml(session.id)}">Sign out session</button>`}</div>`).join('') : '<p>No active sessions were returned. Reload to confirm your sign-in status.</p>';
    list.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', () => {
      const session = sessions.find(row => row.id === button.dataset.sessionId); if (session) confirmSessionSignout(session);
    }));
  } catch { if (current()) renderDataFailure(list, loadSessions); }
  finally { if (current()) list.removeAttribute('aria-busy'); }
}
