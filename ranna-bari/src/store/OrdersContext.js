import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'rannabari_orders';

/**
 * The lifecycle a COD order moves through. Everything past `placed` is driven
 * by the kitchen and the rider, which means a backend -- this build stores
 * orders locally, so an order stays `placed` until the customer cancels it.
 * The timeline still renders the whole path so the state is legible.
 */
export const ORDER_STEPS = [
  { key: 'placed', label: 'Order placed', icon: 'receipt' },
  { key: 'accepted', label: 'Kitchen accepted', icon: 'chefHat' },
  { key: 'cooking', label: 'Cooking now', icon: 'pot' },
  { key: 'on_the_way', label: 'On the way', icon: 'delivery' },
  { key: 'delivered', label: 'Delivered', icon: 'shieldCheck' },
];

export const stepIndex = (status) =>
  ORDER_STEPS.findIndex((s) => s.key === status);

export const PAYMENT_METHODS = [
  {
    key: 'cod',
    icon: 'banknote',
    title: 'Cash on Delivery',
    desc: 'Pay the rider in cash when your food arrives.',
    available: true,
  },
  {
    key: 'bkash',
    icon: 'lock',
    title: 'bKash / Card',
    desc: 'Online payment is not switched on for this kitchen yet.',
    available: false,
  },
];

/**
 * Human-readable order code. Ambiguous glyphs (I, O, 0, 1) are left out so a
 * code read aloud to a rider over the phone cannot be misheard.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeCode() {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `RB-${out}`;
}

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOrders(parsed);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  // Persist only after hydration, so the initial empty array never wipes
  // stored orders during the first render pass.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(KEY, JSON.stringify(orders)).catch(() => {});
  }, [orders, hydrated]);

  /**
   * @param {object} draft  items, totals, contact and address from checkout
   * @returns {object} the created order, including its code
   */
  const placeOrder = useCallback((draft) => {
    const order = {
      id: makeCode(),
      createdAt: new Date().toISOString(),
      status: 'placed',
      paymentMethod: draft.paymentMethod ?? 'cod',
      items: draft.items,
      chefName: draft.items[0]?.chefName ?? '',
      subtotal: draft.subtotal,
      deliveryFee: draft.deliveryFee,
      platformFee: draft.platformFee,
      total: draft.total,
      contact: draft.contact,
      address: draft.address,
    };
    setOrders((prev) => [order, ...prev]);
    return order;
  }, []);

  const getOrder = useCallback(
    (id) => orders.find((o) => o.id === id) ?? null,
    [orders],
  );

  const cancelOrder = useCallback((id) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id && o.status === 'placed'
          ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() }
          : o,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      orders,
      /** Anything not yet delivered or cancelled. */
      activeOrders: orders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled',
      ),
      placeOrder,
      getOrder,
      cancelOrder,
      hydrated,
    }),
    [orders, placeOrder, getOrder, cancelOrder, hydrated],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used inside <OrdersProvider>');
  return ctx;
}

/** "24 Aug 2026, 9:12 pm" — one format, used on every order surface. */
export function formatOrderDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date}, ${time}`;
}
