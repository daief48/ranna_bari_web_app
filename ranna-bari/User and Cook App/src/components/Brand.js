import React from 'react';
import { Image, Text, View } from 'react-native';

import { GradientText } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

const LOGO_LIGHT = require('../../assets/logo.png');
const LOGO_DARK = require('../../assets/logo-dark.png');

/**
 * Modern, high-end brand lockup.
 *
 * Combines a crisp squircle jewel logo mark with contemporary TitleCase
 * typography — the first half in deep ink, the second in a warm vermilion
 * gradient. Both halves come from the language layer: in Bengali the name is
 * written রান্নাবাড়ি rather than transliterated back into Latin, because it
 * is a Bengali name to begin with.
 */
export default function Brand({ size, markSize = 36, markOnly = false }) {
  const { colors, shadow, isDark } = useTheme();
  const { brand } = useLang();
  const r = useResponsive();
  const wordSize = size ?? r.brandWord ?? 19;

  const wordStyle = {
    fontFamily: font.displayBold,
    fontSize: wordSize,
    letterSpacing: -0.4,
    color: colors.text,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      {/* Sleek logo badge */}
      <View
        style={[
          {
            width: markSize,
            height: markSize,
            borderRadius: Math.round(markSize * 0.28),
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(199, 56, 26, 0.06)',
            borderWidth: 1,
            borderColor: isDark
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(199, 56, 26, 0.12)',
          },
          shadow.xs,
        ]}
      >
        <Image
          source={isDark ? LOGO_DARK : LOGO_LIGHT}
          style={{
            width: markSize,
            height: markSize,
          }}
          resizeMode="contain"
        />
      </View>

      {markOnly ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={wordStyle}>{brand.first}</Text>
          <GradientText
            style={[wordStyle, { fontFamily: font.displayBold }]}
            colors={[colors.primary, colors.saffron]}
          >
            {brand.second}
          </GradientText>
          {/* Subtle modern brand accent dot */}
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.primary,
              marginLeft: 2.5,
              marginTop: wordSize * 0.35,
            }}
          />
        </View>
      )}
    </View>
  );
}
