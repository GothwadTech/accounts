/**
 * =============================================================================
 * GOTHWAD CONFIG — THE ONLY FILE TO EDIT WHEN DOMAIN CHANGES! (Rule #1)
 * =============================================================================
 * Yahan sirf values badlo — code ke andar kahin bhi domain hardcoded nahi hai.
 * Worker (backend) ka domain config cloudflare-worker/wrangler.toml mein hai.
 */

export const GOTHWAD_CONFIG = {
  /**
   * Auth API (Cloudflare Worker) ka URL.
   *
   * - Production example: "https://api.gothwadtech.com"
   * - Khaali chhodo ("") agar API same origin par ho
   *   (local dev-server ya `/api` proxy setup) — tab /api/... relative call hota hai.
   *   Production mein bhi "" hi rakho jab Worker route
   *   `accounts.gothwadtech.com/api/*` par lagi ho (recommended) — same origin!
   *
   * YEH EK LINE production mein badalni hai — bas!
   */
  API_URL: '',

  /**
   * Root domain — sirf UI mein email dikhane ke liye
   * (real email Worker calculate karta hai: username@APP_DOMAIN).
   * Example: "gothwadtech.com" ya "gothwad.in"
   */
  APP_DOMAIN: 'gothwadtech.com',
};

/** Full API URL banata hai: apiUrl('/auth/me') → "https://api.example.com/api/auth/me" */
export function apiUrl(path) {
  const base = (GOTHWAD_CONFIG.API_URL || '').replace(/\/+$/, '');
  return `${base}/api${path}`;
}

/** UI ke liye Gothwad email: username@APP_DOMAIN */
export function gothwadEmail(username) {
  return `${username}@${GOTHWAD_CONFIG.APP_DOMAIN}`;
}
