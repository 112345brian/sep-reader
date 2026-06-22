import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { runSync } from '../services/sync';
import type { SyncStatus } from '../types';

interface Props {
  onComplete: () => void;
}

export default function SyncScreen({ onComplete }: Props) {
  const [status, setStatus] = useState<SyncStatus>({ phase: 'fetching-list' });
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    runSync(s => {
      setStatus(s);
      if (s.phase === 'syncing') {
        Animated.timing(progressAnim, {
          toValue: s.done / s.total,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }
      if (s.phase === 'done') {
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start(() => setTimeout(onComplete, 600));
      }
    });
  }, []);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SEP</Text>
      <Text style={styles.title}>Stanford Encyclopedia{'\n'}of Philosophy</Text>

      {status.phase === 'fetching-list' && (
        <>
          <ActivityIndicator color="#7ba4ff" style={styles.spinner} />
          <Text style={styles.sub}>Fetching article list…</Text>
        </>
      )}

      {status.phase === 'syncing' && (
        <>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressBar, { width: barWidth }]} />
          </View>
          <Text style={styles.sub}>
            {status.done} / {status.total} articles
          </Text>
          <Text style={styles.current} numberOfLines={1}>
            {status.current}
          </Text>
        </>
      )}

      {status.phase === 'done' && (
        <Text style={styles.sub}>Ready — {status.count} articles downloaded</Text>
      )}

      {status.phase === 'error' && (
        <Text style={[styles.sub, styles.error]}>{status.message}</Text>
      )}

      <Text style={styles.note}>
        {status.phase === 'syncing'
          ? 'This only happens once. You can read already-downloaded articles while this runs.'
          : 'Downloading all ~1,800 articles for offline reading.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: {
    color: '#7ba4ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#e8e8e8',
    fontSize: 22,
    fontWeight: '300',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 48,
  },
  spinner: {
    marginBottom: 16,
  },
  progressTrack: {
    width: '100%',
    height: 2,
    backgroundColor: '#2a2a2a',
    borderRadius: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7ba4ff',
    borderRadius: 1,
  },
  sub: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  current: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
  },
  error: {
    color: '#ff6b6b',
  },
  note: {
    position: 'absolute',
    bottom: 48,
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
