import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font, radius, type } from '../theme/tokens';

/**
 * `.btn` and its three variants.
 *
 * The refresh layer moved buttons off Fraunces -- serif buttons read as
 * decoration -- so every label here is Inter 600 with the uppercase
 * micro-label tracking. `.btn:active { transform: scale(0.96) }`.
 *
 * @param {'primary'|'glass'|'ghost'} variant
 */
export default function Button({
  variant = 'primary',
  label,
  icon,
  iconPosition = 'right',
  onPress,
  block,
  small,
  disabled,
  style,
  textStyle,
}) {
  const { colors, shadow } = useTheme();
  const r = useResponsive();

  const paddingV = small ? 11 : r.btnPadV;
  const paddingH = small ? 22 : r.btnPadH;
  const fontSize = small ? type.xs + 1 : r.btnFont;
  const letterSpacing = small ? fontSize * 0.09 : r.btnTracking;

  const palette = {
    primary: {
      text: variant === 'primary' ? '#FFFFFF' : colors.text,
      border: 'transparent',
      shadow: shadow.primary,
    },
    glass: { text: colors.text, border: colors.line, shadow: shadow.sm },
    ghost: { text: colors.textMuted, border: colors.line, shadow: null },
  }[variant];

  const iconNode = icon ? (
    <Icon name={icon} size={small ? 14 : 16} color={palette.text} strokeWidth={2} />
  ) : null;

  const content = (
    <>
      {iconPosition === 'left' ? iconNode : null}
      <Text
        /* A button is a fixed-height pill with an icon beside the word; past
           about a fifth larger the label starts pushing the icon out or
           wrapping onto a second line inside a control that has no second
           line. Body copy is where a large system font should show. */
        maxFontSizeMultiplier={1.25}
        style={[
          {
            fontFamily: font.uiSemi,
            fontSize,
            letterSpacing,
            textTransform: 'uppercase',
            color: palette.text,
          },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {iconPosition === 'right' ? iconNode : null}
    </>
  );

  const inner = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: paddingV,
    paddingHorizontal: paddingH,
    borderRadius: radius.pill,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={(e) => {
        if (disabled) return;
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          alignSelf: block ? 'stretch' : 'flex-start',
          borderRadius: radius.pill,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        },
        palette.shadow,
        style,
      ]}
    >
      {variant === 'primary' ? (
        // linear-gradient(140deg, primary-300 -40%, primary 45%, primary-600 130%)
        <LinearGradient
          colors={[colors.primary300, colors.primary, colors.primary600]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={inner}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            inner,
            {
              backgroundColor:
                variant === 'glass' ? colors.surfaceSolid : 'transparent',
              borderWidth: 1,
              borderColor: palette.border,
            },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
