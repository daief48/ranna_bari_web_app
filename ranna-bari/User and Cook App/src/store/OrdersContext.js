import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { call } from '../lib/server';
import {
  DEFAULT_PAYOUT_RATES,
  ORDER_STEPS,
  NEXT_STEP,
  cookPayoutAt,
  isClosed,
  stageOf,
  stepIndex,
} from '../lib/orderRails';
import { useCommerce } from './CommerceContext';
import { useConfig } from './ConfigContext';
import { useSession } from './SessionContext';

/*
 * The rails themselves — which status follows which, which ones are endings,
 * which stage a status belongs to — live in `src/lib/orderRails`, stated once
 * for every cook surface. They are re-exported here under the names this
 * module always had, because the customer's timeline and the status pills
 * import them from here and have no reason to know where they moved.
 */
export { ORDER_STEPS, NEXT_STEP, isClosed, stageOf, stepIndex };

/*
 * The wallet is the only way to pay a new order.
 *
 * Cash on delivery (and the "bKash / Card, soon" placeholder) are gone from
 * checkout: the server now refuses a new `cod` order outright
 * (`cash-not-accepted`). Orders already placed as cash keep their rail and
 * their screens; only the choice of a NEW one is retired. The list stays a
 * list so the checkout's row component needs no special case.
 */
export const PAYMENT_METHODS = [
  /*
   * The wallet, for the one purchase path that could not use it.
   *
   * Meals, the shelf and a won request all took payment from here; kitchen
   * dishes did not, so a customer topped up a balance that could not buy
   * them dinner — and a cash order that went wrong had no held money for a
   * refund to come from.
   *
   * `available` is decided at the checkout, where the balance and the total
   * are both known.
   */
  {
    key: 'wallet',
    icon: 'lock',
    title: 'Wallet',
    desc: 'Held until you confirm the food arrived, then paid to the cook.',
    available: true,
  },
];

/**
 * The cut a cook keeps, per kind of order.
 *
 * This was one constant, 0.85, baked in when the become-a-cook page promised
 * it. The platform has set the rate per system in its settings for some time
 * (`/config` answers `payoutRates`), so the constant drifted from the ledger
 * the moment an operator changed a commission: the card said one figure and
 * the payout run paid another. The provider below reads the live rates and
 * pins them here, so `cookPayout(order)` — which every cook surface calls
 * bare, often inside a memo — answers with the server's number for that
 * order's kind, and the shipped defaults only until `/config` has spoken.
 *
 * Module state rather than a hook so the call sites stay plain functions; the
 * provider also puts `payoutRates` on its value, which is what a memoised
 * caller lists in its deps so a rate arriving after the orders still repaints.
 */
let currentRates = DEFAULT_PAYOUT_RATES;

/** The cook's cut of one order, in whole taka, at the live rate for its kind. */
export const cookPayout = (order, rates = currentRates) => cookPayoutAt(order, rates);

/**
 * Kept for the one reader that wants a headline percentage ("you keep 85%").
 * It is the cash rate, which is what that sentence has always meant.
 */
export const COOK_PAYOUT_RATE = DEFAULT_PAYOUT_RATES.cod;

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

  /* The live payout rates, pinned for the bare `cookPayout()` above the
     moment they change. Set during render on purpose — the same reason the
     language provider sets the type script in render: the first paint after
     `/config` answers already has to be at the right rate, and an effect
     would show one frame of the shipped number. The fallback object is the
     shipped defaults, so `rates` is never undefined for a memo to depend on. */
  const config = useConfig();
  const payoutRates = config?.payoutRates ?? DEFAULT_PAYOUT_RATES;
  currentRates = payoutRates;

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
  /*
   * The codes of an attempt that has not finished.
   *
   * The code is the server's idempotency key, and `makeCode()` ran inside
   * every call — so the retry after a dropped response carried a *fresh* key,
   * the server saw a different order, and the customer who tapped again was
   * charged twice (twice held, on the wallet). A code now belongs to the
   * basket it was drawn for: the same kitchen, the same lines, the same
   * payment method keep it until the server has answered for it. Change the
   * basket and the key changes with it, so a genuinely new order is still one.
   */
  const attempts = useRef(new Map());

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

        /* The lines *and* where they are going. The key used to be the lines
           alone, so a customer whose first attempt dropped, who then fixed
           the address (or the phone, or the note) and tapped again, sent the
           old code — and the server, which replays on `code`, handed back
           the order with the wrong address on it. The delivery details are
           part of what makes an order the same order. */
        const basketKey = [
          draft.paymentMethod,
          chefId,
          ...items.map((it) => `${it.id}:${it.qty}`).sort(),
          JSON.stringify({
            address: draft.address ?? null,
            contact: draft.contact ?? null,
            note: draft.note ?? '',
          }),
        ].join('|');
        if (!attempts.current.has(basketKey)) attempts.current.set(basketKey, makeCode());

        return {
          /* The app's own code is the idempotency key on the server, so a
             retry after a dropped connection returns the order that already
             exists rather than making a second one. */
          code: attempts.current.get(basketKey),
          basketKey,
          /* The rail this order runs on. Always the wallet now: the money is
             held in escrow and needs the customer to confirm receipt before
             it is released. (Cash is retired for new orders.) */
          kind: 'wallet',
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
          /* The customer's words for the cook — every kitchen's order in the
             basket carries it. The server caps it at 300. */
          ...(draft.note ? { note: draft.note } : {}),
          createdAt,
          history: [{ status: 'placed', at: createdAt }],
        };
      });

      const out = await call('/orders', {
        method: 'POST',
        token,
        body: { orders: drafts.map(({ basketKey, ...wire }) => wire) },
      });
      /* A dropped connection keeps its codes: the server may well have made the
         order, and the retry must ask about the same one. */
      if (!out.ok) return out;

      const results = out.result.results ?? [];

      /* The server has now answered for each of these, either way. A success
         is done; a refusal is a real answer and a retry deserves a fresh code. */
      for (const draftRow of drafts) attempts.current.delete(draftRow.basketKey);

      const failed = results.find((row) => !row.ok);
      /* Every row refused is a failure worth reporting; a partial success is
         not, because the orders that were taken are real and the customer has
         to be shown them. */
      if (failed && results.every((row) => !row.ok)) {
        /* `detail` travels with the code: the checkout reads `detail.short`
           off `wallet-low-balance` and `detail.id`/`detail.field` off
           `request-invalid`, and they were being dropped here. */
        return { ok: false, error: failed.error, detail: failed.detail ?? null };
      }

      await shop.refresh();

      const ids = new Set(results.filter((r) => r.ok).map((r) => r.orderId));

      /* Which kitchens were refused, so the basket can keep exactly those. */
      const codeToKitchen = new Map(drafts.map((d) => [d.code, d.chefId]));
      const refused = results
        .filter((r) => !r.ok)
        .map((r) => ({
          chefId: codeToKitchen.get(r.code),
          error: r.error,
          detail: r.detail ?? null,
        }));

      return {
        ok: true,
        refused,
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

  /**
   * Customer-side. The last word on the order, and the only one that closes it.
   *
   * `delivered` is the kitchen's claim; this is the doorstep answering. On a
   * wallet order it is also what puts the row on the operator's release
   * queue — closing the order and paying the cook are two decisions with two
   * owners, and this is the first of them.
   */
  const confirmReceived = useCallback((id) => shop.confirmReceived(id), [shop]);

  /** Rate the kitchen an order came from. Once, and only by whoever ate it. */
  const rateOrder = useCallback(
    (id, rating, text) => shop.rateOrder(id, rating, text),
    [shop],
  );

  /**
   * Fetch one order that is not in the list.
   *
   * The list is capped at fifty and arrives a moment after the app does, so
   * "not in `orders`" means three different things — too old, not loaded yet,
   * and does not exist — and a screen that reads the list alone renders the
   * last of them for all three. An order opened from a notification, or from
   * a link a customer kept, is exactly the case that hits it.
   */
  const ensureOrder = useCallback((id) => shop.ensureOrder(id), [shop]);

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
      /** Anything the customer is still waiting on. By the order, not the
          status: a wallet order marked delivered is still theirs to confirm. */
      activeOrders: orders.filter((o) => !isClosed(o)),
      /** The server's payout rates per kind — list these in a memo's deps
          wherever `cookPayout` is summed, so a rate that lands after the
          orders do still repaints the figure. */
      payoutRates,
      placeOrder,
      getOrder,
      cancelOrder,
      advanceOrder,
      confirmReceived,
      rateOrder,
      ensureOrder,
      rejectOrder,
      ordersForKitchen,
      refresh: shop.refresh,
      hydrated: shop.hydrated,
    }),
    [
      orders,
      payoutRates,
      placeOrder,
      getOrder,
      cancelOrder,
      advanceOrder,
      confirmReceived,
      rateOrder,
      ensureOrder,
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
