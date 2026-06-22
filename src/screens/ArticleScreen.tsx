import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getArticle } from '../services/db';
import { buildArticleHtml } from '../utils/articleTemplate';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Article'>;
type Route = RouteProp<RootStackParamList, 'Article'>;

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { slug, title } = route.params;

  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webLoading, setWebLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const article = await getArticle(slug);
      if (!article || !article.content_html) {
        setLoading(false);
        return;
      }
      setHtml(buildArticleHtml({
        slug: article.slug,
        title: article.title,
        tocHtml: article.toc_html ?? '',
        contentHtml: article.content_html,
        preambleHtml: article.preamble_html ?? '',
      }));
      setLoading(false);
    })();
  }, [slug]);

  const handleNavChange = useCallback((req: WebViewNavigation) => {
    const url = req.url;

    // Stay local: fragment navigation and about:blank
    if (url.startsWith('about:') || url.startsWith('data:')) return true;

    // Internal SEP article link — navigate within app
    const entryMatch = url.match(/plato\.stanford\.edu\/entries\/([a-z0-9-]+)\//);
    if (entryMatch) {
      const targetSlug = entryMatch[1];
      if (targetSlug !== slug) {
        nav.push('Article', { slug: targetSlug, title: targetSlug });
      }
      return false;
    }

    // Fragment link within same page — allow
    if (url.includes('#')) return true;

    // Everything else (external links) — block, could open in browser if desired
    return false;
  }, [slug, nav]);

  const headerHeight = insets.top + 44;

  return (
    <View style={styles.container}>
      {/* Native header */}
      <View style={[styles.header, { paddingTop: insets.top, height: headerHeight }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>Library</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color="#7ba4ff" size="large" />
        </View>
      )}

      {!loading && !html && (
        <View style={styles.loader}>
          <Text style={styles.errorText}>Article not yet downloaded</Text>
        </View>
      )}

      {!loading && html && (
        <View style={styles.webContainer}>
          {webLoading && (
            <View style={styles.webLoader}>
              <ActivityIndicator color="#7ba4ff" />
            </View>
          )}
          <WebView
            source={{ html, baseUrl: 'https://plato.stanford.edu' }}
            style={styles.webView}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={handleNavChange}
            onLoadEnd={() => setWebLoading(false)}
            allowFileAccess={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={true}
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
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backChevron: {
    color: '#7ba4ff',
    fontSize: 26,
    lineHeight: 26,
    marginRight: 2,
  },
  backLabel: {
    color: '#7ba4ff',
    fontSize: 16,
  },
  headerTitle: {
    flex: 1,
    color: '#e8e8e8',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  webContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#121212',
  },
  webLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
    zIndex: 10,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#555',
    fontSize: 15,
  },
});
