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
import { getGraphData, getEntryPreview } from '../services/db';
import type { GraphNode, GraphEdge } from '../services/db';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Graph'>;

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
}

function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  centerSlug?: string,
): LayoutNode[] {
  const W = width / 2, H = height / 2;
  const n = nodes.length;
  const k = Math.sqrt((width * height) / Math.max(n, 1)) * 0.8;

  const layout: LayoutNode[] = nodes.map(node => ({
    ...node,
    x: node.slug === centerSlug ? W : W + (Math.random() - 0.5) * width * 0.7,
    y: node.slug === centerSlug ? H : H + (Math.random() - 0.5) * height * 0.7,
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

  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ slug: string; title: string } | null>(null);
  const [preview, setPreview] = useState<{ author: string | null; excerpt: string | null } | null>(null);

  const canvasH = height - insets.top - 44 - insets.bottom;

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

  useEffect(() => {
    getGraphData().then(data => {
      const laid = forceLayout(data.nodes, data.edges, width, canvasH, centerSlug);
      setNodes(laid);
      setEdges(data.edges);
      setLoading(false);
    });
  }, [width, canvasH, centerSlug]);

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

      <View style={[styles.canvas, { height: canvasH }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#5b8ef5" />
            <Text style={styles.loadingLabel}>Mapping connections…</Text>
          </View>
        ) : nodes.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyTitle}>No connections yet</Text>
            <Text style={styles.emptyHint}>
              Read a few articles — the graph builds as you explore.
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
                const r = isCenter ? 11 : node.read ? 7 : 4;
                const fill = isCenter ? '#5b8ef5' : node.read ? '#1e2a4a' : '#1a1a1a';
                const stroke = isCenter ? '#5b8ef5' : node.read ? '#3a5a8a' : '#333';
                const label = node.title.length > 22
                  ? node.title.slice(0, 20) + '…'
                  : node.title;
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
                    />
                    {(node.read || isCenter) && (
                      <SvgText
                        x={node.x}
                        y={node.y + r + 12}
                        textAnchor="middle"
                        fontSize={9}
                        fill={isCenter ? '#5b8ef5' : '#555'}
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
            <Text style={styles.legendLabel}>Current</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#1e2a4a', borderWidth: 1, borderColor: '#3a5a8a' }]} />
            <Text style={styles.legendLabel}>Read</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' }]} />
            <Text style={styles.legendLabel}>Linked</Text>
          </View>
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
