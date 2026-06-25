import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Svg, { Line, Circle, G, Rect, Text as SvgText, Path } from 'react-native-svg';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, runOnJS, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getEntryPreview, getMeta, setMeta } from '../services/db';
import { getArticleLinkGraph, getLayoutCache, setLayoutCache } from '../services/graphDb';
import type { GraphNode, GraphEdge, GraphData, GraphView, CachedPosition } from '../services/graphDb';
import { forceLayout, slugSeed } from '../utils/forceLayout';
import type { LayoutNode } from '../utils/forceLayout';
import { getGraph } from '../services/inpho';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Graph'>;



// Vertical timeline: newest at top (small y), oldest at bottom (large y).
// Nodes default to center x and jitter left/right only when crowded.
function timelineLayout(nodes: GraphNode[], width: number, height: number): LayoutNode[] {
  const dated = nodes.filter(n => typeof n.birthYear === 'number');
  const undated = nodes.filter(n => typeof n.birthYear !== 'number');

  if (!dated.length) {
    return undated.map((n, i) => ({ ...n, x: width / 2, y: 60 + i * 50 }));
  }

  // Sort ascending so index 0 = oldest (most negative / smallest year)
  const sorted = [...dated].sort((a, b) => (a.birthYear as number) - (b.birthYear as number));
  const minYear = sorted[0].birthYear as number;
  const maxYear = sorted[sorted.length - 1].birthYear as number;
  const span = Math.max(1, maxYear - minYear);

  const PAD_T = 60;
  const usableH = Math.max(100, height - PAD_T - 60);
  const cx = width / 2;
  const JITTER = width * 0.12; // horizontal nudge per side when crowded
  const MIN_SEP = 28;          // minimum y gap enforced between adjacent nodes

  // Oldest → BOTTOM (large y = PAD_T + usableH), Newest → TOP (small y = PAD_T)
  const placed: LayoutNode[] = sorted.map(node => ({
    ...node,
    x: cx,
    y: PAD_T + (maxYear - (node.birthYear as number)) / span * usableH,
  }));

  // Sort by y ascending (top of screen first) so we can enforce spacing
  const byY = [...placed].sort((a, b) => a.y - b.y);

  // Push nodes DOWN if too close to the one above (preserves relative order)
  for (let i = 1; i < byY.length; i++) {
    if (byY[i].y < byY[i - 1].y + MIN_SEP) {
      byY[i].y = byY[i - 1].y + MIN_SEP;
    }
  }

  // Jitter x for clusters of nearby nodes (zigzag left/right from center)
  let i = 0;
  while (i < byY.length) {
    let j = i + 1;
    while (j < byY.length && byY[j].y - byY[j - 1].y <= MIN_SEP * 1.1) j++;
    if (j - i > 1) {
      for (let k = i; k < j; k++) {
        byY[k].x = cx + ((k - i) % 2 === 0 ? -JITTER : JITTER);
      }
    }
    i = j;
  }

  // byY entries are same objects as placed, so mutations propagate
  undated.forEach((n, k) => {
    const maxY = placed.reduce((m, p) => Math.max(m, p.y), 0);
    placed.push({ ...n, x: cx, y: maxY + 30 + k * 50 });
  });

  return placed;
}

function formatYear(y: number): string {
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
}

const READ_COLOR = { fill: '#1a3528', stroke: '#4aaf70' };   // ≥ 90 % read — green
const PROG_COLOR = { fill: '#1e2a40', stroke: '#4a7fd4' };   // opened, in progress — blue
const UNVISITED  = { fill: '#1e1e26', stroke: '#3a3a4a' };   // never opened — grey

// label visibility driven by zoom level — none < 0.7 < partial < 1.4 < all < 2.5 < full
type LabelMode = 'none' | 'partial' | 'all' | 'full';

function labelModeForScale(s: number): LabelMode {
  'worklet';
  if (s < 0.7) return 'none';
  if (s < 1.4) return 'partial';
  if (s < 2.5) return 'all';
  return 'full';
}


function IconArrowUp({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;

export default function GraphScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const centerSlug = route.params?.centerSlug;
  const centerTitle = (route.params as any)?.centerTitle as string | undefined;
  const { width, height } = useWindowDimensions();

  const [mode, setMode] = useState<GraphView>('links');
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [visitedOnly, setVisitedOnly] = useState(false);
  useEffect(() => { getMeta('graph_visited_only').then(v => { if (v === '1') setVisitedOnly(true); }); }, []);
  const toggleVisitedOnly = () => setVisitedOnly(v => { setMeta('graph_visited_only', v ? '0' : '1').catch(() => {}); return !v; });
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ slug: string; title: string } | null>(null);
  const [preview, setPreview] = useState<{ author: string | null; excerpt: string | null } | null>(null);
  const [labelMode, setLabelMode] = useState<LabelMode>('partial');

  // When visitedOnly, filter rawData to center + visited nodes only.
  const displayData = useMemo<GraphData>(() => {
    if (!rawData) return { nodes: [], edges: [] };
    if (!visitedOnly) return rawData;
    const keepSlugs = new Set(
      rawData.nodes.filter(n => n.read || n.slug === centerSlug).map(n => n.slug)
    );
    return {
      nodes: rawData.nodes.filter(n => keepSlugs.has(n.slug)),
      edges: rawData.edges.filter(e => keepSlugs.has(e.from_slug) && keepSlugs.has(e.to_slug)),
    };
  }, [rawData, visitedOnly, centerSlug]);

  const canvasH = height - insets.top - 44 - 40 - insets.bottom;

  // ── Reanimated pan + zoom state ──────────────────────────────────────────
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const focalX0 = useSharedValue(0);
  const focalY0 = useSharedValue(0);

  // Keep sharedValues for canvas dimensions accessible in worklets
  const widthSV = useSharedValue(width);
  const canvasHSV = useSharedValue(canvasH);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { widthSV.value = width; canvasHSV.value = canvasH; }, [width, canvasH]);

  // Drive label visibility from zoom level
  useAnimatedReaction(
    () => scale.value,
    (cur, prev) => {
      if (cur === prev) return;
      const next = labelModeForScale(cur);
      runOnJS(setLabelMode)(next);
    },
  );

  // Reset pan/zoom whenever the graph data changes (shared values intentionally omitted)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scale.value = 1; translateX.value = 0; translateY.value = 0; }, [nodes]);

  // ── Gestures ─────────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      'worklet';
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onChange(e => {
      'worklet';
      translateX.value = savedTx.value + e.translationX;
      translateY.value = savedTy.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(e => {
      'worklet';
      savedScale.value = scale.value;
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
      focalX0.value = e.focalX;
      focalY0.value = e.focalY;
    })
    .onChange(e => {
      'worklet';
      // Clamp scale
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = s;
      const ratio = s / savedScale.value;
      // Keep the initial focal world-point fixed under the current focal screen position.
      // With transformOrigin '0% 0%': screen = world * scale + translate
      translateX.value = e.focalX - (focalX0.value - savedTx.value) * ratio;
      translateY.value = e.focalY - (focalY0.value - savedTy.value) * ratio;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withSpring(1, { damping: 20, stiffness: 200 });
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const gesture = Gesture.Simultaneous(doubleTap, panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as any,
  }));

  // ── Data fetch — only re-runs when the entry or mode changes, not on rotation.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRawData(null);
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

  // ── Layout — recomputes whenever data or dimensions change (rotation re-lays
  // without re-fetching). The seeded PRNG ensures stable scatter per entry+mode.
  useEffect(() => {
    if (!rawData || displayData.nodes.length === 0) return;
    setEdges(displayData.edges);

    if (mode === 'timeline') {
      setNodes(timelineLayout(displayData.nodes, width, canvasH));
      setLoading(false);
      return;
    }

    // Check on-device layout cache first — settled positions from a prior open.
    let cancelled = false;
    const nodeSlugs = displayData.nodes.map(n => n.slug);

    getLayoutCache(centerSlug ?? '', mode, nodeSlugs).then(cached => {
      if (cancelled) return;
      if (cached) {
        // Cache hit: reconstruct LayoutNodes immediately, no force computation.
        const posMap = new Map(cached.map(p => [p.slug, p]));
        setNodes(displayData.nodes.map(node => {
          const p = posMap.get(node.slug);
          return { ...node, x: (p?.xRel ?? 0.5) * width, y: (p?.yRel ?? 0.5) * canvasH };
        }));
        setLoading(false);
        return;
      }

      // Cache miss: drive the generator one chunk at a time, yielding to the
      // event loop between batches so the UI stays responsive.
      const gen = forceLayout(displayData.nodes, displayData.edges, width, canvasH, centerSlug, slugSeed((centerSlug ?? '') + mode));
      let firstYield = true;
      let lastLayout: LayoutNode[] | null = null;

      function step() {
        const { value, done } = gen.next();
        if (cancelled) return;
        if (value) {
          setNodes(value);
          if (firstYield) { setLoading(false); firstYield = false; }
          lastLayout = value;
        }
        if (done && lastLayout) {
          const positions: CachedPosition[] = lastLayout.map(ln => ({
            slug: ln.slug, xRel: ln.x / width, yRel: ln.y / canvasH,
          }));
          setLayoutCache(centerSlug ?? '', mode, nodeSlugs, positions).catch(() => {});
        }
        if (!done) setTimeout(step, 0);
      }
      step();
    });

    return () => { cancelled = true; };
  }, [displayData, width, canvasH, centerSlug, mode]);

  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.slug, n])),
    [nodes]
  );

  // Detect substantial gaps in the timeline and produce break markers.
  const timelineBreaks = useMemo(() => {
    if (mode !== 'timeline') return [];
    const dated = nodes
      .filter(n => typeof n.birthYear === 'number')
      .sort((a, b) => (a.birthYear as number) - (b.birthYear as number));
    if (dated.length < 2) return [];

    const pairs = dated.slice(1).map((n, i) => ({
      older: dated[i],   // lower on screen (higher y)
      newer: n,          // higher on screen (lower y)
      gapYears: (n.birthYear as number) - (dated[i].birthYear as number),
    })).filter(p => p.gapYears > 0);

    if (!pairs.length) return [];

    const sorted = [...pairs].sort((a, b) => a.gapYears - b.gapYears);
    const median = sorted[Math.floor(sorted.length / 2)].gapYears;
    const threshold = Math.max(50, median * 2.5);

    return pairs
      .filter(p => p.gapYears >= threshold)
      .map(p => ({
        fromYear: p.older.birthYear as number,
        toYear: p.newer.birthYear as number,
        yOlder: p.older.y,  // higher value (bottom of screen)
        yNewer: p.newer.y,  // lower value (top of screen)
      }));
  }, [nodes, mode]);

  const open = (slug: string, title: string) =>
    nav.push('Article', { slug, title });

  const selectNode = (slug: string, title: string) => {
    setSelected({ slug, title });
    setPreview(null);
    getEntryPreview(slug).then(p => {
      if (p) setPreview({ author: p.author, excerpt: p.excerpt });
    });
  };

  // ── Label rendering helpers ───────────────────────────────────────────────
  const getLabel = (node: LayoutNode) => {
    const yr = typeof node.birthYear === 'number'
      ? ` (${node.birthYear < 0 ? Math.abs(node.birthYear) + ' BCE' : node.birthYear})` : '';
    const title = labelMode === 'full'
      ? node.title
      : node.title.length > 22 ? node.title.slice(0, 20) + '…' : node.title;
    return title + (mode === 'timeline' ? yr : '');
  };

  const showLabel = (node: LayoutNode): boolean => {
    const isCenter = node.slug === centerSlug;
    if (labelMode === 'none') return false;
    if (!node.read && !isCenter && mode !== 'timeline') return false;
    if (labelMode === 'partial') return isCenter || !!node.read || mode === 'timeline';
    return true; // 'all' | 'full'
  };

  const labelColor = (node: LayoutNode): string => {
    if (node.slug === centerSlug) return '#5b8ef5';
    if ((node.readProgress ?? 0) >= 0.9) return '#4aaf70';
    return '#4a7fd4';
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
        <TouchableOpacity
          style={[styles.visitedToggle, visitedOnly && styles.visitedToggleOn]}
          onPress={toggleVisitedOnly}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.visitedToggleText, visitedOnly && styles.visitedToggleTextOn]}>
            Visited
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── View switcher ── */}
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
                ? "This article has no cross-references to other entries yet,\nor it hasn’t been cached — open it once to index its links."
                : mode === 'influence'
                ? 'InPhO has no teacher/student/influence edges for this entry.'
                : mode === 'timeline'
                ? 'No related thinkers with recorded dates were found.'
                : "InPhO has no related ideas or thinkers for this entry,\nor the index is still syncing — check your connection."}
            </Text>
          </View>
        ) : (
          <GestureDetector gesture={gesture}>
            <Reanimated.View style={[styles.canvasInner, animatedStyle]}>
              <Svg width={width} height={canvasH}>
                {/* ── Timeline break markers (rendered first, behind everything) ── */}
                {timelineBreaks.map((brk, i) => {
                  const NODE_R = 8;
                  const brkTop = brk.yNewer + NODE_R + 12;
                  const brkBot = brk.yOlder - NODE_R - 12;
                  const brkH = brkBot - brkTop;
                  if (brkH < 28) return null;
                  const midY = brkTop + brkH / 2;
                  const label = `${formatYear(brk.fromYear)}  —  ${formatYear(brk.toYear)}`;
                  return (
                    <G key={`brk-${i}`}>
                      <Rect
                        x={0} y={brkTop}
                        width={width} height={brkH}
                        fill="rgba(22,22,30,0.85)"
                      />
                      <Line
                        x1={0} y1={brkTop} x2={width} y2={brkTop}
                        stroke="#2a2a38" strokeWidth={1}
                        strokeDasharray="5,5"
                      />
                      <Line
                        x1={0} y1={brkBot} x2={width} y2={brkBot}
                        stroke="#2a2a38" strokeWidth={1}
                        strokeDasharray="5,5"
                      />
                      <SvgText
                        x={width / 2} y={midY - 7}
                        textAnchor="middle"
                        fontSize={8} fill="#333344"
                        fontWeight="700"
                        letterSpacing={1.5}
                      >
                        BREAK
                      </SvgText>
                      <SvgText
                        x={width / 2} y={midY + 9}
                        textAnchor="middle"
                        fontSize={10} fill="#38384e"
                        fontWeight="500"
                      >
                        {label}
                      </SvgText>
                    </G>
                  );
                })}

                {/* ── Edges ── */}
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

                {/* ── Nodes ── */}
                {nodes.map(node => {
                  const isCenter = node.slug === centerSlug;
                  const isVisited = isCenter || node.read;
                  const progress = node.readProgress ?? 0;
                  const nc = isCenter ? { fill: '#5b8ef5', stroke: '#5b8ef5' }
                    : !isVisited ? UNVISITED
                    : progress >= 0.9 ? READ_COLOR
                    : PROG_COLOR;
                  const r = isCenter ? 11 : isVisited ? (node.kind === 'thinker' ? 7 : 6) : 4;
                  const fill = nc.fill;
                  const stroke = nc.stroke;
                  const isTimeline = mode === 'timeline';
                  const laneLeft = isTimeline && node.x < width / 2;
                  // Timeline: labels branch outward from their lane; other modes: below node.
                  const lx = isTimeline ? (laneLeft ? node.x - r - 6 : node.x + r + 6) : node.x;
                  const ly = isTimeline ? node.y + 3 : node.y + r + 12;
                  const anchor = isTimeline ? (laneLeft ? 'end' : 'start') : 'middle';
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
                        strokeWidth={isVisited ? 1.5 : 1}
                      />
                      {showLabel(node) && (
                        <SvgText
                          x={lx}
                          y={ly}
                          textAnchor={anchor}
                          fontSize={9}
                          fill={labelColor(node)}
                        >
                          {getLabel(node)}
                        </SvgText>
                      )}
                    </G>
                  );
                })}
              </Svg>
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* ── Legend ── */}
        <View style={[styles.legend, { bottom: insets.bottom + 12 }]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#5b8ef5' }]} />
            <Text style={styles.legendLabel}>This entry</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: READ_COLOR.fill, borderWidth: 1, borderColor: READ_COLOR.stroke }]} />
            <Text style={styles.legendLabel}>Read</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PROG_COLOR.fill, borderWidth: 1, borderColor: PROG_COLOR.stroke }]} />
            <Text style={styles.legendLabel}>In progress</Text>
          </View>
          {!visitedOnly && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: UNVISITED.fill, borderWidth: 1, borderColor: UNVISITED.stroke }]} />
              <Text style={styles.legendLabel}>Unvisited</Text>
            </View>
          )}
        </View>

        {/* ── Zoom hint ── */}
        <View style={styles.zoomHint} pointerEvents="none">
          <Text style={styles.zoomHintText}>Pinch to zoom · Double-tap to reset</Text>
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
  visitedToggle: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  visitedToggleOn: {},
  visitedToggleText: { fontSize: 11, fontWeight: '600', color: '#555', letterSpacing: 0.3 },
  visitedToggleTextOn: { color: '#5b8ef5' },
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

  zoomHint: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  zoomHintText: {
    color: '#2e2e2e',
    fontSize: 10,
    fontWeight: '500',
  },

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
