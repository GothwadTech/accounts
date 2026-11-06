/** Redacted local diagnostics; never record credentials, cookie values, URLs or account identity. */
import { arenaPreviewOrigin } from './preview-origin.mjs';

const knownName = /^gothwad_(?:sess_[a-f]|active|accounts|at|rt|sid)$/;
function cookieNames(raw, response = false) {
  return [...new Set((response ? raw : raw.split(';')).flatMap(part => {
    const name = part.split('=', 1)[0].trim();
    return knownName.test(name) ? [name] : [];
  }))].sort();
}

export function previewAuthTrace(request, pathname, status, cookies, environment) {
  const origin = arenaPreviewOrigin(environment);
  if (!origin || environment.LOCAL_PREVIEW_TRACE !== 'true') return null;
  if (!['/api/auth/signin', '/api/auth/me', '/api/auth/refresh', '/api/auth/signout'].includes(pathname) &&
    !/^\/u\/[0-5]\/me\/?$/.test(pathname)) return null;
  const suppliedOrigin = request.headers.origin;
  const selector = request.headers['x-gothwad-authuser'];
  const userAgent = request.headers['user-agent'] || '';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' :
    /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Other';
  return {
    time: new Date().toISOString(), method: request.method, path: pathname, status, browser,
    origin: suppliedOrigin === undefined ? 'absent' : suppliedOrigin === origin ? 'exact-preview' : 'other',
    selector: selector === undefined ? 'absent' : /^[0-5]$/.test(selector) ? selector : 'other',
    cookieHeaderPresent: !!request.headers.cookie,
    incoming: cookieNames(request.headers.cookie || ''), outgoing: cookieNames(cookies, true),
    outgoingCount: cookies.length,
    outgoingPartitioned: cookies.length > 0 && cookies.every(cookie => /;\s*Partitioned(?:;|$)/i.test(cookie)),
  };
}
