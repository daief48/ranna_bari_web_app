import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';
import { useConfig } from './ConfigContext';
import { customerKeyOf } from '../lib/ledger';

const KEY = 'rannabari_cart';

/**
 * The fees the app ships with.
 *
 * These are the fallback for the moment before `/config` has answered (and
 * for as long as it never does), not the price. The server sets both on the
 * platform settings page, ships them on `/config`, and — since it computes
 * every order's fees itself from those same settings — what the cart shows
 * is only ever a preview of what the till will charge. `ConfigContext`
 * starts from these exact values, so the preview cannot flicker between two
 * numbers on a warm launch.
 */
export const DELIVERY_FEE = 40;
export const PLATFORM_FEE = 10;

/**
 * Where one account's basket is kept.
 *
 * One key for everybody used to mean one basket for everybody: a customer
 * who signed out on a shared phone left their dinner in the cart for the
 * next person to check out, and signing into a second account showed the
 * first account's dishes under the second account's name. A guest keeps the
 * bare key so a basket filled before signing in is still there afterwards —
 * the checkout promises exactly that — and every account gets its own.
 */
const storageKeyFor = (owner) => (owner === 'guest' ? KEY : `${KEY}:${owner}`);

/** Two baskets, one list: quantities add where the same dish is in both. */
function mergeLines(base, extra) {
  const next = [...base];
  for (const line of extra) {
    const at = next.findIndex((i) => i.id === line.id);
    if (at >= 0) next[at] = { ...next[at], qty: next[at].qty + line.qty };
    else next.push(line);
  }
  return next;
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { account, hydrated: authReady } = useAuth();
  const { fees } = useConfig();
  const [items, setItems] = useState([]);
  /* Whose basket `items` currently is. "Hydrated" is a question about an
     owner rather than about the provider: the moment the account changes,
     the list in memory is the previous owner's until the new one's has been
     read, and nothing — least of all the persist effect below — may treat
     it as current before then. */
  const [loadedFor, setLoadedFor] = useState(null);

  const owner = customerKeyOf(account);
  const hydrated = loadedFor === owner;

  /* The list as of the last render, readable from inside the loader without
     making the loader re-run every time a dish is added. */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const previousOwner = useRef(null);

  useEffect(() => {
    /* The account is read from storage a moment after launch. Loading on the
       guest key first and then on the account's would carry an (empty) guest
       basket across every cold start as if somebody had just signed in. */
    if (!authReady) return undefined;
    let alive = true;

    (async () => {
      let next = [];
      try {
        const raw = await AsyncStorage.getItem(storageKeyFor(owner));
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) next = parsed;
      } catch {
        /* A corrupt entry is an empty basket, not a crash on launch. */
      }

      /* Signing in: the basket filled as a guest comes along, and the guest
         copy is spent so it cannot be carried in a second time. Signing out,
         or switching accounts, carries nothing — that is the point. */
      const from = previousOwner.current;
      if (owner !== 'guest' && from === 'guest' && itemsRef.current.length) {
        next = mergeLines(next, itemsRef.current);
        AsyncStorage.removeItem(KEY).catch(() => {});
      }

      if (!alive) return;
      previousOwner.current = owner;
      setItems(next);
      setLoadedFor(owner);
    })();

    return () => {
      alive = false;
    };
  }, [owner, authReady]);

  // Persist after hydration only, so the initial empty state never
  // overwrites a stored cart during the first render pass — and never under
  // a key whose basket has not been read yet.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKeyFor(owner), JSON.stringify(items)).catch(() => {});
  }, [items, hydrated, owner]);

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

  /**
   * Bring the lines up to date with the menu as it is now.
   *
   * A line is a copy of a dish taken the day it was added, and a basket can
   * sit on a phone for a week. The cook raises the price in between, and the
   * cart keeps showing the old one right up to the receipt — which the
   * server prices from the live dish, so the total on the receipt was not
   * the total on the button. The cart screen already holds every menu in
   * memory, so refreshing from it costs nothing; the server stays the one
   * that decides, this only stops the preview lying.
   *
   * `byId` maps a dish id to its current row. Lines whose dish is not in the
   * map are left alone — absent from a menu usually means "not loaded yet",
   * and the checkout is where "no longer sold" is actually decided.
   */
  const syncPrices = useCallback((byId) => {
    if (!byId || typeof byId.get !== 'function') return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const dish = byId.get(String(line.id));
        if (!dish || typeof dish.price !== 'number' || dish.price === line.price) return line;
        changed = true;
        return { ...line, price: dish.price };
      });
      return changed ? next : prev;
    });
  }, []);

  /* The live fee, or the shipped one until the server has spoken. Shown, and
     sent along with the order for the sake of a receipt that matches the
     button — but the server computes the real lines from its own settings
     and ignores these on arrival. */
  const deliveryFee = fees?.deliveryFee ?? DELIVERY_FEE;
  const platformFee = fees?.platformFee ?? PLATFORM_FEE;

  const value = useMemo(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      items,
      count,
      subtotal,
      deliveryFee: items.length ? deliveryFee : 0,
      platformFee: items.length ? platformFee : 0,
      total: items.length ? subtotal + deliveryFee + platformFee : 0,
      add,
      reorder,
      remove,
      updateQty,
      clear,
      syncPrices,
      hydrated,
    };
  }, [items, deliveryFee, platformFee, add, reorder, remove, updateQty, clear, syncPrices, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
