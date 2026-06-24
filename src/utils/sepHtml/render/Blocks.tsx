import React, { useState } from 'react';
import { Text, View, Image, Pressable, type LayoutChangeEvent, type TextStyle } from 'react-native';
import type { Block, Inline } from '../types';
import type { Annotation } from '../../../types';
import { SvgXml } from 'react-native-svg';
import { InlineContent, InlineHandlers, hasMath, type Highlight } from './Inline';
import { SEP_BASE_FONT, SEP_COLORS, sepBlock, sepMutedText, sepText } from './theme';

const PX_PER_EX = SEP_BASE_FONT / 2;

export interface BlockHandlers extends InlineHandlers {
  onHeadingLayout?: (id: string, y: number) => void;
  renderFallback?: (html: string) => React.ReactNode;
  resolveImageSrc?: (src: string) => string | null;
  annotations?: Annotation[];
  onAnnotationPress?: (ann: Annotation) => void;
  onAnnotationCreate?: (text: string) => void;
  // Inherited body-text style for nested contexts (blockquote, preamble) where
  // paragraphs render muted/smaller. Applied to `para` inline content.
  textStyle?: TextStyle;
}

// Article figure that sizes itself to the image's intrinsic aspect ratio,
// rather than a fixed height that letterboxes tall diagrams and crops wide ones.
// Starts at a neutral aspect ratio and updates once the natural size is known.
function ArticleImage({ uri, alt }: { uri: string; alt?: string }) {
  const [aspect, setAspect] = useState<number | null>(null);
  return (
    <Image
      source={{ uri }}
      style={[{ borderRadius: 4 }, aspect ? { width: '100%', aspectRatio: aspect } : { width: '100%', height: 180 }]}
      resizeMode="contain"
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width > 0 && height > 0) setAspect(width / height);
      }}
      accessibilityLabel={alt || undefined}
    />
  );
}

// Extract plain text from an inline tree for annotation matching. Must count the
// same characters that Inline's highlight renderer advances its offset over.
function inlineText(inlines: Inline[]): string {
  return inlines.map(n => {
    if (n.t === 'text') return n.v;
    if (n.t === 'code') return n.v;
    if ('children' in n && Array.isArray(n.children)) return inlineText(n.children as Inline[]);
    return '';
  }).join('');
}


// Resolve the annotations that match this paragraph into non-overlapping
// character ranges over its plain text. Skips empty selections (which would
// otherwise match every paragraph) and supports multiple highlights per
// paragraph, each matched to its own occurrence.
//
// When an annotation has a `context` field (a ±50-char window captured at
// creation time), we use it to pick the right occurrence of selected_text
// rather than blindly taking the first indexOf hit — which would paint the
// wrong spot when the same phrase appears multiple times.
export function annotationHighlights(paraText: string, h: BlockHandlers): Highlight[] {
  const anns = (h.annotations ?? []).filter(a => a.selected_text && a.selected_text.trim());
  if (!anns.length) return [];
  const ranges: Highlight[] = [];
  for (const a of anns) {
    let idx = -1;
    if (a.context) {
      // Try to locate context inside paraText. If found, the selected_text
      // inside that context window is the right occurrence.
      const ctxIdx = paraText.indexOf(a.context);
      if (ctxIdx >= 0) {
        const localIdx = a.context.indexOf(a.selected_text);
        if (localIdx >= 0) idx = ctxIdx + localIdx;
      }
      // Context may be wider than paraText (crosses paragraph boundaries) or
      // trimmed differently — fall back to first occurrence.
      if (idx < 0) idx = paraText.indexOf(a.selected_text);
    } else {
      idx = paraText.indexOf(a.selected_text);
    }
    if (idx >= 0) {
      ranges.push({
        start: idx,
        end: idx + a.selected_text.length,
        color: a.color + '55', // translucent fill over the matched span
        onPress: () => h.onAnnotationPress?.(a),
      });
    }
  }
  ranges.sort((x, y) => x.start - y.start);
  const out: Highlight[] = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start >= lastEnd) { out.push(r); lastEnd = r.end; }
  }
  return out;
}

function Blocks({ blocks, h, keyPrefix = 'b' }: { blocks: Block[]; h: BlockHandlers; keyPrefix?: string }) {
  return (
    <>
      {blocks.map((b, idx) => (
        <BlockView key={`${keyPrefix}-${idx}`} block={b} h={h} />
      ))}
    </>
  );
}

function BlockView({ block, h }: { block: Block; h: BlockHandlers }) {
  switch (block.t) {
    case 'heading': {
      const style = block.level === 2 ? sepText.h2 : block.level === 3 ? sepText.h3 : sepText.h4;
      const margin = block.level === 2 ? sepBlock.h2Margin : block.level === 3 ? sepBlock.h3Margin : sepBlock.h4Margin;
      const onLayout = block.id && h.onHeadingLayout
        ? (e: LayoutChangeEvent) => h.onHeadingLayout!(block.id!, e.nativeEvent.layout.y)
        : undefined;
      return (
        <View style={margin} onLayout={onLayout}>
          <InlineContent inlines={block.children} handlers={h} baseStyle={style} />
        </View>
      );
    }
    case 'para': {
      // Only walk the inline tree for text when we actually need it (any
      // annotations present, or long-press creation is enabled).
      const needsText = (h.annotations?.length ?? 0) > 0 || !!h.onAnnotationCreate;
      const paraText = needsText ? inlineText(block.children) : '';
      const paraMath = hasMath(block.children);
      // Precise inline highlights only work on the no-math fast path (where the
      // renderer can map character offsets); math paragraphs fall back to a
      // whole-paragraph left border keyed to the first matching annotation.
      const highlights = !paraMath ? annotationHighlights(paraText, h) : [];
      const borderAnn = paraMath
        ? (h.annotations ?? []).find(a => a.selected_text && a.selected_text.trim() && paraText.includes(a.selected_text))
        : undefined;

      // Display math parses as an inline node but renders as a centered block,
      // so split the paragraph around any display math nodes.
      const hasDisplay = block.children.some(c => (c.t === 'mathsvg' || c.t === 'mathref') && c.display);
      let inner: React.ReactNode;
      if (!hasDisplay) {
        inner = <InlineContent inlines={block.children} handlers={h} baseStyle={h.textStyle} highlights={highlights} />;
      } else {
        const segments: React.ReactNode[] = [];
        let run: typeof block.children = [];
        const flush = (key: string) => {
          if (run.length) { segments.push(<InlineContent key={key} inlines={run} handlers={h} baseStyle={h.textStyle} />); run = []; }
        };
        block.children.forEach((c, i) => {
          if ((c.t === 'mathsvg' || c.t === 'mathref') && c.display) {
            flush(`r${i}`);
            const w = Math.max(1, Math.round(c.w * PX_PER_EX));
            const mh = Math.max(1, Math.round(c.h * PX_PER_EX));
            const svg = c.t === 'mathsvg' ? c.svg : h.mathSvgs?.[c.hash];
            segments.push(
              <View key={`dm${i}`} style={{ alignItems: 'center', width: '100%', marginVertical: 14 }}>
                {svg
                  ? <SvgXml xml={svg} width={w} height={mh} color={SEP_COLORS.text} />
                  : <View style={{ width: w, height: mh }} />}
              </View>
            );
          } else {
            run.push(c);
          }
        });
        flush('rEnd');
        inner = <>{segments}</>;
      }

      // Wrap in a Pressable when long-press creation is on, or when a math
      // paragraph needs the border + tap-to-edit fallback. No-math paragraphs
      // get their tap targets from the inline highlight spans themselves.
      if (h.onAnnotationCreate || borderAnn) {
        return (
          <Pressable
            style={[
              sepBlock.paraGap,
              borderAnn && { borderLeftWidth: 3, borderLeftColor: borderAnn.color, paddingLeft: 10 },
            ]}
            onPress={borderAnn ? () => h.onAnnotationPress?.(borderAnn) : undefined}
            onLongPress={h.onAnnotationCreate ? () => h.onAnnotationCreate!(paraText) : undefined}
            delayLongPress={600}
          >
            {inner}
          </Pressable>
        );
      }
      return <View style={sepBlock.paraGap}>{inner}</View>;
    }
    case 'blockquote':
      // Inner paragraphs render muted + slightly smaller (readerCss blockquote).
      return (
        <View style={sepBlock.blockquote}>
          <Blocks blocks={block.children} h={{ ...h, textStyle: sepMutedText }} />
        </View>
      );
    case 'list': {
      // Bibliography lists: no bullets, hanging indent, muted + smaller. Plain
      // lists: bullet/number gutter with the standard indent.
      if (block.bib) {
        return (
          <View style={{ marginBottom: 16 }}>
            {block.items.map((item, i) => (
              <View key={i} style={sepBlock.bibItem}>
                <Blocks blocks={item} h={{ ...h, textStyle: sepBlock.bibText }} keyPrefix={`bib${i}`} />
              </View>
            ))}
          </View>
        );
      }
      return (
        <View style={{ marginBottom: 16 }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: sepBlock.liGap }}>
              <Text style={{ ...sepText.body, ...h.textStyle, width: sepBlock.listIndent }}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <View style={{ flex: 1 }}>
                <Blocks blocks={item} h={h} keyPrefix={`li${i}`} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'deflist':
      return (
        <View style={{ marginBottom: 16 }}>
          {block.rows.map((row, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <InlineContent inlines={row.term} handlers={h} baseStyle={{ fontWeight: '600', color: SEP_COLORS.textBright }} />
              <View style={{ paddingLeft: 20, marginTop: 2 }}>
                <Blocks blocks={row.def} h={h} keyPrefix={`dd${i}`} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <View style={{ marginVertical: 20 }}>
          {block.caption && (
            <View style={{ marginBottom: 6 }}>
              <InlineContent inlines={block.caption} handlers={h} baseStyle={{ color: SEP_COLORS.textMuted, fontStyle: 'italic' }} />
            </View>
          )}
          <View style={{ borderTopWidth: 1, borderColor: SEP_COLORS.border }}>
            {block.rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: SEP_COLORS.border, backgroundColor: row.header ? SEP_COLORS.bgRaised : undefined }}>
                {row.cells.map((cell, ci) => (
                  <View key={ci} style={{ flex: 1, padding: 8 }}>
                    <InlineContent inlines={cell} handlers={h} baseStyle={row.header ? { fontWeight: '600', color: SEP_COLORS.textBright } : undefined} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      );
    case 'rule':
      return <View style={{ height: 1, backgroundColor: SEP_COLORS.border, marginVertical: 32 }} />;
    case 'image': {
      const uri = h.resolveImageSrc?.(block.src) ?? null;
      if (!uri) return null;
      return (
        <View style={{ alignItems: 'center', marginVertical: 12 }}>
          <ArticleImage uri={uri} alt={block.alt} />
        </View>
      );
    }
    case 'unsupported':
      return <>{h.renderFallback ? h.renderFallback(block.html) : (
        <View style={{ padding: 12, backgroundColor: SEP_COLORS.bgRaised, borderRadius: 6, marginVertical: 12 }}>
          <Text style={{ color: SEP_COLORS.textMuted, fontStyle: 'italic' }}>[table]</Text>
        </View>
      )}</>;
    default:
      return null;
  }
}

export { Blocks };
