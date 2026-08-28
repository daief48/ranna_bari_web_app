import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * `.reveal-item` / `.delay-1..5`
 *
 * The web build drives this from an IntersectionObserver. On a phone the
 * viewport is short enough that a mount-staggered entrance reads the same,
 * and it avoids threading scroll offsets through every card. Curve and
 * distance are the CSS values: 0.8s cubic-bezier(0.16, 1, 0.3, 1), 30px up.
 *
 * `variant` mirrors .reveal-left / .reveal-right / .reveal-scale.
 */
export default function Reveal({
  delay = 1,
  variant = 'up',
  style,
  children,
  ...rest
}) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      // @media (prefers-reduced-motion: reduce) forces opacity:1, no transform
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay * 100,
      withTiming(1, {
        duration: 800,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    );
  }, [delay, progress, reduced]);

  const animated = useAnimatedStyle(() => {
    const p = progress.value;
    const transform = [];
    if (variant === 'up') transform.push({ translateY: 30 * (1 - p) });
    if (variant === 'left') transform.push({ translateX: -40 * (1 - p) });
    if (variant === 'right') transform.push({ translateX: 40 * (1 - p) });
    if (variant === 'scale') transform.push({ scale: 0.9 + 0.1 * p });
    return { opacity: p, transform };
  });

  return (
    <Animated.View style={[style, animated]} {...rest}>
      {children}
    </Animated.View>
  );
}
