// Native type scale mirroring readerCss.ts so the native renderer matches the
// WebView pixel-for-pixel. Base font 17px, line-height 1.8 (≈30.6px).
import type { TextStyle, ViewStyle } from 'react-native';

export const SEP_COLORS = {
  bg: '#111111',
  bgRaised: '#1c1c1c',
  border: '#2a2a2a',
  borderMid: '#333',
  text: '#d0d0d0',
  textBright: '#e4e4e4',
  textMuted: '#888',
  accent: '#5b8ef5',
  accentHi: '#87adf8',
};

const SERIF = 'Georgia';
const BASE = 17;
export const SEP_BASE_FONT = BASE;
export const SEP_LINE_HEIGHT = BASE * 1.8;
export const SEP_SIDE_PAD = 20;
export const SEP_PARA_GAP = Math.round(BASE * 1.6); // margin-bottom: 1.6em

export const sepText = {
  body: {
    fontSize: BASE,
    lineHeight: SEP_LINE_HEIGHT,
    color: SEP_COLORS.text,
  } as TextStyle,
  h1: {
    fontFamily: SERIF,
    fontSize: Math.round(BASE * 1.85),
    fontWeight: '700',
    letterSpacing: -0.6,
    color: SEP_COLORS.textBright,
    lineHeight: Math.round(BASE * 1.85 * 1.3),
  } as TextStyle,
  h2: {
    fontFamily: SERIF,
    fontSize: Math.round(BASE * 1.3),
    fontWeight: '600',
    color: SEP_COLORS.textBright,
    lineHeight: Math.round(BASE * 1.3 * 1.3),
  } as TextStyle,
  h3: {
    fontSize: Math.round(BASE * 1.05),
    fontWeight: '600',
    letterSpacing: -0.2,
    color: SEP_COLORS.textBright,
    lineHeight: Math.round(BASE * 1.05 * 1.3),
  } as TextStyle,
  h4: {
    fontSize: Math.round(BASE * 0.95),
    fontWeight: '600',
    color: SEP_COLORS.textBright,
    lineHeight: Math.round(BASE * 0.95 * 1.3),
  } as TextStyle,
};

// Muted, slightly-smaller text for blockquotes and the preamble — mirrors
// readerCss `blockquote { font-size: 0.97rem; color: muted }` and `#preamble`.
export const sepMutedText = {
  fontSize: Math.round(BASE * 0.97),
  color: SEP_COLORS.textMuted,
} as TextStyle;

// Article header chrome (title / breadcrumb / preamble), translated from the
// WebView's h1.pagetitle, .entry-breadcrumb, and #preamble rules.
export const sepHeader = {
  wrap: { marginBottom: 0 } as ViewStyle,
  breadcrumb: {
    alignSelf: 'flex-start',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    color: SEP_COLORS.accent,
    backgroundColor: 'rgba(91, 142, 245, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(91, 142, 245, 0.30)',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 9,
    overflow: 'hidden',
    marginBottom: 10,
  } as TextStyle,
  title: {
    fontFamily: SERIF,
    fontSize: Math.round(BASE * 1.85),
    fontWeight: '700',
    letterSpacing: -0.6,
    color: SEP_COLORS.textBright,
    lineHeight: Math.round(BASE * 1.85 * 1.2),
    marginBottom: 10,
  } as TextStyle,
  preamble: {
    paddingBottom: 8,
  } as ViewStyle,
  preambleText: {
    fontSize: Math.round(BASE * 0.9),
    lineHeight: Math.round(BASE * 0.9 * 1.55),
    color: SEP_COLORS.textMuted,
  } as TextStyle,
};

// Block spacing (margins) — translated from rem to px against the 17px base.
export const sepBlock = {
  h2Margin: { marginTop: 40, marginBottom: 13, paddingTop: 30, borderTopWidth: 1, borderTopColor: '#252525' } as ViewStyle,
  h3Margin: { marginTop: 26, marginBottom: 10 } as ViewStyle,
  h4Margin: { marginTop: 17, marginBottom: 8 } as ViewStyle,
  paraGap: { marginBottom: SEP_PARA_GAP } as ViewStyle,
  blockquote: {
    marginVertical: 30,
    paddingVertical: 17,
    paddingLeft: 24,
    paddingRight: 19,
    borderLeftWidth: 3,
    borderLeftColor: SEP_COLORS.borderMid,
    backgroundColor: SEP_COLORS.bgRaised,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  } as ViewStyle,
  listIndent: 28, // padding-left: 1.75rem
  liGap: 6, // li margin 0.35em
  // Bibliography entries — muted, smaller, separated (readerCss .bib li). A true
  // CSS hanging indent isn't expressible in RN Text, so each reference is a
  // flush, spaced block instead.
  bibItem: { marginBottom: 12 } as ViewStyle,
  bibText: {
    fontSize: Math.round(BASE * 0.94),
    lineHeight: Math.round(BASE * 0.94 * 1.6),
    color: SEP_COLORS.textMuted,
  } as TextStyle,
};
