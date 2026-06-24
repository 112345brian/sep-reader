// Bridge to the hidden MathRenderWebView. MathJax (mathjax-full) cannot run in
// the Hermes JS runtime — it fails at module init ("Cannot read property
// 'mathjax' of undefined"). So TeX → SVG rendering happens inside a real browser
// engine: an off-screen WebView that loads MathJax and converts equations on
// request. The resulting SVGs are baked into content_html as <math-i> elements
// (see catalog.ts), so the native renderer never needs MathJax at read time.
//
// This module is the RN-side half: a singleton the WebView registers with, plus
// a promise-based renderMathBatch() the fetch/backfill pipeline calls.

export interface MathReq { tex: string; display: boolean }
export interface MathResult {
  tex: string;
  display: boolean;
  b64?: string; // base64 of the standalone SVG (encoded in the WebView)
  w?: number;
  h?: number;
  error?: string;
}

let injectFn: ((js: string) => void) | null = null;
let resolveReady: (() => void) | null = null;
let readyPromise: Promise<void> = new Promise(r => { resolveReady = r; });

let seq = 0;
const pending = new Map<number, (results: MathResult[]) => void>();

// Called by MathRenderWebView once mounted, passing its injectJavaScript fn.
export function _registerInject(fn: (js: string) => void): void {
  injectFn = fn;
}

// Called by MathRenderWebView when MathJax has finished initializing in-page.
export function _signalReady(): void {
  resolveReady?.();
}

// Called by MathRenderWebView for every postMessage from the page.
export function _onMessage(raw: string): void {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg?.type === 'ready') { _signalReady(); return; }
  if (msg?.type === 'result' && typeof msg.reqId === 'number') {
    const resolve = pending.get(msg.reqId);
    if (resolve) { pending.delete(msg.reqId); resolve(msg.out as MathResult[]); }
  }
}

// Reset hook for the component remounting (dev hot-reload safety).
export function _resetReady(): void {
  if (!injectFn) {
    readyPromise = new Promise(r => { resolveReady = r; });
  }
}

// Wait for a promise but give up after `ms`, resolving with `fallback` instead.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    p.then(v => { if (!done) { done = true; clearTimeout(t); resolve(v); } });
  });
}

// Render a batch of equations. Resolves once the WebView posts results back.
// Waits for MathJax init the first time. Each result carries b64+w+h or error.
// Times out (engine never readies, or a render hangs) so the fetch/backfill
// pipeline can fall back to raw TeX rather than blocking forever.
export async function renderMathBatch(items: MathReq[]): Promise<MathResult[]> {
  if (!items.length) return [];
  const errAll = (): MathResult[] => items.map(it => ({ ...it, error: 'timeout' }));
  // Wait up to 20s for MathJax to initialize the first time.
  const ready = await withTimeout(readyPromise.then(() => true), 20000, false);
  if (!ready || !injectFn) return errAll();
  const reqId = ++seq;
  const result = new Promise<MathResult[]>(resolve => pending.set(reqId, resolve));
  // JSON.stringify produces a valid JS literal, safe to embed in the injected call.
  injectFn(`window.__renderMath(${JSON.stringify({ reqId, items })}); true;`);
  // Generous per-batch timeout (large articles, slow devices).
  return withTimeout(result, 30000, errAll()).then(r => { pending.delete(reqId); return r; });
}

export function isMathWebViewReady(): boolean {
  return injectFn != null;
}
