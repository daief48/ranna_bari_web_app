/**
 * The cook's view of an order's lifecycle — every rail, in one place.
 *
 * Five kinds of order reach a kitchen (cash dishes, wallet dishes, shop
 * parcels, meal plates, won requests) on three rails, and the facts about
 * them — which status comes next, which statuses mean "finished", which
 * ones mean "the money is still held" — used to be written out separately
 * in the orders context, the board, the cards and the earnings screen. Each
 * copy was right about the rail its author had in mind and wrong about one
 * of the others: the board treated `delivered` as the end of every order,
 * so a wallet parcel the customer had not confirmed dropped into History
 * while its money was still held; the cook's cut read `subtotal`, which a
 * meal plate does not carry, so a day of plates was worth ৳0.
 *
 * Nothing here is new behaviour. It is the same vocabulary the backend's
 * `domain.ts` speaks, stated once so no two cook screens can count an order
 * differently again. `src/store/OrdersContext` re-exports the names it
 * always exported, so the customer surfaces that import them from there keep
 * working unchanged.
 */

/* ------------------------------------------------------------------ *
 * kinds
 * ------------------------------------------------------------------ */

/**
 * The business an order belongs to, from the cook's chair.
 *
 * `kind` is absent on orders written before the field existed — those are
 * cash dishes. A won request is cooked in the kitchen and paid to the
 * kitchen, so it files under the dishes even though it never came off the
 * menu; the board puts it in the Menu lanes and the dashboard counts it as
 * kitchen income.
 */
export const businessOf = (order) => {
  const kind = order?.kind;
  if (kind === 'store') return 'store';
  if (kind === 'meal') return 'meal';
  return 'dish';
};

/** A dish order proper: cash or wallet, off the menu. */
export const isDishOrder = (order) =>
  order?.kind === 'cod' || order?.kind === 'wallet' || order?.kind == null;

/** Anything the *kitchen* earns from — dishes and won requests. */
export const isKitchenOrder = (order) => isDishOrder(order) || order?.kind === 'request';

/* ------------------------------------------------------------------ *
 * the rails
 * ------------------------------------------------------------------ */

/**
 * The lifecycle a cash order moves through, as the customer's timeline draws
 * it. The cook panel is the part that advances it.
 */
export const ORDER_STEPS = [
  { key: 'placed', label: 'Order placed', icon: 'receipt' },
  { key: 'accepted', label: 'Kitchen accepted', icon: 'chefHat' },
  { key: 'cooking', label: 'Cooking now', icon: 'pot' },
  { key: 'on_the_way', label: 'On the way', icon: 'delivery' },
  { key: 'delivered', label: 'Delivered', icon: 'shieldCheck' },
];

export const stepIndex = (status) => ORDER_STEPS.findIndex((s) => s.key === status);

/** The cash rail: the rider's words. */
export const COD_NEXT = {
  placed: 'accepted',
  accepted: 'cooking',
  cooking: 'on_the_way',
  on_the_way: 'delivered',
};

/** The escrow rail — wallet dishes, shop parcels, won requests. */
export const ESCROW_NEXT = {
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivering',
  delivering: 'delivered',
};

/** A meal plate's short rail: booked → cooking → handed over. */
export const MEAL_NEXT = {
  confirmed: 'preparing',
  preparing: 'delivered',
};

/**
 * What the cook's button says at each stage, whichever rail. The server
 * picks the real next step — this only says whether there is one, and which
 * verb to show. A meal's `preparing` goes straight to `delivered`, but the
 * verb for it is the same "there is a next step", so the escrow map's word
 * serves both.
 */
export const NEXT_STEP = { ...COD_NEXT, ...ESCROW_NEXT };

/** The next status the cook's tap will land on, for the kind in hand. */
export const nextStatusFor = (order) => {
  if (order?.kind === 'cod' || order?.kind == null) return COD_NEXT[order?.status] ?? null;
  if (order?.kind === 'meal') return MEAL_NEXT[order?.status] ?? null;
  return ESCROW_NEXT[order?.status] ?? null;
};

/**
 * Which of the cook's four stages a status belongs to, on either rail.
 *
 * A cash order says placed → accepted → cooking → on_the_way; a wallet order
 * says confirmed → preparing → ready → delivering. Everything that asks "is
 * this new / in the kitchen / out" asks through here, so the two rails can
 * never be counted differently.
 */
const STAGE_OF = {
  confirmed: 'placed',
  preparing: 'cooking',
  ready: 'cooking',
  delivering: 'on_the_way',
};
export const stageOf = (status) => STAGE_OF[status] ?? status;

/* ------------------------------------------------------------------ *
 * endings
 * ------------------------------------------------------------------ */

/**
 * Only cash ends at `delivered`.
 *
 * On every other rail `delivered` is the cook's word and `completed` is the
 * customer's, and the money moves on the second. A wallet parcel marked
 * delivered is therefore still open from the cook's chair — it sits in the
 * awaiting lane with its money held until the customer says it arrived (or
 * the escrow timer says it for them).
 */
export const endsAtDelivered = (order) => order?.kind === 'cod' || order?.kind == null;

/**
 * Whether an order is finished, for the cook.
 *
 * Takes the order, because the answer depends on its kind. A bare status
 * string is still accepted for the callers that only hold one — it is read
 * the conservative old way, where `delivered` closes — so nothing that
 * imported this before breaks; every cook surface passes the order.
 */
export const isClosed = (orderOrStatus) => {
  if (typeof orderOrStatus === 'string') {
    return (
      orderOrStatus === 'delivered' ||
      orderOrStatus === 'completed' ||
      orderOrStatus === 'cancelled' ||
      orderOrStatus === 'rejected'
    );
  }
  const status = orderOrStatus?.status;
  if (status === 'completed' || status === 'cancelled' || status === 'rejected') return true;
  return status === 'delivered' && endsAtDelivered(orderOrStatus);
};

/** Delivered, on a rail where that is not the end: the customer's turn. */
export const awaitingConfirmation = (order) =>
  order?.status === 'delivered' && !endsAtDelivered(order);

/**
 * Whether the cook's share of this order has been released to them — the
 * only orders an earnings screen may call "earned". Cash is earned at the
 * door; everything else when the customer confirms.
 */
export const moneyReleased = (order) =>
  order?.status === 'completed' || (order?.status === 'delivered' && endsAtDelivered(order));

/**
 * The cook's share that exists and is not theirs yet: delivered on an
 * escrow rail and not confirmed. `payment: 'held'` on the wire also covers
 * an order still being cooked, which is a promise rather than held pay, so
 * this reads the status instead.
 */
export const moneyHeld = (order) => awaitingConfirmation(order);

/** Still moving — not closed, not waiting on the customer. */
export const inFlight = (order) => !isClosed(order) && !awaitingConfirmation(order);

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/**
 * The rates the app ships with, used until `/config` answers. Keyed the way
 * the server keys them; a wallet dish is a dish for commission purposes and
 * the server's ledger charges it `commissionCod` too.
 */
export const DEFAULT_PAYOUT_RATES = { cod: 0.85, meal: 0.85, store: 0.85, request: 0.8 };

/** Which rate an order is paid at. */
export const payoutKindOf = (order) => {
  const kind = order?.kind;
  if (kind === 'meal' || kind === 'store' || kind === 'request') return kind;
  return 'cod';
};

export const payoutRateFor = (kind, rates) => {
  const key = kind === 'wallet' || kind == null ? 'cod' : kind;
  const rate = Number(rates?.[key]);
  if (Number.isFinite(rate) && rate > 0 && rate <= 1) return rate;
  return DEFAULT_PAYOUT_RATES[key] ?? DEFAULT_PAYOUT_RATES.cod;
};

/**
 * The food value the cook is paid on — never the delivery or platform lines.
 *
 * Dishes and shop parcels carry `subtotal`; a meal plate carries only its
 * `amount` (one plate, one price); a won request carries both and they are
 * equal. Read in that order, and always a finite whole number, so a sum over
 * a mixed day can never come out NaN.
 */
export const cookBase = (order) => {
  for (const candidate of [order?.subtotal, order?.amount, order?.total]) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  }
  return 0;
};

/** The cook's cut of one order, whole taka. */
export const cookPayoutAt = (order, rates) =>
  Math.round(cookBase(order) * payoutRateFor(payoutKindOf(order), rates));

/* ------------------------------------------------------------------ *
 * when
 * ------------------------------------------------------------------ */

/**
 * When this order was handed over, if it has been.
 *
 * The wire does not carry `deliveredAt`; the history does, as the entry that
 * moved the order to `delivered` (or `completed`, for a customer who
 * confirmed without the cook ever pressing the button). Money is counted on
 * that day, not on the day the order was placed — a dinner ordered at 11pm
 * and delivered after midnight is tomorrow's earnings.
 */
export const settledAt = (order) => {
  if (order?.deliveredAt) return order.deliveredAt;
  if (order?.completedAt) return order.completedAt;
  const history = Array.isArray(order?.history) ? order.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.status === 'delivered' || entry?.status === 'completed') return entry.at ?? null;
  }
  return null;
};
