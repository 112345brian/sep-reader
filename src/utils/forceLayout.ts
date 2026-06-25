import type { GraphNode, GraphEdge } from '../services/graphDb';

export interface LayoutNode extends GraphNode { x: number; y: number; }

function seededRand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1) >>> 0;
    s = (s ^ (s + (Math.imul(s ^ (s >>> 7), s | 61) >>> 0))) >>> 0;
    return (s ^ (s >>> 14)) / 0xffffffff;
  };
}

export function slugSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// Yields the initial scatter immediately, then a snapshot every CHUNK iterations
// so the caller can update state between batches and keep the JS thread free.
export function* forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  centerSlug?: string,
  seed = 0,
): Generator<LayoutNode[]> {
  const W = width / 2, H = height / 2;
  const n = nodes.length;
  const k = Math.sqrt((width * height) / Math.max(n, 1)) * 0.8;
  const k2 = k * k;
  const rand = seededRand(seed);

  const layout: LayoutNode[] = nodes.map(node => ({
    ...node,
    x: node.slug === centerSlug ? W : W + (rand() - 0.5) * width * 0.7,
    y: node.slug === centerSlug ? H : H + (rand() - 0.5) * height * 0.7,
  }));

  yield layout.map(ln => ({ ...ln }));

  const slugIndex = new Map(layout.map((ln, i) => [ln.slug, i]));
  const iterations = Math.max(25, Math.min(80, Math.floor(900 / Math.sqrt(Math.max(n, 1)))));
  const CHUNK = 8;

  for (let iter = 0; iter < iterations; iter++) {
    const fx = new Float32Array(n);
    const fy = new Float32Array(n);
    const temp = Math.max(5, (1 - iter / iterations) * 80);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = layout[i].x - layout[j].x || 0.1;
        const dy = layout[i].y - layout[j].y || 0.1;
        const s = k2 / Math.max(dx * dx + dy * dy, 0.01);
        fx[i] += dx * s; fy[i] += dy * s;
        fx[j] -= dx * s; fy[j] -= dy * s;
      }
    }

    for (const edge of edges) {
      const ai = slugIndex.get(edge.from_slug);
      const bi = slugIndex.get(edge.to_slug);
      if (ai == null || bi == null) continue;
      const dx = layout[bi].x - layout[ai].x;
      const dy = layout[bi].y - layout[ai].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist * dist) / k * (edge.weight ?? 1);
      const fx_ = (dx / dist) * force;
      const fy_ = (dy / dist) * force;
      fx[ai] += fx_; fy[ai] += fy_;
      fx[bi] -= fx_; fy[bi] -= fy_;
    }

    for (let i = 0; i < n; i++) {
      if (layout[i].slug === centerSlug) continue;
      fx[i] += (W - layout[i].x) * 0.01;
      fy[i] += (H - layout[i].y) * 0.01;
    }

    for (let i = 0; i < n; i++) {
      if (layout[i].slug === centerSlug) continue;
      const dist = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) || 1;
      const clamped = Math.min(dist, temp);
      layout[i].x += (fx[i] / dist) * clamped;
      layout[i].y += (fy[i] / dist) * clamped;
      layout[i].x = Math.max(60, Math.min(width - 60, layout[i].x));
      layout[i].y = Math.max(40, Math.min(height - 40, layout[i].y));
    }

    if ((iter + 1) % CHUNK === 0 || iter === iterations - 1) {
      yield layout.map(ln => ({ ...ln }));
    }
  }
}
