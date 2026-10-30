/**
 * =============================================================================
 * OAUTH 2.0 PROVIDER HELPERS — PKCE, Client Lookup & Consent Screen Renderer
 * =============================================================================
 */

import type { D1Database, Env, SessionUser } from './types.ts';
import { oauthQuery } from './db.ts';
import { parseJsonStringArray } from './http.ts';
import { sha256Base64Url, sha256Hex, timingSafeEqual } from './crypto.ts';

export const OAUTH_SCOPES: Record<string, string> = {
  profile: 'View your basic profile (name, username, avatar)',
  email: 'View your Gothwad email address',
  drive: 'Read & write files in your Gothwad Drive',
  'drive.read': 'View files in your Gothwad Drive',
  notes: 'Read & write your Gothwad Notes',
  chat: 'Access your Gothwad Chat messages',
  offline_access: 'Keep you signed in to this app even when you are away',
};

export function parseScopes(scopeStr: string): string[] {
  return String(scopeStr || '')
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s && OAUTH_SCOPES[s]);
}

export async function findOAuthClient(db: D1Database, clientId: string): Promise<Record<string, any> | null> {
  if (!clientId) return null;
  const row = await oauthQuery(() =>
    db
      .prepare('SELECT * FROM ecosystem_apps WHERE client_id = ? OR id = ? ORDER BY (client_id = ?) DESC LIMIT 1')
      .bind(clientId, clientId, clientId)
      .first(),
  );
  if (!row) return null;
  return {
    ...row,
    redirect_uris: parseJsonStringArray(row.redirect_uris),
    is_verified: !!row.is_verified,
    is_core: !!row.is_core,
  };
}

export function isRedirectUriAllowed(env: Env, client: Record<string, any>, redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri);
    if (
      redirectUri.includes('#') ||
      u.username ||
      u.password ||
      ['javascript:', 'data:', 'file:', 'about:', 'blob:'].includes(u.protocol)
    ) {
      return false;
    }
    const allowed: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    if (allowed.includes(redirectUri)) return true;
    return (
      env.DEV_MODE === 'true' &&
      ['http:', 'https:'].includes(u.protocol) &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

export function pkceRequestError(
  client: Record<string, any>,
  challenge: string | null,
  method: string | null,
): string | null {
  if (!challenge) {
    if (!client.secret_hash) return 'PKCE required: pass code_challenge (S256)';
    return method ? 'code_challenge is required with code_challenge_method' : null;
  }
  if (method !== 'S256') return 'Only code_challenge_method=S256 is supported';
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return 'Invalid S256 code_challenge';
  return null;
}

export async function verifyPkce(
  verifier: string,
  challenge: string | null,
  method: string | null,
): Promise<boolean> {
  if (!challenge) return true;
  if (method !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = await sha256Base64Url(verifier);
  return computed === challenge;
}

export function oauthCallbackUrl(
  redirectUri: string,
  result: { code?: string; error?: string },
  state: string,
): string {
  const back = new URL(redirectUri);
  for (const key of ['code', 'error', 'error_description', 'state']) back.searchParams.delete(key);
  for (const [key, value] of Object.entries(result)) back.searchParams.set(key, value);
  if (state) back.searchParams.set('state', state);
  return back.toString();
}

export async function verifyClientSecret(client: Record<string, any>, secret: string | undefined): Promise<boolean> {
  if (!client.secret_hash) return true;
  if (!secret) return false;
  return timingSafeEqual(await sha256Hex(secret), String(client.secret_hash));
}

export function consentPageHtml(
  env: Env,
  client: Record<string, any>,
  authUser: SessionUser,
  profile: Record<string, any> | null,
  params: URLSearchParams,
  authorizeUrl?: string,
): Response {
  const esc = (s: any) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );

  const username = profile?.username || authUser.username || 'user';
  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const displayName = `${firstName} ${lastName}`.trim() || username;
  const initials = ((firstName[0] || username[0] || '?') + (lastName[0] || '')).toUpperCase();

  const scopeIcons: Record<string, string> = {
    profile: '🪪', email: '📧', drive: '☁️', 'drive.read': '☁️',
    notes: '📝', chat: '💬', offline_access: '🕐',
  };
  const scopes = parseScopes(params.get('scope') || '');
  const scopeItems = scopes
    .map(
      (s) => `
    <div class="scope">
      <div class="scope-icon">${scopeIcons[s] || '🔑'}</div>
      <div><div class="scope-name">${esc(s)}</div>
      <div class="scope-desc">${esc(OAUTH_SCOPES[s] || '')}</div></div>
    </div>`,
    )
    .join('');

  const data = {
    client_id: params.get('client_id') || '',
    redirect_uri: params.get('redirect_uri') || '',
    response_type: params.get('response_type') || 'code',
    scope: params.get('scope') || '',
    state: params.get('state') || '',
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || 'S256',
  };

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Authorize — Gothwad</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #ffffff; --card: #ffffff; --text: #202124; --muted: #5f6368;
    --border: #dadce0; --chip: #f8f9fa; --link: #1a73e8; --blue: #1a73e8;
    --blue-hover: #1765cc; --shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131314; --card: #1e1f20; --text: #e3e3e3; --muted: #9aa0a6;
      --border: #444746; --chip: #131314; --link: #8ab4f8; --blue: #8ab4f8;
      --blue-hover: #aecbfa; --shadow: 0 1px 3px rgba(0,0,0,.5);
    }
  }
  body { font-family: 'Google Sans', Roboto, system-ui, sans-serif; background: var(--bg); color: var(--text);
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 28px; padding: 40px 34px;
          max-width: 450px; width: 100%; box-shadow: var(--shadow); position: relative; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 22px; }
  .brand img { width: 48px; height: 48px; border-radius: 50%; }
  .brand span { font-size: 22px; color: var(--muted); font-weight: 400; }
  h1 { font-size: 22px; font-weight: 400; text-align: center; letter-spacing: 0; }
  .sub { text-align: center; color: var(--muted); font-size: 14px; margin: 8px 0 22px; }
  .user { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--chip);
          border: 1px solid var(--border); border-radius: 100px; margin-bottom: 12px; }
  .user .av { width: 40px; height: 40px; border-radius: 50%; background: var(--blue);
              color: var(--card); font-weight: 500; font-size: 15px; display: flex; align-items: center; justify-content: center; }
  .user .n { font-size: 14px; font-weight: 500; } .user .e { font-size: 12px; color: var(--muted); }
  .label { font-size: 13px; font-weight: 500; color: var(--text); margin: 14px 0 10px; }
  .scope { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--chip);
           border: 1px solid var(--border); border-radius: 16px; margin-bottom: 8px; }
  .scope-icon { width: 36px; height: 36px; border-radius: 50%; background: var(--card); border: 1px solid var(--border);
                display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .scope-name { font-size: 13px; font-weight: 500; } .scope-desc { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .note { background: var(--chip); border: 1px solid var(--border); color: var(--muted);
          border-radius: 16px; padding: 12px 14px; font-size: 12px; line-height: 1.55; margin: 16px 0; }
  .err { background: rgba(217,48,37,0.08); border: 1px solid rgba(217,48,37,0.35); color: #d93025;
         border-radius: 16px; padding: 11px 13px; font-size: 12px; margin-bottom: 14px; display: none; }
  .row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; margin-top: 6px; }
  .btn { padding: 12px 18px; border-radius: 100px; border: none; font-size: 14px; font-weight: 500;
         font-family: inherit; cursor: pointer; width: 100%; transition: background 0.15s; }
  .btn-ghost { background: transparent; color: var(--blue); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--chip); }
  .btn-primary { background: var(--blue); color: #fff; }
  .btn-primary:hover { background: var(--blue-hover); box-shadow: var(--shadow); }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
             border-top-color: #fff; border-radius: 50%; animation: sp 0.7s linear infinite; vertical-align: -2px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  @media (prefers-color-scheme: dark) { .btn-primary { color: #062e6f; } }
</style></head>
<body>
  <div class="card">
    <div class="brand"><img src="/favicon.ico" id="brand-icon" alt="Gothwad" /><span>Gothwad</span></div>
    <h1>${esc(client.name)} wants access to your account</h1>
    <p class="sub">Sign in with your Gothwad Account</p>

    <div class="user">
      <div class="av">${esc(initials)}</div>
      <div><div class="n">${esc(displayName)}</div>
      <div class="e">${esc(username)}@${esc(env.APP_DOMAIN)}</div></div>
    </div>
    <p class="sub" style="margin-top:-8px;margin-bottom:14px;">
      <a href="${esc(env.AUTH_HUB_URL)}/signin?choose=1&amp;next=${encodeURIComponent(authorizeUrl || '')}"
         style="color:var(--link);text-decoration:none;font-weight:500;">Use another account</a>
    </p>

    <div class="label">This will allow the app to:</div>
    ${scopeItems}

    <div class="note">Gothwad never shares your password with this app.
      You can remove access anytime from <b>My Account → Security</b>.</div>

    <div class="err" id="err"></div>
    <div class="row">
      <button class="btn btn-ghost" id="deny">Cancel</button>
      <button class="btn btn-primary" id="allow">Continue</button>
    </div>
  </div>
<script nonce="${nonce}">
  document.getElementById('brand-icon').addEventListener('error', (event) => { event.target.style.display = 'none'; });
  const data = ${JSON.stringify(data).replace(/</g, '\\u003c')};
  async function decide(approved) {
    const btn = document.getElementById(approved ? 'allow' : 'deny');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (approved ? 'Authorizing…' : 'Denying…');
    try {
      const res = await fetch('/api/oauth/decision', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, ...data }),
      });
      const out = await res.json();
      if (!res.ok || !out.redirect_url) throw new Error(out.error || 'Authorization failed');
      location.href = out.redirect_url;
    } catch (e) {
      const err = document.getElementById('err');
      err.textContent = e.message; err.style.display = 'block';
      btn.disabled = false; btn.textContent = approved ? 'Allow access' : 'Deny';
    }
  }
  document.getElementById('allow').onclick = () => decide(true);
  document.getElementById('deny').onclick = () => decide(false);
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
      'X-Frame-Options': 'DENY',
    },
  });
}
