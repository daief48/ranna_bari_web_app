import React from 'react';
import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font } from '../theme/tokens';

/**
 * English / Bengali, from any header.
 *
 * It shows the language you would switch TO, not the one you are in: the
 * button is an action, and a control labelled with the current state leaves
 * you guessing what pressing it does.
 *
 * The label is drawn in the script it names -- "বাং" in Noto, "EN" in Inter --
 * so it is legible as a choice even to someone who cannot read the other one.
 */
export default function LanguageSwitch({ style, segment = false, first = false }) {
  const { colors, shadow, isDark } = useTheme();
  const { isBn, toggleLang } = useLang();

  // Going to Bengali, or back to English.
  const target = isBn
    ? { short: 'EN', family: font.uiBold, size: 11 }
    : { short: 'বাং', family: 'NotoSansBengali_700Bold', size: 12 };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isBn ? 'Switch to English' : 'বাংলায় দেখুন'}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        toggleLang();
      }}
      style={({ pressed }) => [
        /*
         * Two shapes. Standalone it is a bordered pill of its own; as a
         * `segment` it is one cell of the header's control rail, which draws
         * the border and the ground for all three at once. The rail cannot
         * clip its own corners — the unread badge next door has to escape it
         * — so the end cell rounds its outer corners itself.
         */
        segment
          ? {
              width: 32,
              height: 34,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.primary50 : 'transparent',
              borderTopLeftRadius: first ? 11 : 0,
              borderBottomLeftRadius: first ? 11 : 0,
            }
          : {
              minWidth: 36,
              height: 36,
              paddingHorizontal: 8,
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
            },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: target.family,
          fontSize: target.size,
          letterSpacing: isBn ? 0.4 : 0,
          color: colors.text,
          fontWeight: '700',
        }}
      >
        {target.short}
      </Text>
    </Pressable>
  );
}
