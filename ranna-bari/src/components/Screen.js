import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
