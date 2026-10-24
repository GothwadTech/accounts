/** Local-only design preview. Serves the real shared widget with synthetic data. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const web = resolve(directory, '../../web');
const port = Number(process.env.PORT || 3010);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://preview.invalid');
  const previews = { '/': 'index.html', '/preview.js': 'preview.js', '/preview.css': 'preview.css' };
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end(); return; }
  const root = previews[pathname] ? directory : web;
  const file = previews[pathname] ? resolve(root, previews[pathname]) : resolve(root, `.${pathname}`);
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}${['.html', '.js', '.css'].includes(extname(file)) ? '; charset=utf-8' : ''}`, 'Cache-Control': 'no-store' });
    response.end(content);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Universal Account Menu preview listening on port ${port}`));
