import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Share, Linking, Pressable,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import WebView from 'react-native-webview';
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  getEntry, recordRead, toggleBookmark, isBookmarked,
  saveAnnotation, updateAnnotation, deleteAnnotation, getAnnotationsForSlug,
  getMeta, setReadProgress, getLinksTo, indexLinks,
} from '../services/db';
import { fetchAndCacheArticle } from '../services/catalog';
import { buildArticleHtml } from '../utils/articleTemplate';
import { parseSepHtml } from '../utils/sepHtml/parse';
import { SepArticle } from '../utils/sepHtml/render/SepArticle';
import AnnotationModal from '../components/AnnotationModal';
import TocSheet from '../components/TocSheet';
import OrphanedAnnotationsBanner from '../components/OrphanedAnnotationsBanner';
import type { EntryRow, Annotation } from '../types';
import { contentHash } from '../services/db';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Article'>;
type Route = RouteProp<RootStackParamList, 'Article'>;

type LoadState =
  | { phase: 'loading' }
  | { phase: 'fetching' }
  | { phase: 'ready'; html: string; entry: EntryRow }
  | { phase: 'error'; message: string };

interface PendingAnnotation {
  selected_text: string;
  context: string | null;
  color: string;
}

const SEP_BASE = 'https://plato.stanford.edu';

// Flag-gated native renderer (off by default — WebView remains the default
// reading surface). When on, the article body renders via the custom native
// parser/renderer instead of the WebView. Math resolves to null here (TeX-text
// fallback) until the build-time math store is wired through the content DB.
const USE_NATIVE_RENDERER = false;

// ── Icon helpers ───────────────────────────────────────────────────────────

function IBtn({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={styles.iBtn} onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      {children}
    </TouchableOpacity>
  );
}

function IconBack({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 5l-7 7 7 7" />
    </Svg>
  );
}

function IconSearch({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" />
      <Path d="m21 21-4.35-4.35" />
    </Svg>
  );
}

function IconDots({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill={color} stroke="none">
      <Circle cx="12" cy="5" r="1.5" />
      <Circle cx="12" cy="12" r="1.5" />
      <Circle cx="12" cy="19" r="1.5" />
    </Svg>
  );
}

function IconMessage({ color = '#5b8ef5' }: { color?: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function IconBookmark({ active = false }: { active?: boolean }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill={active ? '#e03030' : 'none'} stroke={active ? '#e03030' : '#9a9a9a'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function IconShare({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Path d="M16 6l-4-4-4 4" />
      <Path d="M12 2v13" />
    </Svg>
  );
}

function IconGraph({ color = '#9a9a9a' }: { color?: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="18" cy="5" r="3" />
      <Circle cx="6" cy="12" r="3" />
      <Circle cx="18" cy="19" r="3" />
      <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </Svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const screenX = useSharedValue(0);
  const animatedScreenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenX.value }],
  }));
  const nav = useNavigation<Nav>();
  const { slug, title, fromSlug = null } = useRoute<Route>().params;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [webReady, setWebReady] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [orphaned, setOrphaned] = useState<Annotation[]>([]);
  const [orphanDismissed, setOrphanDismissed] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [footnote, setFootnote] = useState<{ text: string } | null>(null);

  // Native-renderer AST (only parsed when the flag is on and content is ready).
  // Key only on content_html — not the whole state object — so unrelated state
  // changes (scroll progress, annotations, footnote popups) don't re-parse.
  const readyContentHtml = state.phase === 'ready' ? state.entry.content_html : null;
  const nativeArticle = useMemo(
    () => (USE_NATIVE_RENDERER && state.phase === 'ready'
      ? parseSepHtml(state.entry.content_html ?? '')
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.phase, readyContentHtml],
  );

  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const modalAnnotation =
    pendingAnnotation
      ? { selected_text: pendingAnnotation.selected_text, context: pendingAnnotation.context, color: pendingAnnotation.color }
      : editingAnnotation ?? null;

  const webRef = useRef<any>(null);
  // Always-current snapshot of annotations for use in callbacks that can't
  // take a dep on annotations without causing stale-closure bugs (handleLoadEnd).
  const annotationsRef = useRef<Annotation[]>([]);
  annotationsRef.current = annotations;

  useEffect(() => {
    isBookmarked(slug).then(setBookmarked);
    load();
  }, [slug]);

  async function load(forceRefetch = false) {
    setState({ phase: 'loading' });
    setWebReady(false);

    let entry = forceRefetch ? null : await getEntry(slug);

    if (!entry?.content_html || forceRefetch) {
      setState({ phase: 'fetching' });
      const ok = await fetchAndCacheArticle(slug);
      if (!ok) {
        setState({ phase: 'error', message: 'Could not load this article. Check your connection.' });
        return;
      }
      entry = await getEntry(slug);
    }

    if (!entry?.content_html) {
      setState({ phase: 'error', message: 'Article content unavailable.' });
      return;
    }

    const anns = await getAnnotationsForSlug(slug);
    const currentHash = contentHash(entry.content_html ?? '');
    const valid = anns.filter(a => !a.content_hash || a.content_hash === currentHash || (entry!.content_html ?? '').includes(a.selected_text));
    const stale = anns.filter(a => a.content_hash && a.content_hash !== currentHash && !(entry!.content_html ?? '').includes(a.selected_text));
    setAnnotations(valid);
    setOrphaned(stale);
    setOrphanDismissed(false);

    await recordRead(slug, entry.title, fromSlug);
    // indexLinks is fire-and-forget — don't block article render
    indexLinks(slug, entry.content_html ?? '').catch(() => {});
    const [customCss, fontSizeStr, backlinks] = await Promise.all([
      getMeta('custom_css'),
      getMeta('font_size'),
      getLinksTo(slug),
    ]);
    const fontSize = fontSizeStr ? parseInt(fontSizeStr, 10) : undefined;

    setState({
      phase: 'ready',
      entry,
      html: buildArticleHtml({
        slug: entry.slug,
        title: entry.title,
        parentLabel: entry.parent_label,
        tocHtml: entry.toc_html ?? '',
        contentHtml: entry.content_html,
        preambleHtml: entry.preamble_html ?? '',
        customCss: customCss ?? undefined,
        fontSize,
        backlinkCount: backlinks.length,
      }),
    });
  }

  const handleLoadEnd = useCallback(() => {
    setWebReady(true);
    if (annotationsRef.current.length > 0) injectAnnotations(annotationsRef.current);
  }, []);

  function injectAnnotations(anns: Annotation[]) {
    webRef.current?.injectJavaScript(
      `window.applyAnnotations(${JSON.stringify(anns)}); true;`
    );
  }

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'progress') {
        if (typeof msg.value === 'number') setReadProgress(slug, msg.value).catch(() => {});
      } else if (msg.type === 'backlinks') {
        nav.navigate('Graph', { centerSlug: slug, centerTitle: title });
      } else if (msg.type === 'highlight') {
        handleSaveAnnotation(msg.text, msg.context, msg.color, null);
      } else if (msg.type === 'annotate') {
        setPendingAnnotation({ selected_text: msg.text, context: msg.context, color: msg.color });
      } else if (msg.type === 'tap_annotation') {
        const ann = annotations.find(a => a.id === msg.id);
        if (ann) setEditingAnnotation(ann);
      } else if (msg.type === 'footnote') {
        if (msg.text) setFootnote({ text: msg.text });
      }
    } catch {}
  }, [annotations, slug, title, nav]);

  async function handleSaveAnnotation(
    text: string, context: string | null, color: string, note: string | null
  ) {
    const currentHash = state.phase === 'ready' ? contentHash(state.entry.content_html ?? '') : null;
    const ann = await saveAnnotation(slug, text, context, color, note, currentHash);
    const updated = [...annotations, ann];
    setAnnotations(updated);
    injectAnnotations([ann]);
    setPendingAnnotation(null);
  }

  async function handleModalSave(note: string | null, color: string) {
    if (editingAnnotation) {
      await updateAnnotation(editingAnnotation.id, note, color);
      const updated = annotations.map(a =>
        a.id === editingAnnotation.id ? { ...a, note, color, updated_at: Date.now() } : a
      );
      setAnnotations(updated);
      webRef.current?.injectJavaScript(
        `window.removeAnnotation(${editingAnnotation.id}); window.applyAnnotations([${JSON.stringify({ ...editingAnnotation, note, color })}]); true;`
      );
      setEditingAnnotation(null);
    } else if (pendingAnnotation) {
      await handleSaveAnnotation(pendingAnnotation.selected_text, pendingAnnotation.context, color, note);
    }
  }

  async function handleModalDelete() {
    if (!editingAnnotation) return;
    await deleteAnnotation(editingAnnotation.id);
    const updated = annotations.filter(a => a.id !== editingAnnotation.id);
    setAnnotations(updated);
    webRef.current?.injectJavaScript(`window.removeAnnotation(${editingAnnotation.id}); true;`);
    setEditingAnnotation(null);
  }

  const handleNav = useCallback((req: WebViewNavigation): boolean => {
    const url = req.url;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;

    const sepEntry = url.match(/plato\.stanford\.edu\/entries\/([a-z0-9-]+)\//);
    if (sepEntry) {
      const target = sepEntry[1];
      if (target !== slug) {
        nav.push('Article', { slug: target, title: target, fromSlug: slug });
        return false;
      }
      // Same article (possibly with an #anchor) — let the WebView handle it.
      return true;
    }

    // Relative anchor navigation stays within the WebView.
    if (url.includes('#') && !url.startsWith('http')) return true;

    if (url.startsWith('http')) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return false;
  }, [slug, nav]);

  const handleShare = async () => {
    const articleTitle = state.phase === 'ready' ? state.entry.title : title;
    await Share.share({
      title: articleTitle,
      url: `${SEP_BASE}/entries/${slug}/`,
      message: `${articleTitle} — ${SEP_BASE}/entries/${slug}/`,
    });
  };

  const handleBookmark = async () => {
    const articleTitle = state.phase === 'ready' ? state.entry.title : title;
    setBookmarked(await toggleBookmark(slug, articleTitle));
  };

  const handleTocJump = (href: string) => {
    webRef.current?.injectJavaScript(
      `(function(){var el=document.getElementById(${JSON.stringify(href)});if(el)el.scrollIntoView({behavior:'smooth'});})();true;`
    );
  };

  const displayTitle = state.phase === 'ready' ? state.entry.title : title;

  const openGraph = () =>
    nav.navigate('Graph', { centerSlug: slug, centerTitle: displayTitle });

  const navBack = useCallback(() => nav.goBack(), [nav]);
  const navBackTop = useCallback(() => nav.popToTop(), [nav]);

  // ── Gestures (non-overlapping zones so the WebView keeps its own scroll) ──

  // Swipe RIGHT anywhere in the reading area → home. Cancels if the drag is
  // vertical-first (failOffsetY), so normal article scrolling is untouched.
  const swipeHome = Gesture.Pan()
    .activeOffsetX([-9999, 30])
    .failOffsetY([-22, 22])
    .onUpdate(e => {
      'worklet';
      if (e.translationX > 0) screenX.value = e.translationX;
    })
    .onEnd(e => {
      'worklet';
      if (e.translationX > 80 && e.velocityX > 150) {
        // Reset immediately and let React Navigation drive the back transition.
        // Springing to 500 first leaves a blank #111 frame because the native
        // stack detaches the previous screen — nothing is rendered behind us.
        screenX.value = withSpring(0, { damping: 30, stiffness: 400 });
        runOnJS(navBack)();
      } else {
        screenX.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  // Swipe DOWN on the header → graph view (mockup: "swipe down from top").
  const swipeGraph = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(18)
    .onEnd(e => {
      if (e.translationY > 50) openGraph();
    });

  // Bottom handle: tap OR swipe up → TOC sheet.
  const tocTap = Gesture.Tap().runOnJS(true).onEnd(() => setShowToc(true));
  const tocSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(-12)
    .onEnd(e => {
      if (e.translationY < -25) setShowToc(true);
    });
  const tocGesture = Gesture.Exclusive(tocSwipe, tocTap);

  return (
    <Animated.View style={[styles.root, animatedScreenStyle]}>
      {/* ── App bar (swipe down → graph) ── */}
      <GestureDetector gesture={swipeGraph}>
      <View style={[styles.appBar, { paddingTop: insets.top }]}>
        <IBtn onPress={() => nav.goBack()}>
          <IconBack />
        </IBtn>
        <View style={{ flex: 1 }} />
        <IBtn onPress={() => { nav.popToTop(); }}>
          <IconSearch />
        </IBtn>
        <IBtn onPress={() => setShowOverflow(v => !v)}>
          <IconDots />
        </IBtn>
      </View>
      </GestureDetector>

      {/* ── Overflow menu ── */}
      {showOverflow && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOverflow(false)} />
          <View style={[styles.overflow, { top: insets.top + 52 }]}>
            <TouchableOpacity style={styles.overflowItem} onPress={() => { handleBookmark(); setShowOverflow(false); }}>
              <IconBookmark active={bookmarked} />
              <Text style={styles.overflowLabel}>{bookmarked ? 'Bookmarked' : 'Bookmark'}</Text>
            </TouchableOpacity>
            <View style={styles.overflowSep} />
            <TouchableOpacity style={styles.overflowItem} onPress={() => { handleShare(); setShowOverflow(false); }}>
              <IconShare />
              <Text style={styles.overflowLabel}>Share</Text>
            </TouchableOpacity>
            <View style={styles.overflowSep} />
            <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflow(false); nav.navigate('Graph', { centerSlug: slug, centerTitle: displayTitle }); }}>
              <IconGraph />
              <Text style={styles.overflowLabel}>View graph</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Loading states ── */}
      {(state.phase === 'loading' || state.phase === 'fetching') && (
        <View style={styles.center}>
          <ActivityIndicator color="#5b8ef5" size="large" />
          {state.phase === 'fetching' && (
            <Text style={styles.fetchingLabel}>Loading article…</Text>
          )}
        </View>
      )}
      {state.phase === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{state.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.phase === 'ready' && (
        <>
          {/* ── Orphan banner ── */}
          {orphaned.length > 0 && !orphanDismissed && (
            <OrphanedAnnotationsBanner
              annotations={orphaned}
              currentContent={state.entry.content_html ?? ''}
              currentHash={contentHash(state.entry.content_html ?? '')}
              onResolved={(ids) => {
                setOrphaned(prev => prev.filter(a => !ids.includes(a.id)));
                getAnnotationsForSlug(slug).then(all => {
                  const hash = contentHash(state.entry.content_html ?? '');
                  const valid = all.filter(a => (state.entry.content_html ?? '').includes(a.selected_text));
                  setAnnotations(valid);
                  injectAnnotations(valid);
                });
              }}
              onDismiss={() => setOrphanDismissed(true)}
            />
          )}

          {/* ── WebView (swipe right → home) ── */}
          <GestureDetector gesture={swipeHome}>
          <View style={styles.webWrap}>
            {!webReady && !USE_NATIVE_RENDERER && (
              <View style={styles.webOverlay}>
                <ActivityIndicator color="#5b8ef5" />
              </View>
            )}
            {USE_NATIVE_RENDERER && nativeArticle ? (
              <SepArticle
                article={nativeArticle}
                resolveMath={() => null}
                onLinkPress={(href) => {
                  const m = href.match(/\/entries\/([a-z0-9-]+)\/?/);
                  if (m && m[1] !== slug) nav.push('Article', { slug: m[1], title: m[1], fromSlug: slug });
                }}
                onFootnotePress={() => { /* footnote text wiring lands with the AST footnote map */ }}
                onProgress={(v) => setReadProgress(slug, v).catch(() => {})}
              />
            ) : (
            <WebView
              ref={webRef}
              source={{ html: state.html, baseUrl: SEP_BASE }}
              style={styles.web}
              originWhitelist={['*']}
              onShouldStartLoadWithRequest={handleNav}
              onLoadEnd={handleLoadEnd}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled
              showsVerticalScrollIndicator={false}
              scalesPageToFit={false}
              textZoom={100}
              androidLayerType="hardware"
            />
            )}
            {/* Swipe-up / tap TOC handle — positioned above system nav bar */}
            <GestureDetector gesture={tocGesture}>
              <View style={[styles.tocHandle, { bottom: insets.bottom }]}>
                <View style={styles.tocHandlePill} />
              </View>
            </GestureDetector>
          </View>
          </GestureDetector>

          {/* ── TOC Sheet ── */}
          {showToc && (
            <TocSheet
              tocHtml={state.entry.toc_html}
              annotations={annotations}
              onClose={() => setShowToc(false)}
              onTocJump={handleTocJump}
              onAnnotationTap={(ann) => setEditingAnnotation(ann)}
            />
          )}
        </>
      )}

      {/* ── Footnote popup ── */}
      {footnote && (
        <Pressable style={styles.fnScrim} onPress={() => setFootnote(null)}>
          <View style={[styles.fnSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.fnHandle} />
            <Text style={styles.fnLabel}>NOTE</Text>
            <Text style={styles.fnText}>{footnote.text}</Text>
          </View>
        </Pressable>
      )}

      <AnnotationModal
        annotation={modalAnnotation}
        onSave={handleModalSave}
        onDelete={editingAnnotation ? handleModalDelete : undefined}
        onClose={() => {
          setPendingAnnotation(null);
          setEditingAnnotation(null);
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  iBtn: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 21,
  },

  overflow: {
    position: 'absolute',
    right: 8,
    backgroundColor: '#252525',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    zIndex: 100,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  overflowLabel: { fontSize: 14, color: '#d0d0d0' },
  overflowSep: { height: StyleSheet.hairlineWidth, backgroundColor: '#2e2e2e', marginHorizontal: 12 },

  articleHeader: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  articleCategory: {
    fontSize: 11, fontWeight: '600',
    letterSpacing: 0.08 * 11,
    textTransform: 'uppercase',
    color: '#5b8ef5',
    marginBottom: 8,
  },
  articleTitle: {
    fontSize: 26, fontWeight: '700',
    lineHeight: 31, letterSpacing: -0.02 * 26,
    color: '#e4e4e4',
    marginBottom: 12,
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  articleMetaText: { fontSize: 12, color: '#555' },
  articleMetaDot: { fontSize: 12, color: '#333' },
  annChip: {
    marginLeft: 'auto' as any,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(91,142,245,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(91,142,245,0.35)',
  },
  annChipText: { fontSize: 11, fontWeight: '500', color: '#5b8ef5' },

  webWrap: { flex: 1, position: 'relative' },
  edgeAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    backgroundColor: 'rgba(91,142,245,0.25)',
    zIndex: 5,
  } as any,
  web: { flex: 1, backgroundColor: '#111' },
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },

  tocHandle: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    zIndex: 6,
  },
  tocHandlePill: {
    width: 40, height: 4,
    backgroundColor: '#555',
    borderRadius: 2,
  },

  fnScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  fnSheet: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '55%',
  },
  fnHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: '#2e2e2e',
    alignSelf: 'center',
    marginBottom: 14,
  },
  fnLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: '#555',
    marginBottom: 8,
  },
  fnText: {
    fontSize: 14,
    color: '#c0c0c0',
    lineHeight: 22,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  fetchingLabel: { color: '#555', fontSize: 14 },
  errorText: { color: '#888', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  retryLabel: { color: '#5b8ef5', fontSize: 15 },
});
