#!/usr/bin/env node
/**
 * =============================================================================
 * GOTHWAD CSS MODULE VERIFIER & SHIM GENERATOR (`npm run build`)
 * =============================================================================
 * Verifies every modular CSS sheet under `web/css/` and `web/css/legacy/` exists,
 * has balanced braces, obeys the strict `<= 500` line limit per file, and keeps
 * compact fallback entrypoints (`styles.css` & `legacy.css`) synced so both
 * direct `<link rel="stylesheet">` tags and cached HTML entrypoints stay valid.
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'web', 'css');

const MODERN_MODULES = [
  'variables.css',
  'base.css',
  'components.css',
  'auth.css',
  'dashboard.css',
  'legal.css',
  'legal-content.css',
  'root.css',
];

const LEGACY_MODULES = [
  'legacy/variables.css',
  'legacy/base.css',
  'legacy/components.css',
  'legacy/auth.css',
  'legacy/dashboard.css',
  'legacy/legal-layout.css',
  'legacy/legal-content.css',
];

function validateModules(list) {
  for (const rel of list) {
    const filePath = path.join(CSS_DIR, rel);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[bundle-css] Missing required CSS module: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    if (lines > 500) {
      throw new Error(`[bundle-css] CSS module exceeds 500-line limit (${lines} lines): ${rel}`);
    }
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
    const opens = (stripped.match(/\{/g) || []).length;
    const closes = (stripped.match(/\}/g) || []).length;
    if (opens !== closes) {
      throw new Error(`[bundle-css] Unbalanced CSS braces in ${rel} ({=${opens}, }=${closes})`);
    }
  }
}

validateModules(MODERN_MODULES);
validateModules(LEGACY_MODULES);

const stylesShim = [
  '/* Fallback entrypoint for cached HTML — primary pages link modules directly in <head> */',
  ...MODERN_MODULES.map((m) => `@import url('./${m}');`),
  '',
].join('\n');

const legacyShim = [
  '/* Frozen legacy snapshot fallback entrypoint — primary pages link modules directly in <head> */',
  ...LEGACY_MODULES.map((m) => `@import url('./${m}');`),
  '',
].join('\n');

fs.writeFileSync(path.join(CSS_DIR, 'styles.css'), stylesShim, 'utf8');
fs.writeFileSync(path.join(CSS_DIR, 'legacy.css'), legacyShim, 'utf8');

console.log(
  `✅ [bundle-css] Verified ${MODERN_MODULES.length + LEGACY_MODULES.length} modular stylesheets (all <= 500 lines, balanced braces).`,
);
