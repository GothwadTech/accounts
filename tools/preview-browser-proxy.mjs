/** Temporary loopback HTTPS transport for realistic browser-cookie testing; never deploy. */
import https from 'node:https';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export async function previewBrowserProxy(origin, local, shells) {
  if (new URL(local).hostname !== '127.0.0.1') throw new Error('Browser test upstream must be loopback.');
  const root = mkdtempSync(path.join(tmpdir(), 'accounts-browser-tls-'));
  let server;
  try {
    const key = path.join(root, 'key.pem'), cert = path.join(root, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', key, '-out', cert, '-subj', '/CN=local-preview.test'], { stdio: 'ignore' });
    server = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
      const host = request.headers.host;
      if (shells.some(shell => new URL(shell).host === host)) {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(`<style>body{margin:0}iframe{display:block;width:100vw;height:100vh;border:0}</style><iframe title="Accounts preview" src="${origin}/signin/?form=1"></iframe>`);
        return;
      }
      if (host !== new URL(origin).host) {
        response.writeHead(404); response.end(); return; // No outbound provider/font requests.
      }
      // Model the private gateway reported by the owner without obtaining its token.
      if (request.headers['sec-fetch-dest'] === 'document') {
        response.writeHead(403); response.end('Simulated private preview: standalone access unavailable.'); return;
      }
      const upstream = http.request(local + request.url, {
        method: request.method, headers: { ...request.headers, host: new URL(local).host },
      }, source => {
        response.writeHead(source.statusCode, source.headers);
        source.pipe(response);
      });
      upstream.on('error', () => { response.writeHead(502); response.end('Local preview unavailable.'); });
      request.pipe(upstream);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    });
    return { port: server.address().port, close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      rmSync(root, { recursive: true, force: true });
    } };
  } catch (error) {
    server?.close(); rmSync(root, { recursive: true, force: true }); throw error;
  }
}
