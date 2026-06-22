import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { savePrefs } from '../services/db';
import type { Prefs } from '../services/db';

interface Props {
  onDone: (prefs: Prefs) => void;
}

type Step = 'welcome' | 'library' | 'home';
const STEPS: Step[] = ['welcome', 'library', 'home'];

export default function OnboardingScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [homeMode, setHomeMode] = useState<Prefs['homeMode']>('search');
  const [downloadAll, setDownloadAll] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    if (step === 'welcome') setStep('library');
    else if (step === 'library') setStep('home');
    else finish();
  };

  const finish = async () => {
    const prefs: Prefs = { homeMode, downloadAll };
    await savePrefs(prefs);
    onDone(prefs);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, i === stepIndex && styles.dotActive]} />
        ))}
      </View>

      {/* Step content */}
      <View style={styles.content}>
        {step === 'welcome' && <WelcomeStep />}
        {step === 'library' && (
          <LibraryStep value={downloadAll} onChange={setDownloadAll} />
        )}
        {step === 'home' && (
          <HomeStep value={homeMode} onChange={setHomeMode} />
        )}
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.cta} onPress={next} activeOpacity={0.8}>
        <Text style={styles.ctaText}>
          {step === 'home' ? 'Done' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function WelcomeStep() {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.logo}>SEP</Text>
      <Text style={styles.title}>Stanford Encyclopedia{'\n'}of Philosophy</Text>
      <Text style={styles.sub}>
        The world's most authoritative philosophy reference, always in your pocket.
      </Text>
    </View>
  );
}

function LibraryStep({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Build your library</Text>
      <Text style={styles.stepSub}>
        How would you like to access articles?
      </Text>

      <Option
        selected={!value}
        onPress={() => onChange(false)}
        title="As I read"
        description="Articles download the first time you open them and stay cached for offline reading."
        badge="Recommended"
      />
      <Option
        selected={value}
        onPress={() => onChange(true)}
        title="Download everything now"
        description="Fetch all ~1,800 articles upfront (~400 MB). Works fully offline from day one."
      />
    </View>
  );
}

function HomeStep({
  value,
  onChange,
}: {
  value: Prefs['homeMode'];
  onChange: (v: Prefs['homeMode']) => void;
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>When you open the app</Text>
      <Text style={styles.stepSub}>
        What should be waiting for you?
      </Text>

      <Option
        selected={value === 'search'}
        onPress={() => onChange('search')}
        title="Show search"
        description="Jump straight to finding an article."
      />
      <Option
        selected={value === 'continue'}
        onPress={() => onChange('continue')}
        title="Continue reading"
        description="Reopen the last article you were reading."
      />
    </View>
  );
}

function Option({
  selected,
  onPress,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.optionRadio}>
        {selected && <View style={styles.optionRadioFill} />}
      </View>
      <View style={styles.optionText}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
            {title}
          </Text>
          {badge && <Text style={styles.badge}>{badge}</Text>}
        </View>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
    justifyContent: 'center',
  },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#2a2a2a',
  },
  dotActive: { backgroundColor: '#7ba4ff' },

  content: { flex: 1, justifyContent: 'center' },

  stepWrap: { gap: 8 },

  // Welcome
  logo: {
    color: '#7ba4ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#e8e8e8',
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 34,
    marginBottom: 16,
  },
  sub: {
    color: '#666',
    fontSize: 16,
    lineHeight: 24,
  },

  // Steps
  stepTitle: {
    color: '#e8e8e8',
    fontSize: 22,
    fontWeight: '500',
    marginBottom: 6,
  },
  stepSub: {
    color: '#666',
    fontSize: 15,
    marginBottom: 24,
  },

  // Options
  option: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
    backgroundColor: '#171717',
  },
  optionSelected: {
    borderColor: '#7ba4ff',
    backgroundColor: '#131a2e',
  },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#444',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  optionRadioFill: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#7ba4ff',
  },
  optionText: { flex: 1 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  optionTitle: { color: '#888', fontSize: 15, fontWeight: '500' },
  optionTitleSelected: { color: '#e8e8e8' },
  optionDesc: { color: '#555', fontSize: 13, lineHeight: 18 },
  badge: {
    color: '#7ba4ff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    backgroundColor: '#131a2e',
    borderWidth: 1,
    borderColor: '#7ba4ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  // CTA
  cta: {
    backgroundColor: '#7ba4ff',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#0a0f1e',
    fontSize: 16,
    fontWeight: '700',
  },
});
