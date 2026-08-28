import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';

const AnimatedText = Animated.createAnimatedComponent(Animated.Text);

/**
 * `.form-group-modern` — the float-label field.
 *
 * The web markup carries real placeholder hints ("As it appears on your ID"),
 * so at rest the label and the placeholder painted in the same spot and
 * overlapped. The CSS fix was to keep the placeholder transparent until
 * focus, by which point the label has floated clear of it; `showPlaceholder`
 * reproduces that.
 */
export default function FloatLabelInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  autoComplete,
  trailingIcon,
  onTrailingPress,
  editable = true,
  error,
  style,
  ...rest
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  const floated = focused || !!value;
  const t = useSharedValue(floated ? 1 : 0);
  const focus = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(floated ? 1 : 0, {
      duration: 180,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [floated, t]);

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focus]);

  const labelStyle = useAnimatedStyle(() => ({
    top: interpolate(t.value, [0, 1], [20, 9]),
    fontSize: interpolate(t.value, [0, 1], [16, 10.5]),
    letterSpacing: interpolate(t.value, [0, 1], [0, 10.5 * tracking.label]),
    color: interpolateColor(t.value, [0, 1], [colors.textMuted, colors.primary]),
  }));

  const wrapStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      [colors.sunken, colors.raised],
    ),
    borderColor: error
      ? colors.primary
      : interpolateColor(focus.value, [0, 1], [colors.line, colors.primary300]),
  }));

  const isPassword = !!secureTextEntry;
  const trailing = isPassword ? (hidden ? 'eye' : 'eyeOff') : trailingIcon;

  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <Animated.View
        style={[
          {
            borderWidth: 1,
            borderRadius: radius.sm,
            justifyContent: 'center',
            // focus ring: box-shadow 0 0 0 3px primary-50
            ...(focused
              ? {
                  shadowColor: colors.primary,
                  shadowOpacity: 0.18,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 2,
                }
              : null),
          },
          wrapStyle,
        ]}
      >
        <AnimatedText
          pointerEvents="none"
          numberOfLines={1}
          style={[
            {
              position: 'absolute',
              left: 14,
              right: 44,
              fontFamily: font.uiSemi,
              textTransform: floated ? 'uppercase' : 'none',
            },
            labelStyle,
          ]}
        >
          {label}
        </AnimatedText>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Transparent until focus, so it never collides with the resting label
          placeholder={focused ? placeholder : ''}
          placeholderTextColor={colors.textLight}
          secureTextEntry={isPassword && hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          editable={editable}
          style={{
            fontFamily: font.ui,
            // 16px keeps iOS from zooming the viewport on focus
            fontSize: 16,
            color: colors.text,
            paddingTop: 24,
            paddingBottom: 9,
            paddingLeft: 14,
            paddingRight: trailing ? 44 : 14,
          }}
          {...rest}
        />

        {trailing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isPassword ? (hidden ? 'Show password' : 'Hide password') : undefined
            }
            onPress={() => {
              if (isPassword) setHidden((h) => !h);
              onTrailingPress?.();
            }}
            hitSlop={10}
            style={{ position: 'absolute', right: 14, top: 20 }}
          >
            <Icon name={trailing} size={19} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * `.auth-note` — the inline strip above a form.
 *
 * Three tones, because a form says three kinds of thing and only one of them
 * is a problem: something is wrong, something needs noticing, something
 * worked. A confirmation painted in the error colour is read as an error.
 */
export function FormNote({ text, tone = 'error' }) {
  const { colors } = useTheme();
  if (!text) return null;

  const isError = tone === 'error';
  const isOk = tone === 'ok';
  const fg = isError ? colors.primary : isOk ? colors.sage : colors.saffron;
  const bg = isError ? colors.primary50 : isOk ? colors.sage50 : colors.saffron50;
  const line = isError ? colors.primary100 : isOk ? colors.sage100 : colors.saffron100;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        marginBottom: 16,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
      }}
    >
      <Icon name={isOk ? 'check' : 'alertCircle'} size={17} color={fg} />
      <Animated.Text
        style={{
          flex: 1,
          fontFamily: font.ui,
          fontSize: type.sm,
          lineHeight: type.sm * 1.5,
          color: colors.text,
        }}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

