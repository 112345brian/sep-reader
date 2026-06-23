import React, { useCallback, useRef, useState } from 'react';
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

// ── Design tokens (mirrors mockup CSS vars) ────────────────────────────────
const C = {
  bg:           '#111111',
  bgSurface:    '#1c1c1c',
  border:       '#2e2e2e',
  borderSubtle: '#222222',
  text:         '#e4e4e4',
  textHint:     '#555555',
  accent:       '#5b8ef5',
  accentDim:    'rgba(91,142,245,.14)',
  accentBorder: 'rgba(91,142,245,.35)',
};

// ── Icons ──────────────────────────────────────────────────────────────────

function IconSearch({ size = 18, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" /><Path d="m21 21-4.35-4.35" />
    </Svg>
  );
}

function IconDoc({ size = 17, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Svg>
  );
}

function IconChevron({ size = 15, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

function IconDots({ size = 21, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <Circle cx="5" cy="12" r="1.5" /><Circle cx="12" cy="12" r="1.5" /><Circle cx="19" cy="12" r="1.5" />
    </Svg>
  );
}

function IconHome({ size = 22, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Path d="M9 22V12h6v10" />
    </Svg>
  );
}

function IconNotes({ size = 22, color = C.textHint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<EntrySummary[]>([]);
  const [history, setHistory]   = useState<EntrySummary[]>([]);
  const [bookmarks, setBookmarks] = useState<EntrySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab]           = useState<'home' | 'search'>('home');
  const searchInputRef          = useRef<TextInput>(null);
  const debounce                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    const [h, b] = await Promise.all([getRecentSlugs(12), getBookmarks()]);
    setHistory(h);
    setBookmarks(b);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) { setSearching(false); setResults([]); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const r = await searchEntries(text, 60);
      setResults(r);
      setSearching(false);
    }, 150);
  };

  const openSearch = () => {
    setTab('search');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const open = (slug: string, title: string) => nav.navigate('Article', { slug, title });

  const bookmarkSlugs  = new Set(bookmarks.map(b => b.slug));
  const recentHistory  = history.filter(h => !bookmarkSlugs.has(h.slug));
  const isSearchActive = tab === 'search';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── App bar (no border per mockup) ── */}
      <View style={styles.ab}>
        <Text style={styles.abTitle}>Nous</Text>
        <TouchableOpacity style={styles.ib} onPress={() => nav.navigate('Settings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <IconDots />
        </TouchableOpacity>
      </View>

      {/* ── Search bar ── */}
      {isSearchActive ? (
        <View style={[styles.searchPill, { borderColor: C.accent }]}>
          <IconSearch color={C.accent} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search the Encyclopedia…"
            placeholderTextColor={C.textHint}
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.searchPill} onPress={openSearch} activeOpacity={0.7}>
          <IconSearch />
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
            query.trim().length === 0 ? null
              : searching ? <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
              : results.length === 0 ? <Text style={styles.empty}>No results for "{query}"</Text>
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
                  <Text style={styles.secLabel}>Bookmarks</Text>
                  {bookmarks.map(item => <PageRow key={item.slug} item={item} onPress={open} />)}
                </>
              )}
              {recentHistory.length > 0 && <Text style={styles.secLabel}>Continue reading</Text>}
              {recentHistory.length === 0 && bookmarks.length === 0 && (
                <Text style={styles.hint}>Search any topic in philosophy.{'\n'}Articles cache for offline reading.</Text>
              )}
            </>
          }
        />
      )}

      {/* ── Bottom nav ── */}
      <View style={[styles.bn, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.bnItem} onPress={() => { setTab('home'); setQuery(''); setResults([]); }} activeOpacity={0.7}>
          {tab === 'home' && <View style={styles.bnPill} />}
          <IconHome color={tab === 'home' ? C.accent : C.textHint} />
          <Text style={[styles.bnLabel, tab === 'home' && styles.bnLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bnItem} onPress={openSearch} activeOpacity={0.7}>
          {tab === 'search' && <View style={styles.bnPill} />}
          <IconSearch size={22} color={tab === 'search' ? C.accent : C.textHint} />
          <Text style={[styles.bnLabel, tab === 'search' && styles.bnLabelActive]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bnItem} onPress={() => nav.navigate('Annotations')} activeOpacity={0.7}>
          <IconNotes color={C.textHint} />
          <Text style={styles.bnLabel}>Notes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Page row (mirrors .page-row in mockup) ─────────────────────────────────

function PageRow({ item, onPress }: { item: EntrySummary; onPress: (slug: string, title: string) => void }) {
  const pct = Math.round((item.read_progress ?? 0) * 100);
  const annCount = item.annotation_count ?? 0;

  // Meta line, mockup style: "67% read · 3 annotations"
  const metaParts: string[] = [];
  if (pct > 0) metaParts.push(`${pct}% read`);
  if (annCount > 0) metaParts.push(`${annCount} annotation${annCount === 1 ? '' : 's'}`);
  if (metaParts.length === 0 && item.author) metaParts.push(item.author);
  const meta = metaParts.join(' · ');

  return (
    <TouchableOpacity style={styles.pageRow} onPress={() => onPress(item.slug, item.title)} activeOpacity={0.5}>
      <View style={styles.pageRowIcon}><IconDoc /></View>
      <View style={styles.pageRowBody}>
        <Text style={styles.pageRowTitle} numberOfLines={2}>{item.title}</Text>
        {meta ? <Text style={styles.pageRowMeta} numberOfLines={1}>{meta}</Text> : null}
        {item.excerpt ? <Text style={styles.pageRowExcerpt} numberOfLines={2}>{item.excerpt}</Text> : null}
        {pct > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.pageRowChev}><IconChevron /></View>
    </TouchableOpacity>
  );
}

// ── Styles (direct translation of mockup CSS) ──────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // App bar — no border-bottom (mock: border-bottom:none on home ab)
  ab: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 2,
  },
  abTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.44,
    color: C.text,
    paddingHorizontal: 6,
  },
  ib: {
    width: 42, height: 42,
    borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },

  // Search pill (mock: .home-search)
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 12,
    height: 46,
    backgroundColor: C.bgSurface,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
  },
  searchPillText: { fontSize: 14, color: C.textHint, flex: 1 },
  searchInput: { flex: 1, fontSize: 16, color: C.text, padding: 0 },
  clearBtn: { color: C.textHint, fontSize: 14, paddingHorizontal: 4 },

  // Section label (mock: .sec-label)
  secLabel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.77,
    textTransform: 'uppercase',
    color: C.textHint,
  },

  // Page row (mock: .page-row)
  pageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  pageRowIcon: {
    width: 38, height: 38,
    borderRadius: 8,
    backgroundColor: C.bgSurface,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pageRowBody: { flex: 1, minWidth: 0 },
  pageRowTitle: { fontSize: 14, fontWeight: '500', color: C.text, lineHeight: 18 },
  pageRowMeta: { fontSize: 12, color: C.textHint, marginTop: 2 },
  pageRowExcerpt: { fontSize: 12, color: C.textHint, marginTop: 3, lineHeight: 17 },
  pageRowChev: { alignSelf: 'center' },

  // mock: width:100%;height:2px;background:#2a2a2a;border-radius:1px;margin-top:7px
  progressTrack: {
    width: '100%',
    height: 2,
    backgroundColor: '#2a2a2a',
    borderRadius: 1,
    marginTop: 7,
    overflow: 'hidden',
  },
  // mock: height:100%;background:#5b8ef5;border-radius:1px;opacity:.6
  progressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 1,
    opacity: 0.6,
  },

  hint: { color: C.textHint, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 80, paddingHorizontal: 32 },
  empty: { color: C.textHint, fontSize: 14, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },

  // Bottom nav (mock: .bn)
  bn: {
    height: 56,
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  bnItem: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  bnPill: {
    position: 'absolute',
    top: 6,
    width: 56, height: 30,
    backgroundColor: C.accentDim,
    borderRadius: 15,
  },
  bnLabel: { fontSize: 10, fontWeight: '500', color: C.textHint },
  bnLabelActive: { color: C.accent },
});
