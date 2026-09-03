import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'rannabari_cart';

/** Matches the web build's fee lines on cart.html. */
export const DELIVERY_FEE = 40;
export const PLATFORM_FEE = 10;

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  // Persist after hydration only, so the initial empty state never
  // overwrites a stored cart during the first render pass.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {});
  }, [items, hydrated]);

  const add = useCallback((item, chef, qty = 1) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image: item.image,
          chefId: chef?.id ?? null,
          chefName: chef?.name ?? '',
          qty,
        },
      ];
    });
  }, []);

  /**
   * Put a past order back in the basket.
   *
   * Refills the cart rather than re-placing the order, and that is the whole
   * design. A dish delisted since, a price that moved, a kitchen now closed —
   * checkout already knows about all of it, and re-placing directly would
   * need every one of those checks written a second time. This way the
   * customer lands on a basket they can look at before they pay.
   *
   * Added to whatever is already there rather than replacing it: somebody
   * halfway through a basket who taps "order again" wants both, and silently
   * dropping what they had chosen would be the worse surprise.
   */
  const reorder = useCallback((order) => {
    const lines = Array.isArray(order?.items) ? order.items : [];
    if (!lines.length) return 0;

    setItems((prev) => {
      const next = [...prev];
      for (const line of lines) {
        if (!line?.id) continue;
        const at = next.findIndex((i) => i.id === line.id);
        const qty = Number(line.qty) || 1;
        if (at >= 0) next[at] = { ...next[at], qty: next[at].qty + qty };
        else
          next.push({
            id: line.id,
            name: line.name,
            description: line.description ?? '',
            price: line.price,
            image: line.image,
            /* From the order, not from a lookup: the kitchen that cooked it
               is the one being reordered from. */
            chefId: line.chefId ?? order.chefId ?? null,
            chefName: line.chefName ?? order.chefName ?? '',
            qty,
          });
      }
      return next;
    });

    return lines.length;
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQty = useCallback((id, delta) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      items,
      count,
      subtotal,
      deliveryFee: items.length ? DELIVERY_FEE : 0,
      platformFee: items.length ? PLATFORM_FEE : 0,
      total: items.length ? subtotal + DELIVERY_FEE + PLATFORM_FEE : 0,
      add,
      reorder,
      remove,
      updateQty,
      clear,
      hydrated,
    };
  }, [items, add, reorder, remove, updateQty, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
