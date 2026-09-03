import type { ClientSession } from 'mongoose';

import { LedgerEntry, Order } from '../models/index.js';
import { isDuplicateKey } from '../config/db.js';
import {
  ACCOUNTS,
  ERR,
  fail,
  ok,
  type FoldedAccount,
  type LedgerAccount,
  type LedgerKind,
  type Result,
} from '../lib/domain.js';
import { getSettings } from './settings.js';

/**
 * The money.
 *
 * Ported from the Expo app's `src/lib/ledger.js`, whose header says the quiet
 * part out loud: *"When a backend arrives, these transitions are its
 * specification."* This is that backend.
 *
 * Five rules, four carried over unchanged:
 *
 *   1. **Append-only.** `post()` inserts. Nothing here updates or deletes an
 *      entry, and both the model and MongoDB refuse it anyway.
 *   2. **Balances are folded, never stored.** A stored total is a second
 *      source of truth and one of them will be wrong.
 *   3. **All-or-nothing.** Every transition runs inside one transaction, and
 *      every query in it carries the session.
 *   4. **Exactly-once settlement**, asserted twice — the order's state and
 *      the idempotency key.
 *   5. *(added by the panel)* **The platform takes a cut.** The app has no
 *      `platform` account, so escrow released 100% to the cook and the
 *      business earned nothing on meals, stores or requests.
 */

/* ------------------------------------------------------------------ *
 * posting
 * ------------------------------------------------------------------ */

export type PostArgs = {
  kind: LedgerKind;
  amount: number;
  from: LedgerAccount;
  to: LedgerAccount;
  fromRef?: string | null;
  toRef?: string | null;
  mealId?: string | null;
  orderId?: string | null;
  payoutRunId?: string | null;
  note?: string;
  /** A double-clicked "Release" carries the same key and pays once. */
  idemKey?: string | null;
};

/**
 * Append one movement.
 *
 * Never updates or removes: a correction is another entry in the other
 * direction, which is what keeps the history auditable.
 *
 * A duplicate key is not an error — it is the second half of a retry, and the
 * caller decides what that means. It is surfaced as a distinct return rather
 * than a throw so a caller cannot accidentally treat "already paid" as
 * "failed to pay" and try again.
 */
export async function post(
  session: ClientSession,
  args: PostArgs,
): Promise<{ posted: boolean; id: string | null }> {
  const amount = Math.round(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(ERR.BAD_AMOUNT);

  try {
    const [entry] = await LedgerEntry.create(
      [
        {
          kind: args.kind,
          amount,
          from: args.from,
          to: args.to,
          fromRef: args.fromRef ?? null,
          toRef: args.toRef ?? null,
          mealId: args.mealId ?? null,
          orderId: args.orderId ?? null,
          payoutRunId: args.payoutRunId ?? null,
          note: args.note ?? '',
          idemKey: args.idemKey ?? null,
        },
      ],
      { session },
    );
    return { posted: true, id: String(entry._id) };
  } catch (error) {
    if (isDuplicateKey(error)) return { posted: false, id: null };
    throw error;
  }
}

export async function alreadyPosted(
  session: ClientSession,
  idemKey: string,
): Promise<boolean> {
  const found = await LedgerEntry.findOne({ idemKey }).session(session).lean();
  return !!found;
}

/* ------------------------------------------------------------------ *
 * balances — folded on read, never stored
 * ------------------------------------------------------------------ */

export type Balances = Record<FoldedAccount, number>;

const empty = (): Balances => ({ customer: 0, held: 0, cook: 0, platform: 0 });

/**
 * The four global buckets.
 *
 * One aggregation rather than eight, and `external` is deliberately absent
 * from the result — money entering or leaving the platform is not a balance
 * anybody holds, which is exactly what makes a top-up read as an arrival
 * rather than a transfer that nets to nothing.
 */
export async function balances(session?: ClientSession): Promise<Balances> {
  const rows = await LedgerEntry.aggregate<{ _id: { from: string; to: string }; total: number }>([
    { $group: { _id: { from: '$from', to: '$to' }, total: { $sum: '$amount' } } },
  ]).session(session ?? null);

  const out = empty();
  for (const row of rows) {
    if (row._id.from in out) out[row._id.from as FoldedAccount] -= row.total;
    if (row._id.to in out) out[row._id.to as FoldedAccount] += row.total;
  }
  return out;
}

/** One party's balance — what *this* cook is owed, what *this* customer holds. */
export async function balanceFor(
  account: LedgerAccount,
  ref: string,
  session?: ClientSession,
): Promise<number> {
  const rows = await LedgerEntry.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        $or: [
          { to: account, toRef: ref },
          { from: account, fromRef: ref },
        ],
      },
    },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ['$to', account] }, '$amount', 0] },
        },
        debits: {
          $sum: { $cond: [{ $eq: ['$from', account] }, '$amount', 0] },
        },
      },
    },
    { $project: { total: { $subtract: ['$credits', '$debits'] } } },
  ]).session(session ?? null);

  return rows[0]?.total ?? 0;
}

/** Every cook with money owed, highest first. Drives the payout runs. */
export async function cookBalances(
  session?: ClientSession,
): Promise<{ kitchenId: string; amount: number }[]> {
  const rows = await LedgerEntry.aggregate<{ _id: string; amount: number }>([
    {
      $match: {
        $or: [
          { to: 'cook', toRef: { $ne: null } },
          { from: 'cook', fromRef: { $ne: null } },
        ],
      },
    },
    {
      $project: {
        ref: { $cond: [{ $eq: ['$to', 'cook'] }, '$toRef', '$fromRef'] },
        signed: { $cond: [{ $eq: ['$to', 'cook'] }, '$amount', { $multiply: ['$amount', -1] }] },
      },
    },
    { $group: { _id: '$ref', amount: { $sum: '$signed' } } },
    { $match: { amount: { $gt: 0 } } },
    { $sort: { amount: -1 } },
  ]).session(session ?? null);

  return rows.map((row) => ({ kitchenId: row._id, amount: row.amount }));
}

/* ------------------------------------------------------------------ *
 * commission
 * ------------------------------------------------------------------ */

/**
 * Split a held amount between the cook and the platform.
 *
 * The cook's share is the *remainder* rather than its own rounding, so the
 * two halves always add back to exactly what was held. A rounding gap here is
 * money that exists in escrow and belongs to nobody.
 */
export async function splitCommission(
  amount: number,
  kind: string,
): Promise<{ cook: number; platform: number; rate: number }> {
  const settings = await getSettings();
  const rate =
    kind === 'meal'
      ? settings.commissionMeal
      : kind === 'store'
        ? settings.commissionStore
        : kind === 'request'
          ? settings.commissionRequest
          : settings.commissionCod;

  const platform = Math.round(amount * rate);
  return { cook: amount - platform, platform, rate };
}

/* ------------------------------------------------------------------ *
 * settlement
 * ------------------------------------------------------------------ */

/** Release an order's escrow: `held` → `cook` + `platform`. */
export async function releaseEscrow(
  session: ClientSession,
  orderId: string,
  opts: { note?: string } = {},
): Promise<Result<{ cook: number; platform: number }>> {
  const order = await Order.findById(orderId).session(session);
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const idemKey = `release:${orderId}`;
  if (await alreadyPosted(session, idemKey)) return fail(ERR.ALREADY_SETTLED);

  const { cook, platform } = await splitCommission(order.amount, order.kind);

  const released = await post(session, {
    kind: 'release',
    amount: cook,
    from: 'held',
    to: 'cook',
    toRef: order.kitchenId,
    orderId,
    mealId: order.mealId,
    note: opts.note ?? `Released for ${order.title}`,
    idemKey,
  });
  // Lost the race to a concurrent release. Somebody else paid; not us.
  if (!released.posted) return fail(ERR.ALREADY_SETTLED);

  if (platform > 0) {
    await post(session, {
      kind: 'commission',
      amount: platform,
      from: 'held',
      to: 'platform',
      orderId,
      note: `Commission on ${order.title}`,
      idemKey: `commission:${orderId}`,
    });
  }

  await Order.updateOne(
    { _id: orderId },
    {
      payment: 'released',
      cookAmount: cook,
      platformAmount: platform,
      completedAt: new Date(),
    },
    { session },
  );

  return ok({ cook, platform });
}

/** Refund an order's escrow: `held` → `customer`. */
export async function refundEscrow(
  session: ClientSession,
  orderId: string,
  opts: { amount?: number; note?: string; idemSuffix?: string } = {},
): Promise<Result<{ refunded: number }>> {
  const order = await Order.findById(orderId).session(session);
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const amount = Math.round(opts.amount ?? order.amount);
  if (amount <= 0 || amount > order.amount) return fail(ERR.BAD_AMOUNT);

  /*
   * A discounted order was funded by two parties, so it is unwound to two.
   *
   * Returning the whole hold to the customer would hand them the platform's
   * discount as cash — they would be refunded more than they ever paid. The
   * customer gets back what they paid; the platform takes back what it put in.
   *
   * Split in proportion so a partial refund behaves: half an order refunds
   * half of each side. `paid` is null on everything ordered before promotions
   * existed, which reads correctly as "the customer paid all of it".
   */
  const discount = Math.round(order.discount ?? 0);
  const paidByCustomer = Math.round(order.paid ?? order.amount);
  const share = order.amount > 0 ? amount / order.amount : 1;
  const toPlatform = discount > 0 ? Math.round(discount * share) : 0;
  /* The customer gets the remainder rather than its own rounded share, so the
     two halves always add back to exactly what left escrow. */
  const toCustomer = amount - toPlatform;

  const idemKey = `refund:${orderId}${opts.idemSuffix ? `:${opts.idemSuffix}` : ''}`;
  if (await alreadyPosted(session, idemKey)) return fail(ERR.ALREADY_SETTLED);

  const refunded = await post(session, {
    kind: 'refund',
    amount: toCustomer,
    from: 'held',
    to: 'customer',
    toRef: order.customerKey,
    orderId,
    mealId: order.mealId,
    note: opts.note ?? `Refund for ${order.title}`,
    idemKey,
  });
  if (!refunded.posted) return fail(ERR.ALREADY_SETTLED);

  /* The platform takes back what it contributed. Posted after the customer
     half and under its own key, so a retry cannot return it twice. */
  if (toPlatform > 0) {
    await post(session, {
      kind: 'promo-return',
      amount: toPlatform,
      from: 'held',
      to: 'platform',
      orderId,
      note: `${order.promoCode ?? 'Discount'} returned on refund`,
      idemKey: `promo-return:${orderId}${opts.idemSuffix ? `:${opts.idemSuffix}` : ''}`,
    });
  }

  await Order.updateOne({ _id: orderId }, { payment: 'refunded' }, { session });

  return ok({ refunded: amount });
}

/**
 * Split a disputed order between both sides.
 *
 * The two halves must sum to exactly what is held. Anything left over would
 * sit in escrow forever attached to a resolved order — precisely the state
 * this module exists to make impossible.
 */
export async function splitEscrow(
  session: ClientSession,
  orderId: string,
  refundAmount: number,
  releaseAmount: number,
  note: string,
): Promise<Result<{ refunded: number; released: number; platform: number }>> {
  const order = await Order.findById(orderId).session(session);
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const refund = Math.round(refundAmount);
  const release = Math.round(releaseAmount);
  if (refund < 0 || release < 0) return fail(ERR.BAD_AMOUNT);
  if (refund + release !== order.amount) {
    return fail(ERR.BAD_AMOUNT, {
      message: 'A split must account for the whole held amount.',
      held: order.amount,
      given: refund + release,
    });
  }

  if (refund > 0) {
    const out = await post(session, {
      kind: 'refund',
      amount: refund,
      from: 'held',
      to: 'customer',
      toRef: order.customerKey,
      orderId,
      note: `${note} — refunded`,
      idemKey: `split-refund:${orderId}`,
    });
    if (!out.posted) return fail(ERR.ALREADY_SETTLED);
  }

  let platform = 0;
  if (release > 0) {
    const cut = await splitCommission(release, order.kind);
    platform = cut.platform;

    const out = await post(session, {
      kind: 'release',
      amount: cut.cook,
      from: 'held',
      to: 'cook',
      toRef: order.kitchenId,
      orderId,
      note: `${note} — released`,
      idemKey: `split-release:${orderId}`,
    });
    if (!out.posted) return fail(ERR.ALREADY_SETTLED);

    if (cut.platform > 0) {
      await post(session, {
        kind: 'commission',
        amount: cut.platform,
        from: 'held',
        to: 'platform',
        orderId,
        note: `${note} — commission`,
        idemKey: `split-commission:${orderId}`,
      });
    }
  }

  await Order.updateOne(
    { _id: orderId },
    {
      payment: refund === order.amount ? 'refunded' : 'released',
      cookAmount: release > 0 ? release - platform : 0,
      platformAmount: platform,
      completedAt: new Date(),
    },
    { session },
  );

  return ok({ refunded: refund, released: release, platform });
}

/* ------------------------------------------------------------------ *
 * reconciliation
 * ------------------------------------------------------------------ */

/**
 * The books, checked against themselves.
 *
 * Each account is folded from its entries and compared with what those entry
 * *kinds* imply it should be. A non-zero drift means an entry was posted with
 * an account or a kind this fold does not understand, and the panel shouts
 * rather than quietly showing a wrong total.
 */
export async function reconcile() {
  const [bal, byKind] = await Promise.all([
    balances(),
    LedgerEntry.aggregate<{ _id: string; total: number }>([
      { $group: { _id: '$kind', total: { $sum: '$amount' } } },
    ]),
  ]);

  const sum = (kind: LedgerKind) => byKind.find((row) => row._id === kind)?.total ?? 0;

  const totals = {
    topups: sum('topup'),
    holds: sum('hold'),
    releases: sum('release'),
    refunds: sum('refund'),
    commissions: sum('commission'),
    payouts: sum('payout'),
    adjustments: sum('adjustment'),
    /* What the platform put into escrow to fund discounts, and what came
       back when those orders were cancelled. */
    promos: sum('promo'),
    promoReturns: sum('promo-return'),
  };

  const expected: Balances = {
    // Customers hold what they topped up, less what is held, plus refunds.
    customer: totals.topups - totals.holds + totals.refunds,
    /* Escrow holds what went in less everything that has come out of it.
       A promotion is money the *platform* put in beside the customer, so it
       counts as going in — and comes back out on a cancellation. */
    held:
      totals.holds +
      totals.promos -
      totals.releases -
      totals.refunds -
      totals.commissions -
      totals.promoReturns,
    // Cooks are owed what was released, less what has been paid out.
    cook: totals.releases - totals.payouts,
    /* Commission earned, less what discounts cost. A campaign that gave away
       more than it earned shows here as exactly that. */
    platform: totals.commissions - totals.promos + totals.promoReturns,
  };

  const drift = Object.fromEntries(
    ACCOUNTS.map((account) => [account, bal[account] - expected[account]]),
  ) as Balances;

  return { balances: bal, totals, expected, drift };
}
