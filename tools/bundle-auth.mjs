/** Build-time only: collapse entry-page module waterfalls, sharing content-hashed code. */
import { build } from 'esbuild';
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = path.join(root, 'web/assets/auth');
await mkdir(outdir, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: { signin: 'web/signin/js/entry.js', signup: 'web/signup/js/entry.js' },
  outdir, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
  entryNames: '[name]-[hash]', chunkNames: 'shared-[hash]', minify: true,
  legalComments: 'none', metafile: true, write: false,
});
const current = new Set(result.outputFiles.map(f => path.basename(f.path)));
for (const output of result.outputFiles) await writeFile(output.path, output.contents);
// Only remove this generator's previous outputs; never remove source modules or user assets.
for (const file of await readdir(outdir)) {
  if (/^(signin|signup|shared)-[A-Z0-9]{8}\.js$/.test(file) && !current.has(file)) await unlink(path.join(outdir, file));
}
for (const page of ['signin', 'signup']) {
  const entry = Object.entries(result.metafile.outputs).find(([, output]) => output.entryPoint === `web/${page}/js/entry.js`);
  if (!entry) throw new Error(`Missing ${page} bundle`);
  const publicPath = file => '/' + file.replace(/^web\//, '');
  const preloads = entry[1].imports.filter(i => i.kind === 'import-statement').map(i =>
    `  <link rel="modulepreload" href="${publicPath(i.path)}" />`).join('\n');
  const htmlPath = path.join(root, `web/${page}/index.html`);
  let html = await readFile(htmlPath, 'utf8');
  html = html.replace(/  <!-- auth-preload:start -->[\s\S]*?  <!-- auth-preload:end -->\n?/g, '');
  html = html.replace('</head>', `  <!-- auth-preload:start -->\n${preloads}\n  <!-- auth-preload:end -->\n</head>`);
  // These are the only two legacy entry scripts; keep all other HTML and CSS order intact.
  html = html.replace(/  <script type="module" src="\/js\/google-entry\.js"><\/script>\n?/g, '');
  const entryTag = new RegExp(`  <script type="module" (?:data-auth-entry="${page}" src="[^"]+"|src="/${page}/js/${page}\\.js")><\\/script>`);
  if (!entryTag.test(html)) throw new Error(`Missing ${page} entry script tag`);
  html = html.replace(entryTag,
    `  <script type="module" data-auth-entry="${page}" src="${publicPath(entry[0])}"></script>`);
  await writeFile(htmlPath, html);
}
console.log(`[bundle-auth] ${result.outputFiles.length} content-hashed modules; no runtime dependency added.`);
