/** Explicit browser redirect destinations; keep aligned with the Worker SSO policy. */
import { GOTHWAD_CONFIG } from './config.js';
const services = ['', 'accounts', 'api', 'mail', 'meet', 'drive', 'notes', 'calendar',
  'contacts', 'kiwistore', 'kiwiconsole', 'kiwiadmin', 'kiwiapp'];
export function trustedRedirectOrigin(url) {
  if (url.username || url.password) return false;
  if (url.origin === location.origin) return true;
  if (url.protocol !== 'https:' || url.port) return false;
  const domain = GOTHWAD_CONFIG.APP_DOMAIN;
  return services.some(service => url.origin === `https://${service ? service + '.' : ''}${domain}`) ||
    (GOTHWAD_CONFIG.SSO_REDIRECT_ORIGINS || []).includes(url.origin);
}
