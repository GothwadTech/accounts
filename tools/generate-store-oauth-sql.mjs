/**
 * Print owner-reviewed Store callback SQL; never connect to a database.
 * Domain comes only from wrangler.toml. Run: node tools/generate-store-oauth-sql.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

export function generateStoreOAuthSql(domain) {
  // Reject URLs, wildcards, quotes, ports and paths before interpolating SQL.
  const labels = typeof domain === 'string' ? domain.split('.') : [];
  if (labels.length < 2 || domain.length > 253 || labels.some(label =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('APP_DOMAIN must be a lowercase hostname, not a URL, wildcard or SQL fragment');
  }
  const nativeSql = read('../sql/04_store_android_oauth.sql');
  const guide = read('../docs/STORE_OAUTH.md');
  const template = guide.match(/```sql\n([\s\S]*?)\n```/)?.[1];
  const placeholder = "app_domain text := 'YOUR_APP_DOMAIN'";
  if (!template?.includes(placeholder)) throw new Error('Store web SQL template missing from docs/STORE_OAUTH.md');
  const webSql = template.replace(placeholder, `app_domain text := '${domain}'`);
  return `-- Generated from Accounts config for ${domain}. Review the four owned web sites first.
-- ACCOUNTS Supabase SQL Editor only; never the Store project's database.
-- Preserves existing callbacks and secrets. No wildcard/localhost registration.
-- This file must be run manually. Git changes do not apply database migrations.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ecosystem_apps WHERE id = 'gothwad-store') THEN
    RAISE EXCEPTION 'Run Accounts sql/01_core_schema.sql first; gothwad-store is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ecosystem_apps WHERE id = 'gothwad-store' AND secret_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'Store must be a reviewed public PKCE client; do not clear an existing secret automatically';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ecosystem_apps WHERE client_id = 'gothwad-store' AND id <> 'gothwad-store') THEN
    RAISE EXCEPTION 'Another row owns the Store client_id; review the registry before changing callbacks';
  END IF;
END $$;

${nativeSql}
${webSql}
COMMIT;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = read('../cloudflare-worker/wrangler.toml');
  const vars = config.split(/^\[vars\][ \t]*\r?$/m)[1]?.split(/^\[/m)[0];
  const domain = vars?.match(/^APP_DOMAIN\s*=\s*"([^"]+)"/m)?.[1];
  process.stdout.write(generateStoreOAuthSql(domain));
}
