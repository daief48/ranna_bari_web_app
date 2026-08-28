import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useCart } from '../store/CartContext';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';

/**
 * The floating cart summary for screens outside the tab group.
 *
 * The bottom app bar carries the cart now, but it only renders for tab
 * screens -- and a kitchen page, which is where dishes are actually added, is
 * a stack screen with no bar at all. Without this, adding to the cart there
 * would give no feedback and no way onward.
 *
 * It says what a tab icon cannot: how many items and how much, which is the
 * question you are actually asking when you look for the cart mid-order.
 * Absent when the cart is empty, so it never takes space it has not earned.
 */
export default function CartBar() {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count, subtotal } = useCart();
  const { t, n } = useLang();

  if (!count) return null;

  const items = t(count === 1 ? '{n} item' : '{n} items', { n: n(count) });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12 + insets.bottom,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('View cart')}, ${items}, ৳${n(subtotal)}`}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          router.push('/cart');
        }}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            paddingVertical: 13,
            paddingHorizontal: 16,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          },
          shadow.primaryLg,
        ]}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
          }}
        >
          <Icon name="cart" size={19} color="#FFFFFF" />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.uiBold,
              fontSize: 15,
              color: '#FFFFFF',
            }}
          >
            {items} · ৳{n(subtotal)}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.ui,
              fontSize: type.xs,
              color: 'rgba(255, 255, 255, 0.85)',
            }}
          >
            {t('Delivery and fees at checkout')}
          </Text>
        </View>

        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: type.micro,
            letterSpacing: type.micro * 0.09,
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          {t('View cart')}
        </Text>
        <Icon name="arrowRight" size={16} color="#FFFFFF" strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
