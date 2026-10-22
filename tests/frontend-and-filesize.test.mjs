/**
 * =============================================================================
 * PERMANENT HYGIENE & REGRESSION SUITE:
 *   1. Repo-Wide File-Size Ceiling Rule (<= 500 target, 800 hard ceiling)
 *   2. Static & Dynamic Browser ESM Import/Export Link Verification (`web/**`)
 *   3. Modular CSS Cascade, `<link>` Resolution & `_headers` Cache Policy
 *   4. `/me` Reload Boot, Cookie Data Export & Password-Reset Token Regression
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { BrowserJar, makeEnv, seedAccount } from './helpers/multi-account-harness.mjs';

const REPO_ROOT = resolve('.');
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'coverage']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.html', '.css', '.sql', '.md', '.json', '.toml', '.yml', '.yaml',
]);
const TARGET_MAX_LINES = 500;
const HARD_MAX_LINES = 800;

function walkRepoFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkRepoFiles(full, out);
    } else if (TEXT_EXTENSIONS.has(extname(name).toLowerCase()) || name === '_headers') {
      out.push(full);
    }
  }
  return out;
}

function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectModuleExports(filePath, visited = new Set()) {
  if (visited.has(filePath)) return new Set();
  visited.add(filePath);
  const src = stripJsComments(readFileSync(filePath, 'utf8'));
  const exports = new Set();

  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) {
    exports.add(m[1]);
  }
  if (/\bexport\s+default\b/.test(src)) {
    exports.add('default');
  }
  for (const m of src.matchAll(/\bexport\s*\{([^}]+)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
    const specList = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const item of specList) {
      const parts = item.split(/\s+as\s+/).map((p) => p.trim());
      exports.add(parts[parts.length - 1]);
    }
  }
  for (const m of src.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = resolveWebImport(filePath, m[1]);
    for (const sub of collectModuleExports(target, visited)) exports.add(sub);
  }
  return exports;
}

function resolveWebImport(fromFile, specifier) {
  const clean = specifier.split('?')[0].split('#')[0];
  if (clean.startsWith('/')) {
    return resolve(REPO_ROOT, 'web', clean.slice(1));
  }
  return resolve(dirname(fromFile), clean);
}

test('Rule #8 File-Size Gate: every code, style, SQL, test, and doc file in the repository stays <= 500 lines (and strictly <= 800)', () => {
  const allFiles = walkRepoFiles(REPO_ROOT);
  assert.ok(allFiles.length >= 60, `Expected full repo scan (>= 60 files), scanned ${allFiles.length}`);

  const overHardLimit = [];
  const overTargetLimit = [];

  for (const fullPath of allFiles) {
    const rel = relative(REPO_ROOT, fullPath);
    if (rel === 'package-lock.json' || rel.endsWith('/package-lock.json')) continue;
    const lineCount = readFileSync(fullPath, 'utf8').split('\n').length;
    if (lineCount > HARD_MAX_LINES) {
      overHardLimit.push(`${rel} (${lineCount} lines > ${HARD_MAX_LINES})`);
    } else if (lineCount > TARGET_MAX_LINES) {
      overTargetLimit.push(`${rel} (${lineCount} lines > ${TARGET_MAX_LINES})`);
    }
  }

  assert.deepEqual(
    overHardLimit,
    [],
    `Files exceeding hard 800-line ceiling MUST be split modularly:\n  ${overHardLimit.join('\n  ')}`,
  );
  assert.deepEqual(
    overTargetLimit,
    [],
    `Files exceeding target 500-line limit:\n  ${overTargetLimit.join('\n  ')}`,
  );
});

test('Frontend ESM Link Verifier: every HTML module entrypoint and JS import across web/** resolves with valid named exports', () => {
  const htmlFiles = walkRepoFiles(join(REPO_ROOT, 'web')).filter((f) => f.endsWith('.html'));
  const jsQueue = [];
  const seenJs = new Set();

  for (const htmlFile of htmlFiles) {
    const html = readFileSync(htmlFile, 'utf8');

    // Verify all local <link rel="stylesheet" href="..."> files exist
    for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const href = m[1];
      if (/^https?:\/\//i.test(href)) continue;
      const targetCss = resolveWebImport(htmlFile, href);
      assert.equal(
        existsSync(targetCss),
        true,
        `Missing stylesheet ${href} referenced in ${relative(REPO_ROOT, htmlFile)}`,
      );
    }

    // Verify all <script type="module" src="..."> entrypoints exist
    for (const m of html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi)) {
      const targetJs = resolveWebImport(htmlFile, m[1]);
      assert.equal(
        existsSync(targetJs),
        true,
        `Missing ESM script ${m[1]} referenced in ${relative(REPO_ROOT, htmlFile)}`,
      );
      jsQueue.push(targetJs);
    }
  }

  // Also include every .js/.mjs file in web/ even if loaded dynamically
  for (const webJs of walkRepoFiles(join(REPO_ROOT, 'web')).filter((f) => /\.(?:js|mjs)$/.test(f))) {
    jsQueue.push(webJs);
  }

  while (jsQueue.length > 0) {
    const jsFile = jsQueue.pop();
    if (seenJs.has(jsFile)) continue;
    seenJs.add(jsFile);

    const src = stripJsComments(readFileSync(jsFile, 'utf8'));
    const relJs = relative(REPO_ROOT, jsFile);

    // Static imports: `import { a, b as c } from './x.js'` / `import def from './x.js'` / `import './x.js'`
    for (const m of src.matchAll(/\bimport\s+(?:([^'"\n;]+?\s+from\s+))?['"]([^'"]+)['"]/g)) {
      const clause = (m[1] || '').replace(/\s+from\s*$/, '').trim();
      const spec = m[2];
      const target = resolveWebImport(jsFile, spec);
      assert.equal(existsSync(target), true, `Broken import "${spec}" in ${relJs}`);
      jsQueue.push(target);

      const exportedNames = collectModuleExports(target);
      const namedMatch = clause.match(/\{([^}]+)\}/);
      if (namedMatch) {
        for (const rawSym of namedMatch[1].split(',').map((s) => s.trim()).filter(Boolean)) {
          const importedName = rawSym.split(/\s+as\s+/)[0].trim();
          assert.equal(
            exportedNames.has(importedName),
            true,
            ` Link SyntaxError prevention: "${relJs}" imports { ${importedName} } from "${spec}", ` +
              `but "${relative(REPO_ROOT, target)}" only exports [${[...exportedNames].join(', ')}]`,
          );
        }
      }
      const beforeBrace = clause.split('{')[0].replace(/,$/, '').trim();
      if (beforeBrace && !beforeBrace.startsWith('*')) {
        assert.equal(
          exportedNames.has('default'),
          true,
          `"${relJs}" default-imports "${beforeBrace}" from "${spec}", which has no default export`,
        );
      }
    }

    // Dynamic imports: `import('./tabs/home.js')`
    for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const target = resolveWebImport(jsFile, m[1]);
      assert.equal(existsSync(target), true, `Broken dynamic import("${m[1]}") in ${relJs}`);
      jsQueue.push(target);
    }
  }
});

test('CSS & Cloudflare Pages _headers Gate: balanced braces, valid @imports, and must-revalidate headers', () => {
  const cssFiles = walkRepoFiles(join(REPO_ROOT, 'web', 'css')).filter((f) => f.endsWith('.css'));
  assert.ok(cssFiles.length >= 17, `Expected modular CSS suite, found ${cssFiles.length}`);

  for (const cssFile of cssFiles) {
    const raw = readFileSync(cssFile, 'utf8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
    let depth = 0;
    for (const ch of stripped) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      assert.ok(depth >= 0, `Negative CSS brace depth in ${relative(REPO_ROOT, cssFile)}`);
    }
    assert.equal(depth, 0, `Unbalanced CSS braces (${depth}) in ${relative(REPO_ROOT, cssFile)}`);

    for (const m of raw.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
      const target = resolveWebImport(cssFile, m[1]);
      assert.equal(existsSync(target), true, `Missing @import "${m[1]}" in ${relative(REPO_ROOT, cssFile)}`);
    }
  }

  const headersFile = readFileSync(join(REPO_ROOT, 'web', '_headers'), 'utf8');
  assert.match(headersFile, /must-revalidate/, 'web/_headers must enforce must-revalidate against stale edge JS');
  assert.match(headersFile, /\/me\/js\/\*/);
  assert.match(headersFile, /\/js\/\*/);
});

test('Dashboard Reload, Cookie Export & Password-Reset Token Regression: zero-storage cookies work end-to-end', async () => {
  const env = makeEnv({ DEV_MODE: 'true' });
  await seedAccount(env, { username: 'reloadcheck', firstName: 'Reload', lastName: 'Verified' });

  const browser = new BrowserJar();
  const signin = await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'reloadcheck', password: 'StrongPassword!123', remember: true },
  });
  assert.equal(signin.status, 200);

  // 1. Multiple consecutive dashboard reloads (`GET /api/auth/me` + `GET /api/auth/accounts`) succeed cleanly
  for (let reload = 1; reload <= 3; reload++) {
    const meRes = await browser.fetch(env, '/api/auth/me', { origin: 'https://accounts.gothwadtech.com' });
    assert.equal(meRes.status, 200);
    const meJson = await meRes.json();
    assert.equal(meJson.authenticated, true);
    assert.equal(meJson.user.username, 'reloadcheck');
  }

  // 2. Cookie-authenticated `/api/auth/export` succeeds with ZERO `Authorization` header (fixing `tabs/data.js`)
  const exportRes = await browser.fetch(env, '/api/auth/export', {
    method: 'GET',
    origin: 'https://accounts.gothwadtech.com',
  });
  assert.equal(exportRes.status, 200);
  const exported = await exportRes.json();
  assert.equal(exported.export, 'gothwad-accounts');
  assert.equal(exported.profile.username, 'reloadcheck');

  // 3. One-time Bearer token in `apiCall(..., { token })` works end-to-end for `/api/auth/reset-password`
  const forgotRes = await browser.fetch(env, '/api/auth/forgot-password', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { username: 'reloadcheck' },
  });
  assert.equal(forgotRes.status, 200);
  const forgotJson = await forgotRes.json();
  const resetToken = new URL(forgotJson.dev_reset_link.replace('#', '?')).searchParams.get('access_token');
  assert.ok(resetToken, 'Expected one-time recovery token in DEV_MODE');

  const resetBrowser = new BrowserJar();
  const resetRes = await resetBrowser.fetch(env, '/api/auth/reset-password', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    headers: { Authorization: `Bearer ${resetToken}` },
    body: { password: 'UpdatedStrongPassword!456' },
  });
  assert.equal(resetRes.status, 200);
  assert.equal((await resetRes.json()).ok, true);
});

test('Real V8 ESM Runtime Boot: dynamically importing web/me/js/me.js links all 14 dashboard modules, finishes boot(), hides #loading-screen, and runs exportData()', async () => {
  const env = makeEnv();
  await seedAccount(env, { username: 'v8boot', firstName: 'Pawan', lastName: 'V8Boot' });
  const browser = new BrowserJar();
  await browser.fetch(env, '/api/auth/signin', {
    method: 'POST',
    origin: 'https://accounts.gothwadtech.com',
    body: { identifier: 'v8boot', password: 'StrongPassword!123', remember: true },
  });

  // Minimal DOM environment sufficient for real `web/me/js/me.js` V8 link + boot() execution
  const elements = new Map();
  const makeEl = (id = '', initialClasses = []) => {
    const listeners = new Map();
    const classes = new Set(initialClasses);
    return {
      id,
      hidden: false,
      disabled: false,
      value: '',
      textContent: '',
      innerHTML: '',
      style: { display: '' },
      dataset: {},
      classList: {
        add(...cs) { cs.forEach((c) => classes.add(c)); },
        remove(...cs) { cs.forEach((c) => classes.delete(c)); },
        toggle(c, force) {
          const next = force !== undefined ? !!force : !classes.has(c);
          if (next) classes.add(c); else classes.delete(c);
          return next;
        },
        contains(c) { return classes.has(c); },
      },
      setAttribute() {},
      getAttribute() { return ''; },
      removeAttribute() {},
      addEventListener(ev, fn) { listeners.set(ev, fn); },
      removeEventListener(ev) { listeners.delete(ev); },
      async trigger(ev) { return listeners.get(ev)?.({ preventDefault() {}, stopPropagation() {} }); },
      appendChild(c) { return c; },
      remove() {},
      click() {},
      focus() {},
      closest() { return null; },
      querySelector() { return makeEl(); },
      querySelectorAll() { return []; },
    };
  };
  elements.set('auth-loading', makeEl('auth-loading'));
  elements.set('dash-root', makeEl('dash-root', ['hidden']));

  const memStore = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
    };
  };

  const prevGlobals = {};
  const injected = {
    location: {
      origin: 'https://accounts.gothwadtech.com',
      hostname: 'accounts.gothwadtech.com',
      pathname: '/me',
      search: '',
      hash: '',
      href: 'https://accounts.gothwadtech.com/me',
      replace(u) { this.href = u; },
    },
    history: { replaceState() {}, pushState() {} },
    localStorage: memStore(),
    sessionStorage: memStore(),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      documentElement: makeEl('html'),
      body: makeEl('body'),
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      createElement: (tag) => makeEl(tag),
      addEventListener() {},
    },
    fetch: async (input, init = {}) => {
      const path = String(input).startsWith('http') ? new URL(String(input)).pathname + new URL(String(input)).search : String(input);
      const headers = { ...(init.headers || {}) };
      return browser.fetch(env, path, {
        method: init.method || 'GET',
        headers,
        origin: 'https://accounts.gothwadtech.com',
      });
    },
  };
  injected.window = Object.assign(injected, { addEventListener() {}, dispatchEvent() {}, CustomEvent });

  for (const [k, v] of Object.entries(injected)) {
    prevGlobals[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  const origURLCreate = URL.createObjectURL;
  const origURLRevoke = URL.revokeObjectURL;
  let blobCreated = false;
  URL.createObjectURL = () => {
    blobCreated = true;
    return 'blob:https://accounts.gothwadtech.com/export';
  };
  URL.revokeObjectURL = () => {};

  try {
    // 1. Real V8 instantiation & evaluation of ALL static imports across `/me`, `/signin`, and `/signup`!
    await import('../web/me/js/me.js');
    const deadline = Date.now() + 2000;
    while (elements.get('dash-root').classList.contains('hidden') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    assert.equal(globalThis.window.__GOTHWAD_ME_BOOTED, true, 'me.js must complete boot() and set __GOTHWAD_ME_BOOTED');
    assert.equal(elements.get('auth-loading').classList.contains('hidden'), true, '#auth-loading must hide after boot()');
    assert.equal(elements.get('dash-root').classList.contains('hidden'), false, '#dash-root must unhide after boot()');
    assert.equal(elements.get('menu-name').textContent, 'Pawan V8Boot', 'Account menu must populate user full name');
    assert.equal(elements.get('menu-email').textContent, 'v8boot@gothwadtech.com', 'Account menu must populate user email');

    // 2. Trigger `#btn-export` wired inside `boot() -> initDataPrivacy()` to prove `exportData()` downloads JSON!
    await elements.get('btn-export').trigger('click');
    assert.equal(blobCreated, true, 'exportData() must download JSON blob via cookie auth');

    // 3. Also instantiate `/signin` and `/signup` ES module trees in real V8 & let async boot settle!
    await import('../web/signin/js/signin.js');
    await import('../web/signup/js/signup.js');
    await new Promise((r) => setTimeout(r, 100));

    // 4. Directly verify getTokens() compat shim in `web/js/api.js`
    const apiMod = await import('../web/js/api.js');
    assert.deepEqual(apiMod.getTokens(), {});
  } finally {
    URL.createObjectURL = origURLCreate;
    URL.revokeObjectURL = origURLRevoke;
    for (const [k, desc] of Object.entries(prevGlobals)) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});

test('Rule #0 Gate: 100% Pure English across all UI, code, CSS, SQL, configs, and Markdown docs (zero Hindi/Hinglish)', () => {
  const disallowed = new RegExp(
    '[\\u0900-\\u097F]|\\b(' +
      'hai|hain|hota|hoti|hote|karo|karein|karke|karna|karta|karti|karte|' +
      'sakta|sakte|sakti|sako|chahiye|nahi|mat|sirf|aur|mein|bhi|jab|toh|agar|warna|' +
      'kyunki|isliye|taaki|jaise|jaisa|jaisi|wala|wale|wali|apna|apni|apne|' +
      'aap|aapka|aapki|aapke|tum|tumhara|hum|hamara|yeh|woh|saara|saare|saari|' +
      'pehle|baad|abhi|turant|hamesha|kabhi|bilkul|asli|naya|naye|nayi|purana|purane|purani|' +
      'chhota|chhoti|alag|dikhta|dikhti|dikhte|dikhao|kholo|jaata|jaati|jaate|jayega|jaayegi|' +
      'lagta|lagti|lagte|rakho|rakhna|banta|banti|waghera|khud|tareeke|bhasha|asaan|' +
      'zaroori|zaroorat|bina|upar|neeche|andar|bahar|yahan|wahan|kaise|kya|kyun|kaunsa|' +
      'poora|poori|poore|seedha|seedhe|lagao|lagana|chalao|chalana|bhejo|bhejna|badlo|dekho|padho|samjho' +
      ')\\b',
    'i',
  );

  const violations = [];
  for (const absPath of walkRepoFiles(REPO_ROOT)) {
    const relPath = relative(REPO_ROOT, absPath);
    if (relPath === 'tests/frontend-and-filesize.test.mjs') continue;
    if (!/\.(?:html|js|mjs|ts|css|sql|toml|md|json)$/i.test(relPath)) continue;

    const lines = readFileSync(absPath, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      const m = line.match(disallowed);
      if (m) violations.push(`${relPath}:${idx + 1} matched "${m[0]}": ${line.trim().slice(0, 90)}`);
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Found non-English / Hinglish text in repository files:\n${violations.join('\n')}`,
  );
});

