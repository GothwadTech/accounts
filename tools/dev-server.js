/**
 * =============================================================================
 * DEV SERVER — local development ke liye (never deploy!)
 * =============================================================================
 * Yeh 2 kaam karta hai:
 *   1. `web/` folder ki static files serve karta hai (pretty URLs ke saath:
 *      /signin → web/signin/index.html)
 *   2. `/api/*` aur `/oauth/*` requests ko Cloudflare Worker (wrangler dev)
 *      par proxy karta hai — same origin, koi CORS issue nahi.
 *
 * Usage:
 *   node tools/dev-server.js
 *   → Website:  http://localhost:3000
 *
 * Env vars (optional):
 *   PORT=3000          frontend port
 *   WORKER_URL=http://127.0.0.1:8787   worker ka address
 * =============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const WEB_ROOT = path.join(__dirname, '..', 'web');

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ------------------------------- /api/* + /oauth/* → Worker proxy
  // (Host header as-is jaata hai, taaki Worker ko sahi origin dikhe)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) {
    const target = new URL(url.pathname + url.search, WORKER_URL);
    const proxyReq = http.request(target, { method: req.method, headers: req.headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers); // Set-Cookie bhi pass through
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API not reachable (${WORKER_URL}): ${err.message}` }));
    });
    req.pipe(proxyReq);
    return;
  }

  // --------------------------------------------- static files (web/)
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const base = path.join(WEB_ROOT, rel);

  // Pretty URLs: /signin → signin/index.html → signin.html → exact file
  const candidates = [base, path.join(base, 'index.html'), `${base}.html`];
  let filePath = null;
  for (const c of candidates) {
    // Directory traversal se bachav: web/ ke bahar access na ho
    if (!path.resolve(c).startsWith(WEB_ROOT)) continue;
    if (fs.existsSync(c) && fs.statSync(c).isFile()) { filePath = c; break; }
  }

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1 style="font-family:sans-serif">404 — Not found</h1><p><a href="/signin">← Gothwad Accounts</a></p>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🔥 Gothwad dev server ready!');
  console.log(`     Website:  http://localhost:3000  (/signin · /signup · /me)`);
  console.log(`     API:      ${WORKER_URL}  (proxied at /api + /oauth)`);
  console.log('');
  console.log('  (Worker chalana mat bhoolo: cd cloudflare-worker && npx wrangler dev)');
  console.log('');
});
