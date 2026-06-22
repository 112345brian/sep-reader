import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchEntries, getRecentSlugs, getBookmarks } from '../services/db';
import type { EntrySummary } from '../types';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Icons ──────────────────────────────────────────────────────────────────

function IconSearch({ size = 18, color = '#555' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" />
      <Path d="m21 21-4.35-4.35" />
    </Svg>
  );
}

function IconDoc({ size = 17, color = '#555' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Svg>
  );
}

function IconChevron({ size = 15, color = '#444' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

function IconHome({ size = 22, color = '#555' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9 22V12h6v10" />
    </Svg>
  );
}

function IconNotes({ size = 22, color = '#555' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function IconSettings({ size = 20, color = '#555' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntrySummary[]>([]);
  const [history, setHistory] = useState<EntrySummary[]>([]);
  const [bookmarks, setBookmarks] = useState<EntrySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'home' | 'search'>('home');
  const searchInputRef = useRef<TextInput>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    const [h, b] = await Promise.all([getRecentSlugs(12), getBookmarks()]);
    setHistory(h);
    setBookmarks(b);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

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

  const switchToSearch = () => {
    setTab('search');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const open = (slug: string, title: string) =>
    nav.navigate('Article', { slug, title });

  const bookmarkSlugs = new Set(bookmarks.map(b => b.slug));
  const recentHistory = history.filter(h => !bookmarkSlugs.has(h.slug));
  const isSearchActive = tab === 'search';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      {/* ── App bar ── */}
      <View style={[styles.appBar, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.wordmark}>Nous</Text>
        <TouchableOpacity
          onPress={() => nav.navigate('Settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.settingsBtn}
        >
          <IconSettings size={20} color="#555" />
        </TouchableOpacity>
      </View>

      {/* ── Search bar ── */}
      {isSearchActive ? (
        <View style={styles.searchBarActive}>
          <IconSearch size={18} color="#5b8ef5" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search the Encyclopedia…"
            placeholderTextColor="#444"
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { handleSearch(''); }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.searchPill} onPress={switchToSearch} activeOpacity={0.7}>
          <IconSearch size={18} color="#555" />
          <Text style={styles.searchPillText}>Search pages…</Text>
        </TouchableOpacity>
      )}

      {/* ── Content ── */}
      {isSearchActive ? (
        <FlatList
          data={results}
          keyExtractor={i => i.slug}
          renderItem={({ item }) => <PageRow item={item} onPress={open} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query.trim().length === 0
              ? null
              : searching
              ? <ActivityIndicator color="#5b8ef5" style={{ marginTop: 32 }} />
              : results.length === 0
              ? <Text style={styles.empty}>No results for "{query}"</Text>
              : null
          }
        />
      ) : (
        <FlatList
          data={recentHistory}
          keyExtractor={i => i.slug}
          renderItem={({ item }) => <PageRow item={item} onPress={open} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListHeaderComponent={
            <>
              {bookmarks.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Bookmarks</Text>
                  {bookmarks.map(item => (
                    <PageRow key={item.slug} item={item} onPress={open} />
                  ))}
                </>
              )}
              {recentHistory.length > 0 && (
                <Text style={styles.sectionLabel}>Continue reading</Text>
              )}
              {recentHistory.length === 0 && bookmarks.length === 0 && (
                <Text style={styles.hint}>
                  Search any topic in philosophy.{'\n'}Articles cache for offline reading.
                </Text>
              )}
            </>
          }
          ListFooterComponent={
            recentHistory.length > 0 ? (
              <TouchableOpacity style={styles.browseBtn} onPress={switchToSearch}>
                <Text style={styles.browseBtnText}>Browse all entries →</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* ── Bottom nav ── */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => { setTab('home'); setQuery(''); setResults([]); }}
          activeOpacity={0.7}
        >
          {tab === 'home' && <View style={styles.navPill} />}
          <IconHome size={22} color={tab === 'home' ? '#5b8ef5' : '#444'} />
          <Text style={[styles.navLabel, tab === 'home' && styles.navLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={switchToSearch}
          activeOpacity={0.7}
        >
          {tab === 'search' && <View style={styles.navPill} />}
          <IconSearch size={22} color={tab === 'search' ? '#5b8ef5' : '#444'} />
          <Text style={[styles.navLabel, tab === 'search' && styles.navLabelActive]}>Search</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => nav.navigate('Annotations')}
          activeOpacity={0.7}
        >
          <IconNotes size={22} color="#444" />
          <Text style={styles.navLabel}>Notes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Page row ───────────────────────────────────────────────────────────────

function PageRow({
  item,
  onPress,
}: {
  item: EntrySummary;
  onPress: (slug: string, title: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(item.slug, item.title)}
      activeOpacity={0.5}
    >
      <View style={styles.rowIcon}>
        <IconDoc size={17} color="#555" />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.author ? (
          <Text style={styles.rowMeta} numberOfLines={1}>{item.author}</Text>
        ) : null}
      </View>
      <View style={styles.rowChev}>
        <IconChevron size={15} color="#333" />
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  wordmark: {
    flex: 1,
    color: '#e4e4e4',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.02 * 22,
  },
  settingsBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },

  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 12,
    height: 46,
    backgroundColor: '#1c1c1c',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 16,
  },
  searchPillText: { fontSize: 14, color: '#555', flex: 1 },

  searchBarActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 12,
    height: 46,
    backgroundColor: '#1c1c1c',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#5b8ef5',
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#e4e4e4',
    padding: 0,
  },
  clearBtn: { color: '#555', fontSize: 14, paddingHorizontal: 4 },

  sectionLabel: {
    color: '#444',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  rowIcon: {
    width: 38, height: 38,
    borderRadius: 8,
    backgroundColor: '#1c1c1c',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#d6d6d6', lineHeight: 19 },
  rowMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  rowChev: { alignSelf: 'center' },

  hint: {
    color: '#444', fontSize: 15, lineHeight: 22,
    textAlign: 'center', marginTop: 80, paddingHorizontal: 32,
  },
  browseBtn: {
    alignSelf: 'center', marginTop: 24,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  browseBtnText: { color: '#5b8ef5', fontSize: 14 },
  empty: {
    color: '#555', fontSize: 14, textAlign: 'center',
    marginTop: 48, paddingHorizontal: 32,
  },

  bottomNav: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  navPill: {
    position: 'absolute',
    top: 6,
    width: 56, height: 30,
    backgroundColor: 'rgba(91,142,245,0.14)',
    borderRadius: 15,
  },
  navLabel: {
    fontSize: 10, fontWeight: '500', color: '#444',
  },
  navLabelActive: { color: '#5b8ef5' },
});
