import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions, ScrollView,
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
import { getEntryPreview, getEntry, getMeta, setMeta } from '../services/db';
import { makeExcerpt } from '../utils/excerpt';
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
  const [warming, setWarming] = useState(false);
  const [selected, setSelected] = useState<{ slug: string; title: string } | null>(null);
  const [preview, setPreview] = useState<{ author: string | null; excerpt: string | null; context: string | null } | null>(null);
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
  // The "fit" transform that frames every node — also the double-tap target.
  const fitScale = useSharedValue(1);
  const fitTx = useSharedValue(0);
  const fitTy = useSharedValue(0);
  // World-space bounding box of the nodes, used to clamp panning/zooming so the
  // graph can never be flung off-screen.
  const bMinX = useSharedValue(0);
  const bMaxX = useSharedValue(0);
  const bMinY = useSharedValue(0);
  const bMaxY = useSharedValue(0);
  // Mirror of labelMode on the UI thread so the zoom reaction only re-renders
  // React on an actual threshold crossing (not every frame).
  const labelModeSV = useSharedValue<LabelMode>('partial');

  // Keep sharedValues for canvas dimensions accessible in worklets
  const widthSV = useSharedValue(width);
  const canvasHSV = useSharedValue(canvasH);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { widthSV.value = width; canvasHSV.value = canvasH; }, [width, canvasH]);

  // Drive label visibility from zoom level — but only cross into React (a
  // re-render) when the mode actually changes, so a pinch doesn't fire a
  // setState every frame and recreate the SVG mid-gesture.
  useAnimatedReaction(
    () => scale.value,
    (cur) => {
      const next = labelModeForScale(cur);
      if (next !== labelModeSV.value) {
        labelModeSV.value = next;
        runOnJS(setLabelMode)(next);
      }
    },
  );

  // Frame the whole graph whenever the laid-out node set changes, so every node
  // is on-screen from the start (and after rotation). The same transform is the
  // double-tap reset target. (shared values intentionally omitted from deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!nodes.length) {
      fitScale.value = 1; fitTx.value = 0; fitTy.value = 0;
      scale.value = 1; translateX.value = 0; translateY.value = 0;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const pad = 56; // breathing room for labels around the bounding box
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    // Never zoom past 1× for small/sparse graphs; never below MIN_SCALE.
    const s = Math.max(MIN_SCALE, Math.min(1, (width - 2 * pad) / bw, (canvasH - 2 * pad) / bh));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    // screen = world * scale + translate (transformOrigin is top-left)
    const tx = width / 2 - cx * s;
    const ty = canvasH / 2 - cy * s;
    fitScale.value = s; fitTx.value = tx; fitTy.value = ty;
    bMinX.value = minX; bMaxX.value = maxX; bMinY.value = minY; bMaxY.value = maxY;
    scale.value = s; translateX.value = tx; translateY.value = ty;
  }, [nodes, width, canvasH]);

  // ── Gestures ─────────────────────────────────────────────────────────────
  // A single tap maps a screen point back to world space and selects the
  // nearest node. Kept in a ref so the memoised gesture below never has to be
  // rebuilt when `nodes`/`selectNode` change — rebuilding it mid-pinch was what
  // made the graph stutter and fly off-screen on zoom-out.
  const tapRef = useRef<(x: number, y: number) => void>(() => {});
  const callTap = useCallback((x: number, y: number) => { tapRef.current(x, y); }, []);

  // Build the gesture exactly once. Every value it closes over is either a
  // shared value or a stable callback, so an empty dep list is correct and the
  // GestureDetector never re-attaches a fresh gesture during an active pinch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gesture = useMemo(() => {
    // Clamp one axis. When the node cloud fits within the viewport (i.e. at the
    // fit scale, which is also the minimum zoom) it is centred and locked — no
    // drifting the fully-visible graph off-centre. Once zoomed in past fit, any
    // node can be panned all the way to the viewport centre, so edge nodes (and
    // their outward labels) are fully reachable rather than stuck at the rim.
    // At (or near) the fit scale the graph is fully framed, so lock it to the fit
    // transform — no drifting the whole-visible graph around. Once zoomed in past
    // fit, allow panning until any node can reach mid-screen, so edge nodes (and
    // their outward labels) are fully reachable rather than stuck at the rim.
    const FIT_EPS = 1.05;
    const clampTx = (tx: number, s: number) => {
      'worklet';
      if (s <= fitScale.value * FIT_EPS) return fitTx.value;
      const cMin = bMinX.value * s;
      const cMax = bMaxX.value * s;
      const viewLen = widthSV.value;
      return Math.min(viewLen / 2 - cMin, Math.max(viewLen / 2 - cMax, tx));
    };
    const clampTy = (ty: number, s: number) => {
      'worklet';
      if (s <= fitScale.value * FIT_EPS) return fitTy.value;
      const cMin = bMinY.value * s;
      const cMax = bMaxY.value * s;
      const viewLen = canvasHSV.value;
      return Math.min(viewLen / 2 - cMin, Math.max(viewLen / 2 - cMax, ty));
    };

    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        savedTx.value = translateX.value;
        savedTy.value = translateY.value;
      })
      .onChange(e => {
        'worklet';
        translateX.value = clampTx(savedTx.value + e.translationX, scale.value);
        translateY.value = clampTy(savedTy.value + e.translationY, scale.value);
      });

    const pinch = Gesture.Pinch()
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
        // Fit scale is the floor: you can't zoom out past "everything visible".
        const s = Math.min(MAX_SCALE, Math.max(fitScale.value, savedScale.value * e.scale));
        scale.value = s;
        const ratio = s / savedScale.value;
        // Keep the focal world-point fixed under the focal screen point.
        // transformOrigin is top-left: screen = world * scale + translate.
        translateX.value = clampTx(e.focalX - (focalX0.value - savedTx.value) * ratio, s);
        translateY.value = clampTy(e.focalY - (focalY0.value - savedTy.value) * ratio, s);
      });

    const dtap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        'worklet';
        scale.value = withSpring(fitScale.value, { damping: 20, stiffness: 200 });
        translateX.value = withSpring(fitTx.value, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(fitTy.value, { damping: 20, stiffness: 200 });
      });

    const stap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd((e, success) => {
        'worklet';
        if (success) runOnJS(callTap)(e.x, e.y);
      });

    return Gesture.Simultaneous(Gesture.Exclusive(dtap, stap), pan, pinch);
  }, []);

  // Latest tap implementation — reassigned every render so it always sees the
  // current node set and selectNode, while `gesture` itself stays stable.
  tapRef.current = (screenX: number, screenY: number) => {
    const canvasX = (screenX - translateX.value) / scale.value;
    const canvasY = (screenY - translateY.value) / scale.value;
    const HIT_R = 20;
    let closest: LayoutNode | null = null;
    let minDist = HIT_R;
    for (const node of nodes) {
      const dx = node.x - canvasX;
      const dy = node.y - canvasY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = node; }
    }
    if (closest) selectNode(closest.slug, closest.title);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as any,
  }));

  // Fade the legend out as you zoom in so it stops obscuring nodes — fully
  // visible at the fit scale, gone by ~1.6× fit.
  const legendStyle = useAnimatedStyle(() => {
    const f = fitScale.value || 1;
    const o = 1 - (scale.value - f) / (f * 0.6);
    return { opacity: Math.max(0, Math.min(1, o)) };
  });

  // ── Data fetch — only re-runs when the entry or mode changes, not on rotation.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWarming(false);
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
      setWarming(true);
      const gen = forceLayout(displayData.nodes, displayData.edges, width, canvasH, centerSlug, slugSeed((centerSlug ?? '') + mode));
      let lastLayout: LayoutNode[] | null = null;

      function step() {
        const { value, done } = gen.next();
        if (cancelled) return;
        if (value) { setNodes(value); lastLayout = value; }
        if (done && lastLayout) {
          const positions: CachedPosition[] = lastLayout.map(ln => ({
            slug: ln.slug, xRel: ln.x / width, yRel: ln.y / canvasH,
          }));
          setLayoutCache(centerSlug ?? '', mode, nodeSlugs, positions).catch(() => {});
          setWarming(false);
          setLoading(false);
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

  // Find the sentence in `html` that contains a link to `linkSlug`.
  const findLinkSentence = (html: string, linkSlug: string): string | null => {
    const linkRe = new RegExp(`[^.!?]*<a [^>]*href=["'][^"']*\\/entries\\/${linkSlug}\\/[^"']*["'][^>]*>[^<]*<\\/a>[^.!?]*[.!?]?`, 'i');
    const m = html.match(linkRe);
    if (!m) return null;
    // Strip all HTML tags, decode common entities, normalise whitespace
    const decoded = m[0]
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:ldquo|rdquo);/g, '"')
      .replace(/&(?:lsquo|rsquo|squo);/g, "’")
      .replace(/&(?:mdash|ndash);/g, '—')
      .replace(/&hellip;/g, '…')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/^[\s"'‘’“”.,;:]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return decoded.slice(0, 480) || null;
  };

  const selectNode = (slug: string, title: string) => {
    setSelected({ slug, title });
    setPreview(null);
    const wantContext = !!centerSlug && mode === 'links' && slug !== centerSlug;
    Promise.all([
      getEntryPreview(slug),
      getEntry(slug),
      wantContext ? getEntry(centerSlug) : Promise.resolve(null),
    ]).then(([p, target, center]) => {
      const targetHtml = target?.content_html ?? null;
      // Reference sentence: prefer the outgoing link in the center article, then
      // fall back to a backlink to the center inside the target article.
      const context = wantContext
        ? (center?.content_html ? findLinkSentence(center.content_html, slug) : null)
          ?? (targetHtml ? findLinkSentence(targetHtml, centerSlug) : null)
        : null;
      // Pull a generous, on-the-fly excerpt straight from the cached body so the
      // card shows real article content — not the short stored teaser.
      const excerpt = targetHtml ? makeExcerpt(targetHtml, 1200) : (p?.excerpt ?? null);
      setPreview({ author: p?.author ?? null, excerpt, context });
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

  // Labels are shown at every zoom level except fully zoomed-out, where they
  // would be illegibly small and overlap. The user wants every name visible.
  const showLabels = labelMode !== 'none';

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
            <Text style={styles.loadingLabel}>
              {warming ? 'Computing layout…' : 'Mapping connections…'}
            </Text>
            {warming && (
              <Text style={styles.loadingHint}>Graph is still loading — keep reading for now</Text>
            )}
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
                    <G key={node.slug}>
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
                      {showLabels && (() => {
                        const label = getLabel(node);
                        // Two-pass halo: a dark stroked copy underneath, colour on
                        // top. react-native-svg ignores paint-order, so we layer the
                        // two SvgText nodes explicitly to keep labels legible over
                        // edges and neighbouring labels.
                        return (
                          <>
                            <SvgText
                              x={lx} y={ly} textAnchor={anchor}
                              fontSize={9}
                              fill="none" stroke="#111111" strokeWidth={2.5}
                              strokeLinejoin="round"
                            >
                              {label}
                            </SvgText>
                            <SvgText
                              x={lx} y={ly} textAnchor={anchor}
                              fontSize={9}
                              fill={labelColor(node)}
                            >
                              {label}
                            </SvgText>
                          </>
                        );
                      })()}
                    </G>
                  );
                })}
              </Svg>
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* ── Legend (fades out as you zoom in; never blocks node taps) ── */}
        <Reanimated.View
          pointerEvents="none"
          style={[styles.legend, { bottom: insets.bottom + 12 }, legendStyle]}
        >
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
        </Reanimated.View>

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
            <ScrollView
              style={styles.previewScroll}
              contentContainerStyle={styles.previewScrollContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {preview?.context ? (
                <Text style={styles.previewContext}>{preview.context}</Text>
              ) : null}
              {preview?.excerpt ? (
                <Text style={styles.previewExcerpt}>{preview.excerpt}</Text>
              ) : (
                <Text style={styles.previewExcerpt}>Not yet downloaded — open to read.</Text>
              )}
            </ScrollView>
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
  // transformOrigin top-left so scale pivots at (0,0): screen = world*scale + translate.
  // RN's default centre origin made pinch-zoom jump the content; this matches the
  // focal math in the pinch gesture and the inverse in the tap hit-test.
  canvasInner: { flex: 1, transformOrigin: 'left top' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLabel: { color: '#444', fontSize: 13 },
  loadingHint: { color: '#555', fontSize: 12, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 },
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
  previewContext: {
    color: '#7a7a8a', fontSize: 12, lineHeight: 18, marginTop: 10,
    fontStyle: 'italic',
    borderLeftWidth: 2, borderLeftColor: '#2e2e3e', paddingLeft: 10,
  },
  previewExcerpt: { color: '#9a9a9a', fontSize: 13, lineHeight: 19, marginTop: 8 },
  previewScroll: { maxHeight: 300 },
  previewScrollContent: { paddingBottom: 2 },
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
