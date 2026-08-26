import React from 'react';
import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius } from '../theme/tokens';

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
export default function LanguageSwitch({ style }) {
  const { colors, shadow } = useTheme();
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
        {
          minWidth: 34,
          height: 38,
          paddingHorizontal: 6,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.sunken : 'transparent',
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.xs,
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: target.family,
          fontSize: target.size,
          // No tracking: it would pull "বাং" apart at the matra.
          letterSpacing: isBn ? 0.6 : 0,
          color: colors.text,
        }}
      >
        {target.short}
      </Text>
    </Pressable>
  );
}
