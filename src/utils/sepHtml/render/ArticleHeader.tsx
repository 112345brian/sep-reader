import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { parseSepHtml } from '../parse';
import { Blocks, type BlockHandlers } from './Blocks';
import { sepHeader } from './theme';

interface Props {
  title: string;
  // SEP parent-group label (e.g. "Logic") shown as a breadcrumb tag, or null.
  parentLabel?: string | null;
  // SEP #preamble HTML (author line + "First published … / substantive
  // revision …"). Rendered muted under the title. Empty/absent → no preamble.
  preambleHtml?: string | null;
  onLinkPress?: (href: string, wl: boolean) => void;
}

// Native equivalent of the WebView's h1.pagetitle + .entry-breadcrumb +
// #preamble chrome. Scrolls with the article body (it's rendered inside the
// SepArticle ScrollView via the `header` prop), so the title recedes as you read.
export function ArticleHeader({ title, parentLabel, preambleHtml, onLinkPress }: Props) {
  const preamble = useMemo(() => {
    if (!preambleHtml || !preambleHtml.trim()) return null;
    // Strip the <h1> (rendered separately as the title) and neutralize the
    // pubinfo/preamble/toc ids so parseSepHtml's SKIP_IDS doesn't drop the
    // "First published … / substantive revision …" line nested inside.
    const cleaned = preambleHtml
      .replace(/<h1[\s\S]*?<\/h1>/i, '')
      .replace(/\bid=("|')(pubinfo|preamble|toc)\1/gi, 'data-sep=$1$2$1');
    const parsed = parseSepHtml(cleaned);
    return parsed.blocks.length ? parsed : null;
  }, [preambleHtml]);
  const handlers: BlockHandlers = { onLinkPress, textStyle: sepHeader.preambleText };

  return (
    <View style={sepHeader.wrap}>
      {parentLabel ? <Text style={sepHeader.breadcrumb}>{parentLabel.toUpperCase()}</Text> : null}
      <Text style={sepHeader.title}>{title}</Text>
      {preamble && preamble.blocks.length > 0 ? (
        <View style={sepHeader.preamble}>
          <Blocks blocks={preamble.blocks} h={handlers} keyPrefix="pre" />
        </View>
      ) : null}
    </View>
  );
}
