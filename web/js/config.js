/**
 * =============================================================================
 * GOTHWAD CONFIG — SINGLE DOMAIN CONFIGURATION POINT (Rule #1)
 * =============================================================================
 * Update only these values when changing domains — no domain string is
 * hardcoded anywhere in runtime code. Backend domain configuration lives in
 * `cloudflare-worker/wrangler.toml`.
 */

export const GOTHWAD_CONFIG = {
  /**
   * Public base URL of the Accounts Cloudflare Worker API.
   *
   * - Leave empty ("") when `/api/*` is routed on the same origin as the frontend
   *   (recommended for `accounts.<domain>/api/*` and local dev server).
   * - Otherwise set explicitly, e.g. "https://api.example.com".
   */
  API_URL: '',

  /**
   * Root ecosystem domain used to format display emails in the UI
   * (authoritative email is always derived server-side as `username@APP_DOMAIN`).
   */
  APP_DOMAIN: 'gothwadtech.com',
};

/** Builds a full API endpoint URL, e.g. apiUrl('/auth/me') -> "/api/auth/me" */
export function apiUrl(path) {
  const base = (GOTHWAD_CONFIG.API_URL || '').replace(/\/+$/, '');
  return `${base}/api${path}`;
}

/** Formats the user's primary ecosystem email address: `username@APP_DOMAIN` */
export function gothwadEmail(username) {
  return `${username}@${GOTHWAD_CONFIG.APP_DOMAIN}`;
}
