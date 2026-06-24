#!/usr/bin/env node
/*
 * Regenerate src/utils/mathjax/texSvgFull.ts from the installed mathjax-full
 * es5 build. MathJax can't run on Hermes, so it's loaded into an off-screen
 * WebView (see src/components/MathRenderWebView.tsx); this bundles the MIT
 * engine as base64 so math renders offline without a CDN dependency.
 *
 * Run after bumping mathjax-full:  node scripts/genMathjaxBundle.cjs
 */
const fs = require('fs');
const path = require('path');

const src = require.resolve('mathjax-full/es5/tex-svg-full.js');
const out = path.join(__dirname, '..', 'src', 'utils', 'mathjax', 'texSvgFull.ts');

const b64 = fs.readFileSync(src).toString('base64');
const header =
  '// MathJax tex-svg-full (mathjax-full es5 build, MIT-licensed) as base64.\n' +
  "// Loaded into the off-screen MathRenderWebView and eval'd in-page (MathJax\n" +
  "// can't run on Hermes). Shipping the MIT *engine* is allowed; the SVGs it\n" +
  '// produces are generated on-device and never bundled (see NOTICE.md/AGENTS.md).\n' +
  '// Regenerate: node scripts/genMathjaxBundle.cjs\n' +
  '/* eslint-disable */\n';

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + 'export const TEX_SVG_FULL_B64 =\n  \'' + b64 + '\';\n');
console.log('wrote', path.relative(process.cwd(), out), (b64.length / 1024 / 1024).toFixed(2), 'MB base64');
