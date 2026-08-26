import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Brand from './Brand';
import Icon from './Icon';
import ModeSwitch from './ModeSwitch';
import LanguageSwitch from './LanguageSwitch';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';

/** Height of the bar itself, from `.navbar .container { height: 58px }`. */
export const NAVBAR_HEIGHT = 58;
/** Gap between the safe area and the floating bar (`top: 10px` on phones). */
export const NAVBAR_TOP = 10;

/** Total space a screen must leave clear at the top (the `.page-top` rule). */
export function useNavbarOffset() {
  const insets = useSafeAreaInsets();
  return insets.top + NAVBAR_TOP + NAVBAR_HEIGHT + 24;
}

function NavIcon({ name, onPress, active, badge, accessibilityLabel }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active || pressed ? colors.primary50 : 'transparent',
      })}
    >
      <Icon
        name={name}
        size={21}
        color={active ? colors.primary : colors.text}
      />

      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.canvas,
          }}
        >
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: 10,
              lineHeight: 12,
              color: '#FFFFFF',
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * `.navbar` at the phone breakpoint — a floating pill-ish bar, 10px below the
 * safe area, inset 10px each side, 22px radius.
 *
 * The "Browse Cooks" link and the location chip are both hidden on phones in
 * the CSS (the bottom app bar carries navigation), so only the icon cluster
 * survives here.
 */
export default function Navbar() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
        // The phone breakpoint drops the blur from 20px to 18px: heavy blur is
        // expensive on mobile GPUs.
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
            // color-mix(canvas 72%, transparent) over the blur
            backgroundColor: isDark
              ? `rgba(${colors.rgbRaised}, 0.76)`
              : 'rgba(250, 247, 240, 0.72)',
          }}
        >
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="link"
            accessibilityLabel="RannaBari home"
          >
            <Brand size={20} markSize={34} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
            {/* Only a cook has somewhere else to be. */}
            <ModeSwitch style={{ marginRight: 3 }} />
            <LanguageSwitch style={{ marginRight: 3 }} />
            {/* Neither cart nor profile lives up here any more: the bottom app
                bar carries both, and a second copy at the far end of the phone
                only made the bar wider. Screens outside the tab group have no
                bottom bar, so those carry their own cart affordance instead --
                see the summary bar on a kitchen page. */}
            <NavIcon
              name={isDark ? 'sun' : 'moon'}
              accessibilityLabel={
                isDark ? 'Switch to light mode' : 'Switch to dark mode'
              }
              onPress={toggle}
            />
          </View>
        </View>
      </BlurView>
    </View>
  );
}
