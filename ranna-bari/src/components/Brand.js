import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Icon from './Icon';
import { GradientText } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font } from '../theme/tokens';

/**
 * The wordmark lockup. Two bugs the CSS had to fix are structural here:
 * "RANNA" and "BARI" live in one <Text> run so no flex gap can split them,
 * and both halves share a size so the second half can't render larger.
 */
export default function Brand({ size, markSize = 38 }) {
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const wordSize = size ?? r.brandWord;

  const wordStyle = {
    fontFamily: font.displayExtra,
    fontSize: wordSize,
    letterSpacing: wordSize * -0.03,
    color: colors.text,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: r.brandGap }}>
      <LinearGradient
        colors={[colors.primary300, colors.primary600]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[
          {
            width: markSize,
            height: markSize,
            borderRadius: markSize * 0.342, // 13/38, the CSS ratio
            alignItems: 'center',
            justifyContent: 'center',
          },
          shadow.primary,
        ]}
      >
        <Icon
          name="brand"
          size={markSize * 0.553}
          color={colors.onPrimary}
          strokeWidth={1.9}
        />
      </LinearGradient>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={wordStyle}>RANNA</Text>
        <GradientText style={wordStyle}>BARI</GradientText>
      </View>
    </View>
  );
}
