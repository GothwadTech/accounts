/** Dedicated server-only proxy authentication and cookie-only browser responses. */
import type { Env } from './types.ts';
import { timingSafeBytesEqual } from './crypto.ts';
export function authenticatedProxy(request: Request, env: Env): boolean {
  const configured = env.SSO_PROXY_TOKEN || '';
  const supplied = request.headers.get('X-Gothwad-Proxy-Token') || '';
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeBytesEqual(new TextEncoder().encode(supplied), new TextEncoder().encode(configured));
}
export function sessionResponse(request: Request, env: Env, data: Record<string, unknown>): Record<string, unknown> {
  // Explicit server authentication is required for the legacy non-browser credential contract.
  // A browser origin, referrer, or fetch-metadata header always forces cookie-only output.
  if (authenticatedProxy(request, env) && !request.headers.has('Origin') &&
    !request.headers.has('Referer') && !request.headers.has('Sec-Fetch-Site')) return data;
  const { access_token, refresh_token, session_id, ...publicData } = data;
  return publicData;
}
