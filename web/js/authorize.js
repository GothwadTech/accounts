/**
 * CONSENT SCREEN logic ("Sign in with Gothwad" → Allow/Deny)
 *
 * Flow:
 *   1. /oauth/authorize user ko is page par bhejta hai (saare params URL mein).
 *   2. Hum session check karte hain + app ka naam dikhate hain.
 *   3. Allow → POST /oauth/decision → code milta hai → app ke callback par redirect.
 *   4. Deny → error=access_denied ke saath app par wapas.
 */

import { api } from './api.js';
import { renderTopbar, getSession, escapeHtml, toast } from './common.js';

renderTopbar();

// URL se OAuth params padho (authorize redirect se aate hain)
const params = new URLSearchParams(location.search);
const oauth = {
  client_id: params.get('client_id') || '',
  redirect_uri: params.get('redirect_uri') || '',
  response_type: params.get('response_type') || 'code',
  scope: params.get('scope') || '',
  state: params.get('state') || '',
  code_challenge: params.get('code_challenge') || '',
  code_challenge_method: params.get('code_challenge_method') || 'S256',
};

const loading = document.getElementById('loading');
const consentBox = document.getElementById('consent');
const errorBox = document.getElementById('error-box');

function showError(message) {
  loading.classList.add('hidden');
  consentBox.classList.add('hidden');
  document.getElementById('error-text').textContent = message;
  errorBox.classList.remove('hidden');
}

/** Scope ke liye icon — consent screen friendly */
const SCOPE_ICONS = {
  profile: '🪪', email: '📧', drive: '☁️', 'drive.read': '☁️',
  notes: '📝', chat: '💬', offline_access: '🕐',
};

async function init() {
  // Zaroori params?
  if (!oauth.client_id || !oauth.redirect_uri) {
    return showError('Invalid authorization request (missing client_id or redirect_uri).');
  }

  // Logged-in hai?
  const session = await getSession();
  if (!session.authenticated) {
    // Login karke wapas yahin aa jaao
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `login.html?next=${next}`;
    return;
  }

  // App info + scopes load
  const [appRes, meRes] = await Promise.all([
    api.get(`/oauth/app-info?client_id=${encodeURIComponent(oauth.client_id)}`),
    Promise.resolve(session),
  ]);

  if (!appRes.ok) {
    return showError('This app is not registered with Gothwad.');
  }

  const app = appRes.data;
  const user = meRes.user;

  // UI fill
  document.getElementById('app-name').textContent = app.name || oauth.client_id;
  document.getElementById('app-icon').textContent =
    { mail: '📧', 'hard-drive': '☁️', 'message-circle': '💬', 'file-text': '📝', calendar: '📅', compass: '🌐' }[app.icon] || '🔐';
  document.getElementById('user-initials').textContent =
    ((user.first_name || '?')[0] + (user.last_name || '')[0]).toUpperCase();
  document.getElementById('user-name').textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('user-email').textContent = user.email || user.username;

  // Scopes list
  const scopes = oauth.scope.split(' ').filter(Boolean);
  document.getElementById('scope-list').innerHTML = scopes.map((s) => `
    <div class="device" style="padding:10px 14px;">
      <div class="device-info">
        <div class="device-icon" style="width:34px;height:34px;font-size:15px;">${SCOPE_ICONS[s] || '🔑'}</div>
        <div>
          <div class="device-name">${escapeHtml(s)}</div>
          <div class="device-meta">${escapeHtml(SCOPE_TEXT[s] || 'Access granted to this app')}</div>
        </div>
      </div>
    </div>`).join('');

  loading.classList.add('hidden');
  consentBox.classList.remove('hidden');
}

// Scope descriptions (Worker ke OAUTH_SCOPES jaisi — UI copy)
const SCOPE_TEXT = {
  profile: 'Your name, username and avatar',
  email: 'Your Gothwad email address',
  drive: 'Read & write your Gothwad Drive files',
  'drive.read': 'View your Gothwad Drive files',
  notes: 'Read & write your Gothwad Notes',
  chat: 'Access your Gothwad Chat',
  offline_access: 'Stay signed in when you are away',
};

/** Decision bhejo (Allow/Deny) → redirect URL par le jaao */
async function decide(approved) {
  const btn = document.getElementById(approved ? 'btn-allow' : 'btn-deny');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${approved ? 'Authorizing…' : 'Denying…'}`;

  const res = await api.post('/oauth/decision', {
    approved,
    client_id: oauth.client_id,
    redirect_uri: oauth.redirect_uri,
    response_type: oauth.response_type,
    scope: oauth.scope,
    state: oauth.state,
    code_challenge: oauth.code_challenge,
    code_challenge_method: oauth.code_challenge_method,
  });

  if (!res.ok || !res.data?.redirect_url) {
    toast(res.error || 'Authorization failed', 'error');
    btn.disabled = false;
    btn.textContent = approved ? 'Allow access' : 'Deny';
    return;
  }

  if (approved) toast('Access granted! Redirecting…');
  location.href = res.data.redirect_url; // app ke callback par wapas
}

document.getElementById('btn-allow').addEventListener('click', () => decide(true));
document.getElementById('btn-deny').addEventListener('click', () => decide(false));

init();
