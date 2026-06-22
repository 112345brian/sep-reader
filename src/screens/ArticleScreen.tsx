import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getEntry, recordVisit } from '../services/db';
import { fetchAndCacheArticle } from '../services/catalog';
import { buildArticleHtml } from '../utils/articleTemplate';
import type { EntryRow } from '../types';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Article'>;
type Route = RouteProp<RootStackParamList, 'Article'>;

type LoadState =
  | { phase: 'loading' }
  | { phase: 'fetching' }
  | { phase: 'ready'; html: string }
  | { phase: 'error'; message: string };

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { slug, title } = useRoute<Route>().params;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [webReady, setWebReady] = useState(false);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    setState({ phase: 'loading' });
    setWebReady(false);

    let entry = await getEntry(slug);

    if (!entry?.content_html) {
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

    await recordVisit(slug, entry.title);
    setState({
      phase: 'ready',
      html: buildArticleHtml({
        slug: entry.slug,
        title: entry.title,
        tocHtml: entry.toc_html ?? '',
        contentHtml: entry.content_html,
        preambleHtml: entry.preamble_html ?? '',
      }),
    });
  }

  const handleNav = useCallback((req: WebViewNavigation): boolean => {
    const url = req.url;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;

    const entry = url.match(/plato\.stanford\.edu\/entries\/([a-z0-9-]+)\//);
    if (entry) {
      const target = entry[1];
      if (target !== slug) nav.push('Article', { slug: target, title: target });
      return false;
    }

    // Fragment navigation — allow
    if (url.includes('#') && !url.includes('plato.stanford.edu')) return true;

    return false;
  }, [slug, nav]);

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
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.back} />
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
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryLabel}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.phase === 'ready' && (
        <View style={styles.webWrap}>
          {!webReady && (
            <View style={styles.webOverlay}>
              <ActivityIndicator color="#7ba4ff" />
            </View>
          )}
          <WebView
            source={{ html: state.html, baseUrl: 'https://plato.stanford.edu' }}
            style={styles.web}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={handleNav}
            onLoadEnd={() => setWebReady(true)}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="normal"
            overScrollMode="never"
            contentInset={{ bottom: insets.bottom }}
          />
        </View>
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
    paddingHorizontal: 8,
  },
  backChevron: { color: '#7ba4ff', fontSize: 28, lineHeight: 28, marginRight: 1 },
  backLabel: { color: '#7ba4ff', fontSize: 16 },
  headerTitle: {
    flex: 1,
    color: '#e8e8e8',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: '#121212' },
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  fetchingLabel: { color: '#555', fontSize: 14 },
  errorText: {
    color: '#888', fontSize: 15,
    textAlign: 'center', paddingHorizontal: 32,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  retryLabel: { color: '#7ba4ff', fontSize: 15 },
});
