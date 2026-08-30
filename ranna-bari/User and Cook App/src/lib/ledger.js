/**
 * The money, and the document everything in the app's commerce sits in.
 *
 * Two systems now move money -- pre-booked meals and the cook stores -- and
 * they must share one wallet. A customer has a single balance; a cook has a
 * single set of earnings; the platform holds a single escrow. Two ledgers
 * would mean two answers to "what is my balance", and one of them would be
 * wrong. So this module owns the money and both systems post into it.
 *
 * ## What this is not
 *
 * Both requirements ask for server-side validation, row locks and atomic
 * database writes. This app has no server -- it is an Expo client over
 * AsyncStorage -- so none of those exist and none of this replaces them.
 * What one device can honestly provide, and what this does:
 *
 *   - one authority. Screens never compute a balance, a stock level or an
 *     order total; they call a transition and render its answer.
 *   - validation against live state, inside the transition, on the state as
 *     it is at that instant -- never a snapshot a screen rendered earlier.
 *     That is what makes a double-tapped Confirm produce one order.
 *   - money that cannot drift. Balances are folded from an append-only
 *     ledger rather than stored, so a balance cannot disagree with history.
 *   - all-or-nothing. A transition returns one new document or an error and
 *     the old one; there is no half-applied state to roll back from.
 *   - exactly-once settlement, asserted at both release and refund.
 *
 * When a backend arrives, these transitions are its specification.
 */

/* ------------------------------------------------------------------ *
 * the document
 * ------------------------------------------------------------------ */

/**
 * Every collection, empty.
 *
 * One document rather than one per feature, because the operations that
 * matter span several: confirming a store order debits a wallet, decrements
 * stock, creates an order and files a notification, and there must be no
 * instant where some of that happened and the rest did not.
 */
export const EMPTY = {
  v: 2,

  // pre-booked meals
  meals: [],

  // cook stores
  stores: [],
  categories: [],
  products: [],
  carts: {},

  /* The platform's own category vocabulary, shared by food requests, browse
     and search. Data rather than a constant in a screen, so the same list
     can be edited in one place and every surface follows. */
  taxonomy: [],

  // food requests and cook bidding
  requests: [],
  offers: [],

  // shared
  orders: [],
  ledger: [],
  notifications: [],
  seq: { meal: 0, order: 0, tx: 0, note: 0, store: 0, cat: 0, prod: 0, req: 0, off: 0, tax: 0 },
  seeded: false,
};

/** Whoever is signed in, as one stable string. */
export const customerKeyOf = (account) =>
  String(account?.email || account?.phone || 'guest').toLowerCase();

/**
 * Where an order is going, in the shape the API and the order screens agree
 * on: `{ label, line, area, lat, lng, instructions }`.
 *
 * Two screens used to send `account.area` here — a bare string — which the
 * server rejects, and which it then reported as an invalid *amount* because
 * its body parser names no field. Checkout built the object correctly and
 * meals and the shop did not; keeping it in one function is what stops those
 * three drifting apart again.
 *
 * `null` rather than an empty object when there is nothing to send: the API
 * accepts null, and a half-filled address on an order is worse than none.
 */
export const addressFromAccount = (account) => {
  const line = String(account?.addressDetail ?? '').trim();
  const area = String(account?.area ?? '').trim();
  if (!line && !area) return null;

  return {
    label: account?.addressLabel || 'Home',
    line,
    area,
    lat: typeof account?.lat === 'number' ? account.lat : null,
    lng: typeof account?.lng === 'number' ? account.lng : null,
    instructions: '',
  };
};

/* ------------------------------------------------------------------ *
 * results
 * ------------------------------------------------------------------ */

/**
 * Codes, not sentences. The screen turns these into the right language;
 * this layer has no business knowing which one is on.
 */
export const ERR = {
  // meals
  NO_MEAL: 'meal-missing',
  MEAL_CLOSED: 'meal-closed',
  PAST_DEADLINE: 'meal-deadline-passed',
  SOLD_OUT: 'meal-sold-out',
  ALREADY_ORDERED: 'meal-already-ordered',

  // stores
  NO_STORE: 'store-missing',
  STORE_CLOSED: 'store-closed',
  NO_PRODUCT: 'product-missing',
  PRODUCT_OFF: 'product-unavailable',
  NO_STOCK: 'product-out-of-stock',
  SHORT_STOCK: 'product-not-enough-stock',
  BELOW_MIN: 'product-below-minimum',
  ABOVE_MAX: 'product-above-maximum',
  EMPTY_CART: 'cart-empty',
  CATEGORY_IN_USE: 'category-in-use',
  NAME_REQUIRED: 'name-required',

  // food requests and bidding
  NO_REQUEST: 'request-missing',
  REQUEST_CLOSED: 'request-closed',
  NOT_ELIGIBLE: 'request-not-eligible',
  NO_OFFER: 'offer-missing',
  OFFER_CLOSED: 'offer-closed',
  NO_PRICE_YET: 'offer-no-price',
  NOT_YOUR_TURN: 'offer-not-your-turn',
  NOT_AGREED: 'offer-not-agreed',

  // money and orders
  LOW_BALANCE: 'wallet-low-balance',
  NO_ORDER: 'order-missing',
  WRONG_STATE: 'order-wrong-state',
  ALREADY_SETTLED: 'order-already-settled',
  BAD_AMOUNT: 'amount-invalid',
};

export const fail = (state, error, extra) => ({ ok: false, state, error, ...extra });
export const done = (state, result) => ({ ok: true, state, result });

/* ------------------------------------------------------------------ *
 * ids
 * ------------------------------------------------------------------ */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A code that survives being read aloud to a rider: no I/O/0/1. */
export function makeCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < 5; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return `RB-${out}`;
}

/** Next id of a kind, and the bumped counter to go with it. */
export const bump = (state, kind) => {
  const seq = { ...state.seq, [kind]: (state.seq[kind] ?? 0) + 1 };
  return [seq, `${kind}-${seq[kind]}`];
};

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/**
 * The three places money can sit.
 *
 * `held` is the platform's escrow: money that has left a customer and has
 * not reached a cook. A real balance rather than a flag on each order, so
 * "what is the platform holding" is one sum rather than a scan.
 */
export const ACCOUNTS = ['customer', 'held', 'cook'];

/**
 * Balances, derived rather than stored.
 *
 * A running total alongside the ledger is two things that can disagree, and
 * when they do the money is already wrong. Folding on read is O(entries)
 * over a list one person generates by hand.
 */
export function balances(ledger = []) {
  const out = { customer: 0, held: 0, cook: 0 };
  for (const tx of ledger) {
    if (out[tx.from] != null) out[tx.from] -= tx.amount;
    if (out[tx.to] != null) out[tx.to] += tx.amount;
  }
  return out;
}

/** Escrow standing against a cook's orders: earned, but not yet theirs. */
export function pendingEarnings(state) {
  return state.orders
    .filter((o) => o.payment === 'held')
    .reduce((sum, o) => sum + o.amount, 0);
}

/**
 * Append one movement. Never updates or removes: a correction is another
 * entry in the other direction, which is what keeps the history auditable.
 */
export function post(state, { kind, amount, from, to, mealId, orderId, note, now }) {
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
 * notifications
 * ------------------------------------------------------------------ */

/**
 * File a notification, unless the same one is already sitting unread.
 *
 * Both requirements ask for no duplicates, and the events that repeat are
 * the repeatable ones -- a status pushed forward and back, a reminder that
 * comes round again. Keying on the event rather than the text means
 * re-wording a string does not defeat it.
 */
export function notify(state, { audience, kind, key, title, body, mealId, orderId, requestId, offerId, now }) {
  const dedupe = key ?? `${audience}:${kind}:${orderId ?? requestId ?? mealId ?? ''}`;
  if (state.notifications.some((nt) => nt.key === dedupe && !nt.read)) return state;

  const [seq, id] = bump(state, 'note');
  return {
    ...state,
    seq,
    notifications: [
      { id, key: dedupe, audience, kind, title, body, mealId, orderId, requestId, offerId, at: now, read: false },
      ...state.notifications,
    ].slice(0, 100),
  };
}

export const unreadFor = (state, audience) =>
  state.notifications.filter((nt) => nt.audience === audience && !nt.read).length;

export function markRead(state, { audience }) {
  const hasUnread = state.notifications.some((nt) => nt.audience === audience && !nt.read);
  if (!hasUnread) return done(state, null);
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
 * orders -- the parts both systems share
 * ------------------------------------------------------------------ */

/**
 * A confirmed order's path, whichever system sold it.
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

/** A pre-order waits on the cook before it joins the flow above. */
export const PREORDER_STEP = {
  key: 'pending',
  label: 'Waiting for the cook',
  icon: 'clock',
};

/**
 * The rail to draw for one order.
 *
 * Collection never goes "out for delivery"; a pre-order gains a step in
 * front, because "the cook has not agreed to make this yet" is a real state
 * a customer needs to see rather than a delay inside "confirmed".
 */
export function flowFor(handover, { preorder } = {}) {
  const base =
    handover === 'pickup'
      ? ORDER_FLOW.filter((s) => s.key !== 'delivering').map((s) =>
          s.key === 'delivered' ? { ...s, label: 'Collected', icon: 'box' } : s,
        )
      : ORDER_FLOW;
  return preorder ? [PREORDER_STEP, ...base] : base;
}

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
  status === 'completed' || status === 'cancelled' || status === 'rejected';

/** Waiting on the customer to say the food arrived. */
export const awaitingReceipt = (order) => order.status === 'delivered';

/**
 * The cook pushes an order one step along its own flow.
 *
 * A pending pre-order has no next step here on purpose -- accepting it is a
 * decision, not a stage, and it goes through `acceptPreorder`.
 */
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
 * Cancel one order and put the held money back.
 *
 * Allowed right up until the food is on its way; after that it is a dispute
 * rather than a cancellation, and this system does not pretend to settle
 * those.
 */
export function cancelOrder(state, { orderId, by, reason, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (isFinished(order.status)) return fail(state, ERR.ALREADY_SETTLED);
  if (order.status === 'delivering' || order.status === 'delivered') {
    return fail(state, ERR.WRONG_STATE);
  }
  if (order.payment !== 'held') return fail(state, ERR.ALREADY_SETTLED);

  let next = refundInto(state, order, reason ?? 'Order cancelled', now);

  /* Stock a cancelled order was holding goes back on the shelf. A
     pre-order never took any, so there is nothing to return. */
  next = restock(next, order);

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

/** Put a cancelled store order's units back into stock. */
export function restock(state, order) {
  if (order.kind !== 'store' || order.preorder || !order.lines?.length) return state;
  const back = new Map();
  for (const line of order.lines) {
    back.set(line.productId, (back.get(line.productId) ?? 0) + line.qty);
  }
  return {
    ...state,
    products: state.products.map((p) =>
      back.has(p.id) ? { ...p, stock: (p.stock ?? 0) + back.get(p.id) } : p,
    ),
  };
}

export const setStatus = (state, orderId, status, now) => ({
  ...state,
  orders: state.orders.map((o) =>
    o.id === orderId
      ? { ...o, status, history: [...o.history, { status, at: now }] }
      : o,
  ),
});

/**
 * The customer says it arrived, and only now does the cook get paid.
 *
 * A courier marking an order delivered is a claim about a van, not about a
 * doorstep, which is why that moves the status and this moves the money.
 * Shared by both systems because the rule is the same one.
 */
export function confirmReceived(state, { orderId, now }) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail(state, ERR.NO_ORDER);
  if (order.status !== 'delivered') return fail(state, ERR.WRONG_STATE);
  // Belt and braces: the status check implies this, and a released hold must
  // never be releasable a second time by any route.
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

/**
 * Put a held payment back where it came from.
 *
 * Cancelling marks the order rather than removing it, and the refund is a
 * new ledger entry rather than a reversal of the old one, so the money can
 * still be traced afterwards.
 */
export function refundInto(state, order, reason, now, status = 'cancelled') {
  let next = setStatus(state, order.id, status, now);
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
 * arrived. The dedupe key carries the day, so the reminder can come back
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
