import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, PanResponder, Animated,
  TouchableOpacity, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getEntryPreview } from '../services/db';
import { getArticleLinkGraph } from '../services/graphDb';
import type { GraphNode, GraphEdge, GraphData, GraphView } from '../services/graphDb';
import { getGraph } from '../services/inpho';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Graph'>;

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
}

// Seeded PRNG (xorshift-derived) so the same article+mode always produces the
// same initial scatter, keeping the layout stable across mode switches/rotations.
function seededRand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1) >>> 0;
    s = (s ^ (s + (Math.imul(s ^ (s >>> 7), s | 61) >>> 0))) >>> 0;
    return (s ^ (s >>> 14)) / 0xffffffff;
  };
}

function slugSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  centerSlug?: string,
  seed = 0,
): LayoutNode[] {
  const W = width / 2, H = height / 2;
  const n = nodes.length;
  const k = Math.sqrt((width * height) / Math.max(n, 1)) * 0.8;
  const rand = seededRand(seed);

  const layout: LayoutNode[] = nodes.map(node => ({
    ...node,
    x: node.slug === centerSlug ? W : W + (rand() - 0.5) * width * 0.7,
    y: node.slug === centerSlug ? H : H + (rand() - 0.5) * height * 0.7,
  }));

  const slugIndex = new Map(layout.map((n, i) => [n.slug, i]));

  const iterations = Math.min(120, 60 + n);
  for (let iter = 0; iter < iterations; iter++) {
    const fx = new Float32Array(n);
    const fy = new Float32Array(n);
    const temp = Math.max(5, (1 - iter / iterations) * 80);

    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = layout[i].x - layout[j].x || 0.1;
        const dy = layout[i].y - layout[j].y || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (k * k) / dist;
        const fx_ = (dx / dist) * force;
        const fy_ = (dy / dist) * force;
        fx[i] += fx_; fy[i] += fy_;
        fx[j] -= fx_; fy[j] -= fy_;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const ai = slugIndex.get(edge.from_slug);
      const bi = slugIndex.get(edge.to_slug);
      if (ai == null || bi == null) continue;
      const dx = layout[bi].x - layout[ai].x;
      const dy = layout[bi].y - layout[ai].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist * dist) / k;
      const fx_ = (dx / dist) * force;
      const fy_ = (dy / dist) * force;
      fx[ai] += fx_; fy[ai] += fy_;
      fx[bi] -= fx_; fy[bi] -= fy_;
    }

    // Gravity toward center
    for (let i = 0; i < n; i++) {
      if (layout[i].slug === centerSlug) continue;
      fx[i] += (W - layout[i].x) * 0.01;
      fy[i] += (H - layout[i].y) * 0.01;
    }

    // Apply with temperature
    for (let i = 0; i < n; i++) {
      if (layout[i].slug === centerSlug) continue;
      const dist = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) || 1;
      const clamped = Math.min(dist, temp);
      layout[i].x += (fx[i] / dist) * clamped;
      layout[i].y += (fy[i] / dist) * clamped;
      layout[i].x = Math.max(60, Math.min(width - 60, layout[i].x));
      layout[i].y = Math.max(40, Math.min(height - 40, layout[i].y));
    }
  }

  return layout;
}

// Chronological layout for Timeline mode: x = birth year (left=earliest), nodes
// with no date dropped into an "unknown" lane on the far left. y is staggered to
// reduce label overlap.
function timelineLayout(nodes: GraphNode[], width: number, height: number): LayoutNode[] {
  const dated = nodes.filter(n => typeof n.birthYear === 'number');
  const undatedNodes = nodes.filter(n => typeof n.birthYear !== 'number');
  const years = dated.map(n => n.birthYear as number);
  const minY = years.length ? Math.min(...years) : 0;
  const maxY = years.length ? Math.max(...years) : 1;
  const span = Math.max(1, maxY - minY);
  const padX = 70, usableW = Math.max(1, width - padX * 2);
  const laneH = 46;
  const lanes = Math.max(3, Math.floor((height - 80) / laneH));
  let i = 0;
  const place = (n: GraphNode, x: number): LayoutNode => {
    const lane = i++ % lanes;
    return { ...n, x, y: 60 + lane * laneH + ((i % 2) * 14) };
  };
  const out: LayoutNode[] = [];
  // Undated (incl. center if it has no year) sit in a left margin column.
  undatedNodes.forEach(n => out.push(place(n, 30)));
  dated
    .sort((a, b) => (a.birthYear as number) - (b.birthYear as number))
    .forEach(n => out.push(place(n, padX + (((n.birthYear as number) - minY) / span) * usableW)));
  return out;
}

const KIND_COLOR: Record<string, { fill: string; stroke: string }> = {
  entry:   { fill: '#5b8ef5', stroke: '#5b8ef5' },
  idea:    { fill: '#1f3a36', stroke: '#3fa796' },
  thinker: { fill: '#3a2e1a', stroke: '#c79a3f' },
  linked:  { fill: '#26324a', stroke: '#5b8ef5' }, // neighbouring entry (Links view)
};

function IconArrowUp({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

export default function GraphScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const centerSlug = route.params?.centerSlug;
  const centerTitle = (route.params as any)?.centerTitle as string | undefined;
  const { width, height } = useWindowDimensions();

  const [mode, setMode] = useState<GraphView>('links');
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ slug: string; title: string } | null>(null);
  const [preview, setPreview] = useState<{ author: string | null; excerpt: string | null } | null>(null);

  const canvasH = height - insets.top - 44 - 40 - insets.bottom; // header + mode bar

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    pan.addListener(v => { panOffset.current = v; });
    return () => pan.removeAllListeners();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => pan.setOffset(panOffset.current),
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => pan.flattenOffset(),
    })
  ).current;

  // Data fetch — only re-runs when the entry or mode changes, not on rotation.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRawData(null);
    // 'links' is the SEP hyperlink neighbourhood (our own link index); the other
    // modes are the InPhO semantic graph.
    const load = mode === 'links'
      ? getArticleLinkGraph(centerSlug ?? '')
      : getGraph(centerSlug ?? '', mode);
    load.then(data => {
      if (!cancelled) setRawData(data);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [centerSlug, mode]);

  // Layout — recomputes whenever data or dimensions change (rotation re-lays
  // without re-fetching). The seeded PRNG ensures stable scatter per entry+mode.
  useEffect(() => {
    if (!rawData) return;
    const laid = mode === 'timeline'
      ? timelineLayout(rawData.nodes, width, canvasH)
      : forceLayout(rawData.nodes, rawData.edges, width, canvasH, centerSlug, slugSeed((centerSlug ?? '') + mode));
    setNodes(laid);
    setEdges(rawData.edges);
    setLoading(false);
  }, [rawData, width, canvasH, centerSlug, mode]);

  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.slug, n])),
    [nodes]
  );

  const open = (slug: string, title: string) =>
    nav.push('Article', { slug, title });

  // Tap a node → show a preview card first (excerpt loads lazily).
  const selectNode = (slug: string, title: string) => {
    setSelected({ slug, title });
    setPreview(null);
    getEntryPreview(slug).then(p => {
      if (p) setPreview({ author: p.author, excerpt: p.excerpt });
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => nav.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconArrowUp color="#9a9a9a" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>GRAPH</Text>
          {centerTitle ? (
            <Text style={styles.headerTitle} numberOfLines={1}>{centerTitle}</Text>
          ) : null}
        </View>
        <View style={styles.back} />
      </View>

      {/* ── View switcher (Links / Related / Timeline / Influence) ── */}
      <View style={styles.modeBar}>
        {(['links', 'related', 'timeline', 'influence'] as GraphView[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeChip, mode === m && styles.modeChipActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.7}
          >
            <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
              {m === 'links' ? 'Links' : m === 'related' ? 'Related' : m === 'timeline' ? 'Timeline' : 'Influence'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.canvas, { height: canvasH }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#5b8ef5" />
            <Text style={styles.loadingLabel}>Mapping connections…</Text>
          </View>
        ) : nodes.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyTitle}>
              {mode === 'links' ? 'No links' : mode === 'influence' ? 'No influence links' : mode === 'timeline' ? 'No dated thinkers' : 'No connections'}
            </Text>
            <Text style={styles.emptyHint}>
              {mode === 'links'
                ? 'This article has no cross-references to other entries yet,\nor it hasn’t been cached — open it once to index its links.'
                : mode === 'influence'
                ? 'InPhO has no teacher/student/influence edges for this entry.'
                : mode === 'timeline'
                ? 'No related thinkers with recorded dates were found.'
                : 'InPhO has no related ideas or thinkers for this entry,\nor the index is still syncing — check your connection.'}
            </Text>
          </View>
        ) : (
          <Animated.View
            style={[styles.canvasInner, { transform: pan.getTranslateTransform() }]}
            {...panResponder.panHandlers}
          >
            <Svg width={width} height={canvasH}>
              {edges.map((e, i) => {
                const a = nodeMap.get(e.from_slug);
                const b = nodeMap.get(e.to_slug);
                if (!a || !b) return null;
                return (
                  <Line
                    key={i}
                    x1={a.x} y1={a.y}
                    x2={b.x} y2={b.y}
                    stroke="#252525"
                    strokeWidth={1}
                  />
                );
              })}
              {nodes.map(node => {
                const isCenter = node.slug === centerSlug;
                const kc = KIND_COLOR[node.kind ?? 'idea'] ?? KIND_COLOR.idea;
                const r = isCenter ? 11 : node.kind === 'thinker' ? 7 : 6;
                const fill = kc.fill;
                const stroke = kc.stroke;
                // Unread linked neighbours are dimmed so read entries stand out.
                const opacity = (!isCenter && mode === 'links' && !node.read) ? 0.35 : 1;
                // In Timeline mode every node is labelled; otherwise only center + read.
                const showLabel = mode === 'timeline' || node.read || isCenter;
                const yr = typeof node.birthYear === 'number'
                  ? ` (${node.birthYear < 0 ? Math.abs(node.birthYear) + ' BCE' : node.birthYear})` : '';
                const base = node.title.length > 22 ? node.title.slice(0, 20) + '…' : node.title;
                const label = base + (mode === 'timeline' ? yr : '');
                return (
                  <G
                    key={node.slug}
                    onPress={() => selectNode(node.slug, node.title)}
                  >
                    <Circle
                      cx={node.x} cy={node.y}
                      r={r + 8}
                      fill="transparent"
                    />
                    <Circle
                      cx={node.x} cy={node.y}
                      r={r}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                      opacity={opacity}
                    />
                    {showLabel && (
                      <SvgText
                        x={node.x}
                        y={node.y + r + 12}
                        textAnchor="middle"
                        fontSize={9}
                        fill={isCenter ? '#5b8ef5' : node.kind === 'thinker' ? '#c79a3f' : node.kind === 'linked' ? '#7da0d8' : '#3fa796'}
                      >
                        {label}
                      </SvgText>
                    )}
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
        )}
        {/* ── Legend (bottom-left overlay) ── */}
        <View style={[styles.legend, { bottom: insets.bottom + 12 }]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#5b8ef5' }]} />
            <Text style={styles.legendLabel}>This entry</Text>
          </View>
          {mode === 'links' ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#26324a', borderWidth: 1, borderColor: '#5b8ef5' }]} />
              <Text style={styles.legendLabel}>Linked entry</Text>
            </View>
          ) : (
            <>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#1f3a36', borderWidth: 1, borderColor: '#3fa796' }]} />
                <Text style={styles.legendLabel}>Idea</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#3a2e1a', borderWidth: 1, borderColor: '#c79a3f' }]} />
                <Text style={styles.legendLabel}>Thinker</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ── Node preview card ── */}
      {selected && (
        <>
          <TouchableOpacity
            style={styles.previewBackdrop}
            activeOpacity={1}
            onPress={() => { setSelected(null); setPreview(null); }}
          />
          <View style={[styles.previewCard, { bottom: insets.bottom + 64 }]}>
            <Text style={styles.previewTitle} numberOfLines={2}>{selected.title}</Text>
            {preview?.author ? (
              <Text style={styles.previewAuthor} numberOfLines={1}>{preview.author}</Text>
            ) : null}
            {preview?.excerpt ? (
              <Text style={styles.previewExcerpt} numberOfLines={3}>{preview.excerpt}</Text>
            ) : (
              <Text style={styles.previewExcerpt}>Not yet downloaded — open to read.</Text>
            )}
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => { const s = selected; setSelected(null); setPreview(null); open(s.slug, s.title); }}
              activeOpacity={0.8}
            >
              <Text style={styles.previewBtnText}>Open article →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    minHeight: 44,
    backgroundColor: '#111111',
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerEyebrow: {
    fontSize: 11, fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: 0.07 * 11,
    color: '#555555',
  },
  headerTitle: {
    fontSize: 14, fontWeight: '600', color: '#e4e4e4', textAlign: 'center',
  },

  modeBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#111111',
    height: 40,
    alignItems: 'center',
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modeChipActive: { backgroundColor: 'rgba(91,142,245,0.14)', borderColor: 'rgba(91,142,245,0.4)' },
  modeChipText: { color: '#777', fontSize: 12.5, fontWeight: '600' },
  modeChipTextActive: { color: '#5b8ef5' },

  canvas: { flex: 1, overflow: 'hidden', position: 'relative' },
  canvasInner: { flex: 1 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLabel: { color: '#444', fontSize: 13 },
  emptyTitle: { color: '#555', fontSize: 17, fontWeight: '500' },
  emptyHint: { color: '#333', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 21 },

  legend: {
    position: 'absolute',
    left: 16,
    flexDirection: 'column',
    gap: 6,
    backgroundColor: 'rgba(17,17,17,0.82)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: '#555555', fontSize: 11 },

  // Node preview card
  previewBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  previewCard: {
    position: 'absolute',
    left: 16, right: 16,
    backgroundColor: '#1c1c1c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  previewTitle: { color: '#e4e4e4', fontSize: 17, fontWeight: '700', lineHeight: 22 },
  previewAuthor: { color: '#555', fontSize: 12, marginTop: 4 },
  previewExcerpt: { color: '#9a9a9a', fontSize: 13, lineHeight: 19, marginTop: 8 },
  previewBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(91,142,245,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(91,142,245,0.35)',
  },
  previewBtnText: { color: '#5b8ef5', fontSize: 14, fontWeight: '600' },
});
