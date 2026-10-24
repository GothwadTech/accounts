/**
 * =============================================================================
 * GOTHWAD ACCOUNTS — 100% CLOUDFLARE NATIVE AUTH & OAUTH 2.0 WORKER ENTRYPOINT
 * =============================================================================
 * Modular Worker router (< 120 lines) dispatching cleanly across cohesive
 * domain modules while preserving 100% public re-export compatibility:
 *   - `types.ts`                  — D1, R2, Env & Multi-Account (`u/0..5`) models
 *   - `db.ts`                     — Cold-start WeakMap D1 bootstrap & error isolation
 *   - `http.ts`                   — JSON/Form parsers, validators & CORS
 *   - `crypto.ts`                 — PBKDF2-SHA256, SHA-256 tokens & HS256 JWTs
 *   - `cookies.ts`                — Subdomain SSO cookies (`a`..`f`) & CSRF checks
 *   - `users.ts`                  — Account lookup, profile formatting & Resend mail
 *   - `sessions.ts`               — Atomic rotation, `authuser` & multi-tab resilience
 *   - `browser-slots.ts`          — Browser slot inspection, ordering & sign-in cookies
 *   - `oauth-helpers.ts`          — S256 PKCE & OAuth consent UI renderer
 *   - `routes/public-internal.ts` — `/internal/usernames/*`, `/avatars/*`, `/health`
 *   - `routes/auth-entry.ts`      — `/auth/check-*`, `/auth/signup`
 *   - `routes/auth-session.ts`    — `/auth/signin`, `/auth/signout`, `/auth/refresh`
 *   - `routes/auth-switch.ts`     — `/auth/accounts`, `/auth/switch` (`GET`/`POST`), slot signout
 *   - `routes/auth-accounts.ts`   — `/auth/me`, `/auth/forgot-password`, `/auth/reset-password`
 *   - `routes/auth-profile.ts`    — `/auth/update-profile`, `/auth/sessions`, `/auth/avatar`, `/auth/export`, `/auth/delete-account`
 *   - `routes/oauth.ts`           — `/oauth/*` OAuth 2.0 + S256 PKCE provider endpoints
 * =============================================================================
 */

import type { Env } from './types.ts';
import { DatabaseUnavailableError, getDb, OAuthDatabaseError, oauthQuery } from './db.ts';
import { apiError, buildCorsHeaders, json } from './http.ts';
import { handleInternalRoute, handlePublicRoute } from './routes/public-internal.ts';
import { handleAuthEntryRoute } from './routes/auth-entry.ts';
import { handleAuthSessionRoute } from './routes/auth-session.ts';
import { handleAuthSwitchRoute } from './routes/auth-switch.ts';
import { handleAuthAccountsRoute } from './routes/auth-accounts.ts';
import { handleAuthProfileRoute } from './routes/auth-profile.ts';
import { handleOAuthRoute } from './routes/oauth.ts';

export type {
  D1Meta,
  D1Result,
  D1PreparedStatement,
  D1Database,
  R2ObjectBody,
  R2Bucket,
  Env,
  AccountSlot,
  AccountCookieEntry,
  PublicAccountSummary,
} from './types.ts';
export { ACCOUNT_SLOTS, ACCOUNTS_COOKIE_NAME, ACTIVE_COOKIE_NAME } from './types.ts';
export { buildCorsHeaders } from './http.ts';
export { hashPassword, verifyPassword, issueSessionAccessToken } from './crypto.ts';
export {
  cookieDomain,
  isAccountSlot,
  slotCookieName,
  signAccountsCookieValue,
  verifyAccountsCookieValue,
  isTrustedGothwadOrigin,
  verifyCsrfOrigin,
  resolveSafeRedirectTarget,
} from './cookies.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const route = pathname.startsWith('/api') ? pathname.slice(4) : pathname;

    // 1. Server-to-Server Internal Lookup (no CORS, no cookies, Cache-Control: no-store)
    const internalRes = await handleInternalRoute(request, env, route);
    if (internalRes) return internalRes;

    const corsHeaders = buildCorsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    let oauthCookies: string[] = [];
    const withCors = (res: Response, newCookies: string[] = oauthCookies): Response => {
      corsHeaders.forEach((v, k) => res.headers.set(k, v));
      for (const cookie of newCookies) res.headers.append('Set-Cookie', cookie);
      if (route.startsWith('/auth/') || route.startsWith('/oauth/')) {
        res.headers.set('Cache-Control', 'no-store');
        res.headers.set('Pragma', 'no-cache');
      }
      return res;
    };

    try {
      // 2. Public Avatars & Health Check
      const publicRes = await handlePublicRoute(request, url, env, route, withCors);
      if (publicRes) return publicRes;

      const db = route.startsWith('/oauth/')
        ? await oauthQuery(() => getDb(env))
        : await getDb(env);

      // 3. Auth Entry, Session, Multi-Account Switcher, Profile & OAuth 2.0 Routes
      return (
        (await handleAuthEntryRoute(request, url, db, env, route, withCors)) ??
        (await handleAuthSessionRoute(request, url, db, env, route, withCors)) ??
        (await handleAuthSwitchRoute(request, url, db, env, route, withCors)) ??
        (await handleAuthAccountsRoute(request, db, env, route, withCors)) ??
        (await handleAuthProfileRoute(request, db, env, route, withCors)) ??
        (await handleOAuthRoute(request, url, db, env, route, withCors, (c) => {
          oauthCookies = c;
        })) ??
        withCors(apiError('Endpoint not found', 404))
      );
    } catch (err: any) {
      if (err instanceof OAuthDatabaseError) {
        return withCors(
          json(
            {
              error: 'temporarily_unavailable',
              error_description: 'OAuth storage is unavailable. Please try again later.',
            },
            503,
          ),
        );
      }
      if (err instanceof DatabaseUnavailableError) {
        return withCors(json({ error: 'service_unavailable', message: err.message }, 503));
      }
      console.error('Worker error:', err);
      return withCors(apiError('Internal server error', 500));
    }
  },
};
