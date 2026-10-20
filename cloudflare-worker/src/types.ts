/**
 * =============================================================================
 * SHARED WORKER TYPES — D1, R2, Env Bindings & Multi-Account Session Models
 * =============================================================================
 */

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = Record<string, any>> {
  success: boolean;
  results: T[];
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, any>>(colName?: string): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface R2ObjectBody {
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
  httpEtag?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface Env {
  /** Primary Cloudflare D1 SQLite database binding (`accounts`) */
  DB: D1Database;
  /** Optional Cloudflare R2 bucket for avatars; falls back to D1 `user_avatars` automatically */
  AVATARS_BUCKET?: R2Bucket;
  /** Root domain, e.g. "gothwadtech.com" — email is always derived: username@APP_DOMAIN */
  APP_DOMAIN: string;
  /** Public URL of Accounts frontend, e.g. "https://accounts.gothwadtech.com" */
  AUTH_HUB_URL: string;
  /** Dedicated Worker Custom Domain for server-to-server calls, e.g. "api.gothwadtech.com" */
  API_DOMAIN?: string;
  /** Strong random secret for signing HS256 Session & OAuth JWTs (`wrangler secret put JWT_SECRET`) */
  JWT_SECRET?: string;
  /** Shared secret for Mail Worker -> Accounts internal lookup (`wrangler secret put MAIL_INTERNAL_TOKEN`) */
  MAIL_INTERNAL_TOKEN?: string;
  /** Optional Resend API key for outbound password-reset emails (`wrangler secret put RESEND_API_KEY`) */
  RESEND_API_KEY?: string;
  /** Optional sender address for Resend password-reset emails */
  RESEND_FROM?: string;
  /** "true" = local dev helpers (localhost OAuth URIs + dev reset link fallback). MUST be "false" in prod! */
  DEV_MODE?: string;
  /** Optional extra CORS origins (comma-separated) for local/preview testing */
  ALLOWED_ORIGINS?: string;
}

export const ACCOUNT_SLOTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
export type AccountSlot = (typeof ACCOUNT_SLOTS)[number];
export const ACCOUNTS_COOKIE_NAME = 'gothwad_accounts';
export const ACTIVE_COOKIE_NAME = 'gothwad_active';
export const MULTI_ACCOUNT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface AccountCookieEntry {
  slot: AccountSlot;
  username: string;
  firstName: string;
  lastName: string;
  addedAt: string;
  lastUsedAt: string;
}

export interface PublicAccountSummary {
  id: AccountSlot;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  lastUsedAt: string;
}

export interface SlotCredentials {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  remember: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  sessionId: string | null;
}

export interface VerifiedBrowserSlot {
  slot: AccountSlot;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  addedAt: string;
  lastUsedAt: string;
  creds: SlotCredentials;
  rotated: boolean;
}

export type ResponseWrapper = (res: Response, newCookies?: string[]) => Response;
