/** Opt-in local account preparation. Never imported by the Worker or browser. */
import path from 'node:path';
import { createLocalD1 } from './local-d1.mjs';
import { isValidNewUsername, RESERVED_USERNAMES } from '../cloudflare-worker/src/http.ts';
import { verifyPassword } from '../cloudflare-worker/src/crypto.ts';
import { getDb } from '../cloudflare-worker/src/db.ts';
import worker from '../cloudflare-worker/src/index.ts';
import { GOTHWAD_CONFIG } from '../web/js/config.js';

export function previewConfig(environment) {
  if (environment.NODE_ENV === 'production' || environment.DEV_MODE !== 'true' ||
    environment.CI || environment.CF_PAGES || environment.WORKERS_CI) {
    throw new Error('Local preview account setup requires explicit DEV_MODE=true outside production/CI.');
  }
  const username = String(environment.LOCAL_PREVIEW_USERNAME || '').trim().toLowerCase();
  const password = String(environment.LOCAL_PREVIEW_PASSWORD || '');
  if (!isValidNewUsername(username) || RESERVED_USERNAMES.has(username) || password.length < 8 || password.length > 128) {
    throw new Error('Set a valid LOCAL_PREVIEW_USERNAME and 8–128 character LOCAL_PREVIEW_PASSWORD privately in .env.preview.');
  }
  return { username, password, firstName: environment.LOCAL_PREVIEW_FIRST_NAME || 'Preview',
    lastName: environment.LOCAL_PREVIEW_LAST_NAME || 'User' };
}

export async function ensurePreviewAccount(root, environment) {
  const config = previewConfig(environment); // Validate before opening or writing a database.
  const databasePath = path.join(root, '.local-d1.sqlite');
  if (environment.LOCAL_D1_PATH && path.resolve(environment.LOCAL_D1_PATH) !== path.resolve(databasePath)) {
    throw new Error('This helper only prepares the ignored local .local-d1.sqlite database.');
  }
  const db = createLocalD1(databasePath);
  try {
    // Synthetic, local-only environment. Never inherit provider secrets or remote DB bindings.
    const env = { DB: db, DEV_MODE: 'true', APP_DOMAIN: GOTHWAD_CONFIG.APP_DOMAIN,
      AUTH_HUB_URL: 'http://localhost:3000', JWT_SECRET: 'local-preview-setup-only-not-a-production-key' };
    await getDb(env);
    const existing = await db.prepare('SELECT password_hash FROM users WHERE username = ?').bind(config.username).first();
    if (existing) {
      if (!(await verifyPassword(config.password, existing.password_hash))) {
        throw new Error('Configured preview password differs from the local account. Update .env.preview to its current password; no reset was performed.');
      }
      return { created: false, databasePath };
    }
    const response = await worker.fetch(new Request('http://localhost:3000/api/auth/signup', {
      method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password, first_name: config.firstName,
        last_name: config.lastName, recovery_email: 'preview@example.invalid' }),
    }), env);
    if (response.status !== 201) throw new Error('Local preview account creation failed. Check local configuration; no remote service was used.');
    // Do not retain the setup-only signup session/refresh credentials.
    const user = await db.prepare('SELECT id FROM users WHERE username = ?').bind(config.username).first();
    await db.batch([
      db.prepare('DELETE FROM auth_refresh_tokens WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(user.id),
    ]);
    return { created: true, databasePath };
  } finally { db.close(); }
}
