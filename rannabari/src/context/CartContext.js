import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  // Load from storage on mount
  useEffect(() => {
    AsyncStorage.getItem('rannabari_cart').then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setCart(parsed);
        } catch (e) { /* ignore */ }
      }
    });
  }, []);

  // Persist whenever cart changes
  useEffect(() => {
    AsyncStorage.setItem('rannabari_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = useCallback((item, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQty = useCallback((id, change) => {
    setCart((prev) => {
      return prev
        .map((i) => {
          if (i.id !== id) return i;
          const newQty = i.qty + change;
          return newQty <= 0 ? null : { ...i, qty: newQty };
        })
        .filter(Boolean);
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartSubtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQty, clearCart, cartCount, cartSubtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
