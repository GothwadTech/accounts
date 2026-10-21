/**
 * =============================================================================
 * USER LOOKUP, PROFILE PRESENTATION, ACTIVITY TELEMETRY & RESEND EMAIL
 * =============================================================================
 */

import type { D1Database, Env } from './types.ts';
import { identifierLooksLikePhone, usernameFromIdentifier } from './http.ts';

export function resolveAvatarUrl(rawUrl: string | null | undefined, env: Env): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  const base = (env.AUTH_HUB_URL || '').replace(/\/+$/, '');
  return base ? `${base}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}` : rawUrl;
}

export function presentUser(profile: Record<string, any> | null | undefined, env: Env) {
  if (!profile) return null;
  const username = String(profile.username || '');
  return {
    id: String(profile.id || ''),
    username,
    email: username ? `${username}@${env.APP_DOMAIN}` : '',
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    recovery_email: profile.recovery_email || '',
    phone_number: profile.phone_number || '',
    avatar_url: resolveAvatarUrl(profile.avatar_url, env),
    date_of_birth: profile.date_of_birth || null,
    gender: profile.gender || null,
    two_factor_enabled: !!profile.two_factor_enabled,
    storage_used_bytes: Number(profile.storage_used_bytes || 0),
    storage_limit_bytes: Number(profile.storage_limit_bytes ?? 16106127360),
    created_at: profile.created_at || null,
  };
}

export async function fetchProfile(db: D1Database, userId: string): Promise<Record<string, any> | null> {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first();
}

export async function lookupAccount(
  db: D1Database,
  rawIdentifier: string,
): Promise<{
  exists: boolean;
  userId: string;
  username: string;
  passwordHash: string;
  kind: 'phone' | 'username';
}> {
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };

  if (identifierLooksLikePhone(trimmed)) {
    const cleanDigits = trimmed.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    let row = await db
      .prepare(
        `SELECT u.id, u.username, u.password_hash
           FROM profiles p
           JOIN users u ON u.id = p.id
          WHERE p.phone_number = ?
          LIMIT 1`,
      )
      .bind(trimmed)
      .first();

    if (!row && cleanDigits) {
      row = await db
        .prepare(
          `SELECT u.id, u.username, u.password_hash
             FROM profiles p
             JOIN users u ON u.id = p.id
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(p.phone_number, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
            LIMIT 1`,
        )
        .bind(`%${cleanDigits}`)
        .first();
    }

    if (row?.username) {
      return {
        exists: true,
        userId: String(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        kind: 'phone',
      };
    }
    return { exists: false, userId: '', username: '', passwordHash: '', kind: 'phone' };
  }

  const username = usernameFromIdentifier(trimmed);
  if (!username) return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };

  const row = await db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1')
    .bind(username)
    .first();

  if (!row?.username) {
    return { exists: false, userId: '', username: '', passwordHash: '', kind: 'username' };
  }

  return {
    exists: true,
    userId: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    kind: 'username',
  };
}

export async function logActivity(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  detail?: string,
  request?: Request,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO account_activity (id, user_id, type, title, detail, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        type,
        title,
        detail || null,
        request?.headers.get('CF-Connecting-IP') || null,
        request?.headers.get('User-Agent') || null,
        now,
      )
      .run();

    await db
      .prepare(
        `DELETE FROM account_activity
          WHERE user_id = ?
            AND id NOT IN (
              SELECT id FROM account_activity
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT 100
            )`,
      )
      .bind(userId, userId)
      .run();
  } catch {
    // Telemetry must never fail the primary user action
  }
}

export function parseUserAgent(ua: string): { device_name: string; browser: string; os: string; device_type: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Unknown browser';

  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' :
    'Unknown OS';

  const device_type = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : /iPad|Tablet/.test(ua) ? 'Tablet' : 'Desktop';
  return { device_name: `${browser} on ${os}`, browser, os, device_type };
}

export async function sendResetEmail(env: Env, toEmail: string, resetLink: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const from = env.RESEND_FROM || `Gothwad Accounts <no-reply@${env.APP_DOMAIN}>`;
  const html = `
    <div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#202124;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:22px;color:#5f6368;font-weight:400;">Gothwad Accounts</div>
      </div>
      <h2 style="font-size:20px;font-weight:400;margin:0 0 16px;">Reset your password</h2>
      <p style="font-size:14px;line-height:1.6;color:#5f6368;margin:0 0 24px;">
        Hi, we received a request to reset the password for your Gothwad Account.
        Click the button below and set a new password within 15 minutes.
      </p>
      <p style="text-align:center;margin:0 0 24px;">
        <a href="${resetLink}" style="display:inline-block;background:#1a73e8;color:#ffffff;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px;">Reset password</a>
      </p>
      <p style="font-size:12px;color:#5f6368;line-height:1.6;margin:0;">
        If you didn't ask to reset your password, you can ignore this email — no action needed.
      </p>
      <hr style="border:none;border-top:1px solid #dadce0;margin:24px 0;" />
      <p style="font-size:11px;color:#9aa0a6;margin:0;">Gothwad Tech · This is an automated security email.</p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: 'Reset your Gothwad Account password',
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
