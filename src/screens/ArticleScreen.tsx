import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Share, Linking,
} from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  getEntry, recordRead, toggleBookmark, isBookmarked,
  saveAnnotation, updateAnnotation, deleteAnnotation, getAnnotationsForSlug,
  getMeta,
} from '../services/db';
import { fetchAndCacheArticle } from '../services/catalog';
import { buildArticleHtml } from '../utils/articleTemplate';
import BookmarkIcon from '../components/BookmarkIcon';
import AnnotationModal from '../components/AnnotationModal';
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

// Pending annotation before it's saved (from WebView selection)
interface PendingAnnotation {
  selected_text: string;
  context: string | null;
  color: string;
}

const SEP_BASE = 'https://plato.stanford.edu';

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

  // Annotation modal state
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const modalAnnotation =
    pendingAnnotation
      ? { selected_text: pendingAnnotation.selected_text, context: pendingAnnotation.context, color: pendingAnnotation.color }
      : editingAnnotation ?? null;

  const webRef = useRef<any>(null);

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
    const [customCss, fontSizeStr] = await Promise.all([
      getMeta('custom_css'),
      getMeta('font_size'),
    ]);
    const fontSize = fontSizeStr ? parseInt(fontSizeStr, 10) : undefined;

    setState({
      phase: 'ready',
      entry,
      html: buildArticleHtml({
        slug: entry.slug,
        title: entry.title,
        tocHtml: entry.toc_html ?? '',
        contentHtml: entry.content_html,
        preambleHtml: entry.preamble_html ?? '',
        customCss: customCss ?? undefined,
        fontSize,
      }),
    });
  }

  // After WebView loads, inject existing annotations
  const handleLoadEnd = useCallback(() => {
    setWebReady(true);
    if (annotations.length > 0) {
      injectAnnotations(annotations);
    }
  }, [annotations]);

  function injectAnnotations(anns: Annotation[]) {
    webRef.current?.injectJavaScript(
      `window.applyAnnotations(${JSON.stringify(anns)}); true;`
    );
  }

  // ── WebView message handler ───────────────────────────────────────────────

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'highlight') {
        // Save immediately with no note, apply highlight visually
        handleSaveAnnotation(msg.text, msg.context, msg.color, null);
      } else if (msg.type === 'annotate') {
        // Open modal for user to add a note
        setPendingAnnotation({ selected_text: msg.text, context: msg.context, color: msg.color });
      } else if (msg.type === 'tap_annotation') {
        const ann = annotations.find(a => a.id === msg.id);
        if (ann) setEditingAnnotation(ann);
      }
    } catch {}
  }, [annotations]);

  async function handleSaveAnnotation(
    text: string, context: string | null, color: string, note: string | null
  ) {
    const currentHash = state.phase === 'ready' ? contentHash(state.entry.content_html ?? '') : null;
    const ann = await saveAnnotation(slug, text, context, color, note, currentHash);
    const updated = [...annotations, ann];
    setAnnotations(updated);
    // Apply only the new annotation to avoid re-running all
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
      // Remove and re-apply just this annotation with updated color
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
    webRef.current?.injectJavaScript(
      `window.removeAnnotation(${editingAnnotation.id}); true;`
    );
    setEditingAnnotation(null);
  }

  // ── Nav ───────────────────────────────────────────────────────────────────

  const handleNav = useCallback((req: WebViewNavigation): boolean => {
    const url = req.url;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;

    const sepEntry = url.match(/plato\.stanford\.edu\/entries\/([a-z0-9-]+)\//);
    if (sepEntry) {
      const target = sepEntry[1];
      if (target !== slug) nav.push('Article', { slug: target, title: target, fromSlug: slug });
      return false;
    }

    if (url.includes('#') && !url.startsWith('http')) return true;

    if (url.startsWith('http')) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return false;
  }, [slug, nav]);

  // ── Header actions ────────────────────────────────────────────────────────

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

  const displayTitle = state.phase === 'ready' ? state.entry.title : title;
  const annCount = annotations.length;

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

        <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>

        <View style={styles.actions}>
          {annCount > 0 && (
            <TouchableOpacity
              onPress={() => nav.navigate('Annotations')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.annBadge}>
                <Text style={styles.annBadgeText}>{annCount}</Text>
              </View>
            </TouchableOpacity>
          )}
          {state.phase === 'ready' && !!state.entry.toc_html && webReady && (
            <TouchableOpacity
              onPress={() => webRef.current?.injectJavaScript('window.openToc && window.openToc(); true;')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.actionIcon}>≡</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleBookmark} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <BookmarkIcon active={bookmarked} size={22} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionIcon}>⬆</Text>
          </TouchableOpacity>
        </View>
      </View>

      {state.phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color="#7ba4ff" size="large" />
        </View>
      )}
      {state.phase === 'fetching' && (
        <View style={styles.center}>
          <ActivityIndicator color="#7ba4ff" size="large" />
          <Text style={styles.fetchingLabel}>Loading article…</Text>
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
      {state.phase === 'ready' && orphaned.length > 0 && !orphanDismissed && (
        <OrphanedAnnotationsBanner
          annotations={orphaned}
          currentContent={state.entry.content_html ?? ''}
          currentHash={contentHash(state.entry.content_html ?? '')}
          onResolved={(ids) => {
            // Move resolved IDs from orphaned; re-anchored ones go back into annotations
            setOrphaned(prev => prev.filter(a => !ids.includes(a.id)));
            // Re-fetch to get updated selected_text for re-anchored ones
            getAnnotationsForSlug(slug).then(all => {
              const currentHash = contentHash(state.entry.content_html ?? '');
              setAnnotations(all.filter(a => (state.entry.content_html ?? '').includes(a.selected_text)));
              injectAnnotations(all.filter(a => (state.entry.content_html ?? '').includes(a.selected_text)));
            });
          }}
          onDismiss={() => setOrphanDismissed(true)}
        />
      )}

      {state.phase === 'ready' && (
        <View style={styles.webWrap}>
          {!webReady && (
            <View style={styles.webOverlay}>
              <ActivityIndicator color="#7ba4ff" />
            </View>
          )}
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
        </View>
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
  headerTitle: { flex: 1, color: '#e8e8e8', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', minWidth: 80, justifyContent: 'flex-end', paddingHorizontal: 8, gap: 14 },
  actionIcon: { color: '#555', fontSize: 18 },
  actionDisabled: { opacity: 0.3 },
  annBadge: { backgroundColor: '#7ba4ff22', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  annBadgeText: { color: '#7ba4ff', fontSize: 11, fontWeight: '600' },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: '#121212' },
  webOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  fetchingLabel: { color: '#555', fontSize: 14 },
  errorText: { color: '#888', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  retryLabel: { color: '#7ba4ff', fontSize: 15 },
});
