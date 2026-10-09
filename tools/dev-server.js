/**
 * =============================================================================
 * DEV SERVER — local development ke liye (never deploy!)
 * =============================================================================
 * Yeh 2 kaam karta hai:
 *   1. `web/` folder ki static files serve karta hai (index.html, css, js...)
 *   2. `/api/*` requests ko Cloudflare Worker (wrangler dev) par proxy karta hai
 *
 * Isse frontend aur API SAME ORIGIN par chalte hain → koi CORS issue nahi.
 *
 * Usage:
 *   node tools/dev-server.js
 *   → Website:  http://localhost:3000
 *   → API:      http://localhost:3000/api/*  (proxy → http://127.0.0.1:8787)
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
const EXAMPLES_ROOT = path.join(__dirname, '..', 'examples');

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

  // ------------------------------------ /api/* + /oauth/* → Worker proxy
  // /oauth/* bhi proxy hota hai taaki OAuth apps local dev mein bhi
  // same-origin se Worker ke standard endpoints use kar sakein.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) {
    const target = new URL(url.pathname + url.search, WORKER_URL);
    const proxyReq = http.request(
      target,
      {
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers); // Set-Cookie bhi pass through
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API not reachable (${WORKER_URL}): ${err.message}` }));
    });
    req.pipe(proxyReq);
    return;
  }

  // ------------------------------------- static files (web/ + /examples/)
  const isExample = url.pathname.startsWith('/examples/');
  const root = isExample ? EXAMPLES_ROOT : WEB_ROOT;
  // '/examples/...' → EXAMPLES_ROOT ke andar '...'
  const relPath = isExample ? url.pathname.slice('/examples/'.length) : (url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  let filePath = path.join(root, relPath);

  // Directory traversal se bachav: allowed root ke bahar access na ho
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || stat.isDirectory()) {
      // Unknown path → 404 page (simple)
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1 style="font-family:sans-serif">404 — Not found</h1><p><a href="/">← Home</a></p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🔥 Gothwad dev server ready!');
  console.log(`     Website:  http://localhost:${PORT}`);
  console.log(`     API:      http://localhost:${PORT}/api/health  → ${WORKER_URL}`);
  console.log('');
  console.log('  (Worker chalana mat bhoolo: cd cloudflare-worker && npx wrangler dev)');
  console.log('');
});
