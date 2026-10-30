/** Parsed origin policy shared by CORS, redirects, and browser mutation guards. */
import { authenticatedProxy } from './sso-policy.ts';
import type { Env } from './types.ts';

export function isTrustedOrigin(
  raw: string,
  request: Request,
  env: Env,
  allowPath = false,
): boolean {
  if (!raw || raw === 'null') return false;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!allowPath && raw !== parsed.origin) return false;

  const host = parsed.hostname.toLowerCase();
  const requestHost = new URL(request.url).hostname;
  const loopback = host === 'localhost' || host === '127.0.0.1';
  const localRequest = requestHost === 'localhost' || requestHost === '127.0.0.1';
  const development = env.DEV_MODE === 'true';
  // Production configuration cannot accidentally allow plain-HTTP remote origins.
  if (parsed.protocol !== 'https:' && !(development || (loopback && localRequest))) return false;
  if (loopback) return development || localRequest;

  const extra = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (extra.includes(parsed.origin)) return true;
  try {
    if (env.AUTH_HUB_URL && new URL(env.AUTH_HUB_URL).origin === parsed.origin) return true;
  } catch { /* Invalid configuration never broadens access. */ }

  const domain = (env.APP_DOMAIN || '').trim().toLowerCase();
  // Explicit, audited first-party services. Unknown or nested siblings are not trusted.
  const services = ['', 'accounts', 'api', 'mail', 'meet', 'drive', 'notes', 'calendar',
    'contacts', 'kiwistore', 'kiwiconsole', 'kiwiadmin', 'kiwiapp'];
  return !!domain && !parsed.port && services.some(service =>
    parsed.origin === `https://${service ? service + '.' : ''}${domain}`);
}

/** Cookie-bearing writes require trusted browser evidence or authenticated proxy transport. */
export function isUnsafeBrowserMutation(request: Request, env: Env): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false;
  const origin = request.headers.get('Origin');
  if (origin !== null) return !isTrustedOrigin(origin, request, env);
  const referer = request.headers.get('Referer');
  if (referer !== null) return !isTrustedOrigin(referer, request, env, true);
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return true;
  if (authenticatedProxy(request, env)) return false;
  // OAuth exchange uses PKCE/client authentication, never a browser session cookie.
  const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/, '');
  if (path === '/oauth/token' && !fetchSite) return false;
  return true;
}
