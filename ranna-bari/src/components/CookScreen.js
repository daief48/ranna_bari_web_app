import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Brand from './Brand';
import Icon from './Icon';
import ModeSwitch from './ModeSwitch';
import FilmGrain from './FilmGrain';
import { AmbientGlow, KineticBackground } from './Backdrop';
import { NAVBAR_HEIGHT, NAVBAR_TOP } from './Navbar';
import { APP_BAR_CLEARANCE } from './Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useKitchen } from '../store/KitchenContext';
import { font, radius } from '../theme/tokens';

/**
 * The cook panel's top bar.
 *
 * The customer navbar carries a cart and a profile link, neither of which
 * means anything to somebody cooking. What a cook needs from every screen is
 * the answer to one question -- am I taking orders right now -- so that is
 * what sits in the middle, and it is the control as well as the readout.
 *
 * Everything else about the bar is the customer one: same height, same
 * offset, same blur, same hairline.
 */
export function CookNavbar() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const { kitchen, toggleOpen } = useKitchen();

  const open = !!kitchen?.isOpen;

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
            paddingHorizontal: 14,
            backgroundColor: isDark
              ? `rgba(${colors.rgbRaised}, 0.76)`
              : 'rgba(250, 247, 240, 0.72)',
          }}
        >
          {/* Mark only: the status pill, the mode switch and the theme
              toggle all have to fit beside it on a 360px phone. */}
          <Brand size={20} markSize={34} markOnly />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: open }}
              accessibilityLabel={
                open ? 'Kitchen is open. Tap to close.' : 'Kitchen is closed. Tap to open.'
              }
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                toggleOpen();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                backgroundColor: open ? colors.sage50 : colors.sunken,
                borderWidth: 1,
                borderColor: open ? colors.sage100 : colors.line,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: open ? colors.sage : colors.textLight,
                }}
              />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 9.5,
                  letterSpacing: 0.85,
                  textTransform: 'uppercase',
                  color: open ? colors.sage : colors.textMuted,
                }}
              >
                {open ? 'Open' : 'Closed'}
              </Text>
            </Pressable>

            {/* The way back to the shop, reachable from every cook screen. */}
            <ModeSwitch compact />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isDark ? 'Switch to light mode' : 'Switch to dark mode'
              }
              onPress={toggle}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.sage50 : 'transparent',
              })}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

/**
 * The cook panel's page shell — the customer `Screen` with the sage glow and
 * the kitchen bar, so both halves of the app sit on the same ground.
 */
export default function CookScreen({
  children,
  showNavbar = true,
  glow = 'both',
  contentStyle,
  scrollRef,
  ...scrollProps
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 24;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KineticBackground />
      {glow === 'top-right' || glow === 'both' ? (
        <AmbientGlow position="top-right" color={colors.sage} />
      ) : null}
      {glow === 'bottom-left' || glow === 'both' ? (
        <AmbientGlow position="bottom-left" color={colors.saffron} />
      ) : null}

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

      <FilmGrain />
      {showNavbar ? <CookNavbar /> : null}
    </View>
  );
}
