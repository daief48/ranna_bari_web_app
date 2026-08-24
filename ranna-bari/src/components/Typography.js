import React from 'react';
import { Platform, Text as RNText } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import useResponsive from '../theme/useResponsive';
import { font, tracking, type } from '../theme/tokens';

/**
 * The stylesheet splits the voice in two: Fraunces carries display copy
 * (artisanal, specific) and Inter carries every control and body run. These
 * primitives are the only places either family is named, so the split can't
 * drift the way it did in the CSS before the "MODERN REFRESH LAYER" fixed it.
 */

/** `.hero-title-modern` — 800 weight, -0.018em, line-height 1.0 */
export function Display({ style, children, ...rest }) {
  const { colors } = useTheme();
  const r = useResponsive();
  return (
    <RNText
      style={[displayStyle(r.heroTitle), { color: colors.text }, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** The metrics of `.hero-title-modern`, shared with the gradient half. */
export const displayStyle = (size) => ({
  fontFamily: font.displayExtra,
  fontSize: size,
  lineHeight: size * 1.02,
  letterSpacing: size * -0.018,
});

/** `.section-title` — 800 weight, -0.012em */
export function SectionTitle({ small, style, children, ...rest }) {
  const { colors } = useTheme();
  const r = useResponsive();
  const size = small ? type.h2sm : r.sectionTitle;
  return (
    <RNText
      style={[
        {
          fontFamily: font.displayExtra,
          fontSize: size,
          lineHeight: size * 1.08,
          letterSpacing: size * -0.012,
          color: colors.text,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Any h3-scale display heading (`.cook-name`, `.menu-name`, card titles). */
export function Heading({ size = 20, style, children, ...rest }) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        {
          fontFamily: font.displayBold,
          fontSize: size,
          lineHeight: size * 1.14,
          letterSpacing: size * -0.01,
          color: colors.text,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Body copy — Inter, 1.6 leading, -0.006em. */
export function Body({ size = type.sm + 1, muted, style, children, ...rest }) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        {
          fontFamily: font.ui,
          fontSize: size,
          lineHeight: size * 1.6,
          letterSpacing: size * -0.006,
          color: muted ? colors.textMuted : colors.text,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** `.eyebrow` / `.stat-label` / `.form-label` — uppercase micro-label. */
export function Label({ size = type.micro, style, children, ...rest }) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        {
          fontFamily: font.uiSemi,
          fontSize: size,
          letterSpacing: size * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/**
 * Money. The CSS pulls prices out of Fraunces on purpose: its heavy didone
 * numerals are genuinely ambiguous at a glance (the 3 reads close to a 5),
 * which is not a risk worth taking on a price. Inter, tabular figures.
 *
 * ৳ is U+09F3; Noto Sans Bengali is loaded so the glyph exists on every
 * device rather than falling back to a tofu box.
 */
export function Price({ size = 26, style, children, ...rest }) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        {
          fontFamily: font.uiBold,
          fontSize: size,
          letterSpacing: size * -0.02,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/**
 * `.text-primary-gradient` — vermilion into tamago at 115deg.
 * MaskedView paints the gradient through the glyph shapes, which is the only
 * way to get -webkit-background-clip:text behaviour in React Native.
 */
export function GradientText({ style, children, colors: override, ...rest }) {
  const { colors } = useTheme();
  const stops = override ?? [colors.primary, colors.saffron];

  // On web, @react-native-masked-view renders the mask element and drops the
  // gradient entirely, so use the CSS property the original stylesheet used.
  if (Platform.OS === 'web') {
    return (
      <RNText
        style={[
          style,
          {
            backgroundImage: `linear-gradient(115deg, ${stops[0]} 10%, ${stops[1]} 95%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          },
        ]}
        {...rest}
      >
        {children}
      </RNText>
    );
  }

  return (
    <MaskedView
      // Without this the mask box collapses to the row's cross-size on
      // Android and clips descenders off the gradient.
      style={{ flexDirection: 'row' }}
      maskElement={
        <RNText style={[style, { backgroundColor: 'transparent' }]} {...rest}>
          {children}
        </RNText>
      }
    >
      <LinearGradient
        colors={stops}
        start={{ x: 0.06, y: 0 }}
        end={{ x: 0.94, y: 1 }}
      >
        {/* Transparent twin: sizes the gradient to the exact glyph run. */}
        <RNText style={[style, { opacity: 0 }]} {...rest}>
          {children}
        </RNText>
      </LinearGradient>
    </MaskedView>
  );
}
