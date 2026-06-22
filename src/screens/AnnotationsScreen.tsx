import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAllAnnotations } from '../services/db';
import type { AnnotationWithTitle } from '../services/db';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ArticleGroup {
  slug: string;
  title: string | null;
  items: AnnotationWithTitle[];
}

const COLOR_LABELS: Record<string, string> = {
  '#fbbf24': '#fbbf24',
  '#34d399': '#34d399',
  '#60a5fa': '#60a5fa',
  '#f87171': '#f87171',
  '#a78bfa': '#a78bfa',
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AnnotationsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [annotations, setAnnotations] = useState<AnnotationWithTitle[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    getAllAnnotations().then(anns => {
      setAnnotations(anns);
      setLoading(false);
    });
  }, []));

  const grouped = useMemo<ArticleGroup[]>(() => {
    const map = new Map<string, ArticleGroup>();
    for (const ann of annotations) {
      if (!map.has(ann.slug)) {
        map.set(ann.slug, { slug: ann.slug, title: ann.article_title, items: [] });
      }
      map.get(ann.slug)!.items.push(ann);
    }
    return Array.from(map.values());
  }, [annotations]);

  const open = (slug: string, title: string) =>
    nav.navigate('Article', { slug, title });

  const totalCount = annotations.length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => nav.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>Library</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Highlights</Text>
        <View style={styles.back}>
          {totalCount > 0 && (
            <Text style={styles.countBadge}>{totalCount}</Text>
          )}
        </View>
      </View>

      {!loading && grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No highlights yet</Text>
          <Text style={styles.emptyHint}>
            Long-press any text while reading to highlight it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={g => g.slug}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => open(group.slug, group.title ?? group.slug)}
                activeOpacity={0.7}
              >
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {group.title ?? group.slug}
                </Text>
                <Text style={styles.groupCount}>
                  {group.items.length} {group.items.length === 1 ? 'highlight' : 'highlights'}
                </Text>
              </TouchableOpacity>
              {group.items.map(ann => (
                <TouchableOpacity
                  key={ann.id}
                  style={styles.ann}
                  onPress={() => open(group.slug, group.title ?? group.slug)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[styles.annStripe, { backgroundColor: COLOR_LABELS[ann.color] ?? '#7ba4ff' }]}
                  />
                  <View style={styles.annBody}>
                    <Text style={styles.annText} numberOfLines={3}>
                      {ann.selected_text}
                    </Text>
                    {ann.note ? (
                      <Text style={styles.annNote} numberOfLines={2}>
                        {ann.note}
                      </Text>
                    ) : null}
                    <Text style={styles.annDate}>{formatDate(ann.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    minHeight: 44,
  },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 80, paddingHorizontal: 8 },
  backChevron: { color: '#7ba4ff', fontSize: 28, lineHeight: 28, marginRight: 1 },
  backLabel: { color: '#7ba4ff', fontSize: 16 },
  headerTitle: {
    flex: 1, color: '#e8e8e8', fontSize: 15, fontWeight: '600', textAlign: 'center',
  },
  countBadge: {
    color: '#7ba4ff', fontSize: 13, fontWeight: '600', marginLeft: 'auto',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: '#555', fontSize: 17, fontWeight: '500', marginBottom: 8 },
  emptyHint: { color: '#3a3a3a', fontSize: 14, textAlign: 'center', lineHeight: 21 },

  group: {
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
    backgroundColor: '#171717',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  groupTitle: { flex: 1, color: '#e8e8e8', fontSize: 14, fontWeight: '600', marginRight: 8 },
  groupCount: { color: '#444', fontSize: 12 },

  ann: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1e1e1e',
  },
  annStripe: { width: 3, flexShrink: 0 },
  annBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  annText: { color: '#c8c8c8', fontSize: 14, lineHeight: 20 },
  annNote: {
    color: '#7ba4ff', fontSize: 13, lineHeight: 18,
    borderLeftWidth: 2, borderLeftColor: '#2a3a5a', paddingLeft: 8,
  },
  annDate: { color: '#3a3a3a', fontSize: 11, marginTop: 2 },
});
