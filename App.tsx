import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getArticleCount } from './src/services/db';
import HomeScreen from './src/screens/HomeScreen';
import ArticleScreen from './src/screens/ArticleScreen';
import SyncScreen from './src/screens/SyncScreen';

export type RootStackParamList = {
  Home: undefined;
  Article: { slug: string; title: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const DARK_THEME = {
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
  const [ready, setReady] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);

  useEffect(() => {
    getArticleCount().then(n => {
      setNeedsSync(n === 0);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  if (needsSync) {
    return (
      <SafeAreaProvider>
        <SyncScreen onComplete={() => setNeedsSync(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={DARK_THEME}>
        <Stack.Navigator id="root" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Article" component={ArticleScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
