// Bridge to the hidden MathRenderWebView. MathJax (mathjax-full) cannot run in
// the Hermes JS runtime — it fails at module init ("Cannot read property
// 'mathjax' of undefined"). So TeX → SVG rendering happens inside a real browser
// engine: an off-screen WebView that loads MathJax and converts equations on
// request. The resulting SVGs are baked into content_html as <math-i> elements
// (see catalog.ts), so the native renderer never needs MathJax at read time.
//
// MathJax is stored as a Metro asset (src/assets/mathjax-full.b64) rather than
// a JS module so it's not parsed on every cold start. It's loaded from disk once
// and injected into the WebView. In full-library mode (downloadAll), App.tsx
// calls preloadMathJax() at boot; otherwise it's deferred to first use.

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

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
let domReady = false;
let resolveReady: (() => void) | null = null;
let readyPromise: Promise<void> = new Promise(r => { resolveReady = r; });
let mathJaxLoading: Promise<void> | null = null;

let seq = 0;
const pending = new Map<number, (results: MathResult[]) => void>();

// Called by MathRenderWebView once mounted, passing its injectJavaScript fn.
export function _registerInject(fn: (js: string) => void): void {
  injectFn = fn;
}

// Called by MathRenderWebView when the WebView DOM is ready (onLoadEnd).
// Does NOT inject MathJax — that happens via preloadMathJax() or first render.
export function _signalDomReady(): void {
  domReady = true;
  // If preloadMathJax was called before the DOM was ready, kick it off now.
  if (mathJaxLoading === null) return;
  // Nothing to do — mathJaxLoading promise is already in flight and will inject
  // once injectFn becomes available. But injectFn was set before domReady, so
  // by the time _signalDomReady fires, injectFn exists and mathJaxLoading can proceed.
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
    domReady = false;
    mathJaxLoading = null;
    readyPromise = new Promise(r => { resolveReady = r; });
  }
}

// Load the MathJax asset from disk and inject it into the WebView.
// Safe to call multiple times — only runs once.
export function preloadMathJax(): Promise<void> {
  if (mathJaxLoading) return mathJaxLoading;
  mathJaxLoading = (async () => {
    const asset = Asset.fromModule(require('../assets/mathjax-full.b64'));
    await asset.downloadAsync();
    const b64 = await FileSystem.readAsStringAsync(asset.localUri!);
    const js = `(function(){
  try {
    var src = atob(${JSON.stringify(b64)});
    var s = document.createElement('script');
    s.text = src;
    document.head.appendChild(s);
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',error:String(e)}));
  }
})(); true;`;
    injectFn?.(js);
  })().catch(() => { mathJaxLoading = null; });
  return mathJaxLoading!;
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
  // Trigger MathJax load if it hasn't been started yet (lazy mode).
  preloadMathJax();
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
