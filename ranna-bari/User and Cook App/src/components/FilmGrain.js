import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

const GRAIN = require('../../assets/grain.png');

/**
 * `body::after` — a fixed, non-interactive noise plate over the whole page.
 * The single cheapest way to stop large flat colour fields from looking like
 * plastic: it gives every surface a faint material tooth.
 *
 * Web uses feTurbulence at 3.2% with mix-blend-mode:multiply (4.5% / screen in
 * dark mode). Here the same tile is a repeated bitmap; the blend mode applies
 * where the platform supports it and is ignored where it doesn't, which still
 * leaves a plain low-opacity grain.
 */
export default function FilmGrain() {
  const { isDark } = useTheme();

  const opacity = isDark ? 0.045 : 0.032;
  const blend = isDark ? 'screen' : 'multiply';

  // react-native-web does not implement resizeMode="repeat" -- it paints one
  // tile in the corner, which reads as a stray pale square rather than grain.
  // Fall back to the CSS property that does tile.
  if (Platform.OS === 'web') {
    // Image.resolveAssetSource is a native-only helper; on web the bundler
    // hands back either a URL string or a {uri} object, so read both shapes.
    const uri = typeof GRAIN === 'string' ? GRAIN : GRAIN?.uri;
    if (!uri) return null;

    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity,
            mixBlendMode: blend,
            backgroundImage: `url(${uri})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '128px 128px',
          },
        ]}
      />
    );
  }

  return (
    <Image
      pointerEvents="none"
      source={GRAIN}
      resizeMode="repeat"
      style={[StyleSheet.absoluteFill, { opacity, mixBlendMode: blend }]}
    />
  );
}
