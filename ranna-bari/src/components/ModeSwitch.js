import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../store/AuthContext';
import { font, radius } from '../theme/tokens';

/**
 * The one control that moves a cook between their two halves of the app.
 *
 * A cook has two jobs on this device -- running a kitchen and buying dinner
 * from someone else's -- and until now the only way across was buried in a
 * settings row on each side. It belongs in the header, where it is reachable
 * from every screen without first navigating somewhere.
 *
 * It always names the destination, never the current state: a button that
 * says "Cook" while you are already cooking is ambiguous, and the tap does
 * one thing regardless.
 *
 * Renders nothing for an account that is not a cook -- there is no second
 * mode to go to, and an inert toggle is worse than none.
 */
export default function ModeSwitch({ compact = false, style }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { isCook, isCookMode, setViewMode } = useAuth();

  if (!isCook) return null;

  // Sage is the cook panel and vermilion is the shop, everywhere in the app.
  const to = isCookMode
    ? { label: 'Shop', icon: 'cart', fg: colors.primary, bg: colors.primary50, edge: colors.primary100, mode: 'customer', href: '/' }
    : { label: 'Kitchen', icon: 'chefHat', fg: colors.sage, bg: colors.sage50, edge: colors.sage100, mode: 'cook', href: '/cook' };

  const onPress = async () => {
    Haptics.selectionAsync().catch(() => {});
    await setViewMode(to.mode);
    router.replace(to.href);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isCookMode
          ? 'Switch to ordering as a customer'
          : 'Switch to your kitchen'
      }
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 0 : 6,
          height: 38,
          paddingHorizontal: compact ? 0 : 11,
          width: compact ? 38 : undefined,
          justifyContent: 'center',
          borderRadius: compact ? 13 : radius.pill,
          backgroundColor: to.bg,
          borderWidth: 1,
          borderColor: pressed ? to.fg : to.edge,
          transform: [{ scale: pressed ? 0.95 : 1 }],
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
          {to.label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The same switch as a full-width row, for the foot of a profile screen
 * where there is room to say what the other side actually is.
 */
export function ModeSwitchRow({ style }) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { isCook, isCookMode, setViewMode } = useAuth();

  if (!isCook) return null;

  const to = isCookMode
    ? {
        title: 'Switch to ordering',
        sub: 'Browse and order from other kitchens',
        icon: 'cart',
        fg: colors.primary,
        bg: colors.primary50,
        edge: colors.primary100,
        mode: 'customer',
        href: '/',
      }
    : {
        title: 'Back to your kitchen',
        sub: 'Orders, menu and earnings',
        icon: 'chefHat',
        fg: colors.sage,
        bg: colors.sage50,
        edge: colors.sage100,
        mode: 'cook',
        href: '/cook',
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${to.title}. ${to.sub}`}
      onPress={async () => {
        Haptics.selectionAsync().catch(() => {});
        await setViewMode(to.mode);
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
          {to.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.ui, fontSize: 14, color: colors.textMuted }}
        >
          {to.sub}
        </Text>
      </View>

      <Icon name="arrowRight" size={17} color={to.fg} strokeWidth={2} />
    </Pressable>
  );
}
