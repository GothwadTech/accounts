/** Node-only Arena transport adapter. Production Worker cookies are never changed. */
import { arenaPreviewOrigin } from './preview-origin.mjs';

export function previewSetCookie(cookie, environment) {
  if (!arenaPreviewOrigin(environment) || !/^gothwad_[a-z_]+=/.test(cookie)) return cookie;
  const attributes = cookie.split(';').slice(1).map(part => part.trim().toLowerCase());
  // Never broaden parent-domain SSO cookies or drop server-only/HTTPS protections.
  if (attributes.some(part => part.startsWith('domain=')) || !attributes.includes('secure') ||
    !attributes.includes('httponly') || !attributes.includes('path=/')) {
    throw new Error('Embedded preview requires secure host-only authentication cookies.');
  }
  if (attributes.includes('samesite=none') && attributes.includes('partitioned')) return cookie;
  if (!attributes.includes('samesite=lax') || attributes.includes('partitioned')) {
    throw new Error('Unexpected authentication cookie policy in local preview.');
  }
  // CHIPS keeps the local session isolated to the embedding top-level site while
  // allowing normal HttpOnly cookie authentication inside its authorized iframe.
  // The exact-origin CSRF guard still runs; no token is exposed to frontend JS.
  return cookie.replace(/;\s*SameSite=Lax(?=;|$)/i, '; SameSite=None') + '; Partitioned';
}
