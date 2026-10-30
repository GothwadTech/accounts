/** Repeatable local release gate. Never deploys, writes remote D1, or changes secrets. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [
  ['Frontend build', root, 'npm', ['run', 'build']],
  ['Security and compatibility tests', root, 'npm', ['test']],
  ['Strict Worker types', root + 'cloudflare-worker', 'npx', ['--no-install', 'tsc', '--noEmit']],
  ['Worker bundle only', root + 'cloudflare-worker', 'npx', ['--no-install', 'wrangler', 'deploy', '--dry-run']],
  ['Root production dependency audit', root, 'npm', ['audit', '--omit=dev', '--audit-level=moderate']],
  ['Worker production dependency audit', root + 'cloudflare-worker', 'npm', ['audit', '--omit=dev', '--audit-level=moderate']],
  ['Patch whitespace', root, 'git', ['diff', '--check']],
];
for (const [label, cwd, executable, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error(`FAILED: ${label}${result.error ? ': ' + result.error.message : ''}`);
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log('\nPASS: local release gate. Production release, email delivery, cross-app pilot, and real D1 recovery still require owner approval and evidence.');
