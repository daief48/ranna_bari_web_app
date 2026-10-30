import type { ClientSession } from 'mongoose';

import { Dispute, LedgerEntry, Order, Redemption, WalletLock, Withdrawal } from '../models/index.js';
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
 *
 * Asked before it is written, not caught after. A duplicate-key error inside
 * a transaction aborts the whole transaction — catching it here saved the
 * call but not the unit of work, and the next write in the same session
 * failed with NoSuchTransaction as a 500. So a keyed entry is looked up in
 * the session first and a replay returns `posted: false` with nothing
 * thrown. The unique index stays underneath as the backstop for two
 * genuinely concurrent posts: that abort is the right outcome, because
 * `withTransaction` replays the loser and the lookup then finds the winner.
 */
export async function post(
  session: ClientSession,
  args: PostArgs,
): Promise<{ posted: boolean; id: string | null }> {
  const amount = Math.round(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(ERR.BAD_AMOUNT);

  if (args.idemKey && (await alreadyPosted(session, args.idemKey))) {
    return { posted: false, id: null };
  }

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

/**
 * Check a customer can afford something, in a way two spends cannot both pass.
 *
 * The balance is folded, so "enough?" is a read and the hold that follows is
 * an insert — and two checkouts in flight read the same balance, both pass,
 * and both hold. Nothing they write collides, because two holds are two rows.
 *
 * So the first thing a spend does is write: it bumps the customer's
 * `WalletLock` row inside its own transaction. Two transactions on one
 * wallet now conflict on that document, Mongo aborts the second, and
 * `withTransaction` replays it with a snapshot that includes the first's
 * hold — at which point this read refuses it. One small upsert on the fast
 * path, and a wallet can never go below zero through any path that calls
 * this. Every spend must: a path that reads the balance on its own is the
 * race again.
 *
 * Must run inside the transaction that posts the hold, with that session.
 */
export async function reserveWallet(
  session: ClientSession,
  customerKey: string,
  amount: number,
): Promise<Result<{ balance: number }>> {
  const needed = Math.round(amount);
  if (!Number.isFinite(needed) || needed < 0) return fail(ERR.BAD_AMOUNT);

  await WalletLock.updateOne(
    { customerKey },
    { $inc: { v: 1 } },
    { upsert: true, session },
  );

  const balance = await balanceFor('customer', customerKey, session);
  if (balance < needed) {
    return fail(ERR.LOW_BALANCE, { short: needed - balance, balance });
  }
  return ok({ balance });
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

/**
 * Money a cook has asked for and an operator has not yet paid or refused.
 *
 * It never leaves the `cook` bucket until "Mark paid", so the ledger alone
 * still says it is theirs. This is the other half: the reservation that stops
 * a batch payout run (or a second withdrawal) from claiming the same taka.
 */
export async function reservedFor(
  kitchenId: string,
  session?: ClientSession,
): Promise<number> {
  const rows = await Withdrawal.aggregate<{ _id: null; total: number }>([
    { $match: { kitchenId, status: 'requested' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session ?? null);
  return rows[0]?.total ?? 0;
}

/**
 * Serialise the writers of one cook's money.
 *
 * The balance is folded and the payout that follows is an insert, so two
 * transactions (a withdrawal "Mark paid" and a batch run, say) can both read
 * enough cover and both post: no document of theirs collides. Bumping this row
 * first makes them conflict, `withTransaction` replays the loser, and its
 * re-read then sees the winner's payout. Same trick as `reserveWallet`; keyed
 * `cook:<id>` so it cannot meet a customer's wallet key.
 */
export async function lockCook(session: ClientSession, kitchenId: string): Promise<void> {
  await WalletLock.updateOne(
    { customerKey: `cook:${kitchenId}` },
    { $inc: { v: 1 } },
    { upsert: true, session },
  );
}

/** Every cook with money owed, highest first. Drives the payout runs. */
export async function cookBalances(
  session?: ClientSession,
  opts: { excludeReserved?: boolean } = {},
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

  if (!opts.excludeReserved) {
    return rows.map((row) => ({ kitchenId: row._id, amount: row.amount }));
  }

  /* The batch runs' view: what is owed AND not already spoken for by an open
     withdrawal. A cook left with nothing unreserved drops out of the list. */
  const reserved = await Withdrawal.aggregate<{ _id: string; total: number }>([
    { $match: { status: 'requested' } },
    { $group: { _id: '$kitchenId', total: { $sum: '$amount' } } },
  ]).session(session ?? null);
  const held = new Map(reserved.map((row) => [row._id, row.total]));

  return rows
    .map((row) => ({ kitchenId: row._id, amount: row.amount - (held.get(row._id) ?? 0) }))
    .filter((row) => row.amount > 0);
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

/**
 * Is a case still open on this order?
 *
 * A dispute's status is 'open' or 'investigating' until an operator resolves
 * it; anything but 'resolved' is live. `except` names the dispute whose own
 * resolution is doing the asking — that one is allowed to move the money,
 * because moving it *is* the resolution.
 */
async function disputeOpenOn(
  session: ClientSession,
  orderId: string,
  except?: string | null,
): Promise<boolean> {
  const live = await Dispute.findOne({ orderId, status: { $ne: 'resolved' } })
    .select({ _id: 1 })
    .session(session)
    .lean();
  if (!live) return false;
  return !except || String(live._id) !== String(except);
}

/**
 * Pay the cook their share of a held amount, and the platform its cut.
 *
 * The half of a release that moves money, shared by the plain release and
 * the partial refund below so the two cannot split an amount differently.
 * `amount` is what leaves escrow for the cook's side; the commission comes
 * out of it, and the cook gets the remainder. Keyed on the order, so the
 * second caller to reach it is told it lost.
 */
async function payOut(
  session: ClientSession,
  order: { _id: unknown; kind: string; kitchenId: string; title: string; mealId?: string | null },
  amount: number,
  note: string,
): Promise<Result<{ cook: number; platform: number }>> {
  const orderId = String(order._id);
  const { cook, platform } = await splitCommission(amount, order.kind);

  const released = await post(session, {
    kind: 'release',
    amount: cook,
    from: 'held',
    to: 'cook',
    toRef: order.kitchenId,
    orderId,
    mealId: order.mealId,
    note,
    idemKey: `release:${orderId}`,
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

  return ok({ cook, platform });
}

/**
 * Release an order's escrow: `held` → `cook` + `platform`.
 *
 * Refused while a dispute is open on the order. The escrow sweep, the panel's
 * release button and an auto-release all come through here, and none of them
 * may pay a cook out from under a case the customer has raised. The dispute's
 * own resolution passes `disputeId` to say it is the one deciding.
 */
export async function releaseEscrow(
  session: ClientSession,
  orderId: string,
  opts: { note?: string; disputeId?: string | null } = {},
): Promise<Result<{ cook: number; platform: number }>> {
  const order = await Order.findById(orderId).session(session);
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  if (await alreadyPosted(session, `release:${orderId}`)) return fail(ERR.ALREADY_SETTLED);
  if (await disputeOpenOn(session, orderId, opts.disputeId)) return fail(ERR.DISPUTE_OPEN);

  const paid = await payOut(session, order, order.amount, opts.note ?? `Released for ${order.title}`);
  if (!paid.ok) return paid;

  await Order.updateOne(
    { _id: orderId },
    {
      payment: 'released',
      cookAmount: paid.result.cook,
      platformAmount: paid.result.platform,
      completedAt: new Date(),
    },
    { session },
  );

  return ok(paid.result);
}

/**
 * Unwind one slice of a hold to the two parties that funded it.
 *
 * A discounted order was paid by two parties, so it is refunded to two.
 * Returning the whole slice to the customer would hand them the platform's
 * discount as cash — refunded more than they ever paid. Split in proportion,
 * so half an order returns half of each side; the customer takes the
 * remainder rather than its own rounded share, so the two halves always add
 * back to exactly what left escrow. `discount` is zero on everything ordered
 * before promotions existed, which reads correctly as "all the customer's".
 *
 * Shared by the refund and the dispute split, so the two cannot disagree
 * about who the discount belonged to.
 */
function unwindShares(
  order: { amount: number; discount?: number | null },
  slice: number,
): { toCustomer: number; toPlatform: number } {
  const discount = Math.round(order.discount ?? 0);
  const share = order.amount > 0 ? slice / order.amount : 1;
  const toPlatform = discount > 0 ? Math.min(slice, Math.round(discount * share)) : 0;
  return { toCustomer: slice - toPlatform, toPlatform };
}

/**
 * A promotion that funded a cancelled order never happened.
 *
 * The redemption row is what the per-customer and usage limits count, so an
 * order refunded in full has to give its slot back — otherwise a customer
 * whose first order was cancelled by the cook has "used" their one code and
 * the campaign's cap counts orders that were never served. A partial refund
 * keeps it: the customer ate, at a discount.
 */
async function releaseRedemption(session: ClientSession, orderId: string): Promise<void> {
  await Redemption.deleteMany({ orderId }, { session });
}

/**
 * Refund an order's escrow: `held` → `customer`.
 *
 * In full by default. With `amount` below the hold it is a *partial* refund,
 * and the remainder is not left behind: it goes to the cook as a release,
 * with the platform's commission taken on it exactly as `releaseEscrow`
 * would. Money that stayed in `held` against an order marked refunded was
 * money nobody could ever move again, and the books only reconcile when
 * every taka that entered escrow has a way out.
 */
export async function refundEscrow(
  session: ClientSession,
  orderId: string,
  opts: { amount?: number; note?: string; idemSuffix?: string } = {},
): Promise<Result<{ refunded: number; released?: number; platform?: number }>> {
  const order = await Order.findById(orderId).session(session);
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const amount = Math.round(opts.amount ?? order.amount);
  if (amount <= 0 || amount > order.amount) return fail(ERR.BAD_AMOUNT);

  const { toCustomer, toPlatform } = unwindShares(order, amount);

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

  const remainder = order.amount - amount;

  if (remainder <= 0) {
    await releaseRedemption(session, orderId);
    await Order.updateOne({ _id: orderId }, { payment: 'refunded' }, { session });
    return ok({ refunded: amount });
  }

  /* Partial: the rest is the cook's. Released under the plain release keys,
     so a later `releaseEscrow` on the same order is told it is settled. */
  const paid = await payOut(
    session,
    order,
    remainder,
    `${opts.note ?? `Partial refund on ${order.title}`} — remainder released`,
  );
  if (!paid.ok) return paid;

  await Order.updateOne(
    { _id: orderId },
    {
      payment: 'released',
      cookAmount: paid.result.cook,
      platformAmount: paid.result.platform,
      completedAt: new Date(),
    },
    { session },
  );

  return ok({ refunded: amount, released: remainder, platform: paid.result.platform });
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

  /* The refund half is unwound the way `refundEscrow` unwinds one: the
     customer gets back only their share of it, and the platform takes back
     the share of the discount it funded. Refunding the whole slice to the
     customer would pay them the promotion in cash. */
  if (refund > 0) {
    const { toCustomer, toPlatform } = unwindShares(order, refund);

    if (toCustomer > 0) {
      const out = await post(session, {
        kind: 'refund',
        amount: toCustomer,
        from: 'held',
        to: 'customer',
        toRef: order.customerKey,
        orderId,
        note: `${note} — refunded`,
        idemKey: `split-refund:${orderId}`,
      });
      if (!out.posted) return fail(ERR.ALREADY_SETTLED);
    }

    if (toPlatform > 0) {
      await post(session, {
        kind: 'promo-return',
        amount: toPlatform,
        from: 'held',
        to: 'platform',
        orderId,
        note: `${order.promoCode ?? 'Discount'} returned on dispute`,
        idemKey: `split-promo-return:${orderId}`,
      });
    }
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

  /* Fully refunded is the one outcome where the promotion was never used. */
  if (refund === order.amount) await releaseRedemption(session, orderId);

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
