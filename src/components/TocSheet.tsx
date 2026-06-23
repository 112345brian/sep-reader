import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Pressable, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Annotation } from '../types';
import { parseToc } from '../utils/parseToc';

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bgSurface:    '#1c1c1c',
  bgElevated:   '#252525',
  border:       '#2e2e2e',
  borderSubtle: '#222222',
  text:         '#e4e4e4',
  textSec:      '#9a9a9a',
  textHint:     '#555555',
  accent:       '#5b8ef5',
  accentDim:    'rgba(91,142,245,.14)',
  accentBorder: 'rgba(91,142,245,.35)',
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  tocHtml: string | null;
  annotations: Annotation[];
  onClose: () => void;
  onTocJump: (href: string) => void;
  onAnnotationTap: (ann: Annotation) => void;
}

const ANN_COLORS: Record<string, string> = {
  '#fbbf24': '#fbbf24', '#FFE566': '#fbbf24',
  '#34d399': '#34d399', '#66DD99': '#34d399',
  '#60a5fa': '#60a5fa', '#66AAFF': '#60a5fa',
  '#f472b6': '#f472b6', '#FF6B6B': '#f472b6',
};

// ── Component ──────────────────────────────────────────────────────────────

export default function TocSheet({ tocHtml, annotations, onClose, onTocJump, onAnnotationTap }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'contents' | 'annotations'>('contents');
  const tocItems = tocHtml ? parseToc(tocHtml) : [];

  const slideAnim = useRef(new Animated.Value(350)).current;
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 28,
      stiffness: 320,
      mass: 0.9,
    }).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim — tap to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom, transform: [{ translateY: slideAnim }] }]}>

        {/* Drag handle (mock: 36×4, color var(--border)=#2e2e2e, margin:10px auto 0) */}
        <View style={styles.handle} />

        {/* Tab bar (mock: border-bottom 1px solid var(--border-subtle)) */}
        <View style={styles.tabBar}>
          {(['contents', 'annotations'] as const).map(t => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t === 'contents' ? 'Contents' : 'Annotations'}
                </Text>
                {t === 'annotations' && annotations.length > 0 && (
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                      {annotations.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contents panel */}
        {tab === 'contents' && (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {tocItems.length === 0 && (
              <Text style={styles.empty}>No table of contents.</Text>
            )}
            {tocItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tocItem, item.level > 0 && styles.tocItemH3]}
                onPress={() => { onTocJump(item.href); onClose(); }}
                activeOpacity={0.5}
              >
                {/* Separate num + text, exactly like the mockup */}
                <Text style={styles.tocNum}>{item.num}</Text>
                <Text style={[styles.tocText, item.level > 0 && styles.tocTextH3]}>
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {/* Annotations panel */}
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
                style={[styles.annCard, { borderLeftColor: ANN_COLORS[ann.color] ?? '#fbbf24' }]}
                onPress={() => { onAnnotationTap(ann); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.annQuote} numberOfLines={3}>"{ann.selected_text}"</Text>
                {ann.note ? <Text style={styles.annNote} numberOfLines={2}>{ann.note}</Text> : null}
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

// ── Styles — direct translation of mockup ──────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '66%',
    backgroundColor: C.bgSurface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
    flexDirection: 'column',
  },

  // mock: width:36, height:4, background:var(--border)=#2e2e2e, margin:10px auto 0
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
    flexShrink: 0,
  },

  // mock: display:flex, border-bottom:1px solid var(--border-subtle)
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    flexShrink: 0,
  },

  // mock tab: flex:1, padding:12px 0, border-bottom:2px solid transparent
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  // mock active tab: border-bottom:2px solid var(--accent)
  tabActive: {
    borderBottomColor: C.accent,
  },
  tabText: { fontSize: 13, fontWeight: '500', color: C.textHint, fontFamily: 'System' },
  tabTextActive: { color: C.accent, fontWeight: '600' },

  badge: {
    backgroundColor: C.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: C.border,
  },
  badgeActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accentBorder,
  },
  badgeText: { fontSize: 11, color: C.textHint, fontWeight: '500' },
  badgeTextActive: { color: C.accent },

  list: { flex: 1 },

  // mock .toc-item: display:flex, align-items:flex-start, gap:14, padding:14px 18px, border-bottom:1px solid var(--border-subtle)
  tocItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  // mock .toc-item.h3: padding-left:36
  tocItemH3: { paddingLeft: 36 },

  // mock .toc-num: font-size:12, color:var(--text-hint), min-width:20, line-height:1.5
  tocNum: {
    fontSize: 12,
    color: C.textHint,
    minWidth: 20,
    lineHeight: 18,
    flexShrink: 0,
  },
  // mock .toc-text: font-size:14, color:var(--text), line-height:1.5
  tocText: {
    fontSize: 14,
    color: C.text,
    lineHeight: 21,
    flex: 1,
  },
  // mock .toc-item.h3 .toc-text: font-size:13, color:var(--text-sec)
  tocTextH3: {
    fontSize: 13,
    color: C.textSec,
  },

  annCard: {
    marginHorizontal: 12,
    marginVertical: 5,
    backgroundColor: C.bgElevated,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
  },
  annQuote: { fontSize: 13, color: C.text, lineHeight: 19 },
  annNote: { fontSize: 12, color: C.textSec, marginTop: 5, lineHeight: 17 },

  empty: {
    color: C.textHint,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
});
