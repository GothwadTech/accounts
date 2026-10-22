/**
 * =============================================================================
 * GOTHWAD ACCOUNTS — CORE TYPES & MULTI-ACCOUNT SESSION MODELS (`a`..`f` / `u/0..5`)
 * =============================================================================
 */

export interface D1Meta {
  changes?: number;
  duration?: number;
  last_row_id?: number;
}

export interface D1Result<T = Record<string, any>> {
  results?: T[];
  success: boolean;
  meta?: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, any>>(colName?: string): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec?(query: string): Promise<unknown>;
}

export interface R2ObjectBody {
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB: D1Database;
  AVATARS_BUCKET?: R2Bucket;
  APP_DOMAIN: string;
  AUTH_HUB_URL: string;
  API_DOMAIN: string;
  RESEND_FROM: string;
  DEV_MODE: string;
  ALLOWED_ORIGINS?: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_INTERNAL_TOKEN?: string;
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

export interface SlotCredentials {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  remember: boolean;
}

export interface PublicAccountSummary {
  id: AccountSlot;
  authuser: number;
  username: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  avatar_url: string | null;
  accountUrl: string;
  lastUsedAt: string;
}

export interface VerifiedBrowserSlot {
  slot: AccountSlot;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  addedAt: string;
  lastUsedAt: string;
  creds: SlotCredentials;
  rotated: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  sessionId: string | null;
}

export type ResponseWrapper = (res: Response, newCookies?: string[]) => Response;
