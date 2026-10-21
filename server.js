import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalD1 } from './tools/local-d1.mjs';
import workerModule from './cloudflare-worker/src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const WEB_ROOT = path.join(__dirname, 'web');
const DB_FILE = process.env.LOCAL_D1_PATH || path.join(__dirname, '.local-d1.sqlite');

// Real persistent SQLite engine matching Cloudflare D1 (`env.DB`) 100%!
const localDb = createLocalD1(DB_FILE);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);

  // ---------------- /api/* & /oauth/* -> in-process Cloudflare Worker + Local D1
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const proto = req.headers['x-forwarded-proto'] || 'http';
      const origin = `${proto}://${req.headers.host || `localhost:${PORT}`}`;
      const webReq = new Request(`${origin}${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
        duplex: 'half',
      });

      const env = {
        DB: localDb,
        APP_DOMAIN: process.env.APP_DOMAIN || 'gothwadtech.com',
        AUTH_HUB_URL: process.env.AUTH_HUB_URL || origin,
        API_DOMAIN: process.env.API_DOMAIN || '',
        DEV_MODE: process.env.DEV_MODE || 'true',
        JWT_SECRET: process.env.JWT_SECRET || 'dev-only-jwt-secret-key',
        MAIL_INTERNAL_TOKEN: process.env.MAIL_INTERNAL_TOKEN || 'dev-mail-internal-token',
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
      };

      const webRes = await workerModule.fetch(webReq, env);
      res.statusCode = webRes.status;
      webRes.headers.forEach((v, k) => {
        if (k.toLowerCase() !== 'set-cookie') res.setHeader(k, v);
      });
      const cookies = webRes.headers.getSetCookie?.() || [];
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      const resBuf = await webRes.arrayBuffer();
      res.end(Buffer.from(resBuf));
      return;
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }
  }

  // ---------------- static files from web/ (+ Google-style `/u/<n>/me` rewrites)
  const uMatch = url.pathname.match(/^\/u\/\d+(?:\/me)?\/?$/);
  const rel = uMatch ? 'me/index.html' : url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const base = path.join(WEB_ROOT, rel);

  const candidates = [base, path.join(base, 'index.html'), `${base}.html`];
  let filePath = null;
  for (const c of candidates) {
    if (!path.resolve(c).startsWith(WEB_ROOT)) continue;
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      filePath = c;
      break;
    }
  }

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1 style="font-family:sans-serif;color:#e6edf3;background:#0d1117;padding:40px;margin:0;height:100vh;">404 — Not found<br><br><a href="/signin" style="color:#2f80ed;font-size:16px;">← Go to Gothwad Sign In</a></h1>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store, max-age=0',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`🔥 Gothwad Accounts (100% Cloudflare D1 Native) running on http://${HOST}:${PORT}`);
  console.log(`🗄️  Local SQLite D1 database: ${DB_FILE}`);
  console.log(`📁 Serving web/ directory (/signin · /signup · /me)`);
});
