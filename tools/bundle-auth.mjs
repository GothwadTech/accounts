/** Build-time only: collapse entry-page module waterfalls, sharing content-hashed code. */
import { build } from 'esbuild';
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = path.join(root, 'web/assets/auth');
await mkdir(outdir, { recursive: true });
const options = {
  absWorkingDir: root, outdir, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  entryNames: '[name]-[hash]', chunkNames: 'shared-[hash]', minify: true,
  legalComments: 'none', metafile: true, write: false,
};
const native = await build({ ...options, splitting: true,
  entryPoints: { signin: 'web/signin/js/entry.js', signup: 'web/signup/js/entry.js' } });
// Keep Google atomic: sharing its chunks must not add requests to native entry screens.
const google = await build({ ...options, splitting: false,
  entryPoints: { google: 'web/signin/google/google.js' } });
const result = { outputFiles: [...native.outputFiles, ...google.outputFiles],
  metafile: { outputs: { ...native.metafile.outputs, ...google.metafile.outputs } } };
const current = new Set(result.outputFiles.map(f => path.basename(f.path)));
for (const output of result.outputFiles) await writeFile(output.path, output.contents);
// Only remove this generator's previous outputs; never remove source modules or user assets.
for (const file of await readdir(outdir)) {
  if (/^(signin|signup|google|shared)-[A-Z0-9]{8}\.js$/.test(file) && !current.has(file)) await unlink(path.join(outdir, file));
}
for (const page of ['signin', 'signup', 'google']) {
  const source = page === 'google' ? 'web/signin/google/google.js' : `web/${page}/js/entry.js`;
  const entry = Object.entries(result.metafile.outputs).find(([, output]) => output.entryPoint === source);
  if (!entry) throw new Error(`Missing ${page} bundle`);
  const publicPath = file => '/' + file.replace(/^web\//, '');
  const preloads = entry[1].imports.filter(i => i.kind === 'import-statement').map(i =>
    `  <link rel="modulepreload" href="${publicPath(i.path)}" />`).join('\n');
  const htmlPath = path.join(root, page === 'google' ? 'web/signin/google/index.html' : `web/${page}/index.html`);
  let html = await readFile(htmlPath, 'utf8');
  html = html.replace(/  <!-- auth-preload:start -->[\s\S]*?  <!-- auth-preload:end -->\n?/g, '');
  if (preloads) html = html.replace('</head>', `  <!-- auth-preload:start -->\n${preloads}\n  <!-- auth-preload:end -->\n</head>`);
  // Keep legacy source paths compatible while publishing each screen with hashed code.
  html = html.replace(/  <script type="module" src="\/js\/google-entry\.js"><\/script>\n?/g, '');
  const legacySource = page === 'google' ? '/signin/google/google.js' : `/${page}/js/${page}.js`;
  const entryTag = new RegExp(`  <script type="module" (?:data-auth-entry="${page}" src="[^"]+"|src="${legacySource.replaceAll('.', '\\.')}")><\\/script>`);
  if (!entryTag.test(html)) throw new Error(`Missing ${page} entry script tag`);
  html = html.replace(entryTag,
    `  <script type="module" data-auth-entry="${page}" src="${publicPath(entry[0])}"></script>`);
  await writeFile(htmlPath, html);
}
console.log(`[bundle-auth] ${result.outputFiles.length} content-hashed modules; no runtime dependency added.`);
