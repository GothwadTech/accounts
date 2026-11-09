/** Explicit local UI preview launcher; not used by npm start or Cloudflare builds. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ensurePreviewAccount } from './preview-account.mjs';
import { arenaPreviewOrigin } from './preview-origin.mjs';

try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const privateFile = path.join(root, '.env.preview');
  let settings;
  try { settings = parseEnv(readFileSync(privateFile, 'utf8')); }
  catch { throw new Error('Create private, ignored .env.preview first; see tools/README.md. No default demo credentials are embedded.'); }
  // Real process settings win, so a private file cannot override production/CI guards.
  const environment = { ...settings, ...process.env };
  const publicOrigin = arenaPreviewOrigin({ ...process.env, DEV_MODE: environment.DEV_MODE, LOCAL_PREVIEW_PROXY: 'true' });
  const prepared = await ensurePreviewAccount(root, environment);
  process.env.DEV_MODE = 'true';
  process.env.LOCAL_D1_PATH = prepared.databasePath;
  if (publicOrigin) {
    process.env.LOCAL_PREVIEW_PROXY = 'true';
    process.env.LOCAL_PREVIEW_TRACE ??= 'true';
    process.env.AUTH_HUB_URL ||= publicOrigin;
    console.log(`Public preview origin: ${publicOrigin}`);
  }
  console.log(prepared.created ? 'Local preview account created.' : 'Existing local preview account ready.');
  await import('../server.js');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
