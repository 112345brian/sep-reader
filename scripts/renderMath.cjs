#!/usr/bin/env node
/*
 * TeX → SVG renderer (MathJax in Node). DEV / AUDIT TOOL ONLY.
 *
 * In production this rendering happens ON-DEVICE — see
 * src/utils/sepHtml/render/texToSvg.ts, which is the same DOM-free liteAdaptor
 * path running in the RN runtime. The client renders each equation from fetched
 * TeX and caches the SVG locally; the SVG is a runtime artifact and is NEVER
 * bundled or folded into a shipped DB (SEP-derived output may not be
 * redistributed — see NOTICE.md / AGENTS.md).
 *
 * This script (and buildMathSvg.cjs) exist only for corpus analysis / sizing and
 * write to .audit/ (gitignored, never shipped). Do not feed their output into
 * the app bundle or content DB.
 *
 * Exports texToSvg(tex, display) -> { svg, width, height } | { error }.
 * CLI: node scripts/renderMath.cjs '\\frac{a}{b}'   (add 'display' as 2nd arg)
 */
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

// AllPackages includes amsmath (align/array/cases/matrix) — needed by 200 SEP
// articles. fontCache:'none' makes each SVG standalone (no cross-equation <use>
// refs into a shared cache that won't exist when equations render independently).
const texInput = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' });
const doc = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });

function texToSvg(tex, display = false) {
  try {
    const node = doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 1000000 });
    const svg = adaptor.innerHTML(node);
    // MathJax sizes SVGs in ex units on the root <svg width/height>; pull them
    // so the app can lay out without measuring.
    const wm = svg.match(/width="([0-9.]+)ex"/);
    const hm = svg.match(/height="([0-9.]+)ex"/);
    return {
      svg,
      width: wm ? parseFloat(wm[1]) : null,
      height: hm ? parseFloat(hm[1]) : null,
    };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

module.exports = { texToSvg };

if (require.main === module) {
  const tex = process.argv[2] || '\\mathbb{N}';
  const display = process.argv[3] === 'display';
  const r = texToSvg(tex, display);
  if (r.error) { console.error('ERROR:', r.error); process.exit(1); }
  console.log(`tex: ${tex}`);
  console.log(`size: ${r.width}ex x ${r.height}ex`);
  console.log(`svg (${r.svg.length} bytes): ${r.svg.slice(0, 200)}...`);
}
