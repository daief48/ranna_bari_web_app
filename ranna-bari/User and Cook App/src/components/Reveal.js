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
 * distance are the CSS values -- cubic-bezier(0.16, 1, 0.3, 1), 30px up.
 *
 * The timing is not. The stylesheet runs 0.8s and staggers 100ms a step,
 * which on a page of five groups puts the last one on screen 1.3s after the
 * tap that asked for it. On the web that entrance is scroll-triggered and has
 * already happened by the time you look at it; here it sits between a button
 * and its answer, so it runs at about a third -- 340ms, 40ms a step.
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
      delay * 40,
      withTiming(1, {
        duration: 340,
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
