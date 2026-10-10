import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const WEB_ROOT = path.join(__dirname, 'web');

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

// Optional Worker import (agar available ho to /api handle karega)
let workerModule = null;
try {
  const mod = await import('./cloudflare-worker/src/index.ts');
  workerModule = mod.default || mod;
} catch (e) {
  console.log('[Dev] Worker not loaded in-process, running static server:', e?.message);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);

  // ---------------- /api/* & /oauth/* worker handling (if available)
  if (workerModule && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/'))) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const webReq = new Request(url.href, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
        duplex: 'half',
      });

      const env = {
        APP_DOMAIN: process.env.APP_DOMAIN || 'gothwadtech.com',
        AUTH_HUB_URL: process.env.AUTH_HUB_URL || `http://${req.headers.host || 'localhost:3000'}`,
        SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:8788',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'mock-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key',
        DEV_MODE: process.env.DEV_MODE || 'true',
        JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret',
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
    }
  }

  // ---------------- static files from web/
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const base = path.join(WEB_ROOT, rel);

  // Pretty URLs: /signin → web/signin/index.html → web/signin.html → exact file
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
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`🔥 Gothwad Accounts running on http://${HOST}:${PORT}`);
  console.log(`📁 Serving web/ directory`);
});
