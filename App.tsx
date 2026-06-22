import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getEntryCount } from './src/services/db';
import { refreshIndexIfStale } from './src/services/catalog';
import HomeScreen from './src/screens/HomeScreen';
import ArticleScreen from './src/screens/ArticleScreen';
import HistoryScreen from './src/screens/HistoryScreen';

export type RootStackParamList = {
  Home: undefined;
  Article: { slug: string; title: string; fromSlug?: string };
  History: undefined;
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

export default function App() {
  // Three states: 'booting' | 'indexing' | 'ready'
  const [phase, setPhase] = useState<'booting' | 'indexing' | 'ready'>('booting');

  useEffect(() => {
    (async () => {
      const count = await getEntryCount();
      if (count === 0) {
        setPhase('indexing');
        await refreshIndexIfStale();
      } else {
        // Already have entries — go straight to ready, refresh index in background
        refreshIndexIfStale();
      }
      setPhase('ready');
    })();
  }, []);

  if (phase !== 'ready') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>SEP</Text>
        {phase === 'indexing' && (
          <>
            <ActivityIndicator color="#7ba4ff" style={{ marginTop: 32 }} />
            <Text style={styles.bootLabel}>Building index…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={THEME}>
        <Stack.Navigator id="root" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Article" component={ArticleScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
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
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  bootLabel: {
    color: '#444',
    fontSize: 13,
    marginTop: 12,
  },
});
