/**
 * =============================================================================
 * ⚠️  MOCK SUPABASE — LOCAL TEST HARNESS ONLY  ⚠️
 * =============================================================================
 * Yeh ek FAKE Supabase hai jo sirf local testing ke liye hai.
 * Real auth nahi — passwords memory file mein plain rehte hain!
 *
 * KABHI production mein deploy mat karna. Real system ke liye:
 *   docs/SETUP.md → STEP 1 (asli Supabase project banao)
 *
 * Purpose: bina internet/Supabase ke Gothwad auth ka poora flow test karna
 * (signup → login → dashboard → reset → sessions).
 *
 * Usage:
 *   node tools/mock-supabase.js        → http://127.0.0.1:8788
 *
 * Data: tools/.mock-data.json mein save hota hai (git-ignored).
 * Reset: file delete kar do.
 * =============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 8788);
const DATA_FILE = path.join(__dirname, '.mock-data.json');

// ------------------------------------------------------------------ storage
let db = { users: [], profiles: [], sessions: [], accessTokens: {}, refreshTokens: {}, tokenPairs: {},
  ecosystem_apps: [], app_authorizations: [], oauth_auth_codes: [], oauth_refresh_tokens: [] };

function seedApps() {
  // Real Supabase jaisa seed — schema.sql se
  const apps = [
    ['gothwad-mail', 'Gothwad Mail', 'Custom email + webmail', 'mail'],
    ['gothwad-drive', 'Gothwad Drive', 'Unlimited storage via Telegram', 'hard-drive'],
    ['gothwad-chat', 'Gothwad Chat', 'Messaging (GrixChat)', 'message-circle'],
    ['gothwad-notes', 'Gothwad Notes', 'Synced notes & lists', 'file-text'],
    ['gothwad-calendar', 'Gothwad Calendar', 'Events & reminders', 'calendar'],
    ['gothwad-browser', 'Gothwad Browser', 'Private browser + sync', 'compass'],
  ];
  for (const [id, name, description, icon] of apps) {
    if (!db.ecosystem_apps.some((a) => a.id === id)) {
      db.ecosystem_apps.push({
        id, client_id: id, name, description, icon,
        // DEV_MODE mein worker koi bhi localhost redirect accept karta hai.
        // Production: schema.sql ka UPDATE snippet dekho (docs/OAUTH.md).
        redirect_uris: [
          'http://localhost:3000/examples/sign-in-with-gothwad/callback.html',
          `https://${id.replace('gothwad-', '')}.example.com/auth/gothwad/callback`,
        ],
        is_verified: true,
        secret_hash: null, // public client (PKCE)
        created_at: new Date().toISOString(),
      });
    }
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { /* corrupt file → fresh start */ }
  // Table defaults (purane data files ke liye)
  db.ecosystem_apps = db.ecosystem_apps || [];
  db.app_authorizations = db.app_authorizations || [];
  db.oauth_auth_codes = db.oauth_auth_codes || [];
  db.oauth_refresh_tokens = db.oauth_refresh_tokens || [];
  db.tokenPairs = db.tokenPairs || {};
  seedApps();
}
function saveDb() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch { /* ignore */ }
}
loadDb();

const uid = () => crypto.randomUUID();
const token = () => crypto.randomBytes(24).toString('hex');
/** Har table ke liye default id (kuch tables code/token khud dete hain) */
function row_id(tableName) {
  if (tableName === 'oauth_auth_codes') return token();
  return uid();
}

// ------------------------------------------------------------- query helpers
/** PostgREST style filters parse karo: ?id=eq.123&user_id=eq.456&select=* */
function parseFilters(searchParams) {
  const filters = [];
  for (const [key, value] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const m = String(value).match(/^(eq|neq|gt|lt)\.(.*)$/);
    if (m) filters.push({ column: key, op: m[1], value: m[2] });
  }
  return filters;
}

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    const cell = row[column];
    if (op === 'eq') return String(cell) === String(value);
    if (op === 'neq') return String(cell) !== String(value);
    if (op === 'gt') return cell > value;
    if (op === 'lt') return cell < value;
    return true;
  });
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const [col, dir] = order.split('.');
  return [...rows].sort((a, b) => {
    const cmp = String(a[col]).localeCompare(String(b[col]));
    return dir === 'desc' ? -cmp : cmp;
  });
}

function send(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': res.req?.headers?.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Prefer',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Type',
  });
  res.end(body);
}

function authUserFromReq(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = db.accessTokens[auth];
  return userId ? db.users.find((u) => u.id === userId) : null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    aud: 'authenticated',
    email: u.email,
    user_metadata: u.user_metadata,
    app_metadata: { provider: 'email' },
    created_at: u.created_at,
  };
}

function makeSession(user) {
  const at = token();
  const rt = token();
  db.accessTokens[at] = user.id;
  db.refreshTokens[rt] = user.id;
  // Access ↔ Refresh link: logout par poora session revoke ho sake
  db.tokenPairs = db.tokenPairs || {};
  db.tokenPairs[at] = rt;
  return {
    access_token: at,
    refresh_token: rt,
    token_type: 'bearer',
    expires_in: 3600,
    user: publicUser(user),
  };
}

// ------------------------------------------------------------------- server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') return send(res, 204);

  let rawBody = '';
  req.on('data', (c) => { rawBody += c; });
  req.on('end', () => {
    let body = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* empty */ }

    try {
      // ============================================================ AUTH API

      // ---- Admin: create user (signup) ----
      if (pathname === '/auth/v1/admin/users' && req.method === 'POST') {
        if (db.users.some((u) => u.email === body.email)) {
          return send(res, 422, { msg: 'A user with this email address has already been registered' });
        }
        const user = {
          id: uid(),
          email: body.email,
          password: body.password, // ⚠️ mock hai, plain text (prod mein kabhi nahi!)
          user_metadata: body.user_metadata || {},
          created_at: new Date().toISOString(),
        };
        db.users.push(user);

        // Real Supabase jaisa trigger → profile auto-create
        const meta = user.user_metadata || {};
        db.profiles.push({
          id: user.id,
          username: (meta.username || body.email.split('@')[0]).toLowerCase(),
          first_name: meta.first_name || '',
          last_name: meta.last_name || '',
          recovery_email: meta.recovery_email || null,
          phone_number: meta.phone_number || null,
          avatar_url: null,
          two_factor_enabled: false,
          storage_used_bytes: 0,
          storage_limit_bytes: 16106127360,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        saveDb();
        return send(res, 200, publicUser(user));
      }

      // ---- Password grant (login) ----
      if (pathname === '/auth/v1/token' && req.method === 'POST') {
        const grant = url.searchParams.get('grant_type');

        if (grant === 'password') {
          const user = db.users.find((u) => u.email === body.email && u.password === body.password);
          if (!user) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
          return send(res, 200, makeSession(user));
        }

        if (grant === 'refresh_token') {
          // GRACE WINDOW (Supabase ke refresh_token_reuse_interval jaisa):
          // Agar koi purana refresh token rotate hone ke 60s ke andar dobara
          // aaye (parallel requests ki race!) to FAIL mat karo — wahi current
          // token pair de do. Isse ek hi request "jeetti" hai aur baaki sab
          // ko bhi valid session mil jaata hai.
          db.rotatedRefresh = db.rotatedRefresh || {};
          const grace = db.rotatedRefresh[body.refresh_token];
          if (grace && Date.now() - grace.at < 60000) {
            return send(res, 200, {
              access_token: grace.access_token,
              refresh_token: grace.refresh_token,
              token_type: 'bearer',
              expires_in: 3600,
              user: publicUser(db.users.find((u) => u.id === grace.user_id)),
            });
          }

          const userId = db.refreshTokens[body.refresh_token];
          const user = db.users.find((u) => u.id === userId);
          if (!user) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token' });
          // Rotation: purana refresh token hata do (real Supabase bhi yahi karta hai)
          delete db.refreshTokens[body.refresh_token];
          const session = makeSession(user);
          db.rotatedRefresh[body.refresh_token] = {
            at: Date.now(),
            user_id: user.id,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          };
          saveDb();
          return send(res, 200, session);
        }
        return send(res, 400, { error: 'unsupported_grant_type' });
      }

      // ---- Get current user ----
      if (pathname === '/auth/v1/user' && req.method === 'GET') {
        const user = authUserFromReq(req);
        if (!user) return send(res, 401, { msg: 'Invalid token' });
        return send(res, 200, publicUser(user));
      }

      // ---- Update user (reset/change password) ----
      if (pathname === '/auth/v1/user' && req.method === 'PUT') {
        const user = authUserFromReq(req);
        if (!user) return send(res, 401, { msg: 'Invalid token' });
        if (body.password) user.password = body.password;
        saveDb();
        return send(res, 200, publicUser(user));
      }

      // ---- Logout ----
      if (pathname === '/auth/v1/logout') {
        const auth = (req.headers.authorization || '').replace('Bearer ', '');
        // Poora session revoke: access token + uska linked refresh token
        // (real Supabase bhi refresh token family revoke karta hai)
        const pairedRt = db.tokenPairs?.[auth];
        if (pairedRt) {
          delete db.refreshTokens[pairedRt];
          delete db.tokenPairs[auth];
        }
        delete db.accessTokens[auth];
        saveDb();
        return send(res, 204);
      }

      // ---- Generate recovery link ----
      if (pathname === '/auth/v1/admin/generate_link' && req.method === 'POST') {
        const user = db.users.find((u) => u.email === body.email);
        if (!user) return send(res, 422, { msg: 'User not found' });

        const recoveryToken = token();
        db.accessTokens[recoveryToken] = user.id; // token se password reset chalega
        saveDb();

        const redirect = body.options?.redirect_to || 'http://localhost:3000/reset-password.html';
        return send(res, 200, {
          action_link: `${redirect}#access_token=${recoveryToken}&type=recovery`,
          email: user.email,
          recovery_token: recoveryToken,
        });
      }

      // ============================================================= REST API

      // ---- profiles ----
      if (pathname === '/rest/v1/profiles') {
        const filters = parseFilters(url.searchParams);

        if (req.method === 'GET') {
          return send(res, 200, applyOrder(db.profiles.filter((p) => matches(p, filters)), url.searchParams.get('order')));
        }

        if (req.method === 'PATCH') {
          const updated = [];
          for (const p of db.profiles) {
            if (matches(p, filters)) {
              Object.assign(p, body, { updated_at: new Date().toISOString() });
              updated.push(p);
            }
          }
          saveDb();
          return send(res, 200, updated);
        }
      }

      // ---- user_sessions ----
      if (pathname === '/rest/v1/user_sessions') {
        const filters = parseFilters(url.searchParams);

        if (req.method === 'GET') {
          return send(res, 200, applyOrder(db.sessions.filter((s) => matches(s, filters)), url.searchParams.get('order')));
        }

        if (req.method === 'POST') {
          const row = {
            id: uid(),
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            ...body,
          };
          db.sessions.push(row);
          saveDb();
          return send(res, 201, [row]);
        }

        if (req.method === 'DELETE') {
          db.sessions = db.sessions.filter((s) => !matches(s, filters));
          saveDb();
          return send(res, 204);
        }
      }

      // ---- Generic tables (ecosystem_apps, app_authorizations, oauth_*) ----
      if (pathname.startsWith('/rest/v1/')) {
        const tableName = pathname.slice('/rest/v1/'.length).split('/')[0];
        const table = db[tableName];
        if (!Array.isArray(table)) return send(res, 404, { msg: `Unknown table ${tableName}` });

        const filters = parseFilters(url.searchParams);

        if (req.method === 'GET') {
          return send(res, 200, applyOrder(table.filter((r) => matches(r, filters)), url.searchParams.get('order')));
        }
        if (req.method === 'POST') {
          const row = { id: row_id(tableName), created_at: new Date().toISOString(), ...body };
          table.push(row);
          saveDb();
          return send(res, 201, [row]);
        }
        if (req.method === 'PATCH') {
          const updated = [];
          for (const r of table) {
            if (matches(r, filters)) {
              Object.assign(r, body);
              updated.push(r);
            }
          }
          saveDb();
          return send(res, 200, updated);
        }
        if (req.method === 'DELETE') {
          db[tableName] = table.filter((r) => !matches(r, filters));
          saveDb();
          return send(res, 204);
        }
      }

      return send(res, 404, { msg: `Mock Supabase: no route for ${req.method} ${pathname}` });
    } catch (err) {
      return send(res, 500, { msg: String(err) });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🧪 Mock Supabase (TEST HARNESS ONLY — never deploy!)');
  console.log(`     Listening:  http://127.0.0.1:${PORT}`);
  console.log(`     Data file:  ${DATA_FILE}`);
  console.log('');
});
