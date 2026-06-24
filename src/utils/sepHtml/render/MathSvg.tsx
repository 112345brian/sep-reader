import React from 'react';
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { SEP_BASE_FONT, SEP_COLORS } from './theme';

// A pre-rendered equation from the build-time math store (scripts/buildMathSvg).
export interface ResolvedMath {
  svg: string; // self-contained <svg> with fill="currentColor"
  w: number; // width in ex units (MathJax)
  h: number; // height in ex units
}

// Resolve a math node's TeX to its pre-rendered SVG. Supplied by the screen,
// backed by the content DB's `math` table (hash -> svg). Returns null when the
// equation isn't in the store (e.g. live-fetched article, or a render error),
// in which case we fall back to showing the raw TeX.
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
