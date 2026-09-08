import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Brand from '../../components/Brand';
import { useTheme } from '../../theme/ThemeProvider';
import { useLang } from '../../i18n/LanguageContext';
import { font } from '../../theme/tokens';

import { MessMark } from './components';

/**
 * The doorway into the mess.
 *
 * The app has three worlds now, and moving between the first two already
 * announces itself — the root stack fades rather than slides, because
 * "switching modes replaces the whole app". A fade is enough there because a
 * cook knows they have two halves.
 *
 * Nobody expects a third. So entering the mess gets a real threshold: the
 * RannaBari mark leaves, the mess mark arrives in its place, and one line
 * says what the room is for. It is a second and a bit, it is skippable with a
 * tap, and it happens every time — the point is not to explain the feature
 * once, it is to make crossing over feel like crossing over.
 *
 * Reduced motion skips it entirely. Somebody who has asked the system for
 * less movement has not asked for a shorter version of this.
 */

/** How long the whole thing runs, including the fade out. */
const DURATION = 1250;

export default function Doorway({ onDone }) {
  const { colors, isDark } = useTheme();
  const { t } = useLang();
  const reduced = useReducedMotion();

  /* Held here rather than in the parent so the overlay unmounts itself: the
     parent should not have to own a piece of state whose only job is to stop
     this component from existing. */
  const [gone, setGone] = useState(false);

  const phase = useSharedValue(0);

  /*
   * The callback, behind a ref.
   *
   * `onDone` is an inline arrow at the call site, so it is a new function on
   * every parent render. Depending on it directly would put it in the effect's
   * dependency list, and the effect *starts the animation* — so any unrelated
   * re-render of the layout (a theme toggle, a language switch) would snap the
   * doorway back to its first frame and play it again.
   *
   * A ref is the fix rather than asking every caller to remember `useCallback`:
   * a component should not be able to be broken by the ordinary way its props
   * are written.
   */
  const done = useRef(onDone);
  done.current = onDone;

  const finish = useCallback(() => {
    setGone(true);
    done.current?.();
  }, []);

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }

    /* One soft tap on the way through — the same `selectionAsync` the mode
       switch uses, so crossing a threshold feels the same everywhere. */
    Haptics.selectionAsync().catch(() => {});

    phase.value = withTiming(
      1,
      { duration: DURATION, easing: Easing.linear },
      (done) => {
        if (done) runOnJS(finish)();
      },
    );
  }, [phase, reduced, finish]);

  /* ---- the pieces, each on its own slice of the timeline ---- */

  /** RannaBari leaves first: it is what you are stepping out of. */
  const leaving = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 0.22], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(phase.value, [0, 0.22], [1, 0.82], Extrapolation.CLAMP) },
      { translateY: interpolate(phase.value, [0, 0.22], [0, -14], Extrapolation.CLAMP) },
    ],
  }));

  /** The mess mark arrives into the space the other one left. */
  const arriving = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0.18, 0.46], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(phase.value, [0.18, 0.52], [0.68, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(phase.value, [0.18, 0.52], [16, 0], Extrapolation.CLAMP) },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0.34, 0.58], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(phase.value, [0.34, 0.58], [12, 0], Extrapolation.CLAMP) },
    ],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0.46, 0.7], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(phase.value, [0.46, 0.7], [10, 0], Extrapolation.CLAMP) },
    ],
  }));

  /** The whole sheet lifts off the dashboard at the end. */
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0.82, 1], [1, 0], Extrapolation.CLAMP),
  }));

  /**
   * A hairline that draws itself under the title.
   *
   * The one piece of pure decoration here, and it earns its place: it is the
   * thing that makes the sheet read as *arriving somewhere* rather than as a
   * splash screen waiting for something to load.
   */
  const ruleStyle = useAnimatedStyle(() => ({
    width: `${interpolate(phase.value, [0.44, 0.78], [0, 100], Extrapolation.CLAMP)}%`,
    opacity: interpolate(phase.value, [0.44, 0.56], [0, 1], Extrapolation.CLAMP),
  }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
          backgroundColor: colors.canvas,
        },
        sheetStyle,
      ]}
    >
      {/* A saffron wash, so the world's colour is the first thing you see. */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(232, 190, 90, 0.14)', 'rgba(232, 190, 90, 0.03)', 'transparent']
            : ['rgba(184, 133, 15, 0.13)', 'rgba(184, 133, 15, 0.03)', 'transparent']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.85 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Skip')}
        onPress={finish}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        {/* The two marks share one square, so one genuinely replaces the
            other rather than the pair of them sliding past each other. */}
        <View style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute' }, leaving]}>
            <Brand size={20} markSize={72} markOnly />
          </Animated.View>

          <Animated.View style={[{ position: 'absolute' }, arriving]}>
            <MessMark size={82} />
          </Animated.View>
        </View>

        <Animated.View style={[{ alignItems: 'center', marginTop: 26 }, titleStyle]}>
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 11,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              color: colors.saffron,
            }}
          >
            {t('RannaBari Mess')}
          </Text>

          <Text
            style={{
              marginTop: 10,
              fontFamily: font.displayBold,
              fontSize: 26,
              letterSpacing: -0.5,
              textAlign: 'center',
              color: colors.text,
            }}
          >
            {t('Entering meal management')}
          </Text>
        </Animated.View>

        <View style={{ width: 120, marginTop: 16, alignItems: 'center' }}>
          <Animated.View
            style={[{ height: 1.5, borderRadius: 1, backgroundColor: colors.saffron }, ruleStyle]}
          />
        </View>

        <Animated.Text
          style={[
            {
              marginTop: 16,
              fontFamily: font.ui,
              fontSize: 14,
              lineHeight: 21,
              textAlign: 'center',
              color: colors.textMuted,
              maxWidth: 280,
            },
            lineStyle,
          ]}
        >
          {t('Your mess’s own books — meals, bazar and money, kept apart from the shop.')}
        </Animated.Text>

        <Animated.Text
          style={[
            {
              position: 'absolute',
              bottom: 44,
              fontFamily: font.ui,
              fontSize: 12,
              color: colors.textMuted,
            },
            lineStyle,
          ]}
        >
          {t('Tap to skip')}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}
