import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { FlatList, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ParsedArticle, Block } from '../types';
import type { Annotation } from '../../../types';
import { BlockView, type BlockHandlers } from './Blocks';
import { SEP_COLORS, SEP_SIDE_PAD } from './theme';

export interface SepArticleProps {
  article: ParsedArticle;
  onLinkPress?: (href: string, wl: boolean) => void;
  onFootnotePress?: (href: string, label: string) => void;
  // Reading progress 0..1, throttled to ~2% steps (matches the WebView path).
  onProgress?: (value: number) => void;
  // Active section id as the user scrolls (scroll-spy for the TOC).
  onActiveSection?: (id: string) => void;
  renderFallback?: (html: string) => React.ReactNode;
  resolveImageSrc?: (src: string) => string | null;
  annotations?: Annotation[];
  onAnnotationPress?: (ann: Annotation) => void;
  onAnnotationCreate?: (text: string) => void;
  // Rendered inside the scroll view before the article body (title / breadcrumb
  // / preamble). Scrolls away with the content.
  header?: React.ReactNode;
  // Rendered inside the scroll view after the article body (e.g. the
  // "Related by link" backlinks row).
  footer?: React.ReactNode;
  // hash→svg map loaded from the math DB table after the article text renders.
  mathSvgs?: Record<string, string>;
}

export interface SepArticleHandle {
  scrollToSection: (id: string) => void;
}

export const SepArticle = React.forwardRef<SepArticleHandle, SepArticleProps>(function SepArticle({
  article, onLinkPress, onFootnotePress, onProgress, onActiveSection, renderFallback,
  resolveImageSrc, annotations, onAnnotationPress, onAnnotationCreate, header, footer, mathSvgs,
}, ref) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<Block>>(null);
  const headingOffsets = useRef<Map<string, number>>(new Map());
  const lastProgress = useRef(0);
  const lastSection = useRef('');

  // Strip leading rule blocks — they're <hr> artifacts from the skipped #toc div.
  const blocks = useMemo(() => {
    let i = 0;
    while (i < article.blocks.length && article.blocks[i].t === 'rule') i++;
    return i > 0 ? article.blocks.slice(i) : article.blocks;
  }, [article.blocks]);

  // Map heading id → block index for off-screen scrollToIndex fallback.
  const headingIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    blocks.forEach((b, i) => {
      if (b.t === 'heading' && b.id) map.set(b.id, i);
    });
    return map;
  }, [blocks]);

  const onHeadingLayout = useCallback((id: string, y: number) => {
    headingOffsets.current.set(id, y);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
    const progress = Math.min(1, Math.max(0, contentOffset.y / scrollable));
    if (onProgress && Math.abs(progress - lastProgress.current) >= 0.02) {
      lastProgress.current = progress;
      onProgress(progress);
    }
    if (onActiveSection) {
      const spy = contentOffset.y + 80;
      let active = '';
      let bestY = -1;
      headingOffsets.current.forEach((y, id) => {
        if (y <= spy && y > bestY) { bestY = y; active = id; }
      });
      if (active && active !== lastSection.current) {
        lastSection.current = active;
        onActiveSection(active);
      }
    }
  }, [onProgress, onActiveSection]);

  useImperativeHandle(ref, () => ({
    scrollToSection(id: string) {
      const y = headingOffsets.current.get(id);
      if (y !== undefined) {
        flatListRef.current?.scrollToOffset({ offset: y, animated: true });
        return;
      }
      // Heading not yet laid out (off-screen) — use index-based scroll.
      const index = headingIndexMap.get(id);
      if (index !== undefined) {
        flatListRef.current?.scrollToIndex({ index, animated: true });
      }
    },
  }), [headingIndexMap]);

  const handlers: BlockHandlers = useMemo(() => ({
    onLinkPress,
    onFootnotePress,
    onHeadingLayout,
    renderFallback,
    resolveImageSrc,
    annotations,
    onAnnotationPress,
    onAnnotationCreate,
    mathSvgs,
  }), [onLinkPress, onFootnotePress, onHeadingLayout, renderFallback, resolveImageSrc,
      annotations, onAnnotationPress, onAnnotationCreate, mathSvgs]);

  const renderBlock = useCallback(({ item, index }: { item: Block; index: number }) => (
    <BlockView block={item} h={handlers} suppressTopBorder={index === 0} />
  ), [handlers]);

  const keyExtractor = useCallback((_: Block, index: number) => String(index), []);

  const listHeader = header ? <View>{header}</View> : null;
  const listFooter = footer ? <View>{footer}</View> : null;

  return (
    <FlatList<Block>
      ref={flatListRef}
      data={blocks}
      renderItem={renderBlock}
      keyExtractor={keyExtractor}
      style={{ backgroundColor: SEP_COLORS.bg }}
      contentContainerStyle={{ paddingHorizontal: SEP_SIDE_PAD, paddingTop: 16, paddingBottom: 96 + bottomInset }}
      onScroll={handleScroll}
      scrollEventThrottle={32}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      windowSize={3}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      removeClippedSubviews
      onScrollToIndexFailed={(info) => {
        // Item not yet rendered — scroll to approximate position then retry once rendered.
        flatListRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
        }, 200);
      }}
    />
  );
});
