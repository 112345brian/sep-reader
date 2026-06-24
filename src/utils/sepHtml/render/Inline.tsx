import React from 'react';
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { Inline } from '../types';
import { SEP_BASE_FONT, SEP_COLORS, sepText } from './theme';

// MathJax sizes SVGs with ex:8 against em:16; reader runs at SEP_BASE_FONT px.
const PX_PER_EX = SEP_BASE_FONT / 2;

export interface InlineHandlers {
  onLinkPress?: (href: string, wl: boolean) => void;
  onFootnotePress?: (href: string, label: string) => void;
  // hash→svg map loaded from the `math` DB table after article text renders.
  mathSvgs?: Record<string, string>;
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
// Inline code chip — mirrors readerCss `code { background; border-radius; … }`.
// RN can't pad inline text, so hair-spaces fake the horizontal breathing room.
const codeStyle = {
  fontFamily: 'monospace' as const,
  fontSize: sepText.body.fontSize! * 0.9,
  color: SEP_COLORS.textBright,
  backgroundColor: SEP_COLORS.bgRaised,
};
const strongStyle = { fontWeight: '700' as const, color: SEP_COLORS.textBright };
const emStyle = { fontStyle: 'italic' as const };
const scriptStyle = { fontSize: sepText.body.fontSize! * 0.75 };
const smallStyle = { fontSize: sepText.body.fontSize! * 0.85 };
const underlineStyle = { textDecorationLine: 'underline' as const };
const strikeStyle = { textDecorationLine: 'line-through' as const };

export function hasMath(inlines: Inline[]): boolean {
  for (const i of inlines) {
    if (i.t === 'mathsvg' || i.t === 'mathref') return true;
    if ('children' in i && Array.isArray(i.children) && hasMath(i.children)) return true;
  }
  return false;
}

function renderMathNode(node: { t: 'mathsvg' | 'mathref'; w: number; h: number; display: boolean; svg?: string; hash?: string }, h: InlineHandlers, k: string, inline = false) {
  const pw = Math.max(1, Math.round(node.w * PX_PER_EX));
  const ph = Math.max(1, Math.round(node.h * PX_PER_EX));
  const svg = node.t === 'mathsvg' ? node.svg! : (node.hash ? h.mathSvgs?.[node.hash] : undefined);
  if (!svg) {
    // Placeholder: reserve the right dimensions while SVGs load.
    return <View key={k} style={{ width: pw, height: ph, opacity: 0 }} />;
  }
  return <SvgXml key={k} xml={svg} width={pw} height={ph} color={SEP_COLORS.text}
    style={!inline || node.display ? undefined : { transform: [{ translateY: Math.round(ph * 0.18) }] }} />;
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
          <Text key={k} style={node.kind === 'strong' ? strongStyle : emStyle}>
            {renderTextRuns(node.children, h, k)}
          </Text>
        );
      case 'styled': {
        const s = node.style === 'underline' ? underlineStyle
          : node.style === 'strike' ? strikeStyle
          : node.style === 'small' ? smallStyle
          : {}; // quote handled via wrapping chars below
        if (node.style === 'quote') {
          return <Text key={k}>{'”'}{renderTextRuns(node.children, h, k)}{'”'}</Text>;
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
        return <Text key={k} style={scriptStyle}>{renderTextRuns(node.children, h, k)}</Text>;
      case 'sub':
        return <Text key={k} style={scriptStyle}>{renderTextRuns(node.children, h, k)}</Text>;
      case 'code':
        return <Text key={k} style={codeStyle}>{` ${node.v} `}</Text>;
      case 'mathsvg':
      case 'mathref':
        return renderMathNode(node, h, k, true);
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
          <Text key={k} style={node.kind === 'strong' ? strongStyle : emStyle}>
            {renderHighlightedRuns(node.children, h, hls, ctx, k)}
          </Text>
        );
      case 'styled': {
        if (node.style === 'quote') {
          return <Text key={k}>{'”'}{renderHighlightedRuns(node.children, h, hls, ctx, k)}{'”'}</Text>;
        }
        const s = node.style === 'underline' ? underlineStyle
          : node.style === 'strike' ? strikeStyle
          : node.style === 'small' ? smallStyle
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
        return <Text key={k} style={scriptStyle}>{renderHighlightedRuns(node.children, h, hls, ctx, k)}</Text>;
      case 'sub':
        return <Text key={k} style={scriptStyle}>{renderHighlightedRuns(node.children, h, hls, ctx, k)}</Text>;
      case 'code': {
        ctx.offset += node.v.length;
        return <Text key={k} style={codeStyle}>{` ${node.v} `}</Text>;
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
    if (node.t === 'mathsvg' || node.t === 'mathref') {
      if (node.display) continue; // display math handled at block level
      out.push(renderMathNode(node, h, `m${keyRef.n++}`, true));
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
      out.push(<Text key={`c${keyRef.n++}`} style={{ ...style, ...codeStyle }}>{` ${node.v} `}</Text>);
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
  // Pre-computed hasMath result from the caller — skips an internal tree walk.
  precomputedHasMath?: boolean;
}

export function InlineContent({ inlines, handlers, baseStyle, highlights, precomputedHasMath }: Props) {
  const style = baseStyle ? { ...sepText.body, ...baseStyle } : sepText.body;
  const withMath = precomputedHasMath ?? hasMath(inlines);
  if (!withMath) {
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
