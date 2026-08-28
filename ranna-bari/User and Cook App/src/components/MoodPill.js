import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font, radius } from '../theme/tokens';

/**
 * `.mood-pill` — a horizontally scrolling craving picker.
 *
 * On touch the CSS explicitly restores the resting appearance for :hover
 * (a tapped pill would otherwise stay solid vermilion), and gives taps a
 * scale(0.97) acknowledgement instead. That is what the pressed state does.
 */
export default function MoodPill({ icon, label, onPress }) {
  const { colors, shadow } = useTheme();
  const r = useResponsive();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: r.moodPillPadV,
          paddingHorizontal: r.moodPillPadH,
          borderRadius: radius.pill,
          backgroundColor: colors.raised,
          borderWidth: 1,
          borderColor: colors.line,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        shadow.sm,
      ]}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.sunken,
        }}
      >
        <Icon name={icon} size={18} color={colors.primary} />
      </View>

      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: r.moodPillFont,
          letterSpacing: -0.06,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
