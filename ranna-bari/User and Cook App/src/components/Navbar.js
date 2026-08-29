import React from 'react';
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

function NavIcon({ name, onPress, active, badge, accessibilityLabel }) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed
          ? colors.primary50
          : isDark
          ? 'rgba(255, 255, 255, 0.06)'
          : 'rgba(31, 29, 26, 0.04)',
        borderWidth: 1,
        borderColor: isDark
          ? 'rgba(255, 255, 255, 0.08)'
          : 'rgba(31, 29, 26, 0.06)',
      })}
    >
      <Icon
        name={name}
        size={18}
        color={active ? colors.primary : colors.text}
        strokeWidth={1.85}
      />

      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
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
              fontSize: 9.5,
              lineHeight: 11,
              color: '#FFFFFF',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * `.navbar` — high-end floating glassmorphic pill bar.
 */
export default function Navbar() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isCookMode } = useAuth();
  const { unreadFor } = useCommerce();

  const audience = isCookMode ? 'cook' : 'customer';
  const unreadCount = unreadFor(audience) ?? 0;

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
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            backgroundColor: isDark
              ? 'rgba(26, 33, 28, 0.84)'
              : 'rgba(255, 255, 255, 0.88)',
          }}
        >
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="link"
            accessibilityLabel="RannaBari home"
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Brand size={19.5} markSize={36} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Cook mode switch if eligible */}
            <ModeSwitch />
            <LanguageSwitch />
            <NavIcon
              name="bell"
              badge={unreadCount}
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
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
