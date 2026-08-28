import 'server-only';

import type { Prisma } from '@prisma/client';

import { db } from '../db';
import {
  ERR,
  fail,
  ok,
  type FoldedAccount,
  type LedgerAccount,
  type LedgerKind,
  type Result,
} from '../domain';
import { getSettings } from '../settings';

/**
 * The money.
 *
 * Ported from the app's `src/lib/ledger.js`, whose header says the quiet part
 * out loud: *"When a backend arrives, these transitions are its
 * specification."* This is that backend.
 *
 * Four rules carry over unchanged, and one is added:
 *
 *   1. **Append-only.** `post()` inserts. Nothing here updates or deletes a
 *      ledger row, and the database refuses it anyway.
 *   2. **Balances are folded, never stored.** A stored total is a second
 *      source of truth and one of them will be wrong.
 *   3. **All-or-nothing.** Every transition runs inside one transaction.
 *   4. **Exactly-once settlement**, asserted at release and at refund.
 *   5. *(new)* **The platform takes a cut.** The app has no `platform`
 *      account, so escrow released 100% to the cook and the business earned
 *      nothing on meals, stores or requests. Release now splits.
 */

type Tx = Prisma.TransactionClient;

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
  /**
   * Idempotency. A double-clicked "Release" carries the same key and the
   * second insert loses on the unique index rather than paying twice.
   */
  idemKey?: string | null;
};

/**
 * Append one movement.
 *
 * Never updates or removes: a correction is another entry in the other
 * direction, which is what keeps the history auditable.
 */
export async function post(tx: Tx, args: PostArgs) {
  const amount = Math.round(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(ERR.BAD_AMOUNT);
  }
  return tx.ledgerEntry.create({
    data: {
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
  });
}

/** True when an entry with this idempotency key already exists. */
export async function alreadyPosted(tx: Tx, idemKey: string): Promise<boolean> {
  const found = await tx.ledgerEntry.findUnique({ where: { idemKey } });
  return !!found;
}

/* ------------------------------------------------------------------ *
 * balances — folded on read, never stored
 * ------------------------------------------------------------------ */

export type Balances = Record<FoldedAccount, number>;

const EMPTY_BALANCES = (): Balances => ({ customer: 0, held: 0, cook: 0, platform: 0 });

/**
 * The four global buckets.
 *
 * Folding on read is O(entries). At the volume one marketplace generates that
 * is cheaper than keeping a running total that can drift, and a drifting
 * total means the money is already wrong.
 */
export async function balances(client: Tx | typeof db = db): Promise<Balances> {
  const rows = await client.ledgerEntry.groupBy({
    by: ['from', 'to'],
    _sum: { amount: true },
  });

  const out = EMPTY_BALANCES();
  for (const row of rows) {
    const amount = row._sum.amount ?? 0;
    if (row.from in out) out[row.from as FoldedAccount] -= amount;
    if (row.to in out) out[row.to as FoldedAccount] += amount;
  }
  return out;
}

/**
 * One party's balance.
 *
 * The app's three buckets are global — fine on a single device where there is
 * one customer. A platform needs per-party answers, which is what `fromRef`
 * and `toRef` carry.
 */
export async function balanceFor(
  account: LedgerAccount,
  ref: string,
  client: Tx | typeof db = db,
): Promise<number> {
  const [credits, debits] = await Promise.all([
    client.ledgerEntry.aggregate({
      where: { to: account, toRef: ref },
      _sum: { amount: true },
    }),
    client.ledgerEntry.aggregate({
      where: { from: account, fromRef: ref },
      _sum: { amount: true },
    }),
  ]);
  return (credits._sum.amount ?? 0) - (debits._sum.amount ?? 0);
}

/** Every cook with money owed, highest first. Drives the payout runs. */
export async function cookBalances(
  client: Tx | typeof db = db,
): Promise<{ kitchenId: string; amount: number }[]> {
  const [credits, debits] = await Promise.all([
    client.ledgerEntry.groupBy({
      by: ['toRef'],
      where: { to: 'cook', toRef: { not: null } },
      _sum: { amount: true },
    }),
    client.ledgerEntry.groupBy({
      by: ['fromRef'],
      where: { from: 'cook', fromRef: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const totals = new Map<string, number>();
  for (const row of credits) {
    if (!row.toRef) continue;
    totals.set(row.toRef, (totals.get(row.toRef) ?? 0) + (row._sum.amount ?? 0));
  }
  for (const row of debits) {
    if (!row.fromRef) continue;
    totals.set(row.fromRef, (totals.get(row.fromRef) ?? 0) - (row._sum.amount ?? 0));
  }

  return Array.from(totals.entries())
    .map(([kitchenId, amount]) => ({ kitchenId, amount }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ *
 * commission — gap #2
 * ------------------------------------------------------------------ */

/**
 * Split a held amount into the cook's share and the platform's.
 *
 * The rate is configuration, per system, because the economics of a ৳220 dal
 * bhat and a ৳2,400 bespoke cake are not the same. The cook's share is the
 * remainder rather than its own rounding, so the two halves always add back
 * to exactly what was held — a rounding gap here is money that exists in
 * escrow and belongs to nobody.
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
 * Release an order's escrow: `held` → `cook` + `platform`.
 *
 * Exactly-once is asserted twice — the order's `payment` must still read
 * `held`, and the idempotency key must be unused. Either check alone would
 * be enough on a quiet day; both together survive a retry storm.
 */
export async function releaseEscrow(
  tx: Tx,
  orderId: string,
  opts: { note?: string; reason?: string } = {},
): Promise<Result<{ cook: number; platform: number }>> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const idemKey = `release:${orderId}`;
  if (await alreadyPosted(tx, idemKey)) return fail(ERR.ALREADY_SETTLED);

  const { cook, platform } = await splitCommission(order.amount, order.kind);

  await post(tx, {
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

  if (platform > 0) {
    await post(tx, {
      kind: 'commission',
      amount: platform,
      from: 'held',
      to: 'platform',
      orderId,
      note: `Commission on ${order.title}`,
      idemKey: `commission:${orderId}`,
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      payment: 'released',
      cookAmount: cook,
      platformAmount: platform,
      completedAt: new Date(),
    },
  });

  return ok({ cook, platform });
}

/**
 * Refund an order's escrow: `held` → `customer`.
 *
 * Partial refunds are allowed because a dispute rarely resolves at all-or-
 * nothing, but the total refunded can never exceed what is held.
 */
export async function refundEscrow(
  tx: Tx,
  orderId: string,
  opts: { amount?: number; note?: string; idemSuffix?: string } = {},
): Promise<Result<{ refunded: number }>> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return fail(ERR.NO_ORDER);
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const amount = Math.round(opts.amount ?? order.amount);
  if (amount <= 0 || amount > order.amount) return fail(ERR.BAD_AMOUNT);

  const idemKey = `refund:${orderId}${opts.idemSuffix ? `:${opts.idemSuffix}` : ''}`;
  if (await alreadyPosted(tx, idemKey)) return fail(ERR.ALREADY_SETTLED);

  await post(tx, {
    kind: 'refund',
    amount,
    from: 'held',
    to: 'customer',
    toRef: order.customerKey,
    orderId,
    mealId: order.mealId,
    note: opts.note ?? `Refund for ${order.title}`,
    idemKey,
  });

  await tx.order.update({
    where: { id: orderId },
    data: { payment: 'refunded' },
  });

  return ok({ refunded: amount });
}

/**
 * Split a disputed order between both sides.
 *
 * The two halves must sum to exactly what is held. Anything left over would
 * sit in escrow forever with no order to attach it to, which is the state
 * this whole module exists to prevent.
 */
export async function splitEscrow(
  tx: Tx,
  orderId: string,
  refundAmount: number,
  releaseAmount: number,
  note: string,
): Promise<Result<{ refunded: number; released: number; platform: number }>> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
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

  if (await alreadyPosted(tx, `split:${orderId}`)) return fail(ERR.ALREADY_SETTLED);

  // A marker entry is not posted; the two movements below carry their own
  // keys and together they are the split.
  if (refund > 0) {
    await post(tx, {
      kind: 'refund',
      amount: refund,
      from: 'held',
      to: 'customer',
      toRef: order.customerKey,
      orderId,
      note: `${note} — refunded`,
      idemKey: `split-refund:${orderId}`,
    });
  }

  let platform = 0;
  if (release > 0) {
    const cut = await splitCommission(release, order.kind);
    platform = cut.platform;
    await post(tx, {
      kind: 'release',
      amount: cut.cook,
      from: 'held',
      to: 'cook',
      toRef: order.kitchenId,
      orderId,
      note: `${note} — released`,
      idemKey: `split-release:${orderId}`,
    });
    if (cut.platform > 0) {
      await post(tx, {
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

  await tx.order.update({
    where: { id: orderId },
    data: {
      payment: refund === order.amount ? 'refunded' : 'released',
      cookAmount: release > 0 ? release - platform : 0,
      platformAmount: platform,
      completedAt: new Date(),
    },
  });

  return ok({ refunded: refund, released: release, platform });
}

/* ------------------------------------------------------------------ *
 * reconciliation
 * ------------------------------------------------------------------ */

/**
 * The books, checked against themselves.
 *
 * Every entry moves money between two of the four accounts, so the four
 * balances must sum to zero minus whatever entered the system as a top-up.
 * A non-zero drift means an entry was posted with an account this fold does
 * not know about, and the panel shouts rather than quietly showing a wrong
 * total.
 */
export async function reconcile() {
  const bal = await balances();
  const [topups, holds, releases, refunds, commissions, payouts] = await Promise.all([
    sumOf('topup'),
    sumOf('hold'),
    sumOf('release'),
    sumOf('refund'),
    sumOf('commission'),
    sumOf('payout'),
  ]);

  // Customers hold what they topped up, less what is held against orders,
  // plus whatever came back as a refund.
  const expectedCustomer = topups - holds + refunds;
  // Escrow holds what went in less everything that has come out of it.
  const expectedHeld = holds - releases - refunds - commissions;
  // Cooks are owed what was released to them less what has been paid out.
  const expectedCook = releases - payouts;

  return {
    balances: bal,
    totals: { topups, holds, releases, refunds, commissions, payouts },
    expected: {
      customer: expectedCustomer,
      held: expectedHeld,
      cook: expectedCook,
      platform: commissions,
    },
    drift: {
      customer: bal.customer - expectedCustomer,
      held: bal.held - expectedHeld,
      cook: bal.cook - expectedCook,
      platform: bal.platform - commissions,
    },
  };
}

async function sumOf(kind: LedgerKind): Promise<number> {
  const row = await db.ledgerEntry.aggregate({ where: { kind }, _sum: { amount: true } });
  return row._sum.amount ?? 0;
}
