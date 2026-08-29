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
  const { brand, isBn } = useLang();
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

      {markOnly ? null : isBn ? (
        /*
         * Bengali is one word, so it is set as one.
         *
         * "RannaBari" is a compound of two words a reader sees as two, which
         * is what the ink/gradient split is drawing. রান্নাবাড়ি is written
         * without a break and carries a continuous মাত্রা across the whole
         * name — recolouring at the halfway point cuts that headline stroke
         * in two and reads as a rendering fault rather than as emphasis.
         *
         * So the Bengali lockup is a single deep vermilion in the heaviest
         * face available, which is how the name is set on the logo itself.
         */
        <Text
          style={[
            wordStyle,
            {
              fontFamily: font.displayExtra,
              // #7F1F0A on paper; the same maroon would disappear on a dark
              // ground, so there it steps up to the lit primary.
              color: isDark ? colors.primary : colors.primary700,
              letterSpacing: -0.2,
            },
          ]}
        >
          {brand.first}
          {brand.second}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={wordStyle}>{brand.first}</Text>
          <GradientText
            style={[wordStyle, { fontFamily: font.displayBold }]}
            colors={[colors.primary, colors.saffron]}
          >
            {brand.second}
          </GradientText>
        </View>
      )}
    </View>
  );
}
