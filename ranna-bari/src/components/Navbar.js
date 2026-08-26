import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Brand from './Brand';
import Icon from './Icon';
import ModeSwitch from './ModeSwitch';
import { useTheme } from '../theme/ThemeProvider';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
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

function NavIcon({ name, onPress, active, badge, dot, accessibilityLabel }) {
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

      {dot ? (
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.sage,
            borderWidth: 1.5,
            borderColor: colors.canvas,
          }}
        />
      ) : null}

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
export default function Navbar({ activeIcon }) {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count } = useCart();
  const { isSignedIn, isCook } = useAuth();

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
            {/* A cook carries a fourth control up here, so the wordmark gives
                up its space to it and the mark stands in alone. */}
            <Brand size={20} markSize={34} markOnly={isCook} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {/* Only a cook has somewhere else to be. */}
            <ModeSwitch style={{ marginRight: 4 }} />
            <NavIcon
              name="cart"
              badge={count}
              active={activeIcon === 'cart'}
              accessibilityLabel={`Cart, ${count} items`}
              onPress={() => router.push('/cart')}
            />
            <NavIcon
              name="user"
              active={activeIcon === 'user'}
              dot={isSignedIn}
              accessibilityLabel={isSignedIn ? 'Your profile' : 'Sign in or join'}
              onPress={() => router.push(isSignedIn ? '/profile' : '/auth')}
            />
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
