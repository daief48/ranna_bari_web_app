import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';

export default function MenuItemCard({ item }) {
  const { colors } = useTheme();
  const { addToCart } = useCart();

  const handleAdd = () => {
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
    });
    Alert.alert('Added!', `${item.name} added to cart.`);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Image source={{ uri: item.image }} style={styles.image} />
      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.tags && item.tags[0] && (
            <View style={[styles.tag, { backgroundColor: colors.surfaceHover }]}>
              <Text style={[styles.tagText, { color: colors.textMuted }]}>
                {item.tags[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.desc, { color: colors.textMuted }]} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      <View style={styles.priceAction}>
        <Text style={[styles.price, { color: colors.text }]}>৳{item.price}</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={handleAdd}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addText}>ADD</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  details: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  desc: {
    fontSize: 12,
    lineHeight: 16,
  },
  priceAction: {
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontSize: 17,
    fontWeight: '900',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  addText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
