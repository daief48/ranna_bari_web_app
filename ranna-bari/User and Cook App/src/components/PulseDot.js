import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * `.pulse-dot` — the refresh layer re-points it from vermilion to wasabi and
 * expands the ring to 9px over 2s. The web version rides box-shadow spread,
 * which has no React Native equivalent, so the ring is a real sibling view
 * that scales and fades.
 */
export default function PulseDot({ size = 8 }) {
  const { colors } = useTheme();
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [t, reduced]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - t.value),
    transform: [{ scale: 1 + (9 / (size / 2)) * t.value * 0.5 }],
  }));

  const dot = useAnimatedStyle(() => ({
    // 0% and 100% sit at scale(0.92); 70% reaches 1.
    transform: [{ scale: 0.92 + 0.08 * Math.min(t.value / 0.7, 1) }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.sage,
          },
          ring,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.sage,
          },
          dot,
        ]}
      />
    </View>
  );
}
