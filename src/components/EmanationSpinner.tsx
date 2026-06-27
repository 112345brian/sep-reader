import React, { useEffect } from 'react';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle,
  withRepeat, withTiming, Easing, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Line } from 'react-native-svg';

// In-app loading indicator built from the app's own mark: a hand-drawn heptagon
// whose rays shoot outward in a continuous emanation. Not used for the boot
// screen — only for in-app loading (article fetch, graph build, search…).

const AnimatedLine = Animated.createAnimatedComponent(Line);

// Hand-drawn heptagon — rounded, wobbly, chunky marker stroke, matching the
// app icon (vertices as bulge points, edges curved through their midpoints).
const HEPT =
  'M168,152.5 Q190,138 210.5,146 Q231,154 237.5,175.5 Q244,197 234,216.5 ' +
  'Q224,236 200,240 Q176,244 159,229 Q142,214 144,190.5 Q146,167 168,152.5 Z';

// The icon's eight short sun-rays around the figure (x1,y1,x2,y2).
const STATIC_RAYS: number[][] = [
  [199, 125, 201, 109], [241, 148, 253, 137], [256, 193, 272, 194],
  [236, 238, 247, 249], [192, 256, 193, 272], [145, 238, 134, 250],
  [124, 192, 108, 193], [140, 147, 128, 136],
];

// Longer lines the emanation pulses travel along, just past each static ray.
const EM_RAYS: number[][] = [
  [201, 111, 211, 40], [251, 139, 306, 92], [270, 194, 342, 198],
  [246, 248, 296, 299], [193, 270, 195, 342], [135, 249, 86, 301],
  [110, 193, 38, 195], [130, 138, 75, 91],
];

const STROKE = 8.5;
const DASH = '15 280';
const TRAVEL = 96; // px the dash shoots before clearing the line

function EmRay({
  d, phase, progress, color,
}: {
  d: number[];
  phase: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const p = (progress.value + 1 - phase) % 1; // 0..1, phase-shifted around the ring
    const opacity = p < 0.13 ? p / 0.13 : p > 0.84 ? (1 - p) / 0.16 : 1;
    return { strokeDashoffset: -TRAVEL * p, opacity };
  });
  return (
    <AnimatedLine
      x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]}
      stroke={color} strokeWidth={STROKE} strokeLinecap="round"
      strokeDasharray={DASH}
      animatedProps={animatedProps}
    />
  );
}

export default function EmanationSpinner({
  size = 96,
  color = '#eef1f6',
}: {
  size?: number;
  color?: string;
}) {
  const progress = useSharedValue(0);
  const wob = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
    wob.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStyle = useAnimatedStyle(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: [
      { rotate: `${-1.5 + 3 * wob.value}deg` },
      { scale: 0.99 + 0.03 * wob.value },
    ] as any,
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, markStyle]}>
      <Svg width={size} height={size} viewBox="20 20 340 340">
        {EM_RAYS.map((d, i) => (
          <EmRay key={`e${i}`} d={d} phase={i / EM_RAYS.length} progress={progress} color={color} />
        ))}
        <Path d={HEPT} fill="none" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" strokeLinecap="round" />
        {STATIC_RAYS.map((d, i) => (
          <Line key={`s${i}`} x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
        ))}
      </Svg>
    </Animated.View>
  );
}
