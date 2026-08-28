import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  Rect,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * `.kinetic-bg` — two soft radial washes over the canvas.
 *
 *   radial-gradient(90% 60% at 12% 0%,  primary-50 0%, transparent 60%)
 *   radial-gradient(80% 55% at 88% 22%, saffron-50 0%, transparent 58%)
 *
 * The MODERN REFRESH LAYER killed the original 15s gradientFlow animation
 * (`animation: none`), so this is deliberately static.
 */
export function KineticBackground() {
  const { colors, isDark } = useTheme();

  // Dark mode overrides the tints to rgba() values rather than the -50 ramp.
  const primaryWash = isDark ? `rgba(${colors.rgbPrimary}, 0.10)` : colors.primary50;
  const saffronWash = isDark ? `rgba(${colors.rgbSaffron}, 0.07)` : colors.saffron50;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgRadialGradient id="wash1" cx="12%" cy="0%" rx="90%" ry="60%">
            <Stop offset="0" stopColor={primaryWash} stopOpacity="1" />
            <Stop offset="0.6" stopColor={primaryWash} stopOpacity="0" />
          </SvgRadialGradient>
          <SvgRadialGradient id="wash2" cx="88%" cy="22%" rx="80%" ry="55%">
            <Stop offset="0" stopColor={saffronWash} stopOpacity="1" />
            <Stop offset="0.58" stopColor={saffronWash} stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wash1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wash2)" />
      </Svg>
    </View>
  );
}

/**
 * `.ambient-glow` — a 260px blurred blob, shrunk and pulled inside the
 * horizontal bounds at the phone breakpoint. Rendered as concentric
 * translucent circles because React Native has no blur filter on views.
 */
export function AmbientGlow({ position = 'top-right', color, size = 260 }) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;

  const place =
    position === 'top-right'
      ? { top: -110, right: 0 }
      : { bottom: -110, left: 0 };

  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, place]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgRadialGradient id={`glow-${position}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity="0.16" />
            <Stop offset="0.7" stopColor={tint} stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width={size}
          height={size}
          fill={`url(#glow-${position})`}
        />
      </Svg>
    </View>
  );
}
