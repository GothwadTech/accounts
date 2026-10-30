/** Persistent fixed-window abuse control. Cloudflare edge rules remain necessary. */
import type { D1Database, Env } from './types.ts';
import { authQuery } from './db.ts';
import { getSigningSecret, sha256Hex } from './crypto.ts';
import { json } from './http.ts';

type Policy = { group: string; limit: number; seconds: number };

export function authRateLimitPolicy(method: string, route: string): Policy | null {
  if (['GET', 'POST'].includes(method) && ['/auth/check-username', '/auth/check-identifier'].includes(route)) {
    return { group: 'discovery', limit: 120, seconds: 60 };
  }
  if (method !== 'POST') return null;
  if (route.startsWith('/auth/passkeys/')) return { group: 'passkeys', limit: 30, seconds: 300 };
  if (route.startsWith('/auth/mfa/')) return { group: 'mfa', limit: 30, seconds: 300 };
  switch (route) {
    case '/auth/signin': return { group: 'signin', limit: 60, seconds: 600 };
    case '/auth/signup': return { group: 'signup', limit: 10, seconds: 3600 };
    case '/auth/recovery-email/request': return { group: 'recovery-change', limit: 5, seconds: 900 };
    case '/auth/recovery-email/verify': return { group: 'recovery-verify', limit: 30, seconds: 900 };
    case '/auth/forgot-password': return { group: 'recovery', limit: 5, seconds: 900 };
    case '/auth/reset-password': return { group: 'reset', limit: 30, seconds: 900 };
    case '/auth/update-profile': return { group: 'profile-update', limit: 60, seconds: 600 };
    case '/auth/delete-account': return { group: 'account-delete', limit: 10, seconds: 600 };
    case '/auth/change-password': return { group: 'password-change', limit: 10, seconds: 600 };
    case '/oauth/token': return { group: 'oauth-token', limit: 120, seconds: 60 };
    default: return null;
  }
}

export async function enforceAuthRateLimit(
  request: Request,
  db: D1Database,
  env: Env,
  route: string,
  nowMs = Date.now(),
): Promise<Response | null> {
  const policy = authRateLimitPolicy(request.method, route);
  if (!policy) return null;
  const now = Math.floor(nowMs / 1000);
  const windowStart = Math.floor(now / policy.seconds) * policy.seconds;
  const expiresAt = windowStart + policy.seconds;
  // Only the Cloudflare-provided edge IP is used. Never trust X-Forwarded-For.
  // Headerless internal callers share one bucket instead of bypassing enforcement.
  const source = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown-source';
  const bucket = await sha256Hex(`${getSigningSecret(env)}\0auth-limit\0${policy.group}\0${source}\0${windowStart}`);

  return authQuery(async () => {
    // SQLite serializes this increment, including concurrent requests across isolates.
    const row = await db.prepare(
      `INSERT INTO auth_rate_limits (bucket, hits, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET hits = MIN(auth_rate_limits.hits + 1, ?)
       RETURNING hits`,
    ).bind(bucket, expiresAt, policy.limit + 1).first<{ hits: number }>();
    if (!row) throw new Error('Rate-limit counter unavailable');
    if (row.hits === 1) {
      await db.prepare(
        `DELETE FROM auth_rate_limits WHERE bucket IN (
           SELECT bucket FROM auth_rate_limits WHERE expires_at <= ? LIMIT 100
         )`,
      ).bind(now).run();
    }
    if (row.hits <= policy.limit) return null;
    return json(
      { error: 'rate_limited', message: 'Too many attempts. Please wait before trying again.' },
      429,
      { 'Retry-After': String(Math.max(1, expiresAt - now)), 'Cache-Control': 'no-store' },
    );
  });
}
