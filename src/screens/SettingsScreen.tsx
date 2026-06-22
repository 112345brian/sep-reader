import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, TextInput, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getPrefs, savePrefs, getEntryCount, getMeta, setMeta, getAllUncachedSlugs,
  clearArticleCache, getZoteroPrefs, saveZoteroPrefs, getSyncFolder, setSyncFolder,
} from '../services/db';
import type { Prefs } from '../services/db';
import { exportToSyncFolder, importFromSyncFolder } from '../services/dataSync';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [prefs, setPrefs] = useState<Prefs>({ homeMode: 'search', downloadAll: false });
  const [cachedCount, setCachedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [zoteroKey, setZoteroKey] = useState('');
  const [zoteroId, setZoteroId] = useState('');
  const [syncFolder, setSyncFolderState] = useState('');
  const [zoteroSaved, setZoteroSaved] = useState(false);
  const [customCss, setCustomCss] = useState('');
  const [cssSaved, setCssSaved] = useState(false);
  const [fontSize, setFontSize] = useState(17);

  useFocusEffect(useCallback(() => {
    getPrefs().then(setPrefs);
    getMeta('index_refreshed_at').then(ts =>
      setLastSync(ts ? new Date(Number(ts)).toLocaleDateString() : null)
    );
    getZoteroPrefs().then(p => { setZoteroKey(p.apiKey); setZoteroId(p.userId); });
    getSyncFolder().then(setSyncFolderState);
    getMeta('custom_css').then(v => setCustomCss(v ?? ''));
    getMeta('font_size').then(v => setFontSize(v ? parseInt(v, 10) : 17));
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

  async function saveCustomCss() {
    await setMeta('custom_css', customCss.trim());
    setCssSaved(true);
    setTimeout(() => setCssSaved(false), 2000);
  }

  async function resetCustomCss() {
    await setMeta('custom_css', '');
    setCustomCss('');
    setCssSaved(false);
  }

  async function updateFontSize(px: number) {
    setFontSize(px);
    await setMeta('font_size', String(px));
  }

  async function saveZotero() {
    await saveZoteroPrefs(zoteroKey.trim(), zoteroId.trim());
    setZoteroSaved(true);
    setTimeout(() => setZoteroSaved(false), 2000);
  }

  async function saveSyncFolder() {
    await setSyncFolder(syncFolder.trim());
    Alert.alert('Sync folder saved', `The app will sync to:\n${syncFolder.trim()}`);
  }

  async function handleExport() {
    const folder = syncFolder.trim();
    if (folder) {
      const result = await exportToSyncFolder();
      Alert.alert(
        result === 'ok' ? 'Exported' : 'Export failed',
        result === 'ok'
          ? `User data written to:\n${folder}/sep_user.json`
          : 'Could not write to that folder. Check the path.'
      );
    } else {
      Alert.alert('No sync folder set', 'Enter a folder path above to export your data.');
    }
  }

  async function handleImport() {
    const result = await importFromSyncFolder();
    const messages: Record<string, string> = {
      ok: 'Database imported. Restart the app for changes to take effect.',
      no_folder: 'Set a sync folder first.',
      not_found: 'No database found in that folder.',
      error: 'Import failed. Check the folder path.',
    };
    Alert.alert(result === 'ok' ? 'Imported' : 'Import failed', messages[result]);
  }

  function confirmClearCache() {
    Alert.alert(
      'Clear Article Cache',
      'Removes all downloaded article content. Titles and history are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache', style: 'destructive',
          onPress: async () => { await clearArticleCache(); loadCounts(); },
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* On Launch */}
        <Section title="On Launch">
          <OptionRow label="Show search" selected={prefs.homeMode === 'search'} onPress={() => updatePref('homeMode', 'search')} />
          <OptionRow label="Continue reading" selected={prefs.homeMode === 'continue'} onPress={() => updatePref('homeMode', 'continue')} last />
        </Section>

        {/* Reading */}
        <Section title="Reading">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Font size</Text>
            <View style={styles.fontSizePicker}>
              {([15, 17, 19, 22] as const).map(px => (
                <TouchableOpacity
                  key={px}
                  style={[styles.fontSizeOption, fontSize === px && styles.fontSizeSelected]}
                  onPress={() => updateFontSize(px)}
                >
                  <Text style={[styles.fontSizeLabel, fontSize === px && styles.fontSizeLabelSelected]}>
                    {px === 15 ? 'S' : px === 17 ? 'M' : px === 19 ? 'L' : 'XL'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.inputRow, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
            <Text style={[styles.inputLabel, { width: 'auto', marginBottom: 8 }]}>Custom CSS</Text>
            <TextInput
              style={styles.cssInput}
              value={customCss}
              onChangeText={setCustomCss}
              placeholder={'/* override any reading styles */\nbody { font-family: "Palatino", serif; }\n#aueditable { max-width: 600px; }'}
              placeholderTextColor="#333"
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
          </View>
          <View style={[styles.syncBtns, styles.rowLast]}>
            <TouchableOpacity style={styles.saveBtn} onPress={saveCustomCss}>
              <Text style={styles.saveBtnText}>{cssSaved ? '✓ Applied' : 'Apply CSS'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, styles.resetBtn]} onPress={resetCustomCss}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>CSS applies to every article. Reload an article to see changes.</Text>
        </Section>

        {/* Zotero */}
        <Section title="Zotero">
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>User ID</Text>
            <TextInput
              style={styles.input}
              value={zoteroId}
              onChangeText={setZoteroId}
              placeholder="12345678"
              placeholderTextColor="#333"
              keyboardType="number-pad"
              autoCorrect={false}
            />
          </View>
          <View style={[styles.inputRow, styles.rowLast]}>
            <Text style={styles.inputLabel}>API Key</Text>
            <TextInput
              style={styles.input}
              value={zoteroKey}
              onChangeText={setZoteroKey}
              placeholder="your-api-key"
              placeholderTextColor="#333"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveZotero}>
            <Text style={styles.saveBtnText}>{zoteroSaved ? '✓ Saved' : 'Save'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Get your user ID and API key at zotero.org/settings/keys
          </Text>
        </Section>

        {/* Sync Folder */}
        <Section title="Sync Folder">
          <View style={[styles.inputRow, styles.rowLast]}>
            <TextInput
              style={[styles.input, styles.pathInput]}
              value={syncFolder}
              onChangeText={setSyncFolderState}
              placeholder={Platform.OS === 'macos' ? '~/Documents/Nous/' : '/sdcard/Nous/'}
              placeholderTextColor="#333"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveSyncFolder}>
            <Text style={styles.saveBtnText}>Set Folder</Text>
          </TouchableOpacity>
          <View style={styles.syncBtns}>
            <TouchableOpacity style={styles.syncBtn} onPress={handleExport}>
              <Text style={styles.syncBtnText}>Export →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.syncBtn} onPress={handleImport}>
              <Text style={styles.syncBtnText}>← Import</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Point to a folder in iCloud Drive, Dropbox, or any synced location for cross-device sync.
          </Text>
        </Section>

        {/* Library */}
        <Section title="Library">
          <Row label="Index entries" value={`${totalCount.toLocaleString()} articles`} />
          <Row label="Downloaded" value={`${cachedCount.toLocaleString()} (${cachePercent}%)`} />
          {lastSync && <Row label="Last synced" value={lastSync} last />}
        </Section>

        {/* Storage */}
        <Section title="Storage">
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={confirmClearCache} activeOpacity={0.7}>
            <Text style={styles.destructiveLabel}>Clear article cache</Text>
          </TouchableOpacity>
        </Section>

        <Text style={styles.version}>Nous · v0.1.0</Text>
        <Text style={styles.attribution}>
          Powered by the Stanford Encyclopedia of Philosophy
        </Text>
        <Text style={styles.attributionUrl}>plato.stanford.edu</Text>
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

function OptionRow({ label, selected, onPress, last }: { label: string; selected: boolean; onPress: () => void; last?: boolean }) {
  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={0.7}>
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
    flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 8, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a', minHeight: 44,
  },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 80, paddingHorizontal: 8 },
  backChevron: { color: '#7ba4ff', fontSize: 28, lineHeight: 28, marginRight: 1 },
  backLabel: { color: '#7ba4ff', fontSize: 16 },
  headerTitle: { flex: 1, color: '#e8e8e8', fontSize: 15, fontWeight: '600', textAlign: 'center' },

  section: { marginTop: 32, paddingHorizontal: 16 },
  sectionTitle: { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  sectionBody: { borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2a', backgroundColor: '#171717' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: '#d6d6d6', fontSize: 15 },
  rowValue: { color: '#555', fontSize: 14 },
  checkmark: { color: '#7ba4ff', fontSize: 16 },
  destructiveLabel: { color: '#ff6b6b', fontSize: 15 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
    gap: 12,
  },
  inputLabel: { color: '#888', fontSize: 14, width: 56 },
  input: { flex: 1, color: '#e8e8e8', fontSize: 14, paddingVertical: 4 },
  pathInput: { fontFamily: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'Menlo' : 'monospace', fontSize: 13 },

  saveBtn: { margin: 12, backgroundColor: '#1e2a4a', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#7ba4ff', fontSize: 14, fontWeight: '600' },

  syncBtns: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 12 },
  syncBtn: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2a' },
  syncBtnText: { color: '#888', fontSize: 14 },

  hint: { color: '#444', fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingBottom: 14 },
  version: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 40 },
  attribution: { color: '#2a2a2a', fontSize: 11, textAlign: 'center', marginTop: 6 },
  attributionUrl: { color: '#252525', fontSize: 10, textAlign: 'center', marginTop: 2, marginBottom: 8 },

  fontSizePicker: { flexDirection: 'row', gap: 6 },
  fontSizeOption: {
    width: 36, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1a1a1a', borderWidth: StyleSheet.hairlineWidth, borderColor: '#333',
  },
  fontSizeSelected: { backgroundColor: '#1e2a4a', borderColor: '#7ba4ff' },
  fontSizeLabel: { color: '#555', fontSize: 13, fontWeight: '600' },
  fontSizeLabelSelected: { color: '#7ba4ff' },

  cssInput: {
    width: '100%', minHeight: 120, backgroundColor: '#0e0e0e', borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2a',
    color: '#c0c0c0', fontSize: 12, padding: 10,
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'Menlo' : 'monospace',
    lineHeight: 18, textAlignVertical: 'top',
  },
  resetBtn: { backgroundColor: '#1a1a1a', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2a2a' },
  resetBtnText: { color: '#555', fontSize: 14, fontWeight: '600' },
});
