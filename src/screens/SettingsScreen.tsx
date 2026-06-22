import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Switch, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getPrefs, savePrefs, getEntryCount, getMeta, getAllUncachedSlugs, clearArticleCache } from '../services/db';
import type { Prefs } from '../services/db';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [prefs, setPrefs] = useState<Prefs>({ homeMode: 'search', downloadAll: false });
  const [cachedCount, setCachedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getPrefs().then(setPrefs);
    getMeta('index_refreshed_at').then(ts =>
      setLastSync(ts ? new Date(Number(ts)).toLocaleDateString() : null)
    );
    loadCounts();
  }, []));

  async function loadCounts() {
    const total = await getEntryCount();
    setTotalCount(total);
    const uncached = await getAllUncachedSlugs();
    setCachedCount(total - uncached.length);
  }

  async function updatePref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrefs(next);
  }

  function confirmClearCache() {
    Alert.alert(
      'Clear Article Cache',
      'This removes all downloaded article content. The index (titles) is kept. Articles will re-download when opened.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await clearArticleCache();
            loadCounts();
          },
        },
      ]
    );
  }

  const cachePercent = totalCount > 0 ? Math.round((cachedCount / totalCount) * 100) : 0;

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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Section title="On Launch">
          <OptionRow
            label="Show search"
            selected={prefs.homeMode === 'search'}
            onPress={() => updatePref('homeMode', 'search')}
          />
          <OptionRow
            label="Continue reading"
            selected={prefs.homeMode === 'continue'}
            onPress={() => updatePref('homeMode', 'continue')}
            last
          />
        </Section>

        <Section title="Library">
          <Row label="Index entries" value={`${totalCount.toLocaleString()} articles`} />
          <Row label="Downloaded" value={`${cachedCount.toLocaleString()} (${cachePercent}%)`} />
          {lastSync && <Row label="Last synced" value={lastSync} last />}
        </Section>

        <Section title="Storage">
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={confirmClearCache}
            activeOpacity={0.7}
          >
            <Text style={styles.destructiveLabel}>Clear article cache</Text>
          </TouchableOpacity>
        </Section>

        <Text style={styles.version}>SEP Reader · v0.1.0</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function OptionRow({
  label, selected, onPress, last,
}: {
  label: string; selected: boolean; onPress: () => void; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {selected && <Text style={styles.checkmark}>✓</Text>}
    </TouchableOpacity>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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

  section: { marginTop: 32, paddingHorizontal: 16 },
  sectionTitle: {
    color: '#444', fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionBody: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
    backgroundColor: '#171717',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: '#d6d6d6', fontSize: 15 },
  rowValue: { color: '#555', fontSize: 14 },
  checkmark: { color: '#7ba4ff', fontSize: 16 },
  destructiveLabel: { color: '#ff6b6b', fontSize: 15 },
  version: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 40 },
});
