import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchEntries, getRecentSlugs, getBookmarks } from '../services/db';
import type { EntrySummary } from '../types';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntrySummary[]>([]);
  const [history, setHistory] = useState<EntrySummary[]>([]);
  const [bookmarks, setBookmarks] = useState<EntrySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHistory = useCallback(async () => {
    const [h, b] = await Promise.all([getRecentSlugs(12), getBookmarks()]);
    setHistory(h);
    setBookmarks(b);
  }, []);

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, [loadHistory]));

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) {
      setSearching(false);
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const r = await searchEntries(text, 60);
      setResults(r);
      setSearching(false);
    }, 150);
  };

  const open = (slug: string, title: string) =>
    nav.navigate('Article', { slug, title });

  const isSearching = query.trim().length > 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.wordmark}>SEP</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => nav.navigate('History')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerAction}>Journey</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => nav.navigate('Settings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerAction}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Search the Encyclopedia…"
          placeholderTextColor="#555"
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {isSearching ? (
        <FlatList
          data={results}
          keyExtractor={i => i.slug}
          renderItem={({ item }) => <Row item={item} onPress={open} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            searching
              ? <ActivityIndicator color="#7ba4ff" style={{ marginTop: 32 }} />
              : results.length === 0
              ? <Text style={styles.empty}>No results for "{query}"</Text>
              : null
          }
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={i => i.slug}
          renderItem={({ item }) => <Row item={item} onPress={open} showCached />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            bookmarks.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>Bookmarks</Text>
                {bookmarks.map(item => (
                  <Row key={item.slug} item={item} onPress={open} showCached />
                ))}
                {history.length > 0 && <Text style={styles.sectionLabel}>Recent</Text>}
              </View>
            ) : history.length > 0 ? (
              <Text style={styles.sectionLabel}>Recent</Text>
            ) : (
              <Text style={styles.hint}>
                Search any topic in philosophy.{'\n'}Articles cache for offline reading.
              </Text>
            )
          }
          ListFooterComponent={
            history.length > 0
              ? <TouchableOpacity
                  style={styles.browseBtn}
                  onPress={() => handleSearch(' ')}
                >
                  <Text style={styles.browseBtnText}>Browse all entries →</Text>
                </TouchableOpacity>
              : null
          }
        />
      )}
    </View>
  );
}

function Row({
  item,
  onPress,
  showCached,
}: {
  item: EntrySummary;
  onPress: (slug: string, title: string) => void;
  showCached?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(item.slug, item.title)}
      activeOpacity={0.55}
    >
      <View style={styles.rowInner}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.author && (
          <Text style={styles.rowMeta} numberOfLines={1}>{item.author}</Text>
        )}
      </View>
      {showCached && item.cached_at && (
        <View style={styles.cachedDot} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordmark: {
    color: '#7ba4ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  headerAction: { color: '#7ba4ff', fontSize: 13 },
  search: {
    height: 38,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#e8e8e8',
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
  },
  sectionLabel: {
    color: '#444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  rowInner: { flex: 1 },
  rowTitle: { color: '#d6d6d6', fontSize: 16 },
  rowMeta: { color: '#555', fontSize: 12, marginTop: 2 },
  cachedDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#7ba4ff', marginLeft: 10, opacity: 0.7,
  },
  hint: {
    color: '#444',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  browseBtn: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  browseBtnText: { color: '#7ba4ff', fontSize: 14 },
  empty: {
    color: '#555', fontSize: 14,
    textAlign: 'center', marginTop: 48,
    paddingHorizontal: 32,
  },
});
