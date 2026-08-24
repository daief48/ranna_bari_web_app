import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function ChefCard({ chef, onPress, index = 0 }) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {chef.isVerified && (
        <View style={[styles.verifiedBadge, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
          <Text style={[styles.verifiedText, { color: colors.primary }]}>Verified Kitchen</Text>
        </View>
      )}

      <View style={styles.header}>
        <Image source={{ uri: chef.avatar }} style={styles.avatar} />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {chef.name}
          </Text>
          <Text style={[styles.specialty, { color: colors.primary }]} numberOfLines={1}>
            {chef.specialty}
          </Text>
        </View>
      </View>

      <View style={styles.tags}>
        {chef.tags.slice(0, 3).map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceHover }]}>
            <Text style={[styles.tagText, { color: colors.textMuted }]}>{tag}</Text>
          </View>
        ))}
        {chef.ecoBadge && (
          <View style={[styles.ecoBadge, { backgroundColor: 'rgba(107,143,113,0.12)' }]}>
            <Ionicons name="leaf" size={12} color={colors.sage} />
            <Text style={[styles.ecoText, { color: colors.sage }]}>{chef.ecoBadge}</Text>
          </View>
        )}
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.rating}>
          <Ionicons name="star" size={16} color={colors.saffron} />
          <Text style={[styles.ratingText, { color: colors.text }]}>{chef.rating}</Text>
          <Text style={[styles.reviewCount, { color: colors.textMuted }]}>({chef.reviewCount})</Text>
        </View>
        <View style={styles.viewMenu}>
          <Text style={[styles.viewMenuText, { color: colors.primary }]}>View menu</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
    marginBottom: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  specialty: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  ecoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  ecoText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 15,
    fontWeight: '800',
  },
  reviewCount: {
    fontSize: 12,
  },
  viewMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewMenuText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
