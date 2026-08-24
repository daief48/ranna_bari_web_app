import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const ICON_MAP = {
  'Healthy & Keto': 'fitness',
  'Heritage Spices': 'flame',
  'Comfort Stews': 'restaurant',
  'Clean Street Food': 'fast-food',
  'Sweet Tooth': 'ice-cream',
  'Coastal Catch': 'fish',
  'Plant-Based': 'leaf',
};

export default function MoodPill({ label, onPress }) {
  const { colors } = useTheme();
  const iconName = ICON_MAP[label] || 'restaurant';

  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: colors.bgElevated, borderColor: colors.cardBorder }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={iconName} size={16} color={colors.primary} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1,
    gap: 8,
    marginRight: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
