import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, type } from '../theme/tokens';

/**
 * The way back, in one place.
 *
 * A dozen screens hand-rolled this same button, and every one of them wrote
 * the same conditional: `canGoBack() ? back() : replace(somewhere)`. The
 * fallback is the part worth keeping. A screen opened from a notification, a
 * deep link, or a reload on the web build has no history behind it, and a
 * bare `router.back()` there does nothing at all — the button looks broken
 * rather than absent, which is worse than either.
 *
 * So `href` is not decoration: it is where this screen belongs when there is
 * no history to pop. Callers that omit it land on the customer home, which is
 * the one screen that always exists.
 */
export default function BackButton({ href = '/', label, style, tone = 'plain' }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLang();

  const goBack = () => {
    Haptics.selectionAsync().catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace(href);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? `${t('Back')}, ${t(label)}` : t('Back')}
      onPress={goBack}
      hitSlop={8}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingVertical: 7,
          paddingRight: label ? 12 : 7,
          paddingLeft: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: tone === 'plain' ? colors.line2 : 'transparent',
          /* Over a photograph the page border disappears, so that variant
             carries its own scrim instead of a hairline nobody can see. */
          backgroundColor:
            tone === 'onImage'
              ? 'rgba(20, 16, 14, 0.5)'
              : pressed
                ? colors.primary50
                : colors.surfaceSolid,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        style,
      ]}
    >
      <Icon
        name="arrowLeft"
        size={17}
        color={tone === 'onImage' ? '#FFFFFF' : colors.text}
        strokeWidth={2}
      />
      {label ? (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.uiSemi,
            fontSize: type.sm,
            color: tone === 'onImage' ? '#FFFFFF' : colors.text,
          }}
        >
          {t(label)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Where a route sits, so the fallback is not always the home screen.
 *
 * Only the parents worth naming: a dish belongs to the kitchen it is cooked
 * in, a shop product to its shop. Anything not listed falls back to `/`,
 * which is correct for the top-level pages and harmless for the rest.
 */
export function fallbackFor(pathname = '') {
  const p = String(pathname);
  if (p.startsWith('/cook/store')) return '/cook/store';
  if (p.startsWith('/cook/requests')) return '/cook/requests';
  if (p.startsWith('/cook')) return '/cook';
  if (p.startsWith('/meal-management')) return '/meal-management';
  if (p.startsWith('/chat')) return '/chat';
  if (p.startsWith('/product') || p.startsWith('/store-order')) return '/stores';
  if (p.startsWith('/dish') || p.startsWith('/chef')) return '/browse';
  if (p.startsWith('/order') || p.startsWith('/meal-order')) return '/orders';
  if (p.startsWith('/meal-booking')) return '/meal-bookings';
  if (p.startsWith('/request-order') || p.startsWith('/requests')) return '/requests';
  return '/';
}
