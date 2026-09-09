/**
 * The order you are waiting on, wherever you are in the app.
 *
 * "Where is my food" is the single most repeated thing anybody does in a
 * delivery app, and until now it was Profile → Your orders → the order: three
 * taps, from a screen that gave no hint an order was even in flight. The Cart
 * badge counts items in a basket, not orders on their way, so nothing on the
 * bar said anything was happening.
 *
 * So: one line above the tab bar whenever something is not yet finished,
 * carrying the kitchen, the state, and — for the customer — whether the ball
 * is in their court. It disappears the moment the last order settles, which is
 * why it is nothing at all when there is nothing to say.
 *
 * ## Why it is built the way it is
 *
 * This sits on top of the floating bar, so it has to belong to the same
 * family: the same 12px inset, the same blurred glass, the same radius. What
 * separates it is that the bar is furniture and this is *alive* — it is the
 * one element on screen whose meaning changes while you look at it.
 *
 * Three things carry that, and each is doing a job rather than decorating:
 *
 *   - **A progress rail** along the bottom edge. The strip used to name the
 *     step — "Order confirmed" — without saying where that fell between
 *     placed and eaten. A word tells you the state; the rail tells you how
 *     much is left, which is the actual question.
 *   - **A sweep of light** crossing the strip while the kitchen has the ball.
 *     Motion is the difference between "something is happening" and "this is
 *     a label", and it stops the moment the order is waiting on *you* —
 *     because then it is not progressing, it is asking.
 *   - **A breathing halo** on the icon when it is your turn, in saffron. The
 *     strip has exactly two moods and they should be legible without reading.
 *
 * All of it is skipped under `useReducedMotion`, where the strip falls back
 * to its static self and loses nothing but the animation.
 */
import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useAuth } from '../store/AuthContext';
import { useCommerce } from '../store/CommerceContext';
import {
  customerKeyOf,
  isFinished,
  awaitingReceipt,
  flowFor,
  stepIndexIn,
} from '../lib/ledger';
import { useLang } from '../i18n/LanguageContext';

/** Where an order of each kind opens. */
const HREF = {
  meal: (id) => `/meal-order/${id}`,
  store: (id) => `/store-order/${id}`,
  request: (id) => `/request-order/${id}`,
};

const hrefFor = (order) => (HREF[order.kind] ?? ((id) => `/order/${id}`))(order.id);

/**
 * What to call an order's current step.
 *
 * Straight off `flowFor`, so the strip and the tracker it opens never
 * disagree — and so a collection says "Collected" rather than promising a
 * delivery. The one word this adds is for `delivered`, where the tracker's
 * label states a fact and the strip has to ask for something: the money does
 * not move until the customer confirms it arrived.
 */
function stepLabel(order) {
  if (awaitingReceipt(order)) return 'Did it arrive?';

  const flow = flowFor(order.handover, { preorder: order.preorder });
  return flow.find((step) => step.key === order.status)?.label ?? order.status;
}

/** How far along the flow this order is, as 0..1, and the step's own icon. */
function progressOf(order) {
  const flow = flowFor(order.handover, { preorder: order.preorder });
  const at = stepIndexIn(flow, order.status);
  const last = Math.max(1, flow.length - 1);
  return {
    /* Never a bare zero: a rail with nothing in it reads as "not started"
       when the order has in fact been placed and paid for. */
    fraction: at < 0 ? 0.08 : Math.max(0.08, at / last),
    icon: at >= 0 ? (flow[at]?.icon ?? 'pot') : 'pot',
    step: at < 0 ? 1 : at + 1,
    of: flow.length,
  };
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function LiveOrderStrip({ bottom = 0 }) {
  const { colors, shadow, isDark } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, isSignedIn } = useAuth();
  const { orders } = useCommerce();
  const reduced = useReducedMotion();

  const key = customerKeyOf(account);

  /*
   * The one worth showing, and how many others there are.
   *
   * An order waiting on the customer to confirm receipt outranks one still
   * being cooked: the first is a job for them, the second is a job for the
   * kitchen. Otherwise the most recent wins.
   */
  const { live, extra } = useMemo(() => {
    if (!isSignedIn) return { live: null, extra: 0 };

    const mine = (orders ?? []).filter(
      (o) => o.customerKey === key && !isFinished(o.status),
    );
    if (!mine.length) return { live: null, extra: 0 };

    const sorted = [...mine].sort((a, b) => {
      const aWaiting = awaitingReceipt(a) ? 1 : 0;
      const bWaiting = awaitingReceipt(b) ? 1 : 0;
      if (aWaiting !== bWaiting) return bWaiting - aWaiting;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });

    return { live: sorted[0], extra: sorted.length - 1 };
  }, [orders, key, isSignedIn]);

  const waiting = live ? awaitingReceipt(live) : false;
  const flow = live ? progressOf(live) : null;

  /* ---- the three motions ---- */

  const enter = useSharedValue(0);
  const rail = useSharedValue(0);
  const sweep = useSharedValue(0);
  const halo = useSharedValue(0);

  const status = live?.status ?? null;
  const fraction = flow?.fraction ?? 0;
  const present = !!live;

  /* Arrival. The strip appears mid-session, under content somebody is already
     reading, so it rises into place instead of blinking on. */
  useEffect(() => {
    if (!present) {
      enter.value = 0;
      return;
    }
    if (reduced) {
      enter.value = 1;
      return;
    }
    enter.value = withDelay(
      120,
      withTiming(1, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [present, enter, reduced]);

  /* The rail animates *to* the new fraction rather than being set, so a step
     advancing while you watch is itself the news. */
  useEffect(() => {
    if (!present) return;
    if (reduced) {
      rail.value = fraction;
      return;
    }
    rail.value = withTiming(fraction, {
      duration: 900,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [present, fraction, status, rail, reduced]);

  /* The sweep, only while the kitchen has the ball. */
  useEffect(() => {
    if (reduced || !present || waiting) {
      sweep.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [present, waiting, sweep, reduced]);

  /* The halo, only while you do. */
  useEffect(() => {
    if (reduced || !present || !waiting) {
      halo.value = 0;
      return;
    }
    halo.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [present, waiting, halo, reduced]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * 14 },
      { scale: 0.97 + enter.value * 0.03 },
    ],
  }));

  const railStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, rail.value)) * 100}%`,
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.15, 0.6, 1], [0, 0.9, 0.9, 0]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-160, 420]) }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + halo.value * 0.45,
    transform: [{ scale: 1 + halo.value * 0.35 }],
  }));

  if (!live) return null;

  const tone = waiting ? colors.saffron : colors.primary;
  const toneSoft = waiting ? colors.saffron50 : colors.primary50;
  const name = live.chefName ?? live.cookName ?? t('Your order');

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          /* Sits directly on top of the floating bar, sharing its inset. */
          bottom: bottom + insets.bottom,
          zIndex: 20,
        },
        enterStyle,
      ]}
    >
      <Pressable
        onPress={() => router.push(hrefFor(live))}
        accessibilityRole="link"
        accessibilityLabel={t('{name}, {state}. Open your order.', {
          name,
          state: t(stepLabel(live)),
        })}
        style={({ pressed }) => [
          {
            borderRadius: radius.pill,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: pressed ? tone : colors.line,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
          shadow.md,
        ]}
      >
        {/* The same glass the bar below is made of, so the two read as one
            stack rather than as a card sitting on a bar. */}
        <BlurView
          intensity={Platform.OS === 'android' ? 40 : 26}
          tint={isDark ? 'dark' : 'light'}
        >
          {/* A wash of the state's own colour, strongest at the leading edge
              where the icon is — it tints the strip without ever competing
              with the text sitting on it. */}
          <LinearGradient
            colors={[toneSoft, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: isDark
                ? `rgba(${colors.rgbRaised}, 0.82)`
                : 'rgba(250, 247, 240, 0.78)',
            }}
          />

          {/* The sweep. Behind the content and clipped by the pill, so it
              passes *under* the words rather than washing them out. */}
          {!waiting && !reduced ? (
            <AnimatedLinearGradient
              pointerEvents="none"
              colors={['transparent', toneSoft, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                { position: 'absolute', top: 0, bottom: 0, width: 130 },
                sweepStyle,
              ]}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 11,
              paddingVertical: 10,
              paddingHorizontal: 14,
            }}
          >
            <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
              {/* The halo is a sibling that scales and fades, rather than a
                  shadow — React Native has no animatable spread. */}
              {waiting && !reduced ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: 'absolute',
                      width: 30,
                      height: 30,
                      borderRadius: 11,
                      backgroundColor: tone,
                    },
                    haloStyle,
                  ]}
                />
              ) : null}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: toneSoft,
                  borderWidth: 1,
                  borderColor: waiting ? tone : 'transparent',
                }}
              >
                <Icon
                  name={waiting ? 'check' : flow.icon}
                  size={14}
                  color={tone}
                  strokeWidth={2}
                />
              </View>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: type.xs + 1,
                  color: colors.text,
                }}
              >
                {name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontFamily: font.uiSemi,
                    fontSize: type.xs,
                    color: tone,
                  }}
                >
                  {t(stepLabel(live))}
                </Text>
                {/* Where that step falls in the whole journey. The word alone
                    never said whether it was nearly there. */}
                {!waiting ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs - 1,
                      color: colors.textLight,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {`${n(flow.step)}/${n(flow.of)}`}
                  </Text>
                ) : null}
                {extra ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs - 1,
                      color: colors.textLight,
                    }}
                  >
                    {`· ${t('+{n} more', { n: n(extra) })}`}
                  </Text>
                ) : null}
              </View>
            </View>

            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: toneSoft,
              }}
            >
              <Icon name="chevronRight" size={13} color={tone} strokeWidth={2.2} />
            </View>
          </View>

          {/* The rail, on the pill's own bottom edge. Two pixels, full width,
              and the only thing on the strip that answers "how much longer". */}
          <View
            style={{
              height: 2,
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.07)'
                : 'rgba(31, 29, 26, 0.07)',
            }}
          >
            <Animated.View style={[{ height: 2, backgroundColor: tone }, railStyle]} />
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}
