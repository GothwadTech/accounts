/**
 * =============================================================================
 * INTERNAL & PUBLIC EDGE ROUTES (`/internal/usernames/*`, `/avatars/*`, `/health`)
 * =============================================================================
 */

import type { Env, ResponseWrapper } from '../types.ts';
import { getDb } from '../db.ts';
import { apiError, internalJson, json } from '../http.ts';
import { sha256Hex, timingSafeEqual } from '../crypto.ts';

export async function handleInternalRoute(
  request: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  if (!route.startsWith('/internal/usernames/')) return null;

  if (request.method !== 'GET') {
    console.log('[internal/usernames] status=405');
    return internalJson({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!env.MAIL_INTERNAL_TOKEN) {
    console.error('[internal/usernames] MAIL_INTERNAL_TOKEN not configured');
    return internalJson({ error: 'server_not_configured' }, 500);
  }
  if (!providedToken) {
    console.log('[internal/usernames] status=401 (missing token)');
    return internalJson({ error: 'unauthorized' }, 401);
  }

  let authorized = false;
  try {
    authorized = await timingSafeEqual(providedToken, env.MAIL_INTERNAL_TOKEN);
  } catch {
    authorized = false;
  }
  if (!authorized) {
    console.log('[internal/usernames] status=401 (bad token)');
    return internalJson({ error: 'unauthorized' }, 401);
  }

  let rawUsername = route.slice('/internal/usernames/'.length);
  try {
    rawUsername = decodeURIComponent(rawUsername);
  } catch {
    return internalJson({ error: 'bad_username' }, 400);
  }

  const normalised = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalised)) {
    return internalJson({ error: 'bad_username' }, 400);
  }

  try {
    const db = await getDb(env);
    const row = await db
      .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
      .bind(normalised)
      .first();
    const exists = !!row?.id;
    console.log(`[internal/usernames] status=200 exists=${exists}`);
    return internalJson({ exists }, 200);
  } catch (e) {
    console.error('[internal/usernames] DB exception', e);
    return internalJson({ error: 'internal_error' }, 500);
  }
}

export async function handlePublicRoute(
  request: Request,
  url: URL,
  env: Env,
  route: string,
  withCors: ResponseWrapper,
): Promise<Response | null> {
  if (route.startsWith('/avatars/') && request.method === 'GET') {
    const userId = decodeURIComponent(route.slice('/avatars/'.length)).trim();
    if (!userId || userId.includes('/')) {
      return withCors(apiError('Not found', 404));
    }

    const edgeCache: Cache | undefined =
      typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache })?.default : undefined;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    if (edgeCache) {
      const cached = await edgeCache.match(cacheKey).catch(() => undefined);
      if (cached) {
        const clientEtag = request.headers.get('If-None-Match');
        if (clientEtag && clientEtag === cached.headers.get('ETag')) {
          return new Response(null, { status: 304, headers: cached.headers });
        }
        return cached;
      }
    }

    let bodyBytes: Uint8Array | null = null;
    let mimeType = 'image/jpeg';
    let etag = '';

    if (env.AVATARS_BUCKET) {
      const obj = await env.AVATARS_BUCKET.get(`avatars/${userId}`);
      if (obj) {
        bodyBytes = new Uint8Array(await obj.arrayBuffer());
        mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
        etag = obj.httpEtag || `"${(await sha256Hex(bodyBytes)).slice(0, 16)}"`;
      }
    }

    if (!bodyBytes) {
      const db = await getDb(env);
      const row = await db
        .prepare('SELECT mime_type, data, etag FROM user_avatars WHERE user_id = ? LIMIT 1')
        .bind(userId)
        .first();
      if (row?.data) {
        bodyBytes =
          row.data instanceof Uint8Array
            ? row.data
            : row.data instanceof ArrayBuffer
              ? new Uint8Array(row.data)
              : Uint8Array.from(row.data as Iterable<number>);
        mimeType = String(row.mime_type || 'image/jpeg');
        etag = `"${String(row.etag || '')}"`;
      }
    }

    if (!bodyBytes) {
      return withCors(apiError('Avatar not found', 404));
    }

    const headers = new Headers({
      'Content-Type': mimeType,
      ETag: etag,
      'Cache-Control': url.searchParams.has('v')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    if (request.headers.get('If-None-Match') === etag) {
      return withCors(new Response(null, { status: 304, headers }));
    }

    const response = withCors(new Response(bodyBytes as unknown as BodyInit, { status: 200, headers }));
    if (edgeCache && url.searchParams.has('v')) {
      await edgeCache.put(cacheKey, response.clone()).catch(() => undefined);
    }
    return response;
  }

  if (route === '/health' && request.method === 'GET') {
    const db = await getDb(env);
    const [tableRow, appRow] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
        .first<{ cnt: number }>(),
      db.prepare("SELECT COUNT(*) AS cnt FROM ecosystem_apps WHERE redirect_uris != '[]'").first<{ cnt: number }>(),
    ]);
    return withCors(
      json({
        status: 'ok',
        service: 'gothwad-auth-api',
        engine: 'cloudflare-d1-native',
        tables: Number(tableRow?.cnt ?? 0),
        oauth_apps: Number(appRow?.cnt ?? 0),
        time: new Date().toISOString(),
      }),
    );
  }

  return null;
}
