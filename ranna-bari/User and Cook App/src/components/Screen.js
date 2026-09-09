import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, usePathname } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import FilmGrain from './FilmGrain';
import Navbar, { useNavbarOffset } from './Navbar';
import BackButton, { fallbackFor } from './BackButton';
import AppFooter, { useInTabGroup, shouldDrawAppFooter } from './AppFooter';
import { useSession } from '../store/SessionContext';
import { isSignedIn } from '../lib/access';
import { STRIP_HEIGHT, useLiveOrder } from './LiveOrderStrip';
import { BAR_HEIGHT, NavOffsetContext } from './NavPill';
import { AmbientGlow, KineticBackground } from './Backdrop';
import { useTheme } from '../theme/ThemeProvider';
import { useCommerce } from '../store/CommerceContext';
import useLiveRefresh from '../lib/useLiveRefresh';
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
  /**
   * What a pull-down and the live timer should re-read. Defaults to the
   * app-wide refresh, so a screen gets both for free; pass one to narrow it
   * to this screen's own data, or `null` to opt out entirely.
   */
  onRefresh,
  /** Set false on a screen where a background re-read would fight the user. */
  live = true,
  /**
   * The bottom navigation. Drawn on every screen the tab navigator does not
   * already own; pass false where the page is a takeover (checkout, auth).
   */
  nav = true,
  /** The back affordance. `false` to suppress, or a route to fall back to. */
  back,
  ...scrollProps
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = useNavbarOffset();
  const pathname = usePathname();
  const commerce = useCommerce();

  /*
   * The bar is the tab navigator's job on its own seven routes, and this
   * component's job everywhere else. Deciding by pathname rather than by a
   * prop is what keeps 52 call sites from having to know which they are.
   */
  const inTabGroup = useInTabGroup();
  const onTab = inTabGroup;
  const session = useSession();
  const signedIn = isSignedIn(session);
  /* Not merely "is this a tab" — a cook screen built on this shell must not
     be handed the customer's bar either, and a guest gets no bar at all. */
  const showNav = nav && signedIn && shouldDrawAppFooter(pathname, inTabGroup);

  /*
   * Whether anything is actually floating at the foot of this screen.
   *
   * On a tab route the navigator draws the bar, and it too is hidden from a
   * guest — so the clearance has to follow the same rule or a signed-out page
   * ends in 110px of nothing.
   */
  const barPresent = onTab ? signedIn : showNav;
  const bottomClearance = barPresent ? APP_BAR_CLEARANCE : 32;

  /*
   * Room for the live-order strip.
   *
   * It is absolutely positioned above the bar, so it reserves no layout space
   * and simply covers whatever the page ends with — which on Profile is the
   * Log out button, sitting under it and unreachable. The strip is drawn by
   * the tab navigator, so it is only ever over a tab route.
   */
  /* `liveOrder`, not `live` — `live` is already this component's
     auto-refresh switch, and the two mean entirely different things. */
  const { live: liveOrder } = useLiveOrder();
  const stripRoom = onTab && liveOrder ? STRIP_HEIGHT : 0;

  /* A tab root is the bottom of its own stack, so there is nothing to go back
     to and an arrow there reads as a bug. */
  const showBack = back !== false && !onTab;

  const { refreshing, onRefresh: pull } = useLiveRefresh(
    onRefresh === null ? null : (onRefresh ?? commerce.refresh),
    { enabled: live },
  );

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
    <NavOffsetContext.Provider value={showNav ? BAR_HEIGHT : 0}>
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {body}

      <Animated.View testID="screen-content" style={[{ flex: 1 }, entering]}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            /*
             * Pull-to-refresh, on every scrolling screen at once.
             *
             * Placed before the `scrollProps` spread on purpose: a screen that
             * already builds its own `refreshControl` — the chat list does —
             * keeps it, because its spread lands after this and wins.
             */
            refreshControl={
              pull ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={pull}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  progressBackgroundColor={colors.surfaceSolid}
                  /* Clear of the floating navbar, or the spinner appears
                     underneath it and looks like nothing happened. */
                  progressViewOffset={showNavbar ? topOffset - 24 : insets.top}
                />
              ) : undefined
            }
            contentContainerStyle={[
              {
                paddingTop: showNavbar ? topOffset : insets.top + 16,
                /* The bar floats over the content, so the clearance is what
                   keeps the last row reachable. A screen with its own footer
                   *and* the nav needs room for both. */
                paddingBottom:
                  bottomClearance +
                  insets.bottom +
                  (showNav && footer ? BAR_HEIGHT : 0) +
                  stripRoom,
              },
              contentStyle,
            ]}
            {...scrollProps}
          >
            {showBack ? (
              <Container style={{ marginBottom: 12 }}>
                <BackButton href={fallbackFor(pathname)} />
              </Container>
            ) : null}
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {showBack ? (
              <Container style={{ paddingTop: topOffset, paddingBottom: 12 }}>
                <BackButton href={fallbackFor(pathname)} />
              </Container>
            ) : null}
            {children}
          </View>
        )}
      </Animated.View>

      {/* Left exactly where it was. A footer may be a flow-laid button bar or
          an absolutely positioned strip, and wrapping it would break the
          first kind; the ones that float clear the navigation by reading
          `useNavOffset` instead. */}
      {footer}

      {showNav ? <AppFooter /> : null}

      <FilmGrain />
      {showNavbar ? <Navbar /> : null}
    </View>
    </NavOffsetContext.Provider>
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
