import React from 'react';
import { Text, View } from 'react-native';
import type { Inline } from '../types';
import { MathSvg, MathResolver } from './MathSvg';
import { SEP_COLORS, sepText } from './theme';

export interface InlineHandlers {
  onLinkPress?: (href: string, wl: boolean) => void;
  onFootnotePress?: (href: string, label: string) => void;
  resolveMath: MathResolver;
}

// A character range (over the paragraph's plain text, as produced by inlineText)
// to paint as an annotation highlight, with the tap target that opens it.
export interface Highlight {
  start: number;
  end: number;
  color: string;
  onPress?: () => void;
}

const linkStyle = { color: SEP_COLORS.accent, textDecorationLine: 'underline' as const };
const fnStyle = { color: SEP_COLORS.accent, fontSize: sepText.body.fontSize! * 0.75 };

function hasMath(inlines: Inline[]): boolean {
  for (const i of inlines) {
    if (i.t === 'math') return true;
    if ('children' in i && Array.isArray(i.children) && hasMath(i.children)) return true;
  }
  return false;
}

// ── Fast path: pure text/links/emphasis nest cleanly inside one <Text> ────────
function renderTextRuns(inlines: Inline[], h: InlineHandlers, key = 'i'): React.ReactNode[] {
  return inlines.map((node, idx) => {
    const k = `${key}-${idx}`;
    switch (node.t) {
      case 'text':
        return <Text key={k}>{node.v}</Text>;
      case 'em':
        return (
          <Text key={k} style={node.kind === 'strong'
            ? { fontWeight: '700', color: SEP_COLORS.textBright }
            : { fontStyle: 'italic' }}>
            {renderTextRuns(node.children, h, k)}
          </Text>
        );
      case 'styled': {
        const s = node.style === 'underline' ? { textDecorationLine: 'underline' as const }
          : node.style === 'strike' ? { textDecorationLine: 'line-through' as const }
          : node.style === 'small' ? { fontSize: sepText.body.fontSize! * 0.85 }
          : {}; // quote handled via wrapping chars below
        if (node.style === 'quote') {
          return <Text key={k}>{'“'}{renderTextRuns(node.children, h, k)}{'”'}</Text>;
        }
        return <Text key={k} style={s}>{renderTextRuns(node.children, h, k)}</Text>;
      }
      case 'link':
        return (
          <Text key={k} style={linkStyle} onPress={() => h.onLinkPress?.(node.href, node.wl)}>
            {renderTextRuns(node.children, h, k)}
          </Text>
        );
      case 'fnref':
        return (
          <Text key={k} style={fnStyle} onPress={() => h.onFootnotePress?.(node.href, node.label)}>
            {node.label}
          </Text>
        );
      case 'sup':
        return <Text key={k} style={{ fontSize: sepText.body.fontSize! * 0.75 }}>{renderTextRuns(node.children, h, k)}</Text>;
      case 'sub':
        return <Text key={k} style={{ fontSize: sepText.body.fontSize! * 0.75 }}>{renderTextRuns(node.children, h, k)}</Text>;
      case 'code':
        return <Text key={k} style={{ fontFamily: 'monospace', color: SEP_COLORS.textBright }}>{node.v}</Text>;
      case 'math':
        // shouldn't reach here on the fast path; render TeX as a safety net.
        return <Text key={k} style={{ fontFamily: 'monospace' }}>{node.tex}</Text>;
      default:
        return null;
    }
  });
}

// ── Highlight-aware text path ────────────────────────────────────────────────
// Renders the same as renderTextRuns but threads a running character offset so
// annotation ranges (computed over the paragraph's plain text) can be painted on
// the exact matched span, with multiple non-overlapping highlights supported.
// Offsets advance for exactly the characters inlineText() counts (text + code +
// nested children), so range math stays in sync with the matcher.
function wrapTextWithHighlights(
  text: string, base: number, highlights: Highlight[], keyBase: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = 0;
  while (pos < text.length) {
    const abs = base + pos;
    const hl = highlights.find(h => abs >= h.start && abs < h.end);
    if (hl) {
      const end = Math.min(text.length, hl.end - base);
      out.push(
        <Text key={`${keyBase}-h${pos}`} style={{ backgroundColor: hl.color }} onPress={hl.onPress}>
          {text.slice(pos, end)}
        </Text>
      );
      pos = end;
    } else {
      let next = text.length;
      for (const h of highlights) {
        if (h.start > abs) next = Math.min(next, h.start - base);
      }
      out.push(<Text key={`${keyBase}-t${pos}`}>{text.slice(pos, next)}</Text>);
      pos = next;
    }
  }
  return out;
}

function renderHighlightedRuns(
  inlines: Inline[], h: InlineHandlers, hls: Highlight[], ctx: { offset: number }, key = 'i',
): React.ReactNode[] {
  return inlines.map((node, idx) => {
    const k = `${key}-${idx}`;
    switch (node.t) {
      case 'text': {
        const runs = wrapTextWithHighlights(node.v, ctx.offset, hls, k);
        ctx.offset += node.v.length;
        return <Text key={k}>{runs}</Text>;
      }
      case 'em':
        return (
          <Text key={k} style={node.kind === 'strong'
            ? { fontWeight: '700', color: SEP_COLORS.textBright }
            : { fontStyle: 'italic' }}>
            {renderHighlightedRuns(node.children, h, hls, ctx, k)}
          </Text>
        );
      case 'styled': {
        if (node.style === 'quote') {
          return <Text key={k}>{'“'}{renderHighlightedRuns(node.children, h, hls, ctx, k)}{'”'}</Text>;
        }
        const s = node.style === 'underline' ? { textDecorationLine: 'underline' as const }
          : node.style === 'strike' ? { textDecorationLine: 'line-through' as const }
          : node.style === 'small' ? { fontSize: sepText.body.fontSize! * 0.85 }
          : {};
        return <Text key={k} style={s}>{renderHighlightedRuns(node.children, h, hls, ctx, k)}</Text>;
      }
      case 'link':
        return (
          <Text key={k} style={linkStyle} onPress={() => h.onLinkPress?.(node.href, node.wl)}>
            {renderHighlightedRuns(node.children, h, hls, ctx, k)}
          </Text>
        );
      case 'sup':
        return <Text key={k} style={{ fontSize: sepText.body.fontSize! * 0.75 }}>{renderHighlightedRuns(node.children, h, hls, ctx, k)}</Text>;
      case 'sub':
        return <Text key={k} style={{ fontSize: sepText.body.fontSize! * 0.75 }}>{renderHighlightedRuns(node.children, h, hls, ctx, k)}</Text>;
      case 'code': {
        ctx.offset += node.v.length;
        return <Text key={k} style={{ fontFamily: 'monospace', color: SEP_COLORS.textBright }}>{node.v}</Text>;
      }
      case 'fnref':
        return (
          <Text key={k} style={fnStyle} onPress={() => h.onFootnotePress?.(node.href, node.label)}>
            {node.label}
          </Text>
        );
      default:
        return null;
    }
  });
}

// ── Math path: word-level tokens in a flex-wrap row so SVG can sit between text.
// Only used for paragraphs that actually contain inline math (~24% of corpus),
// so the common case keeps the fast single-<Text> path.
function flattenToTokens(inlines: Inline[], h: InlineHandlers, style: object, out: React.ReactNode[], keyRef: { n: number }) {
  for (const node of inlines) {
    if (node.t === 'math') {
      if (node.display) continue; // display math handled at block level
      out.push(<MathSvg key={`m${keyRef.n++}`} tex={node.tex} display={false} resolve={h.resolveMath} />);
    } else if (node.t === 'text') {
      // split into words; spaces become natural wrap points
      for (const word of node.v.split(/(\s+)/)) {
        if (word === '') continue;
        out.push(<Text key={`w${keyRef.n++}`} style={style}>{word}</Text>);
      }
    } else if (node.t === 'link') {
      const ls = { ...style, ...linkStyle };
      const k = `l${keyRef.n++}`;
      // Render as a single tappable <Text> so onPress is attached. Math inside
      // links is rare; renderTextRuns' safety-net path (raw TeX text) handles it.
      out.push(
        <Text key={k} style={ls} onPress={() => h.onLinkPress?.(node.href, node.wl)}>
          {renderTextRuns(node.children, h, k)}
        </Text>
      );
    } else if (node.t === 'em') {
      const ns = { ...style, ...(node.kind === 'strong'
        ? { fontWeight: '700' as const, color: SEP_COLORS.textBright }
        : { fontStyle: 'italic' as const }) };
      flattenToTokens(node.children, h, ns, out, keyRef);
    } else if (node.t === 'styled') {
      if (node.style === 'quote') {
        out.push(<Text key={`q${keyRef.n++}`} style={style}>{'"'}</Text>);
        flattenToTokens(node.children, h, style, out, keyRef);
        out.push(<Text key={`q${keyRef.n++}`} style={style}>{'"'}</Text>);
      } else {
        const ns = node.style === 'underline' ? { ...style, textDecorationLine: 'underline' as const }
          : node.style === 'strike' ? { ...style, textDecorationLine: 'line-through' as const }
          : { ...style, fontSize: (style as any).fontSize! * 0.85 }; // small
        flattenToTokens(node.children, h, ns, out, keyRef);
      }
    } else if (node.t === 'sup') {
      const ns = { ...style, fontSize: (style as any).fontSize! * 0.75 };
      flattenToTokens(node.children, h, ns, out, keyRef);
    } else if (node.t === 'sub') {
      const ns = { ...style, fontSize: (style as any).fontSize! * 0.75 };
      flattenToTokens(node.children, h, ns, out, keyRef);
    } else if (node.t === 'fnref') {
      out.push(<Text key={`f${keyRef.n++}`} style={{ ...style, ...fnStyle }} onPress={() => h.onFootnotePress?.(node.href, node.label)}>{node.label}</Text>);
    } else if (node.t === 'code') {
      out.push(<Text key={`c${keyRef.n++}`} style={{ ...style, fontFamily: 'monospace' }}>{node.v}</Text>);
    }
  }
}

interface Props {
  inlines: Inline[];
  handlers: InlineHandlers;
  baseStyle?: object;
  // Annotation ranges over this run's plain text. Only honored on the no-math
  // fast path; math paragraphs fall back to a whole-paragraph indicator upstream.
  highlights?: Highlight[];
}

export function InlineContent({ inlines, handlers, baseStyle, highlights }: Props) {
  const style = { ...sepText.body, ...baseStyle };
  if (!hasMath(inlines)) {
    const runs = highlights && highlights.length
      ? renderHighlightedRuns(inlines, handlers, highlights, { offset: 0 })
      : renderTextRuns(inlines, handlers);
    return <Text style={style}>{runs}</Text>;
  }
  const tokens: React.ReactNode[] = [];
  flattenToTokens(inlines, handlers, style, tokens, { n: 0 });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {tokens}
    </View>
  );
}
