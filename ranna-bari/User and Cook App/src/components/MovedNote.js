import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import Icon from './Icon';
import { statusMeta } from './CookBits';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';

/**
 * What stands where an order's card was, for a moment after it moved on.
 *
 * See `useLingering`: the order is fine, it is one list over, and this says
 * which — with a way to follow it. It is a plain note, not a card: it has to
 * read as "that is done" rather than as another job.
 *
 * @param {object} props
 * @param {object} props.order  The order as it is now.
 * @param {() => void} props.onShow  Take the cook to where it went.
 */
export default function MovedNote({ order, onShow }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const where = statusMeta(order.status, colors);

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(320)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radius.lg,
        backgroundColor: colors.sage50,
        borderWidth: 1,
        borderColor: colors.sage100,
      }}
    >
      <Icon name="check" size={18} color={colors.sage} strokeWidth={2.6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
        >
          {t('{code} moved to {status}', {
            code: order.code ?? '',
            status: t(where.label),
          })}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
        >
          {order.contact?.name ?? order.customerName ?? ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Show')}
        onPress={onShow}
        hitSlop={8}
      >
        <Text style={{ fontFamily: font.uiBold, fontSize: type.sm, color: colors.primary }}>
          {t('Show')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
