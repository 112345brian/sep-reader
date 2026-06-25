import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMathSvgMap } from '../services/db';
import type { EntryRow } from '../types';
import { parseSepHtml } from '../utils/sepHtml/parse';
import { collectMathHashes } from '../utils/sepHtml/collectMathHashes';
import { ArticleHeader } from '../utils/sepHtml/render/ArticleHeader';
import { BlockView } from '../utils/sepHtml/render/Blocks';
import { APP_ACCENT, SEP_COLORS, SEP_SIDE_PAD } from '../utils/sepHtml/render/theme';
import type { Block } from '../utils/sepHtml/types';

interface Props {
  phase: 'booting' | 'indexing' | 'index_error';
  downloadProgress: { done: number; total: number } | null;
  article: EntryRow | null;
}

type ListItem =
  | { kind: 'bar' }
  | { kind: 'block'; block: Block; idx: number }
  | { kind: 'spinner' };


// Memoized so FlatList block items don't re-render on every download-progress tick.
// h is stabilized via useMemo in Inner; block objects are stable from the data memo.
const BlockItem = React.memo(function BlockItem({
  block, idx, h,
}: {
  block: Block;
  idx: number;
  h: { mathSvgs: Record<string, string> };
}) {
  return <BlockView block={block} h={h} suppressTopBorder={idx === 0} />;
});

function LoadingBar({ phase, downloadProgress }: Pick<Props, 'phase' | 'downloadProgress'>) {
  return (
    <View style={s.bar}>
      {phase === 'index_error' ? (
        <Text style={s.errorText}>
          Could not reach plato.stanford.edu.{'\n'}Check your connection and relaunch.
        </Text>
      ) : downloadProgress ? (
        <>
          <View style={s.track}>
            <View style={[s.fill, { width: `${(downloadProgress.done / downloadProgress.total) * 100}%` as any }]} />
          </View>
          <Text style={s.barLabel}>{downloadProgress.done} / {downloadProgress.total}</Text>
        </>
      ) : (
        <ActivityIndicator color="#7ba4ff" size="small" />
      )}
    </View>
  );
}

function Inner({ phase, downloadProgress, article }: Props) {
  const { top, bottom } = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [parsed, setParsed] = useState<ReturnType<typeof parseSepHtml> | null>(null);
  const [mathSvgs, setMathSvgs] = useState<Record<string, string>>({});

  // Hold frequently-changing bar values in refs so renderItem stays stable.
  // extraData on FlatList triggers the bar item to re-render; renderItem reads
  // fresh values from refs at that point rather than closing over stale state.
  const livePhase = useRef(phase);
  const liveProgress = useRef(downloadProgress);
  const liveArticle = useRef(article);
  livePhase.current = phase;
  liveProgress.current = downloadProgress;
  liveArticle.current = article;

  // Drives hint fade-out and arrow bounce — both on native thread.
  const scrollY = useRef(new Animated.Value(0)).current;
  const arrowY = useRef(new Animated.Value(0)).current;

  // Gentle up-and-down bounce on the arrow.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowY, { toValue: -5, duration: 550, useNativeDriver: true }),
        Animated.timing(arrowY, { toValue: 0, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [arrowY]);

  // Hint fades out once user starts scrolling.
  const hintOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    let cancelled = false;
    if (!article) { setParsed(null); return; }
    if (article.content_ast) {
      try { setParsed(JSON.parse(article.content_ast)); return; } catch {}
    }
    const html = article.content_html ?? '';
    if (!html) return;
    setTimeout(() => { if (!cancelled) setParsed(parseSepHtml(html)); }, 0);
    return () => { cancelled = true; };
  }, [article?.slug]);

  useEffect(() => {
    if (!parsed) { setMathSvgs({}); return; }
    const hashes = collectMathHashes(parsed.blocks);
    if (!hashes.length) return;
    getMathSvgMap(hashes).then(setMathSvgs).catch(() => {});
  }, [parsed]);

  const data: ListItem[] = useMemo(() => {
    const items: ListItem[] = [{ kind: 'bar' }];
    if (!article || !parsed) {
      items.push({ kind: 'spinner' });
      return items;
    }
    let idx = 0;
    for (const block of parsed.blocks) {
      if (block.t === 'rule' && idx === 0) continue;
      items.push({ kind: 'block', block, idx: idx++ });
    }
    return items;
  }, [article, parsed]);

  const listHeader = useMemo(() => (
    <View style={[s.header, { minHeight: screenHeight, paddingTop: top + 48 }]}>
      <Text style={s.logo}>Nous</Text>
    </View>
  ), [screenHeight, top]);

  // Stable h object — BlockItem bails via React.memo when mathSvgs hasn't changed.
  const h = useMemo(() => ({ mathSvgs }), [mathSvgs]);

  // renderItem only re-creates when h (i.e. mathSvgs) changes. Bar state is read
  // from refs above; FlatList's extraData drives bar re-renders.
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'bar') {
      const a = liveArticle.current;
      return (
        <>
          <LoadingBar phase={livePhase.current} downloadProgress={liveProgress.current} />
          {a && (
            <ArticleHeader
              title={a.title}
              parentLabel={a.parent_label}
              preambleHtml={a.preamble_html}
            />
          )}
        </>
      );
    }
    if (item.kind === 'spinner') {
      return (
        <View style={s.articleSpinner}>
          <ActivityIndicator color="#444" />
        </View>
      );
    }
    return <BlockItem block={item.block} idx={item.idx} h={h} />;
  }, [h]);

  return (
    <View style={{ flex: 1, backgroundColor: SEP_COLORS.bg }}>
      <FlatList<ListItem>
        data={data}
        renderItem={renderItem}
        keyExtractor={(_, i) => String(i)}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={listHeader}
        extraData={{ phase, downloadProgress, article }}
        style={{ backgroundColor: SEP_COLORS.bg }}
        contentContainerStyle={{
          paddingHorizontal: SEP_SIDE_PAD,
          paddingBottom: 96 + bottom,
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        windowSize={3}
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        removeClippedSubviews
      />

      {/* Swipe-up hint — visible once article is ready, fades on scroll. */}
      {article && (
        <Animated.View
          style={[s.hint, { bottom: bottom + 28, opacity: hintOpacity }]}
          pointerEvents="none"
        >
          <Animated.Text style={[s.hintArrow, { transform: [{ translateY: arrowY }] }]}>
            ↑
          </Animated.Text>
          <Text style={s.hintTitle}>{article.title}</Text>
        </Animated.View>
      )}
    </View>
  );
}

export default function LoadingArticleScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <Inner {...props} />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  header: {
    justifyContent: 'flex-start',
    // No bottom padding — loading bar (data[0]) sits flush below.
  },
  logo: {
    color: APP_ACCENT,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SEP_COLORS.bg,
    // Extend edge-to-edge against contentContainerStyle's horizontal padding.
    marginHorizontal: -SEP_SIDE_PAD,
    paddingHorizontal: SEP_SIDE_PAD,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
    minHeight: 40,
  },
  track: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: APP_ACCENT,
  },
  barLabel: {
    color: '#555',
    fontSize: 12,
    marginLeft: 12,
    minWidth: 68,
    textAlign: 'right',
  },
  errorText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    flex: 1,
    lineHeight: 20,
  },
  articleSpinner: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  hintArrow: {
    color: APP_ACCENT,
    fontSize: 18,
  },
  hintTitle: {
    color: '#555',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
