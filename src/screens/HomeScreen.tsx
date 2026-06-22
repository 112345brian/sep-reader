import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchArticles, getArticleCount } from '../services/db';
import { runSync } from '../services/sync';
import type { ArticleSummary, SyncStatus } from '../types';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [count, setCount] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    const results = await searchArticles(q, 100);
    setArticles(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    load('');
    getArticleCount().then(setCount);
  }, []);

  // Background sync for new/updated articles
  useEffect(() => {
    getArticleCount().then(n => {
      if (n === 0) return; // SyncScreen handles initial sync
      runSync(s => {
        if (s.phase === 'syncing' || s.phase === 'done') setSyncStatus(s);
        if (s.phase === 'done') {
          setTimeout(() => setSyncStatus(null), 3000);
          getArticleCount().then(setCount);
          if (!query) load('');
        }
      });
    });
  }, []);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(text), 200);
  };

  const renderItem = ({ item }: { item: ArticleSummary }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => nav.navigate('Article', { slug: item.slug, title: item.title })}
      activeOpacity={0.6}
    >
      <Text style={styles.rowTitle}>{item.title}</Text>
      {item.author && (
        <Text style={styles.rowMeta} numberOfLines={1}>{item.author}</Text>
      )}
    </TouchableOpacity>
  );

  const headerHeight = insets.top + 56;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, height: headerHeight }]}>
        <View style={styles.searchRow}>
          <Text style={styles.logo}>SEP</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search all articles…"
            placeholderTextColor="#444"
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Sync status bar */}
      {syncStatus?.phase === 'syncing' && (
        <View style={styles.syncBar}>
          <ActivityIndicator size="small" color="#7ba4ff" style={{ marginRight: 8 }} />
          <Text style={styles.syncText}>
            Syncing {syncStatus.done}/{syncStatus.total}…
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#7ba4ff" style={styles.centerSpinner} />
      ) : (
        <FlatList
          data={articles}
          keyExtractor={item => item.slug}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            !query ? (
              <Text style={styles.listHeader}>
                {count.toLocaleString()} articles
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No results for "{query}"</Text>
          }
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({
            length: 68,
            offset: 68 * index,
            index,
          })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    color: '#7ba4ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#e8e8e8',
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  syncText: {
    color: '#7ba4ff',
    fontSize: 12,
  },
  listHeader: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  row: {
    height: 68,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  rowTitle: {
    color: '#d6d6d6',
    fontSize: 16,
    fontWeight: '400',
  },
  rowMeta: {
    color: '#555',
    fontSize: 12,
    marginTop: 2,
  },
  centerSpinner: {
    flex: 1,
  },
  empty: {
    color: '#555',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 32,
  },
});
