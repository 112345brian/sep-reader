import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_ACCENT } from '../utils/sepHtml/render/theme';

interface Props {
  progress: { done: number; total: number } | null;
  minimized: boolean;
  onMinimize: () => void;
}

export default function DownloadBar({ progress, minimized, onMinimize }: Props) {
  const { top, bottom } = useSafeAreaInsets();
  const pct = progress ? (progress.done / progress.total) * 100 : 0;
  const label = progress ? `${progress.done} / ${progress.total}` : '';

  if (minimized) {
    return (
      <View style={[s.mini, { bottom: bottom || 8 }]}>
        <View style={s.miniTrack}>
          <View style={[s.miniFill, { width: `${pct}%` as any }]} />
        </View>
        <Text style={s.miniLabel}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, s.full]}>
      <TouchableOpacity
        style={[s.minimizeBtn, { top: top + 12 }]}
        onPress={onMinimize}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.5}
      >
        <Text style={s.chevron}>⌄</Text>
      </TouchableOpacity>
      <View style={s.center}>
        <Text style={s.logo}>Nous</Text>
        <Text style={s.subtitle}>Downloading articles</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct}%` as any }]} />
        </View>
        <Text style={s.countLabel}>{label}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  full: {
    backgroundColor: '#111',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizeBtn: {
    position: 'absolute',
    right: 20,
    padding: 4,
  },
  chevron: {
    color: '#555',
    fontSize: 26,
    lineHeight: 26,
  },
  center: {
    width: '100%',
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    color: APP_ACCENT,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 6,
    marginBottom: 8,
  },
  subtitle: {
    color: '#555',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  track: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: APP_ACCENT,
  },
  countLabel: {
    color: '#444',
    fontSize: 13,
  },

  // Minimized bottom bar
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#151515',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    zIndex: 40,
  },
  miniTrack: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: APP_ACCENT,
  },
  miniLabel: {
    color: '#444',
    fontSize: 12,
    minWidth: 72,
    textAlign: 'right',
  },
});
