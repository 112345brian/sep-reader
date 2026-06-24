import React from 'react';
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { SEP_BASE_FONT, SEP_COLORS } from './theme';

// An equation rendered to SVG on this device (mathStore.resolveMath), cached in
// memory and in the local `math` table. Never a bundled/build-time asset.
export interface ResolvedMath {
  svg: string; // self-contained <svg> with fill="currentColor"
  w: number; // width in ex units (MathJax)
  h: number; // height in ex units
}

// Resolve a math node's TeX to its SVG. Backed by mathStore: a cache hit returns
// instantly; a miss renders on-device (synchronously) and caches. Returns null
// only when the equation can't be rendered (e.g. the engine is unavailable in
// this runtime, or an un-renderable equation), in which case we show raw TeX.
export type MathResolver = (tex: string, display: boolean) => ResolvedMath | null;

// MathJax sized our SVGs with ex:8 against em:16. The reader runs at 17px, so
// scale ex->px proportionally: 1ex ≈ fontSize/2.
const PX_PER_EX = SEP_BASE_FONT / 2;

// react-native-svg honors `color` for `currentColor` fills, so the equation
// inherits the reader's text color and any future theme.
function svgWithColor(svg: string): string {
  return svg;
}

interface Props {
  tex: string;
  display: boolean;
  resolve: MathResolver;
  color?: string;
}

export function MathSvg({ tex, display, resolve, color = SEP_COLORS.text }: Props) {
  const r = resolve(tex, display);

  // Fallback: no stored SVG (live fetch or an un-renderable equation such as the
  // `€10` currency-in-math-mode cases). Show the raw TeX as monospace text —
  // for those cases that reads correctly.
  if (!r) {
    return (
      <Text style={{ fontFamily: 'monospace', color, fontSize: SEP_BASE_FONT * 0.95 }}>
        {tex}
      </Text>
    );
  }

  const width = Math.max(1, Math.round(r.w * PX_PER_EX));
  const height = Math.max(1, Math.round(r.h * PX_PER_EX));

  if (display) {
    return (
      <View style={{ alignItems: 'center', width: '100%', marginVertical: 14 }}>
        <SvgXml xml={svgWithColor(r.svg)} width={width} height={height} color={color} />
      </View>
    );
  }

  // Inline: nudge the glyph onto the text baseline. MathJax encodes the depth in
  // the SVG's vertical-align; we approximate with a small downward shift.
  return (
    <SvgXml
      xml={svgWithColor(r.svg)}
      width={width}
      height={height}
      color={color}
      style={{ transform: [{ translateY: Math.round(height * 0.18) }] }}
    />
  );
}
