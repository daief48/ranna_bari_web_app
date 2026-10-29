import React from 'react';
import { Text } from 'react-native';
import { Image } from 'expo-image';

/**
 * A shelf's icon, whichever kind it is.
 *
 * An uploaded picture wins over the emoji: the cook chose it on purpose, and
 * the emoji left behind is only what the picker last held. With neither, it
 * draws nothing (or a bullet, when `fallback` asks for one) rather than an
 * empty gap.
 *
 * @param {object} props
 * @param {{emoji?: string, image?: string}} props.category
 * @param {number} [props.size]      Edge of the picture, and the emoji's font.
 * @param {string} [props.fallback]  Drawn when the shelf has no icon at all.
 */
export default function CategoryIcon({ category, size = 16, fallback = '' }) {
  const image = category?.image;
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
      />
    );
  }
  const glyph = category?.emoji || fallback;
  return glyph ? <Text style={{ fontSize: Math.round(size * 0.85) }}>{glyph}</Text> : null;
}
