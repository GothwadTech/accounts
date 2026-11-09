/** Explicit visual simulation: shared UI, fabricated data, no Worker, database, cookies or real authentication. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..'), web = path.join(root, 'web');

export function createVisualPreview(environment, settings) {
  if (environment.VISUAL_PREVIEW !== 'true' || environment.NODE_ENV === 'production' || environment.CI || environment.CF_PAGES || environment.WORKERS_CI) throw new Error('Visual simulation is local-only and explicitly opt-in.');
  if (!settings.LOCAL_PREVIEW_USERNAME || !settings.LOCAL_PREVIEW_PASSWORD) throw new Error('Private local preview configuration is required.');
  // Shared display state for one review session, not a browser identity or security boundary.
  let signedIn = false;
  const user = { id: 'visual-profile', username: settings.LOCAL_PREVIEW_USERNAME,
    first_name: settings.LOCAL_PREVIEW_FIRST_NAME || settings.LOCAL_PREVIEW_USERNAME, last_name: settings.LOCAL_PREVIEW_LAST_NAME || '',
    has_password: true, recovery_email: 'review@example.test', recovery_email_verified: false,
    password_changed_at: '2026-10-15T10:00:00Z', google_linked: false, two_factor_enabled: false,
    storage_used_bytes: 268435456, storage_limit_bytes: 5368709120, created_at: '2026-10-01T10:00:00Z' };
  const accounts = [{ id: 'a', authuser: 0, username: user.username, firstName: user.first_name, lastName: user.last_name }];
  const session = () => ({ ok: true, authenticated: true, user, authuser: 0, activeId: 'a', accounts });
  const fixtures = {
    '/api/auth/activity': { activity: [{ id: 'visual-event', type: 'signin', title: 'Signed in', detail: 'Chrome on Windows', created_at: '2026-11-06T02:00:00Z' }] },
    '/api/auth/sessions': { sessions: [{ id: 'visual-device', device_name: 'Desktop', browser: 'Chrome', os: 'Windows', is_current: true, last_active: '2026-11-06T02:00:00Z' }] },
    '/api/oauth/authorizations': { connected: [], apps: [] },
    '/api/auth/google/links': { user_id: user.id, links: [], limit: 3, has_password: true },
    '/api/auth/google/status': { enabled: false },
    '/api/auth/passkeys/list': { passkeys: [], rp_id: 'preview.example.test' },
    '/api/auth/mfa/status': { enabled: false, enrollment_available: true, recovery_codes_remaining: 0 },
  };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://visual.invalid');
      const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
      if (url.pathname.startsWith('/api/')) {
        let body = {}; let raw = '';
        if (req.method !== 'GET') {
          for await (const chunk of req) { raw += chunk; if (raw.length > 3 * 1024 * 1024) return json(413, { error: 'Input too large' }); }
          try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'Invalid input' }); }
        }
        if (url.pathname === '/api/auth/check-identifier') return json(200, { exists: true });
        if (url.pathname === '/api/auth/signin' && req.method === 'POST') {
          const identifier = String(body.identifier || '').split('@')[0].toLowerCase();
          if (identifier !== settings.LOCAL_PREVIEW_USERNAME.toLowerCase() || body.password !== settings.LOCAL_PREVIEW_PASSWORD) return json(401, { error: 'Incorrect password. Try again.' });
          signedIn = true;
          return json(200, session());
        }
        const active = signedIn;
        if (!active) return json(401, { authenticated: false, error: 'Please sign in first' });
        if (url.pathname === '/api/auth/me' || url.pathname === '/api/auth/accounts') return json(200, session());
        if (url.pathname.includes('signout')) { signedIn = false; return json(200, { ok: true }); }
        if (url.pathname === '/api/auth/update-profile' && req.method === 'POST') {
          for (const key of ['first_name', 'last_name', 'date_of_birth', 'gender', 'phone_number', 'avatar_url']) if (typeof body[key] === 'string') user[key] = body[key];
          return json(200, { ok: true, user });
        }
        if (url.pathname === '/api/auth/avatar' && req.method === 'POST' && typeof body.image_base64 === 'string' && body.image_base64.startsWith('data:image/jpeg;base64,') && body.image_base64.length < 2800000) {
          user.avatar_url = body.image_base64; return json(200, { ok: true, user });
        }
        if (req.method === 'GET' && fixtures[url.pathname]) return json(200, fixtures[url.pathname]);
        return json(409, { error: 'This visual preview does not perform real account or external-service actions.' });
      }
      const route = /^\/(?:u\/[0-5](?:\/me)?\/?|me\/?)?$/.test(url.pathname) ? '/me/index.html' : url.pathname;
      let file = path.resolve(web, '.' + decodeURIComponent(route));
      if (!file.startsWith(web + path.sep)) { res.writeHead(403).end(); return; }
      let content;
      try { content = await readFile(file); } catch { file = path.join(file, 'index.html'); content = await readFile(file); }
      const ext = path.extname(file);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--visual-preview')) throw new Error('Use npm run preview:ui.');
  const settings = parseEnv(await readFile(path.join(root, '.env.preview'), 'utf8'));
  createVisualPreview({ ...process.env, VISUAL_PREVIEW: 'true' }, settings).listen(Number(process.env.PORT || 3002), '0.0.0.0', () => console.log('Visual login/dashboard simulation on port ' + (process.env.PORT || 3002) + '. Not production authentication.'));
}
