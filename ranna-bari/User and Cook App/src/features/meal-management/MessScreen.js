import React, { useCallback } from 'react';
import { RefreshControl, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Icon from '../../components/Icon';
import FilmGrain from '../../components/FilmGrain';
import LanguageSwitch from '../../components/LanguageSwitch';
import { AmbientGlow, KineticBackground } from '../../components/Backdrop';
import { NAVBAR_HEIGHT, NAVBAR_TOP } from '../../components/Navbar';
import { APP_BAR_CLEARANCE, Container as PageContainer } from '../../components/Screen';
import BackButton from '../../components/BackButton';
import { BAR_HEIGHT, NavOffsetContext } from '../../components/NavPill';
import useLiveRefresh from '../../lib/useLiveRefresh';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../store/AuthContext';
import { useLang } from '../../i18n/LanguageContext';
import { font, radius } from '../../theme/tokens';

import { MessMark, BottomNav, PRIMARY_NAV } from './components';
import { useMealManagement, useSlice } from './store';
import { markLeft } from './visit';

/**
 * The mess world's own page shell.
 *
 * The app already keeps two of these — `Screen` for the shop and `CookScreen`
 * for the kitchen — and the pattern is the point: a world gets its own shell,
 * its own bar and its own colour, and the door between them always names
 * where it goes rather than where you are.
 *
 * This is the third. Vermilion is the shop and sage is the kitchen, so the
 * mess is **saffron** — the one full ramp in the palette no world had claimed.
 *
 * It lives in the feature folder rather than in `src/components` on purpose.
 * `CookScreen` is the app's, because the kitchen is half of what the app is;
 * this is a guest's, and putting it in the shared folder would make the
 * feature look like part of the design system when it is a visitor inside it.
 */

/* ------------------------------------------------------------------ *
 * the door out
 * ------------------------------------------------------------------ */

/**
 * Where leaving the mess goes.
 *
 * Follows `ModeSwitch`'s rule exactly: name the destination, never the
 * current state. A cook who came in from their kitchen goes back to the
 * kitchen; everybody else goes back to the shop. The mess is a *place*, not a
 * mode, so this navigates without touching `viewMode` — walking out of a room
 * should not change who you are.
 */
function exitTarget(isCookMode, colors) {
  return isCookMode
    ? {
        label: 'Kitchen',
        title: 'Back to your kitchen',
        sub: 'Orders, menu and earnings',
        icon: 'chefHat',
        fg: colors.sage,
        bg: colors.sage50,
        edge: colors.sage100,
        href: '/cook',
      }
    : {
        label: 'Eat',
        title: 'Back to eating',
        sub: 'Browse kitchens and order dinner',
        icon: 'utensils',
        fg: colors.primary,
        bg: colors.primary50,
        edge: colors.primary100,
        href: '/',
      };
}

/** The pill in the bar — the way out of the mess from any screen. */
export function MessExit({ compact = false, style }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { isCookMode } = useAuth();
  const { t } = useLang();

  const to = exitTarget(isCookMode, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(to.title)}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        /* Leaving on purpose clears the resume flag, so Profile does not then
           offer to bring you back to somewhere you just chose to leave. */
        markLeft();
        /* `replace`, not `push`. The mess is a world you step out of, and a
           back gesture that walks straight back into it makes leaving feel
           like it did not take. */
        router.replace(to.href);
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 0 : 5,
          height: 36,
          paddingHorizontal: compact ? 0 : 9,
          width: compact ? 36 : undefined,
          justifyContent: 'center',
          borderRadius: compact ? 12 : radius.pill,
          backgroundColor: to.bg,
          borderWidth: 1,
          borderColor: pressed ? to.fg : to.edge,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        shadow.xs,
        style,
      ]}
    >
      <Icon name={to.icon} size={17} color={to.fg} strokeWidth={2} />
      {compact ? null : (
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 9.5,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: to.fg,
          }}
        >
          {t(to.label)}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The same door as a full-width row, for the foot of the More screen where
 * there is room to say what the other side actually is.
 */
export function MessExitRow({ style }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { isCookMode } = useAuth();
  const { t } = useLang();

  const to = exitTarget(isCookMode, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(to.title)}. ${t(to.sub)}`}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        markLeft();
        router.replace(to.href);
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: to.bg,
          borderWidth: 1,
          borderColor: pressed ? to.fg : to.edge,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.sm,
        style,
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: to.edge,
        }}
      >
        <Icon name={to.icon} size={22} color={to.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.displayBold,
            fontSize: 17,
            letterSpacing: -0.17,
            color: colors.text,
          }}
        >
          {t(to.title)}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: font.ui, fontSize: 14, color: colors.textMuted }}>
          {t(to.sub)}
        </Text>
      </View>

      <Icon name="arrowRight" size={17} color={to.fg} strokeWidth={2} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * the bar
 * ------------------------------------------------------------------ */

/**
 * The mess world's top bar.
 *
 * Same height, same offset, same blur and same hairline as the other two
 * bars, so the three worlds sit on one piece of furniture. What changes is
 * what it carries: the mess's own name instead of the wordmark, the mess's
 * own inbox instead of the app's, and a door that leads out rather than in.
 *
 * The name truncates before any control does, for the reason the customer
 * navbar gives: a control you cannot reach is a broken app, a clipped name is
 * merely a clipped name.
 */
export function MessNavbar() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, n } = useLang();

  const { mess } = useMealManagement();
  const notifications = useSlice('notifications');
  const unread = notifications.data?.unread ?? 0;

  return (
    <View
      style={[
        {
          position: 'absolute',
          top: insets.top + NAVBAR_TOP,
          left: 10,
          right: 10,
          height: NAVBAR_HEIGHT,
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.line,
          zIndex: 100,
        },
        shadow.sm,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 40 : 26}
        tint={isDark ? 'dark' : 'light'}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            gap: 8,
            backgroundColor: colors.glass,
          }}
        >
          {/* The mess, and the way to its front page. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('{name} — meal management', { name: mess?.name ?? '' })}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.replace('/meal-management');
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              flexShrink: 1,
              minWidth: 0,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <MessMark />

            {mess?.name ? (
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 16,
                    letterSpacing: -0.3,
                    color: colors.text,
                  }}
                >
                  {mess.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 8.5,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: colors.saffron,
                  }}
                >
                  {t('Meal management')}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* The way out, reachable from every mess screen. */}
            <MessExit />
            <LanguageSwitch />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unread ? t('{n} unread mess notifications', { n: n(unread) }) : t('Mess notifications')
              }
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push('/meal-management/notifications');
              }}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.saffron50 : 'transparent',
              })}
            >
              <Icon name="bell" size={18} color={colors.text} />
              {unread > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.saffron,
                    borderWidth: 1.5,
                    borderColor: colors.canvas,
                  }}
                >
                  <Text
                    style={{ fontFamily: font.uiBold, fontSize: 9, lineHeight: 11, color: '#FFFFFF' }}
                  >
                    {unread > 99 ? '99+' : n(unread)}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={toggle}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.saffron50 : 'transparent',
              })}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={19} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the shell
 * ------------------------------------------------------------------ */

/**
 * Every mess screen sits in this.
 *
 * Built from the customer `Screen` rather than from `CookScreen`, because
 * that one carries two things the mess needs and the kitchen never grew: the
 * `footer` slot, which is where the mess's own tab bar goes, and the arrival
 * animation, so a page lands rather than blinks.
 *
 * The glows are the world's signature. Saffron leads; the kitchen's sage sits
 * underneath it, faintly, because a mess is a kitchen's books.
 */
export default function MessScreen({
  children,
  showNavbar = true,
  scroll = true,
  glow = 'both',
  contentStyle,
  scrollRef,
  /** Rendered over the scroll, not inside it — for a bar that must stay put. */
  footer,
  /** What a pull-down and the live timer re-read. `null` opts out. */
  onRefresh,
  live = true,
  /**
   * The mess's own bar. It existed all along and only five of the thirty
   * screens passed it, so the other twenty-five were dead ends; drawing it
   * here is what makes it the shell's job rather than each page's.
   */
  nav = true,
  /** Badge counts for the bar, forwarded to `BottomNav`. */
  navBadges,
  /** The back affordance. `false` to suppress. */
  back,
  ...scrollProps
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 24;
  const pathname = usePathname();

  /*
   * Which of the five sections this screen belongs to.
   *
   * Longest href first, so `/meal-management/meals` is matched before the
   * dashboard's bare `/meal-management` — every route starts with the
   * dashboard's, and shortest-first would light the wrong lamp on all of
   * them.
   */
  const current = String(pathname ?? '').replace(/\/+$/, '') || '/';
  const section = [...PRIMARY_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => current === item.href || current.startsWith(item.href + '/'));

  /* A screen already passing its own footer keeps it — the five that pass a
     `BottomNav` are the ones this is replacing, and doubling the bar would be
     worse than the gap it fixes. */
  const showNav = nav && !footer;
  /* The five section roots are where their section begins; the arrow belongs
     on everything under them. */
  const isRoot = !!section && current === section.href;
  const showBack = back !== false && !isRoot;

  const { refreshing, onRefresh: pull } = useLiveRefresh(
    onRefresh === null ? null : onRefresh,
    { enabled: live },
  );

  const enter = useSharedValue(0);
  const reduced = useReducedMotion();

  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        enter.value = 1;
        return;
      }
      enter.value = 0;
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

  return (
    <NavOffsetContext.Provider value={showNav || footer ? BAR_HEIGHT : 0}>
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KineticBackground />
      {glow === 'top-right' || glow === 'both' ? (
        <AmbientGlow position="top-right" color={colors.saffron} />
      ) : null}
      {glow === 'bottom-left' || glow === 'both' ? (
        <AmbientGlow position="bottom-left" color={colors.sage} />
      ) : null}

      <Animated.View testID="mess-screen-content" style={[{ flex: 1 }, entering]}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            /* Before the spread, so a screen with its own control keeps it. */
            refreshControl={
              pull ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={pull}
                  tintColor={colors.saffron}
                  colors={[colors.saffron]}
                  progressBackgroundColor={colors.surfaceSolid}
                  progressViewOffset={showNavbar ? topOffset - 24 : insets.top}
                />
              ) : undefined
            }
            contentContainerStyle={[
              {
                paddingTop: showNavbar ? topOffset : insets.top + 16,
                paddingBottom: APP_BAR_CLEARANCE + insets.bottom,
              },
              contentStyle,
            ]}
            {...scrollProps}
          >
            {showBack ? (
              <PageContainer style={{ marginBottom: 12 }}>
                <BackButton href={section ? section.href : '/meal-management'} />
              </PageContainer>
            ) : null}
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </Animated.View>

      {footer}
      {showNav ? (
        <BottomNav active={section ? section.key : undefined} badges={navBadges ?? {}} />
      ) : null}

      <FilmGrain />
      {showNavbar ? <MessNavbar /> : null}
    </View>
    </NavOffsetContext.Provider>
  );
}

/** `.container` — 16px of page gutter, 14px on a small phone. */
export { Container } from '../../components/Screen';

/**
 * How much room the bar needs at the top.
 *
 * `MessScreen` applies this to its own scroll's padding, which a screen using
 * `scroll={false}` never gets — the room lays out its own list and has to
 * clear the bar itself.
 */
export function useMessTopOffset() {
  const insets = useSafeAreaInsets();
  return insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 16;
}
