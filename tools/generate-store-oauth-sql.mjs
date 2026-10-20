/**
 * Print owner-reviewed Cloudflare D1 OAuth callback SQL for Store + Ecosystem apps.
 * Never connects to any live database. Domain comes strictly from `wrangler.toml`.
 *
 * Usage:
 *   node tools/generate-store-oauth-sql.mjs > Store-OAuth-Setup.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

export function generateStoreOAuthSql(domain) {
  const labels = typeof domain === 'string' ? domain.split('.') : [];
  if (
    labels.length < 2 ||
    domain.length > 253 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error('APP_DOMAIN must be a lowercase hostname, not a URL, wildcard or SQL fragment');
  }

  const nativeSql = read('../sql/05_store_android_oauth.sql');
  const guide = read('../docs/STORE_OAUTH.md');
  const template = guide.match(/```sql\n([\s\S]*?)\n```/)?.[1];
  const placeholder = 'YOUR_APP_DOMAIN';
  if (!template?.includes(placeholder)) {
    throw new Error('Store web SQL template missing from docs/STORE_OAUTH.md');
  }
  const webSql = template.replaceAll(placeholder, domain);

  return `-- Generated from Gothwad Accounts config for ${domain} (Cloudflare D1 SQLite).
-- Run in Cloudflare Dashboard -> D1 -> gothwad-accounts-db -> Console.
-- Safe to re-run: preserves existing callbacks and never overwrites secret_hash.

${nativeSql}

${webSql}
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = read('../cloudflare-worker/wrangler.toml');
  const vars = config.split(/^\[vars\][ \t]*\r?$/m)[1]?.split(/^\[/m)[0];
  const domain = vars?.match(/^APP_DOMAIN\s*=\s*"([^"]+)"/m)?.[1];
  process.stdout.write(generateStoreOAuthSql(domain));
}
