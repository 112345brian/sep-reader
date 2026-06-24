import React from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import type { Block } from '../types';
import { InlineContent, InlineHandlers } from './Inline';
import { MathSvg } from './MathSvg';
import { SEP_COLORS, sepBlock, sepText } from './theme';

export interface BlockHandlers extends InlineHandlers {
  // Section headings report their y-offset for scroll-spy / TOC jump.
  onHeadingLayout?: (id: string, y: number) => void;
  // Fallback for `unsupported` blocks (nested tables, animated SVG). The screen
  // supplies a scoped WebView; if absent we show a quiet placeholder.
  renderFallback?: (html: string) => React.ReactNode;
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
      // Display math (\[…\]) parses as an inline node but renders as a centered
      // block, so split the paragraph around any display-math nodes.
      const hasDisplay = block.children.some(c => c.t === 'math' && c.display);
      if (!hasDisplay) {
        return (
          <View style={sepBlock.paraGap}>
            <InlineContent inlines={block.children} handlers={h} />
          </View>
        );
      }
      const segments: React.ReactNode[] = [];
      let run: typeof block.children = [];
      const flush = (key: string) => {
        if (run.length) { segments.push(<InlineContent key={key} inlines={run} handlers={h} />); run = []; }
      };
      block.children.forEach((c, i) => {
        if (c.t === 'math' && c.display) {
          flush(`r${i}`);
          segments.push(<MathSvg key={`dm${i}`} tex={c.tex} display resolve={h.resolveMath} />);
        } else {
          run.push(c);
        }
      });
      flush('rEnd');
      return <View style={sepBlock.paraGap}>{segments}</View>;
    }
    case 'blockquote':
      return (
        <View style={sepBlock.blockquote}>
          <Blocks blocks={block.children} h={h} />
        </View>
      );
    case 'list':
      return (
        <View style={{ marginBottom: 16 }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: sepBlock.liGap }}>
              <Text style={{ ...sepText.body, width: sepBlock.listIndent }}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <View style={{ flex: 1 }}>
                <Blocks blocks={item} h={h} keyPrefix={`li${i}`} />
              </View>
            </View>
          ))}
        </View>
      );
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
      return <View style={{ height: 1, backgroundColor: SEP_COLORS.border, marginVertical: 20 }} />;
    case 'image':
      // Raster images (equation pngs / icons) resolved by the screen later; for
      // now omit rather than show a broken box. Display math uses SVG, not <img>.
      return null;
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
