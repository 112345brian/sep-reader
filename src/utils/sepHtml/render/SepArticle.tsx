import React, { useCallback, useImperativeHandle, useRef } from 'react';
import { ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ParsedArticle } from '../types';
import type { Annotation } from '../../../types';
import { Blocks, BlockHandlers } from './Blocks';
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
  // Rendered inside the scroll view after the article body (e.g. the
  // "Related by link" backlinks row).
  footer?: React.ReactNode;
}

export interface SepArticleHandle {
  scrollToSection: (id: string) => void;
}

export const SepArticle = React.forwardRef<SepArticleHandle, SepArticleProps>(function SepArticle({
  article, onLinkPress, onFootnotePress, onProgress, onActiveSection, renderFallback,
  resolveImageSrc, annotations, onAnnotationPress, onAnnotationCreate, footer,
}, ref) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const headingOffsets = useRef<{ id: string; y: number }[]>([]);
  const lastProgress = useRef(0);
  const lastSection = useRef('');

  const onHeadingLayout = useCallback((id: string, y: number) => {
    const arr = headingOffsets.current;
    const existing = arr.find(o => o.id === id);
    if (existing) existing.y = y;
    else arr.push({ id, y });
    arr.sort((a, b) => a.y - b.y);
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
      const spy = contentOffset.y + 80; // 80px offset matches injected scroll-spy
      let active = '';
      for (const o of headingOffsets.current) {
        if (o.y <= spy) active = o.id; else break;
      }
      if (active && active !== lastSection.current) {
        lastSection.current = active;
        onActiveSection(active);
      }
    }
  }, [onProgress, onActiveSection]);

  useImperativeHandle(ref, () => ({
    scrollToSection(id: string) {
      const entry = headingOffsets.current.find(o => o.id === id);
      if (entry) scrollViewRef.current?.scrollTo({ y: entry.y, animated: true });
    },
  }));

  const handlers: BlockHandlers = {
    onLinkPress,
    onFootnotePress,
    onHeadingLayout,
    renderFallback,
    resolveImageSrc,
    annotations,
    onAnnotationPress,
    onAnnotationCreate,
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ backgroundColor: SEP_COLORS.bg }}
      contentContainerStyle={{ paddingHorizontal: SEP_SIDE_PAD, paddingTop: 16, paddingBottom: 96 + bottomInset }}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View>
        <Blocks blocks={article.blocks} h={handlers} />
      </View>
      {footer}
    </ScrollView>
  );
});
