import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMathSvgMap } from '../services/db';
import type { EntryRow } from '../types';
import { parseSepHtml } from '../utils/sepHtml/parse';
import { ArticleHeader } from '../utils/sepHtml/render/ArticleHeader';
import { BlockView } from '../utils/sepHtml/render/Blocks';
import { SEP_COLORS, SEP_SIDE_PAD } from '../utils/sepHtml/render/theme';
import type { Block, Inline } from '../utils/sepHtml/types';

interface Props {
  phase: 'booting' | 'indexing' | 'index_error';
  downloadProgress: { done: number; total: number } | null;
  article: EntryRow | null;
}

type ListItem =
  | { kind: 'bar' }
  | { kind: 'block'; block: Block; idx: number }
  | { kind: 'spinner' };

function collectHashes(blocks: Block[], out: string[]) {
  function fromInlines(inlines: Inline[]) {
    for (const n of inlines) {
      if (n.t === 'mathref') out.push(n.hash);
      if ('children' in n && Array.isArray(n.children)) fromInlines(n.children as Inline[]);
    }
  }
  for (const b of blocks) {
    if (b.t === 'para' || b.t === 'heading') fromInlines(b.children);
    else if (b.t === 'blockquote') collectHashes(b.children, out);
    else if (b.t === 'list') b.items.forEach(item => collectHashes(item, out));
    else if (b.t === 'deflist') b.rows.forEach(row => { fromInlines(row.term); collectHashes(row.def, out); });
    else if (b.t === 'table') {
      if (b.caption) fromInlines(b.caption);
      b.rows.forEach(row => row.cells.forEach(cell => fromInlines(cell)));
    }
  }
}

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
    if (!article) { setParsed(null); return; }
    if (article.content_ast) {
      try { setParsed(JSON.parse(article.content_ast)); return; } catch {}
    }
    const html = article.content_html ?? '';
    if (!html) return;
    setTimeout(() => setParsed(parseSepHtml(html)), 0);
  }, [article?.slug]);

  useEffect(() => {
    if (!parsed) { setMathSvgs({}); return; }
    const hashes: string[] = [];
    collectHashes(parsed.blocks, hashes);
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

  // Header fills the viewport so the loading bar starts just below the fold.
  const listHeader = (
    <View style={[s.header, { minHeight: screenHeight, paddingTop: top + 48 }]}>
      <Text style={s.logo}>Nous</Text>
    </View>
  );

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'bar') {
      return (
        <>
          <LoadingBar phase={phase} downloadProgress={downloadProgress} />
          {article && (
            <ArticleHeader
              title={article.title}
              parentLabel={article.parent_label}
              preambleHtml={article.preamble_html}
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
    return (
      <BlockView
        block={item.block}
        h={{ mathSvgs }}
        suppressTopBorder={item.idx === 0}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: SEP_COLORS.bg }}>
      <FlatList<ListItem>
        data={data}
        renderItem={renderItem}
        keyExtractor={(_, i) => String(i)}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={listHeader}
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
    color: '#7ba4ff',
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
    backgroundColor: '#7ba4ff',
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
    color: '#7ba4ff',
    fontSize: 18,
  },
  hintTitle: {
    color: '#555',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
