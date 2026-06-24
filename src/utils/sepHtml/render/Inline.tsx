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
      // links with inline math are rare; render their text words as one tappable token group
      flattenToTokens(node.children, { ...h }, ls, out, keyRef);
    } else if ('children' in node && Array.isArray(node.children)) {
      const ns = node.t === 'em'
        ? { ...style, ...(node.kind === 'strong' ? { fontWeight: '700' as const, color: SEP_COLORS.textBright } : { fontStyle: 'italic' as const }) }
        : style;
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
}

export function InlineContent({ inlines, handlers, baseStyle }: Props) {
  const style = { ...sepText.body, ...baseStyle };
  if (!hasMath(inlines)) {
    return <Text style={style}>{renderTextRuns(inlines, handlers)}</Text>;
  }
  const tokens: React.ReactNode[] = [];
  flattenToTokens(inlines, handlers, style, tokens, { n: 0 });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {tokens}
    </View>
  );
}
