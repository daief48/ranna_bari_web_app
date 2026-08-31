import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { call } from '../lib/server';
import { useCommerce } from './CommerceContext';
import { useSession } from './SessionContext';

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

/**
 * Neither `cancelled` nor `rejected` is a step, so both sit outside the rail.
 *
 * `completed` is here because the escrow rail has one more state than the COD
 * one: `delivered` is the courier's word and `completed` is the customer's,
 * and money moves on the second. Without it a finished escrow order counted
 * as still open on the cook's board forever.
 */
export const isClosed = (status) =>
  status === 'delivered' ||
  status === 'completed' ||
  status === 'cancelled' ||
  status === 'rejected';

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

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  /* Orders live in one place now -- `CommerceContext` fetches `/orders`, which
     returns every row this account is on whatever kind it is. This provider
     kept its own copy while orders were a device thing; keeping a second one
     against a server would mean two lists that disagree about a status the
     cook just changed. So it projects rather than stores. */
  const shop = useCommerce();
  const { token } = useSession();

  /**
   * Every order this account is on, newest first.
   *
   * This used to be `filter(kind === 'cod')` — the cash-on-delivery rail the
   * rider walks — on the grounds that meals, shop baskets and won requests
   * are escrow orders with their own screens. Those screens do exist, but
   * nothing led to them: a customer who pre-booked a meal saw "5 orders so
   * far" counting only their dish orders, and no way from that page to the
   * others. One list of everything you have bought is what a person means by
   * "my orders", and the kind is a fact about a row, not a reason to hide it.
   *
   * Sorted here rather than at each call site so the order is the same
   * everywhere, and by `createdAt` rather than by id — the ids are ObjectIds,
   * which sort by creation time only by accident of encoding.
   */
  const orders = useMemo(
    () =>
      [...shop.orders].sort(
        (a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0),
      ),
    [shop.orders],
  );

  /**
   * Turn a checkout draft into orders — one per kitchen.
   *
   * The split is still made here, because it is a fact about the basket
   * rather than about the server: a basket spanning two kitchens is two
   * cooks with two queues, and the delivery and platform lines are charged
   * once per basket rather than once per kitchen. `POST /orders` takes the
   * whole array and answers per row, so one kitchen refusing does not lose
   * the other.
   */
  const placeOrder = useCallback(
    async (draft) => {
      const byKitchen = new Map();
      for (const item of draft.items) {
        const key = String(item.chefId ?? 'unknown');
        if (!byKitchen.has(key)) byKitchen.set(key, []);
        byKitchen.get(key).push(item);
      }

      const createdAt = new Date().toISOString();
      const drafts = Array.from(byKitchen.entries()).map(([chefId, items], i) => {
        const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
        const deliveryFee = i === 0 ? draft.deliveryFee : 0;
        const platformFee = i === 0 ? draft.platformFee : 0;

        return {
          /* The app's own code is the idempotency key on the server, so a
             retry after a dropped connection returns the order that already
             exists rather than making a second one. */
          code: makeCode(),
          kind: 'cod',
          chefId,
          chefName: items[0]?.chefName ?? '',
          title: items[0]?.name,
          image: items[0]?.image,
          items,
          subtotal,
          deliveryFee,
          platformFee,
          total: subtotal + deliveryFee + platformFee,
          status: 'placed',
          contact: draft.contact,
          address: draft.address,
          createdAt,
          history: [{ status: 'placed', at: createdAt }],
        };
      });

      const out = await call('/orders', { method: 'POST', token, body: { orders: drafts } });
      if (!out.ok) return out;

      const results = out.result.results ?? [];
      const failed = results.find((row) => !row.ok);
      /* Every row refused is a failure worth reporting; a partial success is
         not, because the orders that were taken are real and the customer has
         to be shown them. */
      if (failed && results.every((row) => !row.ok)) {
        return { ok: false, error: failed.error };
      }

      await shop.refresh();

      const ids = new Set(results.filter((r) => r.ok).map((r) => r.orderId));
      return {
        ok: true,
        result: results
          .filter((r) => r.ok)
          .map((r) => ({ id: r.orderId, code: r.code })),
        ids,
      };
    },
    [token, shop],
  );

  const getOrder = useCallback(
    (id) => orders.find((o) => String(o.id) === String(id)) ?? null,
    [orders],
  );

  /** Customer-side. Only an order the kitchen has not accepted can be pulled. */
  const cancelOrder = useCallback(
    (id, reason = 'Cancelled by the customer') =>
      shop.cancelOrder(id, 'customer', reason),
    [shop],
  );

  /** Cook-side. Move the order one step along the rail. */
  const advanceOrder = useCallback((id) => shop.advanceOrder(id), [shop]);

  /** A kitchen turning an order down. The server refunds nothing on a COD
      order — the rider never collected — but it still tells the customer. */
  const rejectOrder = useCallback(
    (id, reason) =>
      shop.cancelOrder(id, 'cook', reason || 'The kitchen could not take this order.'),
    [shop],
  );

  /** Every order that belongs to one kitchen, newest first. */
  const ordersForKitchen = useCallback(
    (kitchenId) =>
      kitchenId ? orders.filter((o) => String(o.kitchenId) === String(kitchenId)) : [],
    [orders],
  );

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
      refresh: shop.refresh,
      hydrated: shop.hydrated,
    }),
    [
      orders,
      placeOrder,
      getOrder,
      cancelOrder,
      advanceOrder,
      rejectOrder,
      ordersForKitchen,
      shop.refresh,
      shop.hydrated,
    ],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}


export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used inside <OrdersProvider>');
  return ctx;
}

/**
 * "24 Aug 2026, 9:12 pm" — one format, used on every order surface.
 *
 * `lang` picks the locale, so a Bengali reader gets Bengali month names and
 * numerals from Intl rather than an English date sitting inside a Bengali
 * sentence.
 */
export function formatOrderDate(iso, lang = 'en') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB';
  const date = d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date}, ${time}`;
}

/**
 * "4 min ago" / "2 hr ago" — the cook queue needs urgency, not a date.
 *
 * The translator is passed in rather than imported: this module is loaded by
 * the provider that sits above the language provider, and a phrase like this
 * cannot be assembled from parts anyway -- Bengali puts "আগে" after the unit,
 * so the whole sentence has to come out of the catalogue in one piece.
 */
export function timeAgo(iso, t = (s) => s, n = (v) => String(v)) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n} min ago', { n: n(mins) });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('{n} hr ago', { n: n(hrs) });
  const days = Math.round(hrs / 24);
  return t(days === 1 ? '{n} day ago' : '{n} days ago', { n: n(days) });
}
