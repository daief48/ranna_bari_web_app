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
 * The lifecycle a COD order moves through.
 *
 * Everything past `placed` used to be unreachable: it is driven by the
 * kitchen, and this build has no backend to play that part. The cook panel
 * is now that part -- a cook signed in on this device advances their own
 * queue, and the customer's timeline moves with it.
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

/** Neither `cancelled` nor `rejected` is a step, so both sit outside the rail. */
export const isClosed = (status) =>
  status === 'delivered' || status === 'cancelled' || status === 'rejected';

/** What the cook's button says at each stage, and where it goes. */
export const NEXT_STEP = {
  placed: 'accepted',
  accepted: 'cooking',
  cooking: 'on_the_way',
  on_the_way: 'delivered',
};

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

/** The cut a cook keeps, as promised on the become-a-cook page. */
export const COOK_PAYOUT_RATE = 0.85;

/** A cook is paid on the food, never on the delivery or platform lines. */
export const cookPayout = (order) =>
  Math.round((order.subtotal ?? 0) * COOK_PAYOUT_RATE);

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

/** Minutes before now, as an ISO string — used to age the seeded orders. */
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

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
   * Turn a checkout draft into orders — one per kitchen.
   *
   * The cart groups its rows by kitchen already, and a basket spanning two
   * kitchens is two separate cooks with two separate queues. Splitting here
   * is what lets a cook see only their own work.
   *
   * The delivery and platform lines are charged once per basket, not once
   * per kitchen, so they ride on the first order and the rest carry zero.
   * The sum across the split matches the total the customer was shown, and a
   * cook's payout reads off `subtotal`, which is untouched either way.
   *
   * @param {object} draft  items, totals, contact and address from checkout
   * @returns {object[]} the created orders, newest-kitchen-first
   */
  const placeOrder = useCallback((draft) => {
    const byKitchen = new Map();
    for (const item of draft.items) {
      const key = String(item.chefId ?? 'unknown');
      if (!byKitchen.has(key)) byKitchen.set(key, []);
      byKitchen.get(key).push(item);
    }

    const createdAt = new Date().toISOString();
    const created = Array.from(byKitchen.entries()).map(([chefId, items], i) => {
      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const deliveryFee = i === 0 ? draft.deliveryFee : 0;
      const platformFee = i === 0 ? draft.platformFee : 0;

      return {
        id: makeCode(),
        createdAt,
        status: 'placed',
        paymentMethod: draft.paymentMethod ?? 'cod',
        items,
        chefId: chefId === 'unknown' ? null : chefId,
        chefName: items[0]?.chefName ?? '',
        subtotal,
        deliveryFee,
        platformFee,
        total: subtotal + deliveryFee + platformFee,
        contact: draft.contact,
        address: draft.address,
        /* Every status change is stamped, so both the customer timeline and
           the cook's history can say when rather than just what. */
        history: [{ status: 'placed', at: createdAt }],
      };
    });

    setOrders((prev) => [...created, ...prev]);
    return created;
  }, []);

  const getOrder = useCallback(
    (id) => orders.find((o) => o.id === id) ?? null,
    [orders],
  );

  /** Stamp a status change and record it on the order's history. */
  const applyStatus = useCallback((id, status, extra) => {
    const at = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              ...extra,
              status,
              history: [...(o.history ?? []), { status, at }],
            }
          : o,
      ),
    );
  }, []);

  /** Customer-side. Only an order the kitchen has not accepted can be pulled. */
  const cancelOrder = useCallback(
    (id) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id || o.status !== 'placed') return o;
          const at = new Date().toISOString();
          return {
            ...o,
            status: 'cancelled',
            cancelledAt: at,
            history: [...(o.history ?? []), { status: 'cancelled', at }],
          };
        }),
      );
    },
    [],
  );

  /** Cook-side. Move the order one step along the rail. */
  const advanceOrder = useCallback(
    (id) => {
      setOrders((prev) => {
        const order = prev.find((o) => o.id === id);
        const next = order && NEXT_STEP[order.status];
        if (!next) return prev;
        const at = new Date().toISOString();
        return prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: next,
                history: [...(o.history ?? []), { status: next, at }],
                ...(next === 'delivered' ? { deliveredAt: at } : null),
              }
            : o,
        );
      });
    },
    [],
  );

  /** Cook-side. A kitchen turning an order down is not the same as a customer
      cancelling it, so it gets its own terminal status and keeps the reason. */
  const rejectOrder = useCallback(
    (id, reason) => {
      applyStatus(id, 'rejected', {
        rejectedAt: new Date().toISOString(),
        rejectReason: reason || 'The kitchen could not take this order.',
      });
    },
    [applyStatus],
  );

  /** Every order that belongs to one kitchen, newest first. */
  const ordersForKitchen = useCallback(
    (kitchenId) =>
      kitchenId
        ? orders.filter((o) => String(o.chefId) === String(kitchenId))
        : [],
    [orders],
  );

  /**
   * Give a brand-new kitchen a queue to work with.
   *
   * Without a backend there is nobody else on this device to place an order,
   * so a cook would sign up into an empty dashboard with nothing to press.
   * These four cover every state the panel renders: one waiting to be
   * accepted, one mid-cook, one out for delivery, one already done.
   *
   * Runs once — the `isDemo` flag on the rows is the guard.
   */
  const seedKitchenOrders = useCallback((kitchen) => {
    if (!kitchen?.dishes?.length) return;

    setOrders((prev) => {
      if (prev.some((o) => o.isDemo)) return prev;

      const dish = (i) => kitchen.dishes[i % kitchen.dishes.length];
      const line = (i, qty) => {
        const d = dish(i);
        return {
          id: d.id,
          name: d.name,
          description: d.description,
          price: d.price,
          image: d.image,
          chefId: kitchen.id,
          chefName: kitchen.name,
          qty,
        };
      };

      const drafts = [
        {
          minutes: 4,
          status: 'placed',
          items: [line(0, 1), line(2, 2)],
          contact: { name: 'Tanvir Ahmed', phone: '+8801711223344' },
          address: {
            label: 'Home',
            line: 'House 41, Road 9/A, Flat 2C',
            area: 'Dhanmondi, Dhaka',
            instructions: 'Please ring the bell twice, the gate bell is broken.',
          },
        },
        {
          minutes: 26,
          status: 'cooking',
          items: [line(1, 1)],
          contact: { name: 'Nusrat Jahan', phone: '+8801812334455' },
          address: {
            label: 'Office',
            line: 'Level 6, Rangs Babylonia, Bijoy Sarani',
            area: 'Tejgaon, Dhaka',
            instructions: '',
          },
        },
        {
          minutes: 58,
          status: 'on_the_way',
          items: [line(0, 2), line(1, 1)],
          contact: { name: 'Imran Hossain', phone: '+8801913445566' },
          address: {
            label: 'Home',
            line: 'House 7, Road 3, Shukrabad',
            area: 'Dhanmondi, Dhaka',
            instructions: 'Leave with the guard if nobody answers.',
          },
        },
        {
          minutes: 1_580,
          status: 'delivered',
          items: [line(2, 3)],
          contact: { name: 'Farhana Rahman', phone: '+8801614556677' },
          address: {
            label: 'Home',
            line: 'Apt 5B, 22 Green Road',
            area: 'Dhanmondi, Dhaka',
            instructions: '',
          },
        },
      ];

      const seeded = drafts.map((d) => {
        const subtotal = d.items.reduce((s, it) => s + it.price * it.qty, 0);
        const createdAt = minutesAgo(d.minutes);
        const reached = ORDER_STEPS.slice(0, stepIndex(d.status) + 1);

        return {
          id: makeCode(),
          createdAt,
          status: d.status,
          paymentMethod: 'cod',
          items: d.items,
          chefId: kitchen.id,
          chefName: kitchen.name,
          subtotal,
          deliveryFee: 40,
          platformFee: 10,
          total: subtotal + 50,
          contact: d.contact,
          address: d.address,
          isDemo: true,
          /* Back-date each step it has already passed, evenly across the
             order's age, so the timeline is not four identical stamps. */
          history: reached.map((s, i) => ({
            status: s.key,
            at: minutesAgo(d.minutes - (d.minutes / reached.length) * i),
          })),
        };
      });

      return [...prev, ...seeded];
    });
  }, []);

  const value = useMemo(
    () => ({
      orders,
      /** Anything the customer is still waiting on. */
      activeOrders: orders.filter((o) => !isClosed(o.status)),
      placeOrder,
      getOrder,
      cancelOrder,
      advanceOrder,
      rejectOrder,
      ordersForKitchen,
      seedKitchenOrders,
      hydrated,
    }),
    [
      orders,
      placeOrder,
      getOrder,
      cancelOrder,
      advanceOrder,
      rejectOrder,
      ordersForKitchen,
      seedKitchenOrders,
      hydrated,
    ],
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

/** "4 min ago" / "2 hr ago" — the cook queue needs urgency, not a date. */
export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
