/**
 * Pre-booked meals: the rules that are specific to a cook planning one
 * service for one day.
 *
 * The money, the notification list and the shared half of the order
 * lifecycle live in `ledger.js` -- meals and cook stores are two ways to
 * sell food into the same wallet, and only one of them may own the wallet.
 * What is here is what a meal is and nothing else: a deadline, a capacity,
 * a count of people who said they were interested.
 */
import {
  ERR,
  balances,
  bump,
  done,
  fail,
  makeCode,
  notify,
  post,
  refundInto,
} from './ledger';

/* The shared half, re-exported so a meal screen has one import. */
export {
  ERR,
  EMPTY,
  ACCOUNTS,
  ORDER_FLOW,
  COOK_ADVANCES,
  advanceOrder,
  awaitingReceipt,
  balances,
  cancelOrder,
  clearNotifications,
  confirmReceived,
  customerKeyOf,
  flowFor,
  isFinished,
  markRead,
  pendingEarnings,
  remindReceipts,
  stepIndexIn,
  topUp,
  unreadFor,
} from './ledger';

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

/** Confirmed, uncancelled orders against a meal. */
export const ordersForMeal = (state, mealId) =>
  state.orders.filter((o) => o.mealId === mealId && o.status !== 'cancelled');

export const confirmedCount = (state, mealId) => ordersForMeal(state, mealId).length;

export const interestCount = (meal) => (meal?.interested ?? []).length;

/** How many portions are still buyable. `null` capacity means no limit. */
export function remaining(state, meal) {
  if (!meal || meal.capacity == null) return null;
  return Math.max(0, meal.capacity - confirmedCount(state, meal.id));
}

/** Whether this meal can still take orders at `now`. */
export function mealOpen(state, meal, now) {
  if (!meal || meal.status !== 'published') return false;
  if (meal.deadline && new Date(meal.deadline).getTime() <= now) return false;
  const left = remaining(state, meal);
  return left == null || left > 0;
}

/* ------------------------------------------------------------------ *
 * transitions -- cook side
 * ------------------------------------------------------------------ */

/**
 * Publish a meal for a future service.
 *
 * `notifyNearby` is decided by the caller, which is the only place that
 * knows where this device's customer lives; the rule it applies is the same
 * delivery radius browse uses, so a meal that cannot reach you never
 * announces itself.
 */
export function publishMeal(state, { meal, notifyNearby, now, rand }) {
  const [seq, id] = bump(state, 'meal');
  const record = {
    ...meal,
    id,
    status: 'published',
    interested: [],
    createdAt: now,
    code: makeCode(rand),
  };

  let next = { ...state, seq, meals: [record, ...state.meals] };

  if (notifyNearby) {
    next = notify(next, {
      audience: 'customer',
      kind: 'meal-published',
      key: `customer:meal-published:${id}`,
      title: 'New meal near you',
      body: '{title} from {cook} — ৳{price}',
      mealId: id,
      now,
    });
  }

  return done(next, record);
}

/** Stop taking orders without touching the ones already placed. */
export function closeMeal(state, { mealId, now }) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return fail(state, ERR.NO_MEAL);
  if (meal.status !== 'published') return fail(state, ERR.MEAL_CLOSED);

  return done(
    {
      ...state,
      meals: state.meals.map((m) =>
        m.id === mealId ? { ...m, status: 'closed', closedAt: now } : m,
      ),
    },
    null,
  );
}

/**
 * Call the whole service off.
 *
 * Every held payment goes back to the customer it came from. The orders are
 * marked cancelled rather than removed, and the refunds are ledger entries
 * rather than reversals, so the money can still be traced afterwards.
 */
export function cancelMeal(state, { mealId, reason, now }) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return fail(state, ERR.NO_MEAL);

  let next = {
    ...state,
    meals: state.meals.map((m) =>
      m.id === mealId ? { ...m, status: 'cancelled', closedAt: now } : m,
    ),
  };

  let refunded = 0;
  for (const order of ordersForMeal(state, mealId)) {
    if (order.payment !== 'held') continue;
    next = refundInto(next, order, reason ?? 'Meal cancelled by the kitchen', now);
    refunded += order.amount;
  }

  if (refunded) {
    next = notify(next, {
      audience: 'customer',
      kind: 'meal-cancelled',
      key: `customer:meal-cancelled:${mealId}`,
      title: 'Meal cancelled',
      body: '{title} was cancelled. ৳{amount} is back in your wallet.',
      mealId,
      now,
    });
  }

  return done(next, { refunded });
}

/* ------------------------------------------------------------------ *
 * transitions -- customer side
 * ------------------------------------------------------------------ */

/**
 * Interest is not an order.
 *
 * It costs nothing and commits nobody, which is exactly what makes it useful
 * to a cook the night before -- it is the difference between "how many might
 * want this" and "how many have paid for it".
 */
export function toggleInterest(state, { mealId, customerKey, now }) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return fail(state, ERR.NO_MEAL);

  const list = meal.interested ?? [];
  const already = list.includes(customerKey);
  const interested = already
    ? list.filter((k) => k !== customerKey)
    : [...list, customerKey];

  let next = {
    ...state,
    meals: state.meals.map((m) => (m.id === mealId ? { ...m, interested } : m)),
  };

  if (!already) {
    next = notify(next, {
      audience: 'cook',
      kind: 'interest',
      // Keyed per meal, not per tap: a cook wants "someone is interested",
      // not one line per person on a list they can already see.
      key: `cook:interest:${mealId}`,
      title: 'Someone is interested',
      body: '{n} interested in {title}',
      mealId,
      now,
    });
  }

  return done(next, { interested: !already });
}

/**
 * Take the money and create the order, or do neither.
 *
 * Order of checks matters: everything that can refuse runs before the ledger
 * is touched, so there is no path that debits a wallet and then discovers
 * the meal sold out.
 */
export function confirmOrder(state, { mealId, customer, now, rand }) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return fail(state, ERR.NO_MEAL);
  if (meal.status !== 'published') return fail(state, ERR.MEAL_CLOSED);

  if (meal.deadline && new Date(meal.deadline).getTime() <= now) {
    return fail(state, ERR.PAST_DEADLINE);
  }

  const left = remaining(state, meal);
  if (left != null && left <= 0) return fail(state, ERR.SOLD_OUT);

  const key = customer.key;
  const duplicate = state.orders.some(
    (o) => o.mealId === mealId && o.customerKey === key && o.status !== 'cancelled',
  );
  if (duplicate) return fail(state, ERR.ALREADY_ORDERED);

  const amount = meal.price;
  const balance = balances(state.ledger).customer;
  if (balance < amount) {
    return fail(state, ERR.LOW_BALANCE, { short: amount - balance, balance });
  }

  /* Past every refusal. From here the whole thing lands or nothing does. */
  const [seq, id] = bump(state, 'order');
  const order = {
    id,
    kind: 'meal',
    code: makeCode(rand),
    mealId,
    kitchenId: meal.kitchenId,
    cookName: meal.cookName,
    title: meal.title,
    image: meal.image,
    handover: meal.handover,
    serveDate: meal.serveDate,
    slot: meal.slot,
    customerKey: key,
    customerName: customer.name,
    phone: customer.phone,
    address: customer.address,
    price: meal.price,
    amount,
    status: 'confirmed',
    payment: 'held',
    history: [{ status: 'confirmed', at: now }],
    createdAt: now,
  };

  let next = { ...state, seq, orders: [order, ...state.orders] };

  next = post(next, {
    kind: 'hold',
    amount,
    from: 'customer',
    to: 'held',
    mealId,
    orderId: id,
    note: 'Held for {title}',
    now,
  });

  next = notify(next, {
    audience: 'cook',
    kind: 'order-confirmed',
    // Per order: a cook needs to count these, so they must not collapse.
    key: `cook:order-confirmed:${id}`,
    title: 'New confirmed order',
    body: '{customer} confirmed {title}. Prepare {n}.',
    mealId,
    orderId: id,
    now,
  });

  next = notify(next, {
    audience: 'customer',
    kind: 'order-placed',
    key: `customer:order-placed:${id}`,
    title: 'Order confirmed',
    body: '৳{amount} is held until you confirm the food arrived.',
    mealId,
    orderId: id,
    now,
  });

  return done(next, order);
}
