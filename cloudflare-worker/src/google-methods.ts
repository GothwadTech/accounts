/** Shared Google method invariants. SQL expressions receive only server-owned identifiers. */
import type { D1Database, Env } from './types.ts';
import { GOOGLE_ISSUER } from './google-oidc.ts';
import { sendSecurityEmail } from './security-email.ts';
import { logActivity } from './users.ts';

export const GOOGLE_METHOD_LIMIT = 3;
export const googleLinksSnapshot = (user: string) => `(SELECT COALESCE(group_concat(id, ','), '') FROM
  (SELECT id FROM auth_google_methods WHERE user_id = ${user} AND issuer = '${GOOGLE_ISSUER}' ORDER BY id))`;
export async function googleMethodSnapshot(db: D1Database, userId: string): Promise<string> {
  return String((await db.prepare(`SELECT ${googleLinksSnapshot('?')} AS snapshot`).bind(userId).first())?.snapshot || '');
}
export async function googleMethods(db: D1Database, userId: string) {
  return (await db.prepare(`SELECT id, provider_email AS email, created_at FROM auth_google_methods
    WHERE user_id = ? AND issuer = ? ORDER BY created_at, id`).bind(userId, GOOGLE_ISSUER).all()).results || [];
}
export async function notifyGoogleChange(db: D1Database, env: Env, userId: string, action: 'added' | 'removed',
  email: string, previous: Record<string, any>[], request: Request): Promise<boolean> {
  let recovery: Record<string, any> | null = null, metadataLoaded = false;
  try {
    recovery = await db.prepare(`SELECT p.username, CASE WHEN v.email = p.recovery_email THEN v.email END AS email
      FROM profiles p LEFT JOIN verified_recovery_emails v ON v.user_id = p.id WHERE p.id = ?`).bind(userId).first();
    metadataLoaded = true;
  } catch { /* A notification lookup cannot turn a committed mutation into an error. */ }
  const recipients = new Set([...previous.map(row => String(row.email)), email, ...(recovery?.email ? [String(recovery.email)] : [])]);
  const address = recovery?.username ? `${recovery.username}@${env.APP_DOMAIN}` : 'your Gothwad Account';
  const delivered = await Promise.all([...recipients].map(to => sendSecurityEmail(env, to,
    `Google sign-in method ${action}`, `A Google sign-in method (${email}) was ${action} on ${address}.\n\n` +
    `If this was not you, open ${env.AUTH_HUB_URL} directly, review Security and sign out unknown devices. ` +
    'Never share passwords, verification codes or recovery codes.')));
  const sent = metadataLoaded && delivered.length > 0 && delivered.every(Boolean);
  await logActivity(db, userId, `google_method_${action}`, `Google sign-in method ${action}`,
    `${email}. ${sent ? 'Security email sent.' : 'Security email could not be delivered to every address.'}`, request);
  return sent;
}
