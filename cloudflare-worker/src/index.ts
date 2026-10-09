/**
 * Gothwad Unified Auth - Cloudflare Worker
 * Handles Single Sign-On (SSO), cross-subdomain cookies (*.gothwadtech.com),
 * Supabase auth proxying, and OAuth 2.0 token issuance for the Gothwad Suite.
 */

export interface Env {
  ROOT_DOMAIN: string;
  AUTH_HUB_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const CORS_HEADERS = (origin: string, rootDomain: string) => {
  // Allow all subdomains of gothwadtech.com, localhost for dev
  const isAllowed =
    origin.endsWith(`.${rootDomain}`) ||
    origin === `https://${rootDomain}` ||
    origin.includes('localhost');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : `https://${rootDomain}`,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
  };
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const rootDomain = env.ROOT_DOMAIN || 'gothwadtech.com';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS(origin, rootDomain),
      });
    }

    // Router
    try {
      if (url.pathname === '/api/health') {
        return jsonResponse({ status: 'ok', service: 'gothwad-auth-worker', time: new Date().toISOString() });
      }

      // 1. Check Username Availability (e.g. username@gothwadtech.com)
      if (url.pathname === '/api/auth/check-username' && request.method === 'GET') {
        const username = url.searchParams.get('username')?.toLowerCase().trim();
        if (!username || username.length < 3) {
          return jsonResponse({ available: false, error: 'Username must be at least 3 characters' }, 400);
        }

        // Query Supabase profiles table for existing handle
        const supabaseRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`,
          {
            headers: {
              apikey: env.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
            },
          }
        );
        const data = (await supabaseRes.json()) as any[];
        const isAvailable = Array.isArray(data) && data.length === 0;

        return jsonResponse({
          available: isAvailable,
          username,
          full_email: `${username}@${rootDomain}`,
        });
      }

      // 2. Sign In (Issues wildcard *.gothwadtech.com session cookie)
      if (url.pathname === '/api/auth/signin' && request.method === 'POST') {
        const body = await request.json() as { identifier: string; password: string };
        const { identifier, password } = body;

        let email = identifier.trim().toLowerCase();
        if (!email.includes('@')) {
          email = `${email}@${rootDomain}`;
        }

        // Call Supabase Auth endpoint
        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email, password }),
        });

        const authData = await authRes.json() as any;
        if (!authRes.ok) {
          return jsonResponse({ error: authData.error_description || 'Invalid credentials' }, 401);
        }

        // Get user profile
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${authData.user.id}&select=*`,
          {
            headers: {
              apikey: env.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${authData.access_token}`,
            },
          }
        );
        const profiles = await profileRes.json() as any[];
        const profile = profiles[0] || null;

        // Set wildcard cookie for *.gothwadtech.com
        const cookieHeader = `gothwad_session=${authData.access_token}; Domain=.${rootDomain}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;

        const responseHeaders = new Headers(CORS_HEADERS(origin, rootDomain));
        responseHeaders.append('Set-Cookie', cookieHeader);

        return jsonResponse(
          {
            user: authData.user,
            profile,
            access_token: authData.access_token,
          },
          200,
          responseHeaders
        );
      }

      // 3. Verify Session across any Gothwad App
      if (url.pathname === '/api/auth/verify-session' && request.method === 'GET') {
        const cookieHeader = request.headers.get('Cookie') || '';
        const tokenMatch = cookieHeader.match(/gothwad_session=([^;]+)/);
        const authHeader = request.headers.get('Authorization');
        const token = tokenMatch ? tokenMatch[1] : authHeader?.replace('Bearer ', '');

        if (!token) {
          return jsonResponse({ authenticated: false, message: 'No active session found' }, 401);
        }

        // Verify with Supabase
        const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        });

        if (!userRes.ok) {
          return jsonResponse({ authenticated: false, message: 'Session expired' }, 401);
        }

        const userData = await userRes.json();
        return jsonResponse({ authenticated: true, user: userData });
      }

      // 4. Logout (Clears cross-subdomain cookie)
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const clearCookie = `gothwad_session=; Domain=.${rootDomain}; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
        const headers = new Headers(CORS_HEADERS(origin, rootDomain));
        headers.append('Set-Cookie', clearCookie);

        return jsonResponse({ success: true, message: 'Signed out of all Gothwad services' }, 200, headers);
      }

      // Fallback
      return jsonResponse({ error: 'Endpoint not found' }, 404);
    } catch (err: any) {
      return jsonResponse({ error: err.message || 'Worker server error' }, 500);
    }
  },
};

function jsonResponse(data: any, status = 200, customHeaders?: Headers) {
  const headers = customHeaders || new Headers();
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}
