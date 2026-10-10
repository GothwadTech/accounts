#!/usr/bin/env node
/**
 * Automatically bundles modular CSS files into web/css/styles.css
 * This eliminates nested @import statements for production performance and prevents
 * unstyled layout flashes on Cloudflare Pages or slow networks.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'web', 'css');

const MODULES = [
  'variables.css',
  'base.css',
  'auth.css',
  'dashboard.css',
  'legal.css',
  'root.css',
];

const header = `/* =============================================================================
   GOTHWAD ACCOUNTS — UNIFIED DESIGN SYSTEM
   Generated automatically from modular CSS files. Do not add @import chains here.
   ============================================================================= */\n\n`;

const parts = MODULES.map((filename) => {
  const filePath = path.join(CSS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[bundle-css] Warning: ${filename} not found, skipping.`);
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return `/* ----------------- ${filename} ----------------- */\n${content}`;
});

const bundled = header + parts.join('\n\n') + '\n';
const targetPath = path.join(CSS_DIR, 'styles.css');
fs.writeFileSync(targetPath, bundled, 'utf8');
console.log(`✅ [bundle-css] Bundled ${MODULES.length} modules into ${targetPath} (${bundled.length} bytes)`);
