/**
 * =============================================================================
 * DEV SERVER — Local development proxy server (do not deploy to production)
 * =============================================================================
 * Responsibilities:
 *   1. Serves static files from `web/` with clean URL resolution
 *      (`/signin` -> `web/signin/index.html`)
 *   2. Proxies `/api/*` and `/oauth/*` requests to the local Cloudflare Worker
 *      (`wrangler dev`) on the same origin without CORS issues.
 *
 * Usage:
 *   node tools/dev-server.js
 *   -> Website:  http://localhost:3000
 *
 * Optional environment variables:
 *   PORT=3000                       frontend port
 *   WORKER_URL=http://127.0.0.1:8787  local worker URL
 * =============================================================================
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const WEB_ROOT = path.join(import.meta.dirname, '..', 'web');

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

  // ------------------------------- /api/* + /oauth/* -> Worker proxy
  // Preserve Host header so the Worker resolves the exact incoming origin
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) {
    const target = new URL(url.pathname + url.search, WORKER_URL);
    const proxyReq = http.request(target, { method: req.method, headers: req.headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers); // pass through Set-Cookie headers
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

  // Pretty URLs: /signin -> signin/index.html -> signin.html -> exact file
  const candidates = [base, path.join(base, 'index.html'), `${base}.html`];
  let filePath = null;
  for (const c of candidates) {
    // Prevent directory traversal outside web/
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
  console.log('  (Make sure the local Worker is running: cd cloudflare-worker && npx wrangler dev)');
  console.log('');
});
