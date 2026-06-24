import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, SectionList, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  searchEntries, getRecentSlugs, getBookmarks, getAllAnnotations,
  toggleBookmark, getAllEntries,
} from '../services/db';
import type { EntrySummary } from '../types';
import type { AnnotationWithTitle } from '../services/db';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Design tokens ──────────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────

interface ArticleGroup {
  slug: string;
  title: string | null;
  items: AnnotationWithTitle[];
}

type BrowseSectionItem =
  | { kind: 'entry'; slug: string; title: string }
  | { kind: 'parent'; label: string; slug: string | null; children: { slug: string; subTitle: string }[] };

interface BrowseSection {
  title: string; // the letter
  data: BrowseSectionItem[];
}

// ── AlphabetScrubber ───────────────────────────────────────────────────────

function AlphabetScrubber({
  letters,
  onSelect,
}: {
  letters: string[];
  onSelect: (letter: string) => void;
}) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<View>(null);
  // Populated via onLayout so it's always ready before first touch
  const metricsRef = useRef({ top: 0, height: 0 });
  const activeRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lettersRef = useRef(letters);
  lettersRef.current = letters;

  function pickLetter(absoluteY: number): string {
    const { top, height } = metricsRef.current;
    if (height === 0) return '';
    const rel = Math.max(0, Math.min(0.9999, (absoluteY - top) / height));
    const idx = Math.floor(rel * lettersRef.current.length);
    return lettersRef.current[idx] ?? lettersRef.current[lettersRef.current.length - 1] ?? '';
  }

  function applyLetter(absoluteY: number) {
    const letter = pickLetter(absoluteY);
    if (!letter || letter === activeRef.current) return;
    activeRef.current = letter;
    setActive(letter);
    onSelectRef.current(letter);
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(e => {
      setExpanded(true);
      applyLetter(e.absoluteY);
    })
    .onUpdate(e => {
      applyLetter(e.absoluteY);
    })
    .onFinalize(() => {
      setExpanded(false);
      setActive(null);
      activeRef.current = null;
    });

  const onLayout = () => {
    containerRef.current?.measure((_x, _y, _w, h, _px, py) => {
      metricsRef.current = { top: py, height: h };
    });
  };

  return (
    <GestureDetector gesture={pan}>
      <View
        ref={containerRef}
        onLayout={onLayout}
        style={[styles.scrubber, expanded && styles.scrubberExpanded, { bottom: bottomInset }]}
      >
        {letters.map(letter => (
          <Text
            key={letter}
            style={[styles.scrubberLetter, active === letter && styles.scrubberLetterActive]}
          >
            {letter}
          </Text>
        ))}
        {active && (
          <View style={styles.scrubberBubble} pointerEvents="none">
            <Text style={styles.scrubberBubbleText}>{active}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [activeTab, setActiveTab]     = useState<'reading' | 'notes' | 'browse'>('reading');
  const [isSearchActive, setSearchActive] = useState(false);
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<EntrySummary[]>([]);
  const [history, setHistory]         = useState<EntrySummary[]>([]);
  const [bookmarks, setBookmarks]     = useState<EntrySummary[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationWithTitle[]>([]);
  const [searching, setSearching]     = useState(false);

  const [browseEntries, setBrowseEntries] = useState<{ slug: string; title: string; parent_label: string | null }[]>([]);
  const [browseLoaded, setBrowseLoaded]   = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<TextInput>(null);
  const debounce       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionListRef = useRef<SectionList<BrowseSectionItem>>(null);

  const loadData = useCallback(async () => {
    const [h, b, anns] = await Promise.all([
      getRecentSlugs(12),
      getBookmarks(),
      getAllAnnotations(),
    ]);
    setHistory(h);
    setBookmarks(b);
    setAnnotations(anns);
  }, []);

  // Load browse entries lazily on first activation
  useEffect(() => {
    if (activeTab === 'browse' && !browseLoaded) {
      getAllEntries().then(entries => {
        setBrowseEntries(entries);
        setBrowseLoaded(true);
      });
    }
  }, [activeTab, browseLoaded]);

  const swipeLeft = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-30, 9999])
    .failOffsetY([-20, 20])
    .onEnd(e => {
      if (e.translationX < -80 && e.velocityX < -100 && history.length > 0) {
        nav.navigate('Article', { slug: history[0].slug, title: history[0].title });
      }
    });

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

  const openSearch = () => {
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setSearchActive(false);
    setQuery('');
    setResults([]);
    setSearching(false);
  };

  const open = (slug: string, title: string) => nav.navigate('Article', { slug, title });

  const handleIconPress = (item: EntrySummary, isBookmarked: boolean) => {
    const bmLabel = isBookmarked ? 'Remove Bookmark' : 'Bookmark';
    Alert.alert(item.title, undefined, [
      {
        text: bmLabel,
        onPress: async () => {
          await toggleBookmark(item.slug, item.title);
          loadData();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const bookmarkSlugs = new Set(bookmarks.map(b => b.slug));
  const recentHistory = history.filter(h => !bookmarkSlugs.has(h.slug));

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

  const toggleParent = useCallback((label: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  const browseSections = useMemo<BrowseSection[]>(() => {
    // Filter out "see X" redirect entries — they're not real articles
    const filtered = browseEntries.filter(e => !e.title.includes(' — see ') && !e.title.includes('— see '));

    // Group sub-entries by parent_label. Fall back to colon-parsing for entries
    // cached before the parent_label column existed (parent_label will be null).
    const parentMap = new Map<string, { slug: string | null; children: { slug: string; subTitle: string }[] }>();
    const standaloneKeys = new Set<string>(); // slugs that are standalone parents

    for (const e of filtered) {
      const label = e.parent_label ?? (() => {
        const idx = e.title.indexOf(': ');
        if (idx <= 0) return null;
        const l = e.title.slice(0, idx);
        return (l.includes(' — ') || l.includes(' - ')) ? null : l;
      })();
      if (!label) continue;
      const subTitle = e.parent_label ? e.title : e.title.slice(label.length + 2);
      if (!parentMap.has(label)) parentMap.set(label, { slug: null, children: [] });
      parentMap.get(label)!.children.push({ slug: e.slug, subTitle });
    }
    // Mark standalone entries that share a name with a parent label
    for (const e of filtered) {
      if (!e.parent_label && e.title.indexOf(': ') < 0) {
        if (parentMap.has(e.title)) {
          parentMap.get(e.title)!.slug = e.slug;
          standaloneKeys.add(e.slug);
        }
      }
    }

    // Build sections
    const groups: Record<string, BrowseSectionItem[]> = {};
    const addedParentLabels = new Set<string>();

    for (const e of filtered) {
      const label = e.parent_label ?? (() => {
        const idx = e.title.indexOf(': ');
        if (idx <= 0) return null;
        const l = e.title.slice(0, idx);
        return (l.includes(' — ') || l.includes(' - ')) ? null : l;
      })();
      if (label) {
        if (addedParentLabels.has(label)) continue;
        addedParentLabels.add(label);
        const info = parentMap.get(label)!;
        const first = label[0] ?? '';
        const letter = /[0-9]/.test(first) ? '#' : first.toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push({ kind: 'parent', label, slug: info.slug, children: info.children });
      } else if (!standaloneKeys.has(e.slug)) {
        const first = e.title[0] ?? '';
        const letter = /[0-9]/.test(first) ? '#' : first.toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push({ kind: 'entry', slug: e.slug, title: e.title });
      }
    }

    return Object.keys(groups)
      .sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
      .map(letter => ({ title: letter, data: groups[letter] }));
  }, [browseEntries]);

  const browseLetters = useMemo(() => browseSections.map(s => s.title), [browseSections]);

  const handleAlphaSelect = useCallback((letter: string) => {
    const idx = browseSections.findIndex(s => s.title === letter);
    if (idx < 0 || !sectionListRef.current) return;
    sectionListRef.current.scrollToLocation({
      sectionIndex: idx,
      itemIndex: 0,
      animated: false,
      viewPosition: 0,
    });
  }, [browseSections]);

  return (
    <GestureDetector gesture={swipeLeft}>
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── App bar ── */}
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
            onBlur={() => { if (!query.trim()) setTimeout(closeSearch, 120); }}
          />
          <TouchableOpacity onPress={closeSearch}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.searchPill} onPress={openSearch} activeOpacity={0.7}>
          <IconSearch />
          <Text style={styles.searchPillText}>Search pages…</Text>
        </TouchableOpacity>
      )}

      {/* ── Search results ── */}
      {isSearchActive ? (
        <FlatList
          data={results}
          keyExtractor={i => i.slug}
          renderItem={({ item }) => <PageRow item={item} onPress={open} isBookmarked={bookmarkSlugs.has(item.slug)} onIconPress={i => handleIconPress(i, bookmarkSlugs.has(i.slug))} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query.trim().length === 0 ? null
              : searching ? <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
              : results.length === 0 ? <Text style={styles.empty}>No results for "{query}"</Text>
              : null
          }
        />
      ) : (
        <>
          {/* ── Inline tabs ── */}
          <View style={styles.tabRow}>
            <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('reading')} activeOpacity={0.7}>
              <Text style={[styles.tabLabel, activeTab === 'reading' && styles.tabLabelActive]}>Reading</Text>
              {activeTab === 'reading' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('notes')} activeOpacity={0.7}>
              <Text style={[styles.tabLabel, activeTab === 'notes' && styles.tabLabelActive]}>Notes</Text>
              {activeTab === 'notes' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('browse')} activeOpacity={0.7}>
              <Text style={[styles.tabLabel, activeTab === 'browse' && styles.tabLabelActive]}>Browse</Text>
              {activeTab === 'browse' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          </View>

          {/* ── Reading tab ── */}
          {activeTab === 'reading' && (
            <FlatList
              data={recentHistory}
              keyExtractor={i => i.slug}
              renderItem={({ item }) => <PageRow item={item} onPress={open} isBookmarked={bookmarkSlugs.has(item.slug)} onIconPress={i => handleIconPress(i, bookmarkSlugs.has(i.slug))} />}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              ListHeaderComponent={
                <>
                  {bookmarks.length > 0 && (
                    <>
                      <Text style={styles.secLabel}>Bookmarks</Text>
                      {bookmarks.map(item => <PageRow key={item.slug} item={item} onPress={open} isBookmarked onIconPress={i => handleIconPress(i, true)} />)}
                    </>
                  )}
                  {recentHistory.length > 0 && bookmarks.length > 0 && <Text style={styles.secLabel}>Recent</Text>}
                  {recentHistory.length === 0 && bookmarks.length === 0 && (
                    <Text style={styles.hint}>Search any topic in philosophy.{'\n'}Articles cache for offline reading.</Text>
                  )}
                </>
              }
            />
          )}

          {/* ── Notes tab ── */}
          {activeTab === 'notes' && (
            <FlatList
              data={grouped}
              keyExtractor={g => g.slug}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              ListEmptyComponent={
                <Text style={styles.hint}>No notes yet.{'\n'}Highlight text in any article to add one.</Text>
              }
              renderItem={({ item: group }) => (
                <TouchableOpacity
                  style={styles.noteGroup}
                  onPress={() => open(group.slug, group.title ?? group.slug)}
                  activeOpacity={0.6}
                >
                  <View style={styles.noteGroupHeader}>
                    <Text style={styles.noteGroupTitle} numberOfLines={1}>
                      {group.title ?? group.slug}
                    </Text>
                    <Text style={styles.noteGroupCount}>
                      {group.items.length} note{group.items.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {group.items.slice(0, 2).map(ann => (
                    <View key={ann.id} style={[styles.noteChip, { borderLeftColor: ann.color }]}>
                      <Text style={styles.noteChipText} numberOfLines={2}>{ann.selected_text}</Text>
                      {ann.note ? <Text style={styles.noteChipNote} numberOfLines={1}>{ann.note}</Text> : null}
                    </View>
                  ))}
                  {group.items.length > 2 && (
                    <Text style={styles.noteMore}>+{group.items.length - 2} more</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          {/* ── Browse tab ── */}
          {activeTab === 'browse' && (
            <View style={styles.browseContainer}>
              {!browseLoaded ? (
                <ActivityIndicator color={C.accent} style={{ marginTop: 64 }} />
              ) : (
                <>
                  <SectionList<BrowseSectionItem>
                    ref={sectionListRef}
                    sections={browseSections}
                    keyExtractor={item => item.kind === 'parent' ? `parent-${item.label}` : item.slug}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingLeft: 32 }}
                    stickySectionHeadersEnabled
                    onScrollToIndexFailed={() => {}}
                    renderSectionHeader={({ section }) => (
                      <View style={styles.browseHeader}>
                        <Text style={styles.browseHeaderText}>{section.title}</Text>
                      </View>
                    )}
                    renderItem={({ item }) => {
                      if (item.kind === 'parent') {
                        const isExpanded = expandedParents.has(item.label);
                        return (
                          <View>
                            <View style={styles.browseRow}>
                              <TouchableOpacity
                                style={{ flex: 1 }}
                                onPress={() => item.slug ? open(item.slug, item.label) : toggleParent(item.label)}
                                activeOpacity={0.5}
                              >
                                <Text style={styles.browseRowText} numberOfLines={1}>{item.label}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                onPress={() => toggleParent(item.label)}
                              >
                                <View style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}>
                                  <IconChevron size={13} />
                                </View>
                              </TouchableOpacity>
                            </View>
                            {isExpanded && item.children.map(child => (
                              <TouchableOpacity
                                key={child.slug}
                                style={styles.browseSubRow}
                                onPress={() => open(child.slug, `${item.label}: ${child.subTitle}`)}
                                activeOpacity={0.5}
                              >
                                <Text style={styles.browseSubRowText} numberOfLines={1}>{child.subTitle}</Text>
                                <IconChevron size={11} />
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          style={styles.browseRow}
                          onPress={() => open(item.slug, item.title)}
                          activeOpacity={0.5}
                        >
                          <Text style={styles.browseRowText} numberOfLines={1}>{item.title}</Text>
                          <IconChevron size={13} />
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <AlphabetScrubber letters={browseLetters} onSelect={handleAlphaSelect} />
                </>
              )}
            </View>
          )}
        </>
      )}
    </View>
    </GestureDetector>
  );
}

// ── Page row ───────────────────────────────────────────────────────────────

function PageRow({
  item, onPress, isBookmarked = false, onIconPress,
}: {
  item: EntrySummary;
  onPress: (slug: string, title: string) => void;
  isBookmarked?: boolean;
  onIconPress?: (item: EntrySummary) => void;
}) {
  const pct = Math.round((item.read_progress ?? 0) * 100);
  const annCount = item.annotation_count ?? 0;

  const metaParts: string[] = [];
  if (pct > 0) metaParts.push(`${pct}% read`);
  if (annCount > 0) metaParts.push(`${annCount} note${annCount === 1 ? '' : 's'}`);
  if (metaParts.length === 0 && item.author) metaParts.push(item.author);
  const meta = metaParts.join(' · ');

  return (
    <TouchableOpacity style={styles.pageRow} onPress={() => onPress(item.slug, item.title)} activeOpacity={0.5}>
      <TouchableOpacity
        style={[styles.pageRowIcon, isBookmarked && styles.pageRowIconBookmarked]}
        onPress={() => onIconPress?.(item)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        activeOpacity={0.6}
      >
        <IconDoc color={isBookmarked ? C.accent : C.textHint} />
      </TouchableOpacity>
      <View style={styles.pageRowBody}>
        {item.parent_label ? (
          <View style={styles.parentTag}><Text style={styles.parentTagText}>{item.parent_label}</Text></View>
        ) : null}
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

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

  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 4,
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

  // Inline tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    marginBottom: 0,
  },
  tabBtn: {
    marginRight: 24,
    paddingBottom: 10,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textHint,
  },
  tabLabelActive: {
    color: C.text,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0, right: 0,
    height: 2,
    backgroundColor: C.accent,
    borderRadius: 1,
  },

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
  pageRowIconBookmarked: {
    backgroundColor: C.accentDim,
  },
  pageRowBody: { flex: 1, minWidth: 0 },
  parentTag: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentDim,
    borderColor: C.accentBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 4,
  },
  parentTagText: { fontSize: 10, fontWeight: '500', color: C.accent, letterSpacing: 0.3 },
  pageRowTitle: { fontSize: 14, fontWeight: '500', color: C.text, lineHeight: 18 },
  pageRowMeta: { fontSize: 12, color: C.textHint, marginTop: 2 },
  pageRowExcerpt: { fontSize: 12, color: C.textHint, marginTop: 3, lineHeight: 17 },
  pageRowChev: { alignSelf: 'center' },

  progressTrack: {
    width: '100%', height: 2,
    backgroundColor: '#2a2a2a',
    borderRadius: 1, marginTop: 7,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 1, opacity: 0.6,
  },

  // Notes tab
  noteGroup: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  noteGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteGroupTitle: {
    flex: 1,
    fontSize: 14, fontWeight: '600',
    color: C.text,
  },
  noteGroupCount: {
    fontSize: 11, color: C.textHint,
    marginLeft: 8,
  },
  noteChip: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 6,
  },
  noteChipText: {
    fontSize: 13, color: '#9a9a9a',
    lineHeight: 18,
  },
  noteChipNote: {
    fontSize: 12, color: C.textHint,
    marginTop: 2, fontStyle: 'italic',
  },
  noteMore: {
    fontSize: 12, color: C.textHint,
    marginTop: 2,
  },

  // Browse tab
  browseContainer: {
    flex: 1,
    position: 'relative',
  },
  browseHeader: {
    backgroundColor: C.bg,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  browseHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.accent,
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  browseRowText: {
    flex: 1,
    fontSize: 14,
    color: C.text,
  },
  browseSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 28,
    paddingRight: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  browseSubRowText: {
    flex: 1,
    fontSize: 13,
    color: C.textHint,
  },

  // Alphabet scrubber
  scrubber: {
    position: 'absolute',
    left: 0,
    top: 0, bottom: 0,
    width: 18,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  scrubberExpanded: {
    width: 26,
    backgroundColor: 'rgba(28,28,28,0.92)',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  scrubberLetter: {
    fontSize: 9,
    fontWeight: '500',
    color: C.textHint,
    lineHeight: 11,
  },
  scrubberLetterActive: {
    color: C.accent,
    fontWeight: '700',
    fontSize: 10,
  },
  scrubberBubble: {
    position: 'absolute',
    left: 30,
    top: '50%',
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -24 }],
    elevation: 8,
  },
  scrubberBubbleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },

  hint: { color: C.textHint, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 80, paddingHorizontal: 32 },
  empty: { color: C.textHint, fontSize: 14, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },
});
