/**
 * The vocabulary — error codes, order rails, ledger accounts, admin roles.
 *
 * Ported unchanged from the Expo app's `src/lib` by way of the admin panel's
 * `lib/domain.ts`. Three codebases now branch on these strings, and a rename
 * here breaks two of them without failing to compile in either.
 *
 * Codes, not sentences: the client turns these into the right language, and
 * this layer has no business knowing which one is on.
 */

/* ------------------------------------------------------------------ *
 * error codes — src/lib/ledger.js ERR
 * ------------------------------------------------------------------ */

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

  // requests and bidding
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
  /* A body field of the wrong shape, where naming it an amount would be a
     lie — the failing field travels in `detail`. */
  BAD_REQUEST: 'request-invalid',

  /*
   * Promotions. Each refusal is its own code because each one has a different
   * repair: a customer told "invalid" when they are ৳200 short of the minimum
   * types it again and gives up; one told the minimum adds something.
   */
  PROMO_UNKNOWN: 'promo-unknown',
  PROMO_EXPIRED: 'promo-expired',
  PROMO_NOT_STARTED: 'promo-not-started',
  PROMO_MIN_ORDER: 'promo-min-order',
  PROMO_FIRST_ONLY: 'promo-first-only',
  PROMO_USED: 'promo-used',
  PROMO_EXHAUSTED: 'promo-exhausted',
  PROMO_NO_VALUE: 'promo-no-value',

  /** A real kitchen, but one an operator has not approved yet. */
  KITCHEN_UNAPPROVED: 'kitchen-unapproved',

  // admin-only, not in the app
  NO_KITCHEN: 'kitchen-missing',
  FORBIDDEN: 'admin-forbidden',
  NO_DISPUTE: 'dispute-missing',
  DISPUTE_CLOSED: 'dispute-closed',
  DUPLICATE: 'duplicate-request',
  NOTHING_TO_PAY: 'payout-nothing-due',
  RUN_CLOSED: 'payout-run-closed',
} as const;

export type ErrCode = (typeof ERR)[keyof typeof ERR];

/** What an operator reads when a transition refuses. */
export const ERR_TEXT: Record<string, string> = {
  /* Not one of the transition codes — this comes from the body parser, before
     any handler runs. It has a sentence for the same reason the others do:
     the client shows whatever `message` it is handed. */
  'bad-json': 'That request body was not valid JSON.',
  [ERR.NO_MEAL]: 'That meal no longer exists.',
  [ERR.MEAL_CLOSED]: 'This meal is not taking orders.',
  [ERR.PAST_DEADLINE]: 'The ordering deadline has passed.',
  [ERR.SOLD_OUT]: 'Every plate is spoken for.',
  [ERR.ALREADY_ORDERED]: 'This customer already ordered this meal.',
  [ERR.NO_STORE]: 'That store no longer exists.',
  [ERR.STORE_CLOSED]: 'The shop is closed.',
  [ERR.NO_PRODUCT]: 'That product no longer exists.',
  [ERR.PRODUCT_OFF]: 'This product is not available.',
  [ERR.NO_STOCK]: 'Out of stock.',
  [ERR.SHORT_STOCK]: 'Not enough stock left.',
  [ERR.BELOW_MIN]: 'Below the minimum order quantity.',
  [ERR.ABOVE_MAX]: 'Above the maximum order quantity.',
  [ERR.EMPTY_CART]: 'The basket is empty.',
  [ERR.CATEGORY_IN_USE]: 'That category still holds products.',
  [ERR.NAME_REQUIRED]: 'A name is required.',
  [ERR.NO_REQUEST]: 'That request no longer exists.',
  [ERR.REQUEST_CLOSED]: 'This request is closed.',
  [ERR.NOT_ELIGIBLE]: 'This kitchen was not on the broadcast.',
  [ERR.NO_OFFER]: 'That offer no longer exists.',
  [ERR.OFFER_CLOSED]: 'This offer is closed.',
  [ERR.NO_PRICE_YET]: 'No price has been named yet.',
  [ERR.NOT_YOUR_TURN]: 'The other side is waiting on a reply.',
  [ERR.NOT_AGREED]: 'Both sides have not agreed a price.',
  [ERR.LOW_BALANCE]: 'The wallet does not hold enough.',
  [ERR.NO_ORDER]: 'That order no longer exists.',
  [ERR.WRONG_STATE]: 'The order is not in a state that allows this.',
  [ERR.ALREADY_SETTLED]: 'This is already settled.',
  [ERR.BAD_AMOUNT]: 'That amount is not valid.',
  [ERR.BAD_REQUEST]: 'Some of that was not valid.',
  [ERR.PROMO_UNKNOWN]: 'That code does not exist.',
  [ERR.PROMO_EXPIRED]: 'That code has expired.',
  [ERR.PROMO_NOT_STARTED]: 'That code is not live yet.',
  [ERR.PROMO_MIN_ORDER]: 'Your basket is not large enough for that code yet.',
  [ERR.PROMO_FIRST_ONLY]: 'That code is for a first order only.',
  [ERR.PROMO_USED]: 'You have already used that code.',
  [ERR.PROMO_EXHAUSTED]: 'That code has been fully claimed.',
  [ERR.PROMO_NO_VALUE]: 'That code takes nothing off this basket.',
  [ERR.KITCHEN_UNAPPROVED]:
    'Your kitchen is waiting to be approved. You can finish setting it up, but you cannot list food or take orders until then.',
  [ERR.NO_KITCHEN]: 'That kitchen no longer exists.',
  [ERR.FORBIDDEN]: 'Your role cannot do that.',
  [ERR.NO_DISPUTE]: 'That dispute no longer exists.',
  [ERR.DISPUTE_CLOSED]: 'This dispute is already resolved.',
  [ERR.DUPLICATE]: 'That has already been done.',
  [ERR.NOTHING_TO_PAY]: 'No cook is owed anything right now.',
  [ERR.RUN_CLOSED]: 'This payout run is closed.',
};

export const errText = (code: string) => ERR_TEXT[code] ?? code;

/* ------------------------------------------------------------------ *
 * transition results — the app's { ok, state, result } shape
 * ------------------------------------------------------------------ */

export type Ok<T> = { ok: true; result: T };
export type Fail = { ok: false; error: string; detail?: Record<string, unknown> };
export type Result<T> = Ok<T> | Fail;

export const ok = <T>(result: T): Ok<T> => ({ ok: true, result });
export const fail = (error: string, detail?: Record<string, unknown>): Fail => ({
  ok: false,
  error,
  detail,
});

/* ------------------------------------------------------------------ *
 * order rails
 * ------------------------------------------------------------------ */

/*
 * Which rail an order runs on.
 *
 * `cod` and `wallet` are both à-la-carte kitchen orders and differ only in
 * where the money sits: cash is handed to the rider, so that rail ends at
 * `delivered`; a wallet order is held in escrow and needs the customer's
 * confirmation before it is released, which is the step after.
 */
export type OrderKind = 'cod' | 'wallet' | 'meal' | 'store' | 'request';

export const ORDER_KINDS: { key: OrderKind; label: string }[] = [
  { key: 'cod', label: 'Cash on delivery' },
  { key: 'wallet', label: 'Paid from the wallet' },
  { key: 'meal', label: 'Pre-booked meal' },
  { key: 'store', label: 'Cook store' },
  { key: 'request', label: 'Food request' },
];

/** The legacy COD rail — src/store/OrdersContext.js ORDER_STEPS. */
export const COD_FLOW = [
  { key: 'placed', label: 'Order placed' },
  { key: 'accepted', label: 'Kitchen accepted' },
  { key: 'cooking', label: 'Cooking now' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
] as const;

/** The escrow rail — src/lib/ledger.js ORDER_FLOW. */
export const ESCROW_FLOW = [
  { key: 'confirmed', label: 'Order confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivering', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
] as const;

export const PREORDER_STEP = { key: 'pending', label: 'Waiting for the cook' } as const;

/**
 * The rail to draw for one order.
 *
 * Collection never goes "out for delivery"; a pre-order gains a step in
 * front, because "the cook has not agreed to make this yet" is a real state
 * rather than a delay inside "confirmed".
 */
export function flowFor(
  kind: OrderKind,
  handover: string,
  opts: { preorder?: boolean } = {},
): { key: string; label: string }[] {
  if (kind === 'cod') return [...COD_FLOW];

  const base =
    handover === 'pickup'
      ? ESCROW_FLOW.filter((s) => s.key !== 'delivering').map((s) =>
          s.key === 'delivered' ? { key: s.key, label: 'Collected' } : { ...s },
        )
      : ESCROW_FLOW.map((s) => ({ ...s }));

  return opts.preorder ? [{ ...PREORDER_STEP }, ...base] : base;
}

/** The steps a cook drives. The last one belongs to the customer. */
export const COOK_ADVANCES: Record<string, Record<string, string>> = {
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

/** The legacy COD equivalent — src/store/OrdersContext.js NEXT_STEP. */
export const COD_ADVANCES: Record<string, string> = {
  placed: 'accepted',
  accepted: 'cooking',
  cooking: 'on_the_way',
  on_the_way: 'delivered',
};

export function nextStatus(order: {
  kind: string;
  status: string;
  handover: string;
}): string | null {
  if (order.kind === 'cod') return COD_ADVANCES[order.status] ?? null;
  const table = COOK_ADVANCES[order.handover === 'pickup' ? 'pickup' : 'delivery'];
  return table[order.status] ?? null;
}

export const isFinished = (status: string) =>
  status === 'completed' || status === 'cancelled' || status === 'rejected';

/** A COD order ends at `delivered`; there is no escrow to release. */
export const isClosed = (kind: string, status: string) =>
  kind === 'cod'
    ? status === 'delivered' || status === 'cancelled' || status === 'rejected'
    : isFinished(status);

/** Waiting on the customer to say the food arrived — money is still held. */
export const awaitingReceipt = (order: { kind: string; status: string; payment: string }) =>
  order.kind !== 'cod' && order.status === 'delivered' && order.payment === 'held';

/* ------------------------------------------------------------------ *
 * meals, requests, offers
 * ------------------------------------------------------------------ */

/** When each service is eaten, and when ordering for it shuts. */
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', serveHour: 8, cutoffHour: 7 },
  { key: 'lunch', label: 'Lunch', serveHour: 13, cutoffHour: 10 },
  { key: 'dinner', label: 'Dinner', serveHour: 20, cutoffHour: 17 },
] as const;

export const slotMeta = (key: string) => SLOTS.find((s) => s.key === key) ?? SLOTS[1];

export const MEAL_STATUS = ['published', 'closed', 'cancelled'] as const;

export const REQUEST_STATUS = {
  OPEN: 'open',
  SELECTED: 'selected',
  AGREED: 'agreed',
  ORDERED: 'ordered',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export const OFFER_STATUS = {
  INTERESTED: 'interested',
  PRICED: 'priced',
  SELECTED: 'selected',
  NEGOTIATING: 'negotiating',
  AGREED: 'agreed',
  NOT_SELECTED: 'not-selected',
  DECLINED: 'declined',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const;

export const isLiveOffer = (status: string) =>
  (
    [
      OFFER_STATUS.INTERESTED,
      OFFER_STATUS.PRICED,
      OFFER_STATUS.SELECTED,
      OFFER_STATUS.NEGOTIATING,
      OFFER_STATUS.AGREED,
    ] as string[]
  ).includes(status);

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/**
 * The four places money can sit.
 *
 * `held` is the platform's escrow: money that has left a customer and has not
 * reached a cook. `platform` is new — the app has no such account, which is
 * exactly why it earns nothing on the escrow systems (gap #2).
 */
export const ACCOUNTS = ['customer', 'held', 'cook', 'platform'] as const;
export type FoldedAccount = (typeof ACCOUNTS)[number];

/**
 * The world outside the platform — a bKash wallet, a bank.
 *
 * Deliberately not in ACCOUNTS: it is never folded into a balance, which is
 * what makes a top-up read as money arriving rather than as a transfer that
 * nets to nothing. The app does the same thing (`from: 'external'`), and
 * a payout leaves the same way.
 */
export const EXTERNAL = 'external';

export type LedgerAccount = FoldedAccount | typeof EXTERNAL;

export const LEDGER_KINDS = [
  'topup',
  'hold',
  'release',
  'refund',
  'commission',
  'payout',
  'adjustment',
  /* A promotion the platform funded into escrow, and the same money coming
     back out when the order is cancelled. Separate kinds because reconcile
     has to be able to tell them apart from a customer payment. */
  'promo',
  'promo-return',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** The cook's cut on the legacy COD path — src/store/OrdersContext.js. */
export const COOK_PAYOUT_RATE = 0.85;

/* ------------------------------------------------------------------ *
 * admin roles
 * ------------------------------------------------------------------ */

export const ROLES = ['superadmin', 'ops', 'finance', 'support'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What each role may do. `superadmin` is every capability; the rest are
 * deliberately narrow — a support agent must not be able to move money.
 */
export const CAPABILITIES = {
  superadmin: ['*'],
  ops: [
    'kitchen.write',
    'kyc.decide',
    'order.write',
    'meal.write',
    'store.write',
    'request.read',
    'review.moderate',
    'notification.broadcast',
    'config.write',
  ],
  finance: [
    'order.read',
    'ledger.read',
    'payout.write',
    'topup.reconcile',
    'dispute.resolve',
    'config.read',
  ],
  support: ['order.read', 'kitchen.read', 'request.read', 'dispute.open', 'review.moderate'],
} as const satisfies Record<Role, readonly string[]>;

export function can(role: string, capability: string): boolean {
  const caps = CAPABILITIES[role as Role] as readonly string[] | undefined;
  if (!caps) return false;
  if (caps.includes('*')) return true;
  if (caps.includes(capability)) return true;
  // A write capability implies the matching read.
  if (capability.endsWith('.read')) {
    const prefix = capability.slice(0, -'.read'.length);
    return caps.some((c) => c.startsWith(`${prefix}.`));
  }
  return false;
}

export const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super admin',
  ops: 'Operations',
  finance: 'Finance',
  support: 'Support',
};
