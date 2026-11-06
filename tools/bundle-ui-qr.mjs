/** Build the local MIT-licensed QR encoder; MFA setup secrets never reach a QR service. */
import { build } from 'esbuild';
await build({ entryPoints: ['node_modules/qrcode-generator/dist/qrcode.mjs'], outfile: 'web/vendor/qrcode.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none', banner: { js: '/* qrcode-generator 2.0.4, Copyright (c) 2009 Kazuhiko Arase, MIT. See /vendor/QR_LICENSE.txt. */' } });
