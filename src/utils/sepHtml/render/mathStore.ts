// Client-side math cache: render once on the device, store, reuse.
//
// The flow is "the client builds the SVGs and then stores them":
//   1. First time an equation is seen, render it on-device (texToSvg).
//   2. Keep it in an in-memory Map for the rest of the session.
//   3. Persist it to the local `math` table so future sessions skip the render.
//
// Nothing is pre-rendered at build time and nothing ships in our artifact — the
// SVG is a runtime artifact created from TeX the user already fetched. See
// texToSvg.ts and NOTICE.md.
//
// MathSvg's resolver is synchronous, and MathJax conversion is synchronous, so
// `resolveMath` renders-on-miss inline and returns immediately. DB persistence
// is fire-and-forget; DB hydration (warming the Map from a previous session) is
// an async step the screen can run before render via `hydrateMath`.

import { getMathByHashes, putMath } from '../../../services/db';
import { texToSvg } from './texToSvg';
import type { ResolvedMath } from './MathSvg';

// Stable, synchronous cache key. Does not need to match any build-time hash
// (there is no build-time store anymore) — only to be collision-resistant across
// the ~10^5 distinct short equations a device might ever render. 64-bit FNV-1a
// (two interleaved lanes) as base36 keeps it short for use as a SQLite PK.
export function mathHash(tex: string, display: boolean): string {
  const s = (display ? 'D' : 'I') + tex;
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x1234567;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

// hash -> resolved SVG, or null for an equation that failed to render (so we
// don't retry it every frame; MathSvg shows raw TeX for nulls).
const mem = new Map<string, ResolvedMath | null>();

// Synchronous resolver passed to <SepArticle resolveMath={...}>. Renders on miss,
// memoizes, and queues a write to the local DB.
export function resolveMath(tex: string, display: boolean): ResolvedMath | null {
  const key = mathHash(tex, display);
  const hit = mem.get(key);
  if (hit !== undefined) return hit;

  const r = texToSvg(tex, display);
  if ('error' in r) {
    mem.set(key, null);
    return null;
  }
  const resolved: ResolvedMath = { svg: r.svg, w: r.width ?? 1, h: r.height ?? 1 };
  mem.set(key, resolved);
  // Persist for future sessions; failure is non-fatal (we can always re-render).
  void putMath(key, resolved.svg, resolved.w, resolved.h, display).catch(() => {});
  return resolved;
}

// Warm the in-memory Map from the local DB for a set of equations before they
// render, so a math-heavy article that was read in a prior session doesn't pay
// the render cost again. Safe to call with the full list of an article's math
// nodes; unknown hashes are simply absent and fall through to render-on-miss.
export async function hydrateMath(nodes: Array<{ tex: string; display: boolean }>): Promise<void> {
  const wanted: string[] = [];
  for (const n of nodes) {
    const key = mathHash(n.tex, n.display);
    if (!mem.has(key)) wanted.push(key);
  }
  if (wanted.length === 0) return;
  try {
    const rows = await getMathByHashes(wanted);
    for (const row of rows) {
      mem.set(row.hash, { svg: row.svg, w: row.w, h: row.h });
    }
  } catch {
    // DB unavailable — render-on-miss still works, just without the warm cache.
  }
}

// Test/diagnostic hook.
export function _clearMathCache(): void {
  mem.clear();
}
