import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Share, Linking, Pressable,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import WebView from 'react-native-webview';
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  getEntry, recordRead, toggleBookmark, isBookmarked,
  saveAnnotation, updateAnnotation, deleteAnnotation, getAnnotationsForSlug,
  getMeta, setReadProgress, getLinksTo, indexLinks, getRecentSlugs, getMathSvgMap,
} from '../services/db';
import { fetchAndCacheArticle } from '../services/catalog';
import { primeBackfillForSlugs } from '../services/inpho';
import { buildArticleHtml } from '../utils/articleTemplate';
import { parseSepHtml } from '../utils/sepHtml/parse';
import { SepArticle, type SepArticleHandle } from '../utils/sepHtml/render/SepArticle';
import { ArticleHeader } from '../utils/sepHtml/render/ArticleHeader';
import { InlineContent } from '../utils/sepHtml/render/Inline';
import type { Inline, Block } from '../utils/sepHtml/types';
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

// Renders an unsupported block (nested table, animated SVG) in a sandboxed
// WebView that sizes itself to content. Used as the renderFallback for SepArticle.
function FallbackBlock({ html, baseUrl }: { html: string; baseUrl: string }) {
  const [height, setHeight] = useState(120);
  const doc = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:8px;background:#1a1a1a;color:#d0d0d0;font-family:-apple-system,sans-serif;font-size:14px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px 8px}</style></head><body>${html}<script>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));<\/script></body></html>`;
  return (
    <WebView
      source={{ html: doc, baseUrl }}
      style={{ height, marginVertical: 12 }}
      scrollEnabled={false}
      onMessage={(e) => {
        const h = parseInt(e.nativeEvent.data, 10);
        if (h > 0) setHeight(h + 16);
      }}
      javaScriptEnabled
    />
  );
}

const USE_NATIVE_RENDERER = true;

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
  const [footnote, setFootnote] = useState<{ inlines: Inline[] } | null>(null);
  const [backlinkCount, setBacklinkCount] = useState(0);

  // Native-renderer AST — deferred past the navigation animation. SVGs are
  // already baked into content_html at fetch time, so parse is pure and fast.
  const [nativeArticle, setNativeArticle] = useState<ReturnType<typeof parseSepHtml> | null>(null);
  const [mathSvgs, setMathSvgs] = useState<Record<string, string>>({});
  // After the AST is ready, load math SVGs from the DB in one batch query.
  // mathref nodes show invisible placeholders until this resolves (~1 DB query).
  useEffect(() => {
    if (!nativeArticle) { setMathSvgs({}); return; }
    const hashes: string[] = [];
    function collectInlineHashes(inlines: Inline[]) {
      for (const n of inlines) {
        if (n.t === 'mathref') hashes.push(n.hash);
        else if ('children' in n && Array.isArray(n.children)) collectInlineHashes(n.children as Inline[]);
      }
    }
    function collectBlockHashes(blocks: Block[]) {
      for (const block of blocks) {
        if (block.t === 'para' || block.t === 'heading') {
          collectInlineHashes(block.children);
        } else if (block.t === 'blockquote') {
          collectBlockHashes(block.children);
        } else if (block.t === 'list') {
          block.items.forEach(item => collectBlockHashes(item));
        } else if (block.t === 'deflist') {
          block.rows.forEach(row => {
            collectInlineHashes(row.term);
            collectBlockHashes(row.def);
          });
        } else if (block.t === 'table') {
          if (block.caption) collectInlineHashes(block.caption);
          block.rows.forEach(row => row.cells.forEach(cell => collectInlineHashes(cell)));
        }
      }
    }
    collectBlockHashes(nativeArticle.blocks);
    if (!hashes.length) return;
    getMathSvgMap(hashes).then(setMathSvgs).catch(() => {});
  }, [nativeArticle]);

  // Key on content strings (primitives) rather than the entry object so the
  // parse effect only re-fires when the AST or HTML actually changes, not on
  // every state object replacement.
  const astKey = state.phase === 'ready'
    ? (state.entry.content_ast ?? `html:${state.entry.slug}`)
    : null;
  const readyEntry = state.phase === 'ready' ? state.entry : null;
  useEffect(() => {
    if (!USE_NATIVE_RENDERER || !readyEntry) {
      setNativeArticle(null);
      return;
    }
    // Fast path: AST was pre-parsed at fetch time — just deserialize.
    if (readyEntry.content_ast) {
      try {
        setNativeArticle(JSON.parse(readyEntry.content_ast));
        return;
      } catch { }
    }
    // Slow path: AST not yet stored (article cached before this feature).
    // Yield once so the spinner paints before the parse blocks the JS thread.
    let cancelled = false;
    const html = readyEntry.content_html ?? '';
    setTimeout(() => {
      if (!cancelled) setNativeArticle(parseSepHtml(html));
    }, 0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astKey]);

  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const modalAnnotation =
    pendingAnnotation
      ? { selected_text: pendingAnnotation.selected_text, context: pendingAnnotation.context, color: pendingAnnotation.color }
      : editingAnnotation ?? null;

  const webRef = useRef<any>(null);
  const nativeArticleRef = useRef<SepArticleHandle>(null);
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
    setBacklinkCount(0);

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

    recordRead(slug, entry.title, fromSlug).catch(() => {});
    // Both fire-and-forget — don't block article render.
    indexLinks(slug, entry.content_html ?? '').catch(() => {});
    // Prime InPhO date backfill: active article first, then reading history,
    // so Timeline shows correct chronology without waiting for user to open it.
    getRecentSlugs(10).then(recent => {
      const rest = recent.map(r => r.slug).filter(s => s !== slug);
      primeBackfillForSlugs([slug, ...rest]);
    }).catch(() => {});
    const [customCss, fontSizeStr] = await Promise.all([
      getMeta('custom_css'),
      getMeta('font_size'),
    ]);
    const fontSize = fontSizeStr ? parseInt(fontSizeStr, 10) : undefined;

    // Show article immediately — don't wait for backlink count.
    setState({
      phase: 'ready',
      entry,
      html: USE_NATIVE_RENDERER ? '' : buildArticleHtml({
        slug: entry.slug,
        title: entry.title,
        parentLabel: entry.parent_label,
        tocHtml: entry.toc_html ?? '',
        contentHtml: entry.content_html,
        preambleHtml: entry.preamble_html ?? '',
        customCss: customCss ?? undefined,
        fontSize,
        backlinkCount: 0,
      }),
    });

    // Show backlink count after article is ready (non-blocking). The native
    // renderer reads backlinkCount to draw a "Related by link" footer row; the
    // WebView path injects the row into the document.
    getLinksTo(slug).then(backlinks => {
      setBacklinkCount(backlinks.length);
      if (!USE_NATIVE_RENDERER && backlinks.length > 0) {
        webRef.current?.injectJavaScript(
          `(function(){var r=document.querySelector('.backlinks-row');` +
          `if(r){r.querySelector('.backlinks-badge').textContent=${JSON.stringify(String(backlinks.length))};r.style.display='';}` +
          `else{var d=document.createElement('div');d.className='backlinks-row';` +
          `d.onclick=function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'backlinks'}));};` +
          `d.innerHTML='<span class="backlinks-label">Related by link</span><span class="backlinks-badge">${backlinks.length}</span>';` +
          `document.body.appendChild(d);}})();true;`
        );
      }
    }).catch(() => {});
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
        if (msg.text) setFootnote({ inlines: [{ t: 'text', v: msg.text }] });
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
    if (USE_NATIVE_RENDERER) {
      nativeArticleRef.current?.scrollToSection(href);
    } else {
      webRef.current?.injectJavaScript(
        `(function(){var el=document.getElementById(${JSON.stringify(href)});if(el)el.scrollIntoView({behavior:'smooth'});})();true;`
      );
    }
  };

  // Link handling for the native renderer. Mirrors the WebView's handleNav so
  // cross-article, in-page anchor, and external links behave the same regardless
  // of USE_NATIVE_RENDERER.
  const handleNativeLink = useCallback((href: string) => {
    if (!href) return;
    // In-page anchor (#section, bibliography back-ref) → scroll within the article.
    if (href.startsWith('#')) {
      nativeArticleRef.current?.scrollToSection(href.slice(1));
      return;
    }
    // Cross-article SEP link, absolute or relative (e.g. ../other-article/).
    const sepEntry = href.match(/(?:\/entries\/|^\.\.\/)([a-z0-9-]+)\//);
    if (sepEntry) {
      const target = sepEntry[1];
      if (target !== slug) nav.push('Article', { slug: target, title: target, fromSlug: slug });
      else nativeArticleRef.current?.scrollToSection(href.replace(/^[^#]*#?/, ''));
      return;
    }
    // Everything else external → open in the system browser.
    if (href.startsWith('http')) Linking.openURL(href).catch(() => {});
  }, [slug, nav]);

  const displayTitle = state.phase === 'ready' ? state.entry.title : title;

  const openGraph = () =>
    nav.navigate('Graph', { centerSlug: slug, centerTitle: displayTitle });

  const navBackTop = useCallback(() => nav.popToTop(), [nav]);

  // ── Gestures ──

  // Swipe DOWN on the header → graph view (mockup: "swipe down from top").
  const swipeGraph = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(18)
    .onEnd(e => {
      if (e.translationY > 50) openGraph();
    });

  // Bottom handle: tap (Pressable — instant) or swipe up (Pan gesture).
  const tocSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(-12)
    .onEnd(e => {
      if (e.translationY < -25) setShowToc(true);
    });

  // Swipe right from the left edge → go back. Android's native swipe-back is
  // unreliable here (3-button nav + predictive back broken on react-native-screens),
  // so we own it. hitSlop restricts activation to the first 20pt from the left
  // edge; failOffsetY gives vertical scroll priority if the finger drifts up/down
  // first; activeOffsetX([10, 9999]) only triggers on rightward movement.
  const edgeBack = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ left: 0, width: 20 })
    .activeOffsetX([10, 9999])
    .failOffsetY([-8, 8])
    .onEnd(e => {
      if (e.translationX > 80 || e.velocityX > 500) {
        nav.goBack();
      }
    });

  return (
    <GestureDetector gesture={edgeBack}>
    <View style={styles.root}>
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

          <View style={styles.webWrap}>
            {!webReady && !USE_NATIVE_RENDERER && (
              <View style={styles.webOverlay}>
                <ActivityIndicator color="#5b8ef5" />
              </View>
            )}
            {USE_NATIVE_RENDERER && !nativeArticle && (
              <View style={styles.webOverlay}>
                <ActivityIndicator color="#5b8ef5" />
              </View>
            )}
            {USE_NATIVE_RENDERER && nativeArticle ? (
              <SepArticle
                ref={nativeArticleRef}
                article={nativeArticle}
                mathSvgs={mathSvgs}
                header={
                  <ArticleHeader
                    title={displayTitle}
                    parentLabel={state.entry.parent_label}
                    preambleHtml={state.entry.preamble_html}
                    onLinkPress={handleNativeLink}
                  />
                }
                onLinkPress={handleNativeLink}
                onFootnotePress={(fnHref) => {
                  const id = fnHref.startsWith('#') ? fnHref.slice(1) : fnHref;
                  const inlines = nativeArticle.footnotes[id];
                  if (inlines && inlines.length) setFootnote({ inlines });
                }}
                onProgress={(v) => setReadProgress(slug, v).catch(() => {})}
                resolveImageSrc={(src) => {
                  if (src.startsWith('http')) return src;
                  if (src.startsWith('/')) return `${SEP_BASE}${src}`;
                  return `${SEP_BASE}/entries/${slug}/${src}`;
                }}
                annotations={annotations}
                onAnnotationPress={(ann) => setEditingAnnotation(ann)}
                onAnnotationCreate={(text) => {
                  setPendingAnnotation({ selected_text: text, context: null, color: '#fbbf24' });
                }}
                renderFallback={(html) => (
                  <FallbackBlock html={html} baseUrl={`${SEP_BASE}/entries/${slug}/`} />
                )}
                footer={backlinkCount > 0 ? (
                  <TouchableOpacity
                    style={styles.backlinksRow}
                    onPress={() => nav.navigate('Graph', { centerSlug: slug, centerTitle: displayTitle })}
                  >
                    <Text style={styles.backlinksLabel}>Related by link</Text>
                    <Text style={styles.backlinksBadge}>{backlinkCount}</Text>
                  </TouchableOpacity>
                ) : null}
              />
            ) : (
            <WebView
              ref={webRef}
              source={{ html: state.html, baseUrl: `${SEP_BASE}/entries/${slug}/` }}
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
            <GestureDetector gesture={tocSwipe}>
              <Pressable
                style={[styles.tocHandle, { bottom: insets.bottom }]}
                onPress={() => setShowToc(true)}
                hitSlop={{ top: 10, bottom: 10, left: 40, right: 40 }}
              >
                <View style={styles.tocHandlePill} />
              </Pressable>
            </GestureDetector>
          </View>

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
            <InlineContent inlines={footnote.inlines} handlers={{}} baseStyle={styles.fnText} />
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
    </View>
    </GestureDetector>
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

  backlinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: '#161616',
  },
  backlinksLabel: { color: '#5b8ef5', fontSize: 14, fontWeight: '600' },
  backlinksBadge: {
    color: '#9a9a9a',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 22,
    textAlign: 'center',
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: '#222',
    overflow: 'hidden',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  fetchingLabel: { color: '#555', fontSize: 14 },
  errorText: { color: '#888', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  retryLabel: { color: '#5b8ef5', fontSize: 15 },
});
