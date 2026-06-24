// On-device TeX → SVG renderer (MathJax in the RN JS runtime).
//
// LICENSING: we ship the math *engine* (mathjax-full, MIT-licensed) and render
// each equation on the user's device from TeX that arrived inside the
// already-fetched article HTML. The resulting SVG is a runtime artifact, created
// and stored on the client — it is never a build-time asset and never ships in
// our binary, DB, or server. (SEP-derived rendered output may not be
// redistributed; see NOTICE.md / AGENTS.md.) This mirrors scripts/renderMath.cjs
// — same liteAdaptor (DOM-free) path — but runs client-side instead of at build.
//
// MathJax's `doc.convert` is synchronous, so this is a synchronous call; callers
// memoize the result (see mathStore.ts).

export interface SvgResult {
  svg: string; // self-contained <svg> (fontCache:'none', fill="currentColor")
  width: number | null; // root width in ex units (MathJax)
  height: number | null; // root height in ex units
}

// MathJax init is heavy (parses the full TeX package set + SVG font metrics), so
// defer it to the first equation rather than blocking bundle evaluation.
let _doc: any = null;
let _adaptor: any = null;
let _initError: string | null = null;

function ensureDoc(): boolean {
  if (_doc) return true;
  if (_initError) return false;
  try {
    // Required, not imported at top level, so the engine only loads if an
    // article actually contains math (~24% of the corpus).
    const { mathjax } = require('mathjax-full/js/mathjax.js');
    const { TeX } = require('mathjax-full/js/input/tex.js');
    const { SVG } = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

    _adaptor = liteAdaptor();
    RegisterHTMLHandler(_adaptor);
    // AllPackages includes amsmath (align/array/cases/matrix) — needed by ~200
    // SEP articles. fontCache:'none' makes each SVG standalone (no cross-equation
    // <use> refs into a shared cache that won't exist when equations render and
    // cache independently).
    const texInput = new TeX({ packages: AllPackages });
    const svgOutput = new SVG({ fontCache: 'none' });
    _doc = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });
    return true;
  } catch (e) {
    // If mathjax-full can't initialize in this JS engine (e.g. Hermes), record
    // it once so callers can fall back (raw TeX, or a WebView renderer behind the
    // same resolver interface) instead of throwing on every equation.
    _initError = String((e && (e as Error).message) || e);
    return false;
  }
}

// True if the engine failed to initialize in this runtime. Lets a caller decide
// to swap in the WebView fallback. Only meaningful after the first render attempt.
export function mathEngineUnavailable(): boolean {
  return _initError != null;
}

export function texToSvg(tex: string, display = false): SvgResult | { error: string } {
  if (!ensureDoc()) return { error: _initError || 'math engine unavailable' };
  try {
    const node = _doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 1000000 });
    const svg: string = _adaptor.innerHTML(node);
    // MathJax doesn't throw on malformed TeX — it emits a red `merror` box. Treat
    // that as a failure so the caller falls back to raw TeX (e.g. the `€10`
    // currency-in-math-mode cases) instead of showing an error box to the reader.
    if (svg.includes('data-mjx-error') || svg.includes('data-mml-node="merror"')) {
      const m = svg.match(/data-mjx-error="([^"]*)"/);
      return { error: m ? m[1] : 'malformed TeX' };
    }
    // MathJax sizes SVGs in ex units on the root <svg width/height>; pull them so
    // the renderer can lay out without measuring.
    const wm = svg.match(/width="([0-9.]+)ex"/);
    const hm = svg.match(/height="([0-9.]+)ex"/);
    return {
      svg,
      width: wm ? parseFloat(wm[1]) : null,
      height: hm ? parseFloat(hm[1]) : null,
    };
  } catch (e) {
    return { error: String((e && (e as Error).message) || e) };
  }
}
