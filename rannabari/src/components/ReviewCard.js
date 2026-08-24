import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function ReviewCard({ review }) {
  const { colors } = useTheme();

  const stars = Array.from({ length: 5 }, (_, i) => (
    <Ionicons
      key={i}
      name={i < review.rating ? 'star' : 'star-outline'}
      size={14}
      color={colors.saffron}
    />
  ));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.quote, { color: colors.primaryLight }]}>"</Text>
      <View style={styles.stars}>{stars}</View>
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={4}>
        {review.text}
      </Text>
      <View style={styles.author}>
        <Image source={{ uri: review.avatar }} style={styles.avatar} />
        <View>
          <Text style={[styles.name, { color: colors.text }]}>{review.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{review.area}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 16,
  },
  quote: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 48,
    marginBottom: -8,
    opacity: 0.3,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    fontSize: 11,
  },
});
