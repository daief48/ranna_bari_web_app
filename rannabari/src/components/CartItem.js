import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';

export default function CartItem({ item }) {
  const { colors } = useTheme();
  const { updateQty, removeFromCart } = useCart();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Image source={{ uri: item.image }} style={styles.image} />
      <View style={styles.details}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.price, { color: colors.primary }]}>৳{item.price}</Text>
      </View>
      <View style={styles.qtyControls}>
        <TouchableOpacity
          style={[styles.qtyBtn, { backgroundColor: colors.surfaceHover }]}
          onPress={() => updateQty(item.id, -1)}
        >
          <Ionicons name="remove" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.qtyVal, { color: colors.text }]}>{item.qty}</Text>
        <TouchableOpacity
          style={[styles.qtyBtn, { backgroundColor: colors.surfaceHover }]}
          onPress={() => updateQty(item.id, 1)}
        >
          <Ionicons name="add" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.removeBtn}>
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 20,
    textAlign: 'center',
  },
  removeBtn: {
    padding: 4,
  },
});
