import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigationContainerRef } from '@react-navigation/native';
import { getEntryCount, getMeta, getPrefs, getRecentSlugs } from './src/services/db';
import { syncOnLaunch } from './src/services/dataSync';
import { refreshIndexIfStale, downloadAll } from './src/services/catalog';
import type { Prefs } from './src/services/db';
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

type AppPhase = 'booting' | 'onboarding' | 'indexing' | 'index_error' | 'ready';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('booting');
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
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
      refreshIndexIfStale(); // background, failures are silent
    }

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

    // Kick off bulk download in background if user requested it
    if (prefs.downloadAll) {
      downloadAll(p => setDownloadProgress(p))
        .then(() => setDownloadProgress(null));
    }
  }

  async function handleOnboardingDone(prefs: Prefs) {
    setPhase('indexing');
    await initialize(prefs);
  }

  if (phase === 'booting') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>Nous</Text>
      </View>
    );
  }

  if (phase === 'onboarding') {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onDone={handleOnboardingDone} />
      </SafeAreaProvider>
    );
  }

  if (phase === 'indexing') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>Nous</Text>
        <ActivityIndicator color="#7ba4ff" style={{ marginTop: 32 }} />
        <Text style={styles.bootLabel}>Building index…</Text>
      </View>
    );
  }

  if (phase === 'index_error') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>Nous</Text>
        <Text style={styles.bootError}>Could not reach plato.stanford.edu.{'\n'}Check your connection and relaunch.</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={THEME} ref={navRef}>
        <Stack.Navigator id="root" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Article" component={ArticleScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="ReadingList" component={ReadingListScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Annotations" component={AnnotationsScreen} />
          <Stack.Screen name="Graph" component={GraphScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      {downloadProgress && (
        <View style={styles.downloadBar}>
          <View
            style={[
              styles.downloadFill,
              { width: `${(downloadProgress.done / downloadProgress.total) * 100}%` },
            ]}
          />
        </View>
      )}
    </SafeAreaProvider>
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
  downloadBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: '#1a1a1a',
  },
  downloadFill: {
    height: '100%',
    backgroundColor: '#7ba4ff',
  },
});
