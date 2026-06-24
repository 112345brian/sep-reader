import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, LogBox } from 'react-native';

LogBox.ignoreAllLogs();
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigationContainerRef } from '@react-navigation/native';
import { getEntryCount, getMeta, getPrefs, getRecentSlugs } from './src/services/db';
import { syncOnLaunch } from './src/services/dataSync';
import { importSeedFromUrl } from './src/services/seedImport';
import type { SeedPhase } from './src/services/seedImport';
import { refreshIndexIfStale, downloadAll, syncCachedArticles, backfillMathInline, backfillAst, backfillMathHashFormat } from './src/services/catalog';
import type { Prefs } from './src/services/db';
import { IS_TEST_BUILD } from './src/testConfig';
import MathRenderWebView from './src/components/MathRenderWebView';
import TestRunnerScreen from './src/screens/TestRunnerScreen';
import HomeScreen from './src/screens/HomeScreen';
import ArticleScreen from './src/screens/ArticleScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReadingListScreen from './src/screens/ReadingListScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import AnnotationsScreen from './src/screens/AnnotationsScreen';
import GraphScreen from './src/screens/GraphScreen';

export type RootStackParamList = {
  Home: undefined;
  Article: { slug: string; title: string; fromSlug?: string };
  History: undefined;
  ReadingList: undefined;
  Settings: undefined;
  Annotations: undefined;
  Graph: { centerSlug?: string; centerTitle?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Android 16 forces edge-to-edge: the app draws behind the translucent status
// and navigation bars, so scrolling content bleeds through them. These opaque
// bars sit over the system-bar regions (pointerEvents none, so the OS still
// owns taps/gestures) to give the bars a solid backdrop. Must live inside
// SafeAreaProvider to read the insets.
function SystemBarScrim() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View pointerEvents="none" style={[barStyles.bar, { top: 0, height: insets.top }]} />
      <View pointerEvents="none" style={[barStyles.bar, { bottom: 0, height: insets.bottom }]} />
    </>
  );
}
const barStyles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, backgroundColor: '#111', zIndex: 50 },
});

const THEME = {
  dark: true,
  colors: {
    primary: '#7ba4ff',
    background: '#121212',
    card: '#121212',
    text: '#e8e8e8',
    border: '#2a2a2a',
    notification: '#7ba4ff',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};

type AppPhase = 'booting' | 'onboarding' | 'seeding' | 'seed_error' | 'indexing' | 'index_error' | 'ready';

export default function App() {
  if (IS_TEST_BUILD) {
    return (
      <SafeAreaProvider>
        <TestRunnerScreen />
      </SafeAreaProvider>
    );
  }

  const [phase, setPhase] = useState<AppPhase>('booting');
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [seedPhase, setSeedPhase] = useState<SeedPhase | null>(null);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    const onboardingDone = await getMeta('onboarding_done');
    if (!onboardingDone) {
      setPhase('onboarding');
      return;
    }
    await initialize(await getPrefs());
  }

  async function initialize(prefs: Prefs) {
    syncOnLaunch(); // pull from sync folder if newer, non-blocking
    const count = await getEntryCount();

    if (count === 0) {
      setPhase('indexing');
      try {
        await refreshIndexIfStale();
        const newCount = await getEntryCount();
        if (newCount === 0) { setPhase('index_error'); return; }
      } catch {
        setPhase('index_error');
        return;
      }
    } else {
      await refreshIndexIfStale();
    }

    // Block until all articles are cached. "As I read" (downloadAll=false) skips
    // this and lets users fetch on demand — every other article open will hit the
    // network. MathRenderWebView is already mounted so the math backfill can use
    // it immediately after. Progress is shown on the splash screen.
    if (prefs.downloadAll) {
      await downloadAll(p => setDownloadProgress(p), undefined, prefs.libraryScope);
      setDownloadProgress(null);
    }

    // One-time migrations — no-ops on subsequent launches (each has a done flag).
    try { await backfillMathInline(); } catch {}
    try { await backfillMathHashFormat(); } catch {}
    try { await backfillAst(); } catch {}

    setPhase('ready');

    // After nav is ready, handle "continue" mode
    if (prefs.homeMode === 'continue') {
      const recent = await getRecentSlugs(1);
      if (recent.length > 0) {
        setTimeout(() => {
          navRef.current?.navigate('Article', {
            slug: recent[0].slug,
            title: recent[0].title,
          });
        }, 100);
      }
    }

    // Auto-sync runs after ready — it updates articles already in the DB and
    // doesn't need to block the user.
    const autoSync = await getMeta('auto_sync');
    const lastDeepSync = await getMeta('last_deep_sync');
    if (autoSync && autoSync !== 'off') {
      const days = autoSync === '2days' ? 2 : 7;
      const elapsed = Date.now() - (lastDeepSync ? Number(lastDeepSync) : 0);
      if (elapsed > days * 24 * 60 * 60 * 1000) {
        syncCachedArticles(() => {}).catch(() => {});
      }
    }
  }

  async function handleOnboardingDone(prefs: Prefs) {
    if (prefs.seedUrl) {
      setPhase('seeding');
      try {
        await importSeedFromUrl(prefs.seedUrl, p => setSeedPhase(p));
      } catch {
        setPhase('seed_error');
        return;
      }
      setSeedPhase(null);
    }
    setPhase('indexing');
    await initialize(prefs);
  }

  // Always mounted so the math backfill can use it during boot.
  const mathWebView = <MathRenderWebView />;

  if (phase === 'booting' || phase === 'seeding' || phase === 'seed_error' || phase === 'indexing' || phase === 'index_error') {
    return (
      <>
        {mathWebView}
        <View style={styles.boot}>
          <Text style={styles.bootLogo}>Nous</Text>
          {phase === 'index_error' ? (
            <Text style={styles.bootError}>Could not reach plato.stanford.edu.{'\n'}Check your connection and relaunch.</Text>
          ) : phase === 'seed_error' ? (
            <Text style={styles.bootError}>Could not download the seed database.{'\n'}Check the URL and relaunch.</Text>
          ) : phase === 'seeding' && seedPhase ? (
            seedPhase.phase === 'downloading' ? (
              <>
                <View style={styles.bootProgressTrack}>
                  <View style={[styles.bootProgressFill, {
                    width: seedPhase.bytesTotal > 0
                      ? `${Math.round((seedPhase.bytesWritten / seedPhase.bytesTotal) * 100)}%` as any
                      : '0%' as any,
                  }]} />
                </View>
                <Text style={styles.bootLabel}>
                  {seedPhase.bytesTotal > 0
                    ? `${Math.round(seedPhase.bytesWritten / 1_048_576)} / ${Math.round(seedPhase.bytesTotal / 1_048_576)} MB`
                    : `${Math.round(seedPhase.bytesWritten / 1_048_576)} MB…`}
                </Text>
              </>
            ) : (
              <>
                <ActivityIndicator color="#7ba4ff" style={{ marginTop: 32 }} />
                <Text style={styles.bootLabel}>
                  {seedPhase.phase === 'validating' ? 'Validating…' : 'Installing…'}
                </Text>
              </>
            )
          ) : downloadProgress ? (
            <>
              <View style={styles.bootProgressTrack}>
                <View style={[styles.bootProgressFill, { width: `${(downloadProgress.done / downloadProgress.total) * 100}%` as any }]} />
              </View>
              <Text style={styles.bootLabel}>{downloadProgress.done} / {downloadProgress.total}</Text>
            </>
          ) : (
            <>
              <ActivityIndicator color="#7ba4ff" style={{ marginTop: 32 }} />
              {phase === 'indexing' && <Text style={styles.bootLabel}>Building index…</Text>}
            </>
          )}
        </View>
      </>
    );
  }

  if (phase === 'onboarding') {
    return (
      <>
        {mathWebView}
        <SafeAreaProvider>
          <OnboardingScreen onDone={handleOnboardingDone} />
        </SafeAreaProvider>
      </>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={THEME} ref={navRef}>
          <Stack.Navigator
            id="root"
            screenOptions={{
              headerShown: false,
              // Native Android swipe-back is unreliable here (3-button nav, no
              // edge gesture); ArticleScreen implements its own edge-swipe Pan.
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Article" component={ArticleScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="ReadingList" component={ReadingListScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Annotations" component={AnnotationsScreen} />
            <Stack.Screen name="Graph" component={GraphScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        {/* Opaque backdrop behind the translucent system bars (edge-to-edge) */}
        <SystemBarScrim />
        {mathWebView}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: {
    color: '#7ba4ff',
    fontSize: 26,
    fontWeight: '400',
    letterSpacing: 6,
  },
  bootLabel: { color: '#444', fontSize: 13, marginTop: 12 },
  bootError: { color: '#666', fontSize: 14, marginTop: 24, textAlign: 'center', lineHeight: 22, paddingHorizontal: 40 },
  bootProgressTrack: {
    width: 160, height: 2, borderRadius: 1,
    backgroundColor: '#1e1e1e', marginTop: 40, overflow: 'hidden',
  },
  bootProgressFill: {
    height: '100%', borderRadius: 1, backgroundColor: '#7ba4ff',
  },
});
