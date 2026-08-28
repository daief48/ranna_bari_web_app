/**
 * The meal system's rules, as pure functions over one document.
 *
 * Every transition here takes the whole meal-system state and returns a new
 * one, or an error code and the state untouched. Nothing partially applies:
 * confirming an order moves money, creates the order, bumps the meal's count
 * and files the cook's notification in a single returned object, so there is
 * no reachable state where the money left a wallet and the order did not
 * appear.
 *
 * ## What this is not
 *
 * The requirement asks for server-side validation, row locks and atomic
 * database writes. This app has no server -- it is an Expo client over
 * AsyncStorage -- so none of those exist and none of this is a substitute
 * for them. What is achievable on one device, and what this does:
 *
 *   - one authority. Screens never compute a balance or decide whether a
 *     meal is still available; they call in here and render the answer.
 *   - validation against live state. Checks run inside the transition, on
 *     the state as it is at that instant, never on a snapshot a screen
 *     rendered earlier -- which is what makes a double-tap safe.
 *   - money that is conserved. Balances are derived from an append-only
 *     ledger rather than stored, so a balance cannot drift from its history.
 *   - exactly-once settlement. Release and refund both assert the hold is
 *     still held, so neither can run twice.
 *
 * When a backend arrives, these functions are the specification for it, and
 * the screens should not have to change.
 */

/* ------------------------------------------------------------------ *
 * lifecycle
 * ------------------------------------------------------------------ */

/**
 * A confirmed order's path.
 *
 * `delivered` is the courier's word for it and `completed` is the
 * customer's, and the gap between them is the whole point of the design:
 * money moves on the second one.
 */
export const ORDER_FLOW = [
  { key: 'confirmed', label: 'Order confirmed', icon: 'receipt' },
  { key: 'preparing', label: 'Preparing', icon: 'pot' },
  { key: 'ready', label: 'Ready', icon: 'chefHat' },
  { key: 'delivering', label: 'Out for delivery', icon: 'delivery' },
  { key: 'delivered', label: 'Delivered', icon: 'box' },
  { key: 'completed', label: 'Completed', icon: 'shieldCheck' },
];

/** A meal the customer collects never goes "out for delivery". */
export const flowFor = (handover) =>
  handover === 'pickup'
    ? ORDER_FLOW.filter((s) => s.key !== 'delivering').map((s) =>
        s.key === 'delivered' ? { ...s, label: 'Collected', icon: 'box' } : s,
      )
    : ORDER_FLOW;

/** The steps a cook drives. The last one belongs to the customer. */
export const COOK_ADVANCES = {
  delivery: {
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'delivering',
    delivering: 'delivered',
  },
  pickup: {
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'delivered',
  },
};

export const stepIndexIn = (flow, status) => flow.findIndex((s) => s.key === status);

export const isFinished = (status) =>
  status === 'completed' || status === 'cancelled';

/** Waiting on the customer to say the food arrived. */
export const awaitingReceipt = (order) => order.status === 'delivered';

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/**
 * The three places money can sit.
 *
 * `held` is the platform's escrow: money that has left the customer and has
 * not reached the cook. It is a real balance, not a flag on an order, so
 * "what is the platform holding right now" is one sum rather than a scan.
 */
export const ACCOUNTS = ['customer', 'held', 'cook'];

/**
 * Balances, derived rather than stored.
 *
 * Keeping a running total alongside the ledger means two things that can
 * disagree, and when they do the money is already wrong. Folding the ledger
 * on read is O(entries) over a list one person generates by hand; the
 * guarantee is worth more than the microseconds.
 */
export function balances(ledger = []) {
  const out = { customer: 0, held: 0, cook: 0 };
  for (const tx of ledger) {
    if (out[tx.from] != null) out[tx.from] -= tx.amount;
    if (out[tx.to] != null) out[tx.to] += tx.amount;
  }
  return out;
}

/** What the cook has earned but cannot spend yet: escrow against their meals. */
export function pendingEarnings(state) {
  return state.orders
    .filter((o) => o.payment === 'held')
    .reduce((sum, o) => sum + o.amount, 0);
}

/* ------------------------------------------------------------------ *
 * errors
 * ------------------------------------------------------------------ */

/**
 * Codes, not sentences. The screen turns these into the right language;
 * this module has no business knowing which one is on.
 */
export const ERR = {
  NO_MEAL: 'meal-missing',
  MEAL_CLOSED: 'meal-closed',
  PAST_DEADLINE: 'meal-deadline-passed',
  SOLD_OUT: 'meal-sold-out',
  ALREADY_ORDERED: 'meal-already-ordered',
  LOW_BALANCE: 'wallet-low-balance',
  NO_ORDER: 'order-missing',
  WRONG_STATE: 'order-wrong-state',
  ALREADY_SETTLED: 'order-already-settled',
  BAD_AMOUNT: 'amount-invalid',
};

const fail = (state, error, extra) => ({ ok: false, state, error, ...extra });
const done = (state, result) => ({ ok: true, state, result });

/* ------------------------------------------------------------------ *
 * ids and helpers
 * ------------------------------------------------------------------ */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A code that survives being read aloud: no I/O/0/1. */
function makeCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 5; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return `RB-${out}`;
}

const bump = (state, kind) => {
  const seq = { ...state.seq, [kind]: (state.seq[kind] ?? 0) + 1 };
  return [seq, `${kind}-${seq[kind]}`];
};

export const EMPTY = {
  v: 1,
  meals: [],
  orders: [],
  ledger: [],
  notifications: [],
  seq: { meal: 0, order: 0, tx: 0, note: 0 },
  seeded: false,
};

/** Whoever is signed in, as one stable string. */
export const customerKeyOf = (account) =>
  String(account?.email || account?.phone || 'guest').toLowerCase();

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
 * notifications
 * ------------------------------------------------------------------ */

/**
 * File a notification, unless the same one is already sitting unread.
 *
 * The requirement asks for no duplicates, and the events that fire twice are
 * the repeatable ones -- a status pushed forward and back, a reminder that
 * comes round again. Keying on the event rather than the text means a
 * re-worded string does not defeat it.
 */
function notify(state, { audience, kind, key, title, body, mealId, orderId, now }) {
  const dedupe = key ?? `${audience}:${kind}:${orderId ?? mealId ?? ''}`;
  if (state.notifications.some((nt) => nt.key === dedupe && !nt.read)) return state;

  const [seq, id] = bump(state, 'note');
  return {
    ...state,
    seq,
    notifications: [
      { id, key: dedupe, audience, kind, title, body, mealId, orderId, at: now, read: false },
      ...state.notifications,
    ].slice(0, 100),
  };
}

export const unreadFor = (state, audience) =>
  state.notifications.filter((nt) => nt.audience === audience && !nt.read).length;

export function markRead(state, { audience }) {
  return done(
    {
      ...state,
      notifications: state.notifications.map((nt) =>
        nt.audience === audience ? { ...nt, read: true } : nt,
      ),
    },
    null,
  );
}

export function clearNotifications(state, { audience }) {
  return done(
    {
      ...state,
      notifications: state.notifications.filter((nt) => nt.audience !== audience),
    },
    null,
  );
}

/* ------------------------------------------------------------------ *
 * ledger
 * ------------------------------------------------------------------ */

/**
 * Append one movement. Never updates or removes: a correction is another
 * entry in the other direction, which is what keeps the history auditable.
 */
function post(state, { kind, amount, from, to, mealId, orderId, note, now }) {
  const [seq, id] = bump(state, 'tx');
  return {
    ...state,
    seq,
    ledger: [
      ...state.ledger,
      { id, kind, amount, from, to, mealId, orderId, note, at: now },
    ],
  };
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
    next = refundOrderInto(next, order, reason ?? 'Meal cancelled by the kitchen', now);
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

/* ------------------------------------------------------------------ *
 * transitions -- fulfilment
 * ------------------------------------------------------------------ */

const setStatus = (state, orderId, status, now) => ({
  ...state,
  orders: state.orders.map((o) =>
    o.id === orderId
      ? { ...o, status, history: [...o.history, { status, at: now }] }
      : o,
  ),
});

/** The cook pushes an order one step along its own flow. */
export function advanceOrder(state, { orderId, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);

  const to = COOK_ADVANCES[order.handover === 'pickup' ? 'pickup' : 'delivery'][
    order.status
  ];
  if (!to) return fail(state, ERR.WRONG_STATE);

  let next = setStatus(state, orderId, to, now);

  const told = {
    preparing: ['Being prepared', '{title} is being cooked.'],
    ready: ['Ready', '{title} is ready.'],
    delivering: ['On the way', '{title} is out for delivery.'],
    delivered: ['Delivered', 'Confirm you received {title} to complete the order.'],
  }[to];

  if (told) {
    next = notify(next, {
      audience: 'customer',
      kind: `order-${to}`,
      key: `customer:order-${to}:${orderId}`,
      title: told[0],
      body: told[1],
      mealId: order.mealId,
      orderId,
      now,
    });
  }

  return done(next, to);
}

/**
 * The customer says the food arrived, and only now does the cook get paid.
 *
 * A courier marking an order delivered is a claim about a van, not about a
 * doorstep, which is why it moves the status and not the money.
 */
export function confirmReceived(state, { orderId, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (order.status !== 'delivered') return fail(state, ERR.WRONG_STATE);
  // Belt and braces: the status check already implies this, and a released
  // hold must never be releasable a second time by any route.
  if (order.payment !== 'held') return fail(state, ERR.ALREADY_SETTLED);

  let next = setStatus(state, orderId, 'completed', now);
  next = {
    ...next,
    orders: next.orders.map((o) =>
      o.id === orderId ? { ...o, payment: 'released', settledAt: now } : o,
    ),
  };

  next = post(next, {
    kind: 'release',
    amount: order.amount,
    from: 'held',
    to: 'cook',
    mealId: order.mealId,
    orderId,
    note: 'Released for {title}',
    now,
  });

  next = notify(next, {
    audience: 'cook',
    kind: 'payment-released',
    key: `cook:payment-released:${orderId}`,
    title: 'Payment released',
    body: '৳{amount} for {title} is in your wallet.',
    mealId: order.mealId,
    orderId,
    now,
  });

  next = notify(next, {
    audience: 'customer',
    kind: 'order-completed',
    key: `customer:order-completed:${orderId}`,
    title: 'Order completed',
    body: '৳{amount} has been released to the cook.',
    mealId: order.mealId,
    orderId,
    now,
  });

  return done(next, order.amount);
}

/** Shared by cancel-one and cancel-the-whole-meal. */
function refundOrderInto(state, order, reason, now) {
  let next = setStatus(state, order.id, 'cancelled', now);
  next = {
    ...next,
    orders: next.orders.map((o) =>
      o.id === order.id
        ? { ...o, payment: 'refunded', settledAt: now, cancelReason: reason }
        : o,
    ),
  };
  return post(next, {
    kind: 'refund',
    amount: order.amount,
    from: 'held',
    to: 'customer',
    mealId: order.mealId,
    orderId: order.id,
    note: reason,
    now,
  });
}

/**
 * Cancel one order and put the held money back.
 *
 * Allowed right up until the food is on its way; after that it is a dispute
 * rather than a cancellation, and this system does not pretend to settle
 * those.
 */
export function cancelOrder(state, { orderId, by, reason, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (order.status === 'cancelled' || order.status === 'completed') {
    return fail(state, ERR.ALREADY_SETTLED);
  }
  if (order.status === 'delivering' || order.status === 'delivered') {
    return fail(state, ERR.WRONG_STATE);
  }
  if (order.payment !== 'held') return fail(state, ERR.ALREADY_SETTLED);

  let next = refundOrderInto(state, order, reason ?? 'Order cancelled', now);

  next = notify(next, {
    audience: by === 'cook' ? 'customer' : 'cook',
    kind: 'order-cancelled',
    key: `${by === 'cook' ? 'customer' : 'cook'}:order-cancelled:${orderId}`,
    title: 'Order cancelled',
    body: '{title} was cancelled. ৳{amount} was refunded.',
    mealId: order.mealId,
    orderId,
    now,
  });

  return done(next, order.amount);
}

/**
 * Money in from outside.
 *
 * There is no payment gateway behind this: the top-up is the same simulation
 * the rest of the demo runs on, and the ledger records it as coming from
 * `external` so nothing downstream mistakes it for earnings.
 */
export function topUp(state, { amount, method, now }) {
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return fail(state, ERR.BAD_AMOUNT);

  let next = post(state, {
    kind: 'topup',
    amount: value,
    from: 'external',
    to: 'customer',
    note: method ?? 'Top up',
    now,
  });

  next = notify(next, {
    audience: 'customer',
    kind: 'topup',
    key: `customer:topup:${next.seq.tx}`,
    title: 'Wallet topped up',
    body: '৳{amount} added to your wallet.',
    now,
  });

  return done(next, value);
}

/**
 * Nudge anyone sitting on a delivered order.
 *
 * Held money helps nobody: the customer's is gone and the cook's has not
 * arrived. The dedupe key carries the day so the reminder can come back
 * tomorrow but not twice this afternoon.
 */
export function remindReceipts(state, { now, today }) {
  let next = state;
  for (const order of state.orders) {
    if (order.status !== 'delivered') continue;
    next = notify(next, {
      audience: 'customer',
      kind: 'confirm-receipt',
      key: `customer:confirm-receipt:${order.id}:${today}`,
      title: 'Did your food arrive?',
      body: 'Confirm {title} so the cook can be paid.',
      mealId: order.mealId,
      orderId: order.id,
      now,
    });
  }
  return done(next, null);
}
