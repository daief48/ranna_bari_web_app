import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Brand from './Brand';
import Icon from './Icon';
import ModeSwitch from './ModeSwitch';
import LanguageSwitch from './LanguageSwitch';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../store/AuthContext';
import { useCommerce } from '../store/CommerceContext';
import { font, radius } from '../theme/tokens';

/** Height of the bar itself, from `.navbar .container { height: 58px }`. */
export const NAVBAR_HEIGHT = 60;
/** Gap between the safe area and the floating bar (`top: 10px` on phones). */
export const NAVBAR_TOP = 10;

/** Total space a screen must leave clear at the top (the `.page-top` rule). */
export function useNavbarOffset() {
  const insets = useSafeAreaInsets();
  return insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 24;
}

/* ------------------------------------------------------------------ *
 * the control rail
 * ------------------------------------------------------------------ */

/**
 * Language, notifications and theme, as one segmented control.
 *
 * They used to be three separate bordered pills with gaps between them, which
 * cost 120px of a bar that only has about 340 to spend — and on a 390px phone
 * that was 30px more than there was, so the theme toggle was simply cut off
 * at the edge. Nobody could reach it.
 *
 * Grouping them recovers that space honestly rather than by shrinking things
 * until they are hard to hit: one border instead of three, hairlines instead
 * of gaps, and the same 36px touch height throughout. It also says something
 * true about them — these three are settings for how the app looks and speaks
 * to you, which is a different kind of thing from the mode switch beside them,
 * and that one stays a pill of its own because it is a *destination*.
 *
 * `overflow` is deliberately left visible so the unread badge can sit proud of
 * the rail; the corner radii are put on the end segments by hand instead.
 */
const SEGMENT_W = 32;

function Rail({ children }) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(31, 29, 26, 0.07)',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(31, 29, 26, 0.035)',
        /* Not `hidden`: the notification badge has to escape. */
        overflow: 'visible',
      }}
    >
      {children.map((child, i) => (
        <React.Fragment key={child.key ?? i}>
          {i > 0 ? (
            <View
              style={{
                width: 1,
                height: 18,
                backgroundColor: colors.line2,
              }}
            />
          ) : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * One segment of the rail.
 *
 * `first` and `last` round the outer corners, because the rail cannot clip
 * them itself without also clipping the badge.
 */
function Segment({ onPress, accessibilityLabel, first, last, children }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        width: SEGMENT_W,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.primary50 : 'transparent',
        borderTopLeftRadius: first ? 11 : 0,
        borderBottomLeftRadius: first ? 11 : 0,
        borderTopRightRadius: last ? 11 : 0,
        borderBottomRightRadius: last ? 11 : 0,
      })}
    >
      {children}
    </Pressable>
  );
}

/** The unread count, sitting proud of the rail's top-right. */
function Badge({ count }) {
  const { colors } = useTheme();
  if (!(count > 0)) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: -5,
        right: -4,
        minWidth: 15,
        height: 15,
        paddingHorizontal: 3.5,
        borderRadius: 7.5,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderWidth: 1.5,
        borderColor: colors.canvas,
      }}
    >
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 9,
          lineHeight: 10.5,
          color: '#FFFFFF',
        }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * the bar
 * ------------------------------------------------------------------ */

/*
 * What each piece costs, measured rather than guessed.
 *
 * These are the widths the browser actually reported at 390px, and they are
 * what the tier below is decided from. They only have to be close: the flex
 * rules underneath mean a bad estimate makes the wordmark truncate, never a
 * control disappear off the edge.
 */
const COST = {
  brand: 132,
  brandMark: 34,
  modeLabelled: 90,
  modeCompact: 36,
  rail: SEGMENT_W * 3 + 2 + 2,
  gap: 7,
};

/**
 * `.navbar` — high-end floating glassmorphic pill bar.
 *
 * The layout tiers by the width it is actually given, not by a device
 * breakpoint. A cook in Bengali on a small Android is a different sum from a
 * customer in English on a Pro Max, and the old bar — a fixed row with a
 * fixed gap — solved for neither and clipped the last control on both.
 *
 * The order things are given up in is deliberate: the wordmark goes before
 * any control does, because a control you cannot reach is a broken app,
 * whereas the logo mark alone is still unmistakably the brand.
 */
export default function Navbar() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isCook, isCookMode } = useAuth();
  const { unreadFor } = useCommerce();

  const audience = isCookMode ? 'cook' : 'customer';
  const unreadCount = unreadFor(audience) ?? 0;

  /* Null until the first layout pass. Until then assume there is room — a bar
     that starts cramped and expands is worse to watch than one that settles
     the other way, and the first paint is a frame. */
  const [inner, setInner] = useState(null);

  const need = (brand, mode) =>
    brand + COST.gap + mode + COST.gap + COST.rail + (isCook ? 0 : -(mode + COST.gap));

  const roomy = inner == null || need(COST.brand, COST.modeLabelled) <= inner;
  const tight = !roomy && need(COST.brand, COST.modeCompact) <= inner;
  /* Neither fits: the wordmark is what goes. */
  const markOnly = !roomy && !tight;

  return (
    <View
      style={[
        {
          position: 'absolute',
          top: insets.top + NAVBAR_TOP,
          left: 12,
          right: 12,
          height: NAVBAR_HEIGHT,
          borderRadius: radius.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark
            ? 'rgba(236, 234, 225, 0.12)'
            : 'rgba(31, 29, 26, 0.08)',
          zIndex: 100,
        },
        shadow.md,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 45 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={{ flex: 1 }}
      >
        <View
          onLayout={(e) => setInner(e.nativeEvent.layout.width - 24)}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            backgroundColor: isDark
              ? 'rgba(26, 33, 28, 0.84)'
              : 'rgba(255, 255, 255, 0.88)',
          }}
        >
          {/* The brand yields first and truncates rather than pushing. */}
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="link"
            accessibilityLabel="RannaBari home"
            style={({ pressed }) => ({
              flexShrink: 1,
              minWidth: 0,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Brand size={18} markSize={32} markOnly={markOnly} />
          </Pressable>

          {/* Controls never shrink and never wrap. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: COST.gap,
              flexShrink: 0,
            }}
          >
            {/* A destination, not a setting — so it keeps its own colour and
                its own outline instead of joining the rail. */}
            <ModeSwitch compact={!roomy} />

            <Rail>
              {[
                <LanguageSwitch key="lang" segment first />,

                <Segment
                  key="bell"
                  accessibilityLabel="Notifications"
                  onPress={() => router.push('/notifications')}
                >
                  <Icon name="bell" size={17} color={colors.text} strokeWidth={1.85} />
                  <Badge count={unreadCount} />
                </Segment>,

                <Segment
                  key="theme"
                  last
                  accessibilityLabel={
                    isDark ? 'Switch to light mode' : 'Switch to dark mode'
                  }
                  onPress={toggle}
                >
                  <Icon
                    name={isDark ? 'sun' : 'moon'}
                    size={17}
                    color={colors.text}
                    strokeWidth={1.85}
                  />
                </Segment>,
              ]}
            </Rail>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
