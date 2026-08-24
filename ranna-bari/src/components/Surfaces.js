import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';

/**
 * `.bento-box` at the phone breakpoint: 28px radius, hairline border,
 * shadow-md. The web version layers a 20px backdrop-blur behind a 62%
 * raised fill; on a phone the blur is dropped to 18px for GPU cost and the
 * fill has to be opaque anyway, so this paints the resolved colour.
 */
export function BentoBox({ style, children, onPress, ...rest }) {
  const { colors, shadow } = useTheme();

  const base = [
    {
      backgroundColor: colors.surfaceSolid,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 28,
      overflow: 'hidden',
    },
    shadow.md,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...base, { opacity: pressed ? 0.94 : 1 }]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}

/**
 * `.icon-tile` — the tinted square that replaced the emoji-in-a-circle
 * pattern. Three tints: primary (default), sage, saffron.
 */
export function IconTile({ name, variant = 'primary', large, style }) {
  const { colors } = useTheme();

  const tint = {
    primary: { bg: colors.primary50, fg: colors.primary },
    sage: { bg: colors.sage50, fg: colors.sage },
    saffron: { bg: colors.saffron50, fg: colors.saffron },
  }[variant];

  const box = large ? 68 : 56;

  return (
    <View
      style={[
        {
          width: box,
          height: box,
          borderRadius: large ? 22 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
          borderWidth: 1,
          borderColor: colors.line2,
        },
        style,
      ]}
    >
      <Icon name={name} size={large ? 30 : 26} color={tint.fg} />
    </View>
  );
}

/**
 * `.badge` / `.badge-accent` / `.badge-sage`.
 * @param {'neutral'|'accent'|'sage'} tone
 */
export function Badge({ tone = 'neutral', icon, label, style }) {
  const { colors, shadow } = useTheme();

  const tint = {
    neutral: { bg: colors.raised, fg: colors.text, border: colors.line },
    accent: { bg: colors.primary50, fg: colors.primary, border: colors.primary100 },
    sage: { bg: colors.sage50, fg: colors.sage, border: colors.sage100 },
  }[tone];

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 7,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: tint.bg,
          borderWidth: 1,
          borderColor: tint.border,
        },
        shadow.xs,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={13} color={tint.fg} /> : null}
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.micro,
          letterSpacing: type.micro * tracking.label,
          textTransform: 'uppercase',
          color: tint.fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** `.badge-eco` — sage pill, sentence case, used for sourcing claims. */
export function EcoBadge({ icon = 'leaf', label, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: radius.pill,
          backgroundColor: colors.sage50,
        },
        style,
      ]}
    >
      <Icon name={icon} size={13} color={colors.sage} />
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.micro,
          letterSpacing: type.micro * 0.05,
          color: colors.sage,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** `.tag` — the sunken chip on chef cards and menu rows. */
export function Tag({ label, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          paddingVertical: 6,
          paddingHorizontal: 11,
          borderRadius: radius.pill,
          backgroundColor: colors.sunken,
          borderWidth: 1,
          borderColor: colors.line2,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.micro,
          letterSpacing: type.micro * 0.06,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
