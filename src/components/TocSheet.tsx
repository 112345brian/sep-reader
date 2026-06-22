import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Annotation } from '../types';

interface TocItem { text: string; href: string; level: number; }

function parseToc(html: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /<a[^>]+href="(#[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].slice(1);
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    const numMatch = text.match(/^([\d.]+)\.\s*/);
    const dots = numMatch ? (numMatch[1].match(/\./g) ?? []).length : 0;
    items.push({ href, text, level: dots });
  }
  return items;
}

interface Props {
  tocHtml: string | null;
  annotations: Annotation[];
  onClose: () => void;
  onTocJump: (href: string) => void;
  onAnnotationTap: (ann: Annotation) => void;
}

export default function TocSheet({ tocHtml, annotations, onClose, onTocJump, onAnnotationTap }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'contents' | 'annotations'>('contents');
  const tocItems = tocHtml ? parseToc(tocHtml) : [];

  const ANN_COLOR_MAP: Record<string, string> = {
    '#fbbf24': '#fbbf24', '#FFE566': '#fbbf24',
    '#34d399': '#34d399', '#66DD99': '#34d399',
    '#60a5fa': '#60a5fa', '#66AAFF': '#60a5fa',
    '#f472b6': '#f472b6', '#FF6B6B': '#f472b6',
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.tabBar}>
          {(['contents', 'annotations'] as const).map(t => (
            <TouchableOpacity key={t} style={styles.tab} onPress={() => setTab(t)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'contents' ? 'Contents' : 'Annotations'}
                </Text>
                {t === 'annotations' && annotations.length > 0 && (
                  <View style={[styles.badge, tab === t && styles.badgeActive]}>
                    <Text style={[styles.badgeText, tab === t && styles.badgeTextActive]}>
                      {annotations.length}
                    </Text>
                  </View>
                )}
              </View>
              {tab === t && <View style={styles.tabLine} />}
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'contents' && (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {tocItems.length === 0 && (
              <Text style={styles.empty}>No table of contents.</Text>
            )}
            {tocItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tocItem, item.level > 0 && styles.tocItemNested]}
                onPress={() => { onTocJump(item.href); onClose(); }}
                activeOpacity={0.6}
              >
                <Text style={[styles.tocText, item.level > 0 && styles.tocTextNested]}>
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {tab === 'annotations' && (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {annotations.length === 0 && (
              <Text style={styles.empty}>
                No annotations yet.{'\n'}Select text to highlight.
              </Text>
            )}
            {annotations.map(ann => (
              <TouchableOpacity
                key={ann.id}
                style={[styles.annCard, { borderLeftColor: ANN_COLOR_MAP[ann.color] ?? '#fbbf24' }]}
                onPress={() => { onAnnotationTap(ann); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.annQuote} numberOfLines={3}>
                  "{ann.selected_text}"
                </Text>
                {ann.note ? (
                  <Text style={styles.annNote} numberOfLines={2}>{ann.note}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '66%',
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#3a3a3a',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  tab: {
    flex: 1, alignItems: 'center',
    paddingVertical: 12, position: 'relative',
  },
  tabText: { fontSize: 13, fontWeight: '500', color: '#555' },
  tabTextActive: { color: '#5b8ef5', fontWeight: '600' },
  tabLine: {
    position: 'absolute', bottom: 0,
    left: '20%', right: '20%',
    height: 2, backgroundColor: '#5b8ef5', borderRadius: 1,
  },
  badge: {
    backgroundColor: '#252525', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1,
    borderWidth: 1, borderColor: '#333',
  },
  badgeActive: {
    backgroundColor: 'rgba(91,142,245,0.14)',
    borderColor: 'rgba(91,142,245,0.35)',
  },
  badgeText: { fontSize: 11, color: '#555', fontWeight: '500' },
  badgeTextActive: { color: '#5b8ef5' },
  list: { flex: 1 },
  tocItem: {
    paddingVertical: 14, paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  tocItemNested: { paddingLeft: 36 },
  tocText: { fontSize: 14, color: '#d0d0d0', lineHeight: 20 },
  tocTextNested: { fontSize: 13, color: '#888' },
  annCard: {
    marginHorizontal: 12, marginVertical: 5,
    backgroundColor: '#252525', borderRadius: 8,
    padding: 12, borderLeftWidth: 3,
  },
  annQuote: { fontSize: 13, color: '#d0d0d0', lineHeight: 19 },
  annNote: { fontSize: 12, color: '#888', marginTop: 5, lineHeight: 17 },
  empty: {
    color: '#555', fontSize: 14,
    textAlign: 'center', marginTop: 40,
    paddingHorizontal: 32, lineHeight: 22,
  },
});
