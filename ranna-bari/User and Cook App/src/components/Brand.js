import React from 'react';
import { Image, Text, View } from 'react-native';

import { GradientText } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font } from '../theme/tokens';

const LOGO_IMG = require('../../assets/logo.png');

/**
 * Modern, high-end brand lockup.
 *
 * Combines a crisp squircle jewel logo mark with contemporary TitleCase
 * typography — "Ranna" in deep ink and "Bari" in vibrant warm vermilion gradient.
 */
export default function Brand({ size, markSize = 36, markOnly = false }) {
  const { colors, shadow, isDark } = useTheme();
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
          source={LOGO_IMG}
          style={{
            width: markSize,
            height: markSize,
          }}
          resizeMode="contain"
        />
      </View>

      {markOnly ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={wordStyle}>Ranna</Text>
          <GradientText
            style={[wordStyle, { fontFamily: font.displayBold }]}
            colors={[colors.primary, colors.saffron]}
          >
            Bari
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
