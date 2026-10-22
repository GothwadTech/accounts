/**
 * =============================================================================
 * HTTP RESPONSES, BODY PARSERS, VALIDATORS & CORS HELPERS
 * =============================================================================
 */

import type { Env } from './types.ts';

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'assets', 'mail', 'email', 'smtp', 'imap', 'pop',
  'support', 'help', 'root', 'security', 'billing', 'legal', 'abuse', 'postmaster',
  'webmaster', 'hostmaster', 'noreply', 'no-reply', 'donotreply', 'www', 'web', 'ftp',
  'cdn', 'static', 'status', 'dev', 'test', 'staging', 'gothwad', 'gothwadtech',
  'login', 'signin', 'signup', 'logout', 'account', 'accounts', 'auth', 'oauth',
  'me', 'everyone', 'team', 'official', 'pay', 'payments', 'wallet', 'store', 'shop',
]);

export const CORE_GOTHWAD_SERVICES = new Set([
  'gothwad-meet', 'gothwad-mail', 'kiwi-store', 'gothwad-drive',
  'gothwad-notes', 'gothwad-calendar', 'gothwad-contacts',
]);

export const GENDER_VALUES = ['Male', 'Female', 'Other', 'Rather not say'];

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

export function apiError(message: string, status = 400, extraHeaders?: HeadersInit): Response {
  return json({ error: message }, status, extraHeaders);
}

export function internalJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    return (await request.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

export async function readFormOrJson(request: Request): Promise<Record<string, any>> {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const out: Record<string, string> = {};
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return readJson(request);
}

export function parseJsonStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/.test(username);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function identifierLooksLikePhone(raw: string): boolean {
  const digitsOnly = raw.replace(/[\s\-()]/g, '');
  return /^(\+)?[0-9]{7,15}$/.test(digitsOnly);
}

export function usernameFromIdentifier(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return lower.includes('@') ? (lower.split('@')[0] || '') : lower;
}

export function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin') || '';
  const rootDomain = env.APP_DOMAIN;

  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowed =
    origin.endsWith(`.${rootDomain}`) ||
    origin === `https://${rootDomain}` ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    extra.includes(origin);

  if (allowed && origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Gothwad-Refresh, X-Gothwad-Authuser',
    );
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}
