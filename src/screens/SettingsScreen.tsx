import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, TextInput, Platform, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getPrefs, savePrefs, getMeta, setMeta,
  clearArticleCache, getZoteroPrefs, saveZoteroPrefs, getSyncFolder, setSyncFolder,
  getEntryCounts,
} from '../services/db';
import type { Prefs } from '../services/db';
import { downloadAll, syncCachedArticles } from '../services/catalog';
import type { DownloadProgress } from '../services/catalog';
import { exportToSyncFolder, importFromSyncFolder } from '../services/dataSync';
import { importSeedFromUrl } from '../services/seedImport';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [prefs, setPrefs] = useState<Prefs>({ homeMode: 'search', downloadAll: true, libraryScope: 'all', seedUrl: '' });
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
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);
  const [dlAbort, setDlAbort] = useState<AbortController | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState<string>('off');
  const [linkPreview, setLinkPreview] = useState(true);

  useFocusEffect(useCallback(() => {
    getPrefs().then(setPrefs);
    getMeta('index_refreshed_at').then(ts =>
      setLastSync(ts ? new Date(Number(ts)).toLocaleDateString() : null)
    );
    getZoteroPrefs().then(p => { setZoteroKey(p.apiKey); setZoteroId(p.userId); });
    getSyncFolder().then(setSyncFolderState);
    getMeta('custom_css').then(v => setCustomCss(v ?? ''));
    getMeta('font_size').then(v => setFontSize(v ? parseInt(v, 10) : 17));
    getMeta('auto_sync').then(v => setAutoSync(v ?? 'off'));
    getMeta('link_preview').then(v => setLinkPreview(v !== '0'));
    loadCounts();
  }, []));

  async function loadCounts() {
    const { total, cached } = await getEntryCounts();
    setTotalCount(total);
    setCachedCount(cached);
  }

  async function updatePref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrefs(next);
  }

  function toggleLinkPreview() {
    const next = !linkPreview;
    setLinkPreview(next);
    setMeta('link_preview', next ? '1' : '0').catch(() => {});
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

  const swipeBack = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-9999, 30])
    .failOffsetY([-22, 22])
    .onEnd(e => {
      if (e.translationX > 60 && e.velocityX > 100) nav.goBack();
    });

  async function handleDownloadAll() {
    const abort = new AbortController();
    setDlAbort(abort);
    setDlProgress({ done: 0, total: 0, current: '' });
    try {
      await downloadAll(p => setDlProgress(p), abort.signal, prefs.libraryScope);
    } finally {
      setDlAbort(null);
      setDlProgress(null);
      loadCounts();
    }
  }

  function cancelDownload() {
    dlAbort?.abort();
    setDlAbort(null);
    setDlProgress(null);
  }

  async function handleSeedFromUrl() {
    Alert.prompt(
      'Seed from URL',
      'Enter the URL of a Nous-compatible database file (.db)',
      async (url) => {
        if (!url?.trim()) return;
        try {
          await importSeedFromUrl(url.trim(), () => {});
          Alert.alert('Done', 'Database imported. Restart the app to apply.');
        } catch (e: any) {
          Alert.alert('Import failed', e?.message ?? 'Unknown error');
        }
      },
      'plain-text',
      prefs.seedUrl,
      'url',
    );
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await syncCachedArticles(() => {});
      const now = new Date().toLocaleDateString();
      setLastSync(now);
    } finally {
      setSyncing(false);
    }
  }

  async function setAutoSyncPref(value: string) {
    setAutoSync(value);
    await setMeta('auto_sync', value);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => nav.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.back} />
      </View>

      <GestureDetector gesture={swipeBack}>
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
          <OptionRow label="Preview links before opening" selected={linkPreview} onPress={toggleLinkPreview} />
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
          <View style={styles.cssBlock}>
            <TextInput
              style={styles.cssInput}
              value={customCss}
              onChangeText={setCustomCss}
              placeholder={'/* override any reading styles */\nbody { font-family: "Palatino", serif; }'}
              placeholderTextColor="#3a3a3a"
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
            <Text style={styles.cssRef}>
              {'Variables: --bg  --text  --accent  --serif  --sans  --font-size  --max-width  --side-pad\n' +
               'Key selectors: body  #article-content  #preamble  #aueditable  #toc  h1  h2  h3  p  a  blockquote\n' +
               'Hide elements: #related-entries  #bibliography-section  .footnotes'}
            </Text>
          </View>
          <ActionRow label={cssSaved ? '✓ Applied' : 'Apply CSS'} onPress={saveCustomCss} accent />
          <ActionRow label="Reset to default" onPress={resetCustomCss} last />
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
              placeholderTextColor="#3a3a3a"
              keyboardType="number-pad"
              autoCorrect={false}
            />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>API Key</Text>
            <TextInput
              style={styles.input}
              value={zoteroKey}
              onChangeText={setZoteroKey}
              placeholder="your-api-key"
              placeholderTextColor="#3a3a3a"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
          </View>
          <ActionRow label={zoteroSaved ? '✓ Saved' : 'Save'} onPress={saveZotero} accent last />
        </Section>
        <Text style={styles.hint}>Get your user ID and API key at zotero.org/settings/keys</Text>

        {/* Sync Folder */}
        <Section title="Sync Folder">
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.pathInput]}
              value={syncFolder}
              onChangeText={setSyncFolderState}
              placeholder={Platform.OS === 'macos' ? '~/Documents/Nous/' : '/sdcard/Nous/'}
              placeholderTextColor="#3a3a3a"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <ActionRow label="Set Folder" onPress={saveSyncFolder} accent />
          <ActionRow label="Export →" onPress={handleExport} />
          <ActionRow label="← Import" onPress={handleImport} last />
        </Section>
        <Text style={styles.hint}>Point to a folder in iCloud Drive, Dropbox, or any synced location.</Text>

        {/* Library */}
        <Section title="Library">
          <View style={[styles.row, { flexWrap: 'wrap', paddingVertical: 12 }]}>
            <Text style={[styles.rowLabel, { marginRight: 12 }]}>Sources</Text>
            <View style={scopeStyles.row}>
              {(['all', 'sep', 'owl'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[scopeStyles.chip, prefs.libraryScope === s && scopeStyles.chipActive]}
                  onPress={() => updatePref('libraryScope', s)}
                  activeOpacity={0.7}
                >
                  <Text style={[scopeStyles.chipText, prefs.libraryScope === s && scopeStyles.chipTextActive]}>
                    {s === 'all' ? 'All' : s === 'sep' ? 'Stanford Encyclopedia' : 'The OWL'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Row label="Index entries" value={`${totalCount.toLocaleString()} articles`} />
          <Row label="Downloaded" value={`${cachedCount.toLocaleString()} (${cachePercent}%)`} />
          {lastSync && <Row label="Last synced" value={lastSync} />}
          {dlProgress ? (
            <>
              <Row label="Downloading" value={`${dlProgress.done.toLocaleString()} / ${Math.max(dlProgress.total, 1).toLocaleString()}`} />
              <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={cancelDownload} activeOpacity={0.7}>
                <Text style={styles.destructiveLabel}>Cancel download</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.row} onPress={handleDownloadAll} activeOpacity={0.7}>
              <Text style={styles.rowLabel}>Download all articles</Text>
              <Text style={styles.rowValue}>{(totalCount - cachedCount).toLocaleString()} remaining</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleSeedFromUrl} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Import database from URL</Text>
          </TouchableOpacity>
        </Section>

        {/* Auto-sync */}
        <Section title="Auto-sync">
          <OptionRow label="Off" selected={autoSync === 'off'} onPress={() => setAutoSyncPref('off')} />
          <OptionRow label="Every 2 days" selected={autoSync === '2days'} onPress={() => setAutoSyncPref('2days')} />
          <OptionRow label="Every week" selected={autoSync === '7days'} onPress={() => setAutoSyncPref('7days')} />
          <ActionRow label={syncing ? 'Syncing…' : 'Check for updates now'} onPress={handleSyncNow} accent last />
        </Section>
        <Text style={styles.hint}>Re-fetches cached articles and picks up new entries from SEP.</Text>

        {/* Storage */}
        <Section title="Storage">
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={confirmClearCache} activeOpacity={0.7}>
            <Text style={styles.destructiveLabel}>Clear article cache</Text>
          </TouchableOpacity>
        </Section>

        {/* Credits */}
        <Section title="Credits">
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('https://plato.stanford.edu')} activeOpacity={0.7}>
            <View style={styles.supportTextWrap}>
              <Text style={styles.rowLabel}>Stanford Encyclopedia of Philosophy</Text>
              <Text style={styles.supportSub}>Suggested content source</Text>
            </View>
            <Text style={styles.rowValue}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => Linking.openURL('https://www.inphoproject.org')} activeOpacity={0.7}>
            <View style={styles.supportTextWrap}>
              <Text style={styles.rowLabel}>InPhO, Indiana University</Text>
              <Text style={styles.supportSub}>Suggested semantic graph</Text>
            </View>
            <Text style={styles.rowValue}>↗</Text>
          </TouchableOpacity>
        </Section>

        {/* Support */}
        <Section title="Support">
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('https://plato.stanford.edu/support/')} activeOpacity={0.7}>
            <View style={styles.supportTextWrap}>
              <Text style={styles.rowLabel}>Donate to the SEP</Text>
              <Text style={styles.supportSub}>Support them!</Text>
            </View>
            <Text style={styles.rowValue}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => Linking.openURL('https://ko-fi.com/112345brian')} activeOpacity={0.7}>
            <View style={styles.supportTextWrap}>
              <Text style={styles.rowLabel}>Buy me a coffee</Text>
              <Text style={styles.supportSub}>If you have anything left over</Text>
            </View>
            <Text style={styles.rowValue}>↗</Text>
          </TouchableOpacity>
        </Section>

        <Text style={styles.version}>Nous · v0.6.6</Text>
      </ScrollView>
      </GestureDetector>
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

function ActionRow({ label, onPress, accent, last, destructive }: { label: string; onPress: () => void; accent?: boolean; last?: boolean; destructive?: boolean }) {
  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={0.6}>
      <Text style={[styles.actionLabel, accent && styles.actionAccent, destructive && styles.destructiveLabel]}>{label}</Text>
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

const S = {
  bg:       '#111111',
  surface:  '#1c1c1c',
  border:   '#252525',
  text:     '#e0e0e0',
  textDim:  '#999999',
  textHint: '#5a5a5a',
  accent:   '#7ba4ff',
  red:      '#ff6b6b',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.bg },
  header: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingBottom: 10, paddingHorizontal: 8,
    minHeight: 50,
  },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 80, paddingHorizontal: 6 },
  backChevron: { color: S.accent, fontSize: 24, lineHeight: 26, marginRight: 2 },
  backLabel: { color: S.accent, fontSize: 15 },
  headerTitle: { flex: 1, color: S.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },

  section: { marginTop: 28, paddingHorizontal: 16 },
  sectionTitle: {
    color: S.textHint, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
  },
  sectionBody: { borderRadius: 12, overflow: 'hidden', backgroundColor: S.surface },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: S.text, fontSize: 15 },
  rowValue: { color: S.textDim, fontSize: 14 },
  supportTextWrap: { flex: 1 },
  supportSub: { color: S.textDim, fontSize: 12, marginTop: 2 },
  checkmark: { color: S.accent, fontSize: 15 },
  actionLabel: { color: S.textDim, fontSize: 15 },
  actionAccent: { color: S.accent },
  destructiveLabel: { color: S.red, fontSize: 15 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.border,
    gap: 12,
  },
  inputLabel: { color: S.textDim, fontSize: 14, width: 56 },
  input: { flex: 1, color: S.text, fontSize: 14, paddingVertical: 4 },
  pathInput: {
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },

  hint: {
    color: S.textHint, fontSize: 12, lineHeight: 18,
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4,
  },
  version: { color: S.textHint, fontSize: 12, textAlign: 'center', marginTop: 40 },
  attribution: { color: '#333', fontSize: 11, textAlign: 'center', marginTop: 6 },
  attributionUrl: { color: '#2e2e2e', fontSize: 10, textAlign: 'center', marginTop: 2, marginBottom: 8 },

  fontSizePicker: { flexDirection: 'row', gap: 6 },
  fontSizeOption: {
    width: 38, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: S.bg, borderWidth: 1, borderColor: S.border,
  },
  fontSizeSelected: { backgroundColor: '#162040', borderColor: S.accent },
  fontSizeLabel: { color: S.textDim, fontSize: 13, fontWeight: '600' },
  fontSizeLabelSelected: { color: S.accent },

  cssBlock: {
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.border,
  },
  cssInput: {
    minHeight: 110, backgroundColor: '#0d0d0d', borderRadius: 8,
    borderWidth: 1, borderColor: '#252525',
    color: '#bdbdbd', fontSize: 12, padding: 10,
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'Menlo' : 'monospace',
    lineHeight: 18, textAlignVertical: 'top',
  },
  cssRef: {
    color: '#404040', fontSize: 11, lineHeight: 16,
    paddingTop: 8, paddingBottom: 6,
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'Menlo' : 'monospace',
  },
});

const scopeStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1,
    borderColor: S.border, backgroundColor: S.bg,
  },
  chipActive: { borderColor: S.accent, backgroundColor: '#162040' },
  chipText: { color: S.textDim, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: S.accent },
});
