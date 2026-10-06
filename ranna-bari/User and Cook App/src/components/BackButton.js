import React from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius } from '../theme/tokens';

/**
 * The one way back, drawn the same everywhere.
 *
 * Every screen used to copy-paste this pill, and three more invented their
 * own shape — so "go back" looked like three different controls wearing the
 * same arrow. This is the auth flow's copy of it, lifted verbatim out of
 * `auth.js` and given a home.
 *
 * Pass `onPress` when going back means something more specific than leaving
 * (a wizard stepping back a stage); pass `fallback` for the route to land on
 * when there is no stack to pop — deep links open with an empty history.
 */
export default function BackButton({ label, onPress, fallback = '/', style }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useLang();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={
        onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))
      }
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 8,
          paddingVertical: 9,
          paddingLeft: 12,
          paddingRight: 16,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: pressed ? colors.primary200 : colors.line,
          backgroundColor: colors.surfaceSolid,
        },
        style,
      ]}
    >
      <Icon name="arrowLeft" size={16} color={colors.textMuted} />
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 13,
          color: colors.textMuted,
        }}
      >
        {label ?? t('Back to RannaBari')}
      </Text>
    </Pressable>
  );
}
