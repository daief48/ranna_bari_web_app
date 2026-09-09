import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useMaxQtyPerItem } from './ConfigContext';

const KEY = 'rannabari_cart';

/** Matches the web build's fee lines on cart.html. */
export const DELIVERY_FEE = 40;
export const PLATFORM_FEE = 10;

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  /*
   * The platform's ceiling on one line, set from the admin panel.
   *
   * This basket is the device's own — no server round trip to refuse an
   * add — so the limit has to be applied here or it is not applied at all on
   * this side. `CartProvider` sits inside `ConfigProvider`, so the live value
   * is available; it falls back to the shipped default when the server has
   * not answered, because a cap that disappears offline is not a cap.
   */
  const maxQty = useMaxQtyPerItem();

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
      /* Adding the same dish again is a bigger quantity, never a second row —
         it always was, and the clamp is what keeps that merge from walking
         past the limit one tap at a time. */
      if (found) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, qty: Math.min(i.qty + qty, maxQty) } : i,
        );
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
          qty: Math.min(qty, maxQty),
        },
      ];
    });
  }, [maxQty]);

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
        if (at >= 0)
          next[at] = { ...next[at], qty: Math.min(next[at].qty + qty, maxQty) };
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
            qty: Math.min(qty, maxQty),
          });
      }
      return next;
    });

    return lines.length;
  }, [maxQty]);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQty = useCallback(
    (id, delta) => {
      setItems((prev) =>
        prev
          .map((i) => (i.id === id ? { ...i, qty: Math.min(i.qty + delta, maxQty) } : i))
          .filter((i) => i.qty > 0),
      );
    },
    [maxQty],
  );

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    /* How many different things are in the basket, which is not the same
       question as how many plates. The badge asks the first — "three items"
       reads as three lines to look at, where the sum of the quantities reads
       as a number nobody put there on purpose. */
    const lineCount = items.length;
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      items,
      count,
      lineCount,
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
      maxQty,
    };
  }, [items, add, reorder, remove, updateQty, clear, hydrated, maxQty]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
