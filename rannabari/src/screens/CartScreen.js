import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';
import CartItem from '../components/CartItem';

const DELIVERY_FEE = 40;
const PLATFORM_FEE = 10;

export default function CartScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { cart, cartCount, cartSubtotal, clearCart } = useCart();

  const total = cartSubtotal + (cartCount > 0 ? DELIVERY_FEE + PLATFORM_FEE : 0);

  const handleCheckout = () => {
    Alert.alert(
      'Order Placed! 🎉',
      `Your order of ৳${total} has been placed. Thank you for ordering from RannaBari!`,
      [{ text: 'OK', onPress: () => clearCart() }]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          YOUR <Text style={{ color: colors.primary }}>CART</Text>
        </Text>
      </View>

      {cartCount === 0 ? (
        /* Empty State */
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="cart-outline" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your cart is empty</Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            Browse our curated artisans and add your favourite home-cooked meals.
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('BrowseTab')}
          >
            <Text style={styles.browseBtnText}>BROWSE ARTISANS</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* AI Suggestion */}
          <View style={[styles.aiSuggestion, { backgroundColor: colors.bgElevated, borderColor: colors.cardBorder }]}>
            <Ionicons name="sparkles" size={24} color={colors.saffron} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.aiTitle, { color: colors.text }]}>AI Pairing Suggestion</Text>
              <Text style={[styles.aiDesc, { color: colors.textMuted }]}>
                Based on your order, we recommend a cool Mint Lemonade for ৳40.
              </Text>
            </View>
          </View>

          {/* Cart Items */}
          <FlatList
            data={cart}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            renderItem={({ item }) => <CartItem item={item} />}
          />

          {/* Summary & Checkout */}
          <View style={[styles.summary, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Subtotal</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>৳{cartSubtotal}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Delivery Fee</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>৳{DELIVERY_FEE}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Platform Fee</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>৳{PLATFORM_FEE}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.totalValue, { color: colors.primary }]}>৳{total}</Text>
            </View>

            <TouchableOpacity activeOpacity={0.85} onPress={handleCheckout}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.checkoutBtn}
              >
                <Text style={styles.checkoutText}>PROCEED TO CHECKOUT</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={[styles.secureText, { color: colors.textLight }]}>
              Secure checkout. Guaranteed fresh delivery.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Empty
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 22, fontWeight: '900' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  browseBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  browseBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },

  // AI Suggestion
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  aiTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  aiDesc: { fontSize: 12, lineHeight: 16 },

  // Summary
  summary: {
    padding: 20,
    borderTopWidth: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  totalLabel: { fontSize: 18, fontWeight: '900' },
  totalValue: { fontSize: 20, fontWeight: '900' },
  checkoutBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  checkoutText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  secureText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 12,
  },
});
