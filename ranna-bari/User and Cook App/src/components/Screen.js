import React, { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import FilmGrain from './FilmGrain';
import Navbar, { useNavbarOffset } from './Navbar';
import { AmbientGlow, KineticBackground } from './Backdrop';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';

/** Clearance the floating app bar needs at the foot of a scroll. */
export const APP_BAR_CLEARANCE = 110;

/**
 * The page shell every screen sits in: kinetic wash, ambient glows, film
 * grain, the floating navbar, and a scroll view padded clear of both bars.
 *
 * `.footer { padding: 40px 0 120px }` on phones is why the bottom padding is
 * so generous -- the app bar floats over the content rather than reserving
 * layout space.
 */
export default function Screen({
  children,
  showNavbar = true,
  scroll = true,
  glow = 'top-right',
  contentStyle,
  scrollRef,
  /** Rendered over the scroll, not inside it -- for a bar that must stay put. */
  footer,
  ...scrollProps
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = useNavbarOffset();

  /*
   * A page should arrive, not blink into place.
   *
   * Moving between tabs used to be an instant cut, and the thing papering
   * over it was the loading screen — a 420ms full-screen takeover on every
   * navigation, which is not a transition, it is an interruption. That is
   * gone; this is what replaces it.
   *
   * expo-router 57's tabs mount a screen afresh every time it is opened, so
   * focus and mount are the same moment here — worth knowing, because an
   * earlier attempt guarded against animating on the first focus and
   * therefore never animated at all. `Reveal` still staggers the items
   * inside; this brings the page they sit on.
   *
   * Only the content moves. The wash, the grain and the floating bars are
   * the frame the page sits in; sliding those would make the whole app
   * twitch.
   */
  /* Starts hidden, so the first frame is the beginning of the entrance
     rather than a fully drawn page that then moves. */
  const enter = useSharedValue(0);
  const reduced = useReducedMotion();

  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        enter.value = 1;
        return;
      }
      enter.value = 0;
      /* Same curve as Reveal — 0.16, 1, 0.3, 1 — but a third of the length.
         This one sits between a tap and the answer, so it has to be quick. */
      enter.value = withTiming(1, {
        duration: 260,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
    }, [enter, reduced]),
  );

  const entering = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }],
  }));

  const body = (
    <>
      <KineticBackground />
      {glow === 'top-right' || glow === 'both' ? (
        <AmbientGlow position="top-right" color={colors.primary} />
      ) : null}
      {glow === 'bottom-left' || glow === 'both' ? (
        <AmbientGlow position="bottom-left" color={colors.saffron} />
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {body}

      <Animated.View testID="screen-content" style={[{ flex: 1 }, entering]}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              {
                paddingTop: showNavbar ? topOffset : insets.top + 16,
                paddingBottom: APP_BAR_CLEARANCE + insets.bottom,
              },
              contentStyle,
            ]}
            {...scrollProps}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </Animated.View>

      {footer}

      <FilmGrain />
      {showNavbar ? <Navbar /> : null}
    </View>
  );
}

/** `.container` — 16px of page gutter, 14px on a small phone. */
export function Container({ style, children, ...rest }) {
  const r = useResponsive();
  return (
    <View style={[{ paddingHorizontal: r.gutter }, style]} {...rest}>
      {children}
    </View>
  );
}
