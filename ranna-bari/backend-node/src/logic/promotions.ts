/**
 * Promotions, and who pays for them.
 *
 * The platform had no promotional primitive of any kind — no code, no
 * discount, no voucher anywhere in thirty-one collections. This is the first
 * one, and the whole design turns on a single rule:
 *
 *   **A cook is paid exactly the same whether a promotion was used or not.**
 *
 * That is not a nicety. A discount is a marketing decision the platform makes;
 * a cook agreed a price for cooking food. Funding the first out of the second
 * would mean every campaign quietly cut somebody's earnings, and they would
 * find out from their payout.
 *
 * So the money works like this, and it is the reason the order keeps two
 * numbers instead of one:
 *
 *   order.amount    the gross. What the cook's share is computed from, and
 *                   what `releaseEscrow` splits — untouched by any promotion.
 *   order.discount  what came off.
 *   order.paid      what the customer actually handed over.
 *
 * At checkout the customer posts `paid` into escrow and the *platform* posts
 * `discount` into escrow beside it. Escrow therefore holds the full gross, the
 * release splits it exactly as it always did, and the promotion shows up where
 * it belongs: as money the platform put in and will not get back.
 *
 * On a refund the two are unwound separately — the customer is returned what
 * they paid and the platform takes back what it contributed. Refunding the
 * whole hold to the customer would hand them the discount as cash.
 */
import type { ClientSession } from 'mongoose';

import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { isDuplicateKey } from '../config/db.js';
import { Order, Promotion, Redemption } from '../models/index.js';

export type PromotionRow = {
  id: string;
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  minOrder: number;
  maxDiscount: number;
  firstOrderOnly: boolean;
  usageLimit: number;
  perCustomer: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  /** How many times it has actually been used. */
  used?: number;
};

type Row = {
  _id: unknown;
  code: string;
  kind: string;
  value: number;
  minOrder: number;
  maxDiscount: number;
  firstOrderOnly: boolean;
  usageLimit: number;
  perCustomer: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

const shape = (row: Row): PromotionRow => ({
  id: String(row._id),
  code: row.code,
  kind: row.kind === 'flat' ? 'flat' : 'percent',
  value: row.value,
  minOrder: row.minOrder,
  maxDiscount: row.maxDiscount,
  firstOrderOnly: row.firstOrderOnly,
  usageLimit: row.usageLimit,
  perCustomer: row.perCustomer,
  startsAt: row.startsAt ? row.startsAt.toISOString() : null,
  endsAt: row.endsAt ? row.endsAt.toISOString() : null,
  active: row.active,
});

/** Codes are shouted, never typed exactly. Case and spacing do not count. */
export const normaliseCode = (code: string) =>
  String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');

/* ------------------------------------------------------------------ *
 * using one
 * ------------------------------------------------------------------ */

export type Quote = {
  promotionId: string;
  code: string;
  discount: number;
  /** What the customer will actually pay. */
  paid: number;
};

/**
 * What a code is worth on this basket, for this customer, right now.
 *
 * Every refusal names its own reason rather than a generic "invalid code".
 * A customer told their code is invalid when it is really ৳200 short of the
 * minimum will type it again, then give up; one told the minimum will add
 * something.
 *
 * Never throws and never writes. Redemption is a separate step taken inside
 * the order's transaction, so a quote shown on a checkout screen cannot
 * consume anything.
 */
export async function quotePromotion(args: {
  code: string;
  customerKey: string;
  /** The gross order total the discount applies to. */
  amount: number;
}): Promise<Result<Quote>> {
  const code = normaliseCode(args.code);
  if (!code) return fail(ERR.NAME_REQUIRED);

  const promo = await Promotion.findOne({ code })
    .lean()
    .catch(() => null);
  if (!promo || !promo.active) return fail(ERR.PROMO_UNKNOWN);

  const now = Date.now();
  if (promo.startsAt && now < new Date(promo.startsAt).getTime()) {
    return fail(ERR.PROMO_NOT_STARTED);
  }
  if (promo.endsAt && now > new Date(promo.endsAt).getTime()) {
    return fail(ERR.PROMO_EXPIRED);
  }

  const amount = Math.round(Number(args.amount) || 0);
  if (amount <= 0) return fail(ERR.BAD_AMOUNT);
  if (promo.minOrder && amount < promo.minOrder) {
    return fail(ERR.PROMO_MIN_ORDER, { minOrder: promo.minOrder });
  }

  /* First-order codes are checked against orders, not redemptions: somebody
     who ordered without a code has still ordered. */
  if (promo.firstOrderOnly) {
    const before = await Order.countDocuments({
      customerKey: args.customerKey,
      status: { $nin: ['cancelled', 'rejected'] },
    });
    if (before > 0) return fail(ERR.PROMO_FIRST_ONLY);
  }

  const promotionId = String(promo._id);

  const [mine, all] = await Promise.all([
    Redemption.countDocuments({ promotionId, customerKey: args.customerKey }),
    promo.usageLimit ? Redemption.countDocuments({ promotionId }) : Promise.resolve(0),
  ]);

  if (promo.perCustomer && mine >= promo.perCustomer) return fail(ERR.PROMO_USED);
  if (promo.usageLimit && all >= promo.usageLimit) return fail(ERR.PROMO_EXHAUSTED);

  /* Rounded to whole taka like every other figure in this system, and capped
     twice: by maxDiscount, and by the order itself. A discount larger than the
     basket would mean posting a negative payment. */
  let discount =
    promo.kind === 'flat'
      ? Math.round(promo.value)
      : Math.round((amount * promo.value) / 100);

  if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.max(0, Math.min(discount, amount));

  if (discount <= 0) return fail(ERR.PROMO_NO_VALUE);

  return ok({ promotionId, code, discount, paid: amount - discount });
}

/**
 * Record that a code was used, inside the order's own transaction.
 *
 * The unique index on (promotionId, orderId) is what makes a retried checkout
 * safe: the second attempt collides rather than counting twice against a
 * one-per-customer limit.
 */
export async function redeem(
  session: ClientSession,
  args: { quote: Quote; customerKey: string; orderId: string },
): Promise<void> {
  /* Read before write, not catch-after-write.

     Inside a transaction a duplicate-key error aborts the whole transaction,
     and catching it does not save it — the commit fails afterwards with
     NoSuchTransaction. `post()` already avoids this with `alreadyPosted`,
     and this is the same shape of problem.

     The unique index stays: it is what stops two genuinely concurrent
     checkouts both writing a redemption, and in that case aborting is the
     right outcome because withTransaction retries the loser. */
  const already = await Redemption.findOne({
    promotionId: args.quote.promotionId,
    orderId: args.orderId,
  })
    .session(session)
    .lean();
  if (already) return;

  await Redemption.create(
    [
      {
        promotionId: args.quote.promotionId,
        code: args.quote.code,
        customerKey: args.customerKey,
        orderId: args.orderId,
        amount: args.quote.discount,
      },
    ],
    { session },
  );
}

/* ------------------------------------------------------------------ *
 * managing them
 * ------------------------------------------------------------------ */

export async function promotionsOf(): Promise<PromotionRow[]> {
  const rows = await Promotion.find().sort({ createdAt: -1 }).lean();
  if (!rows.length) return [];

  const used = await Redemption.aggregate<{ _id: string; n: number }>([
    { $group: { _id: '$promotionId', n: { $sum: 1 } } },
  ]);
  const byPromo = new Map(used.map((row) => [row._id, row.n]));

  return rows.map((row) => ({
    ...shape(row as Row),
    used: byPromo.get(String(row._id)) ?? 0,
  }));
}

export async function savePromotion(args: {
  id?: string;
  code?: string;
  kind?: 'percent' | 'flat';
  value?: number;
  minOrder?: number;
  maxDiscount?: number;
  firstOrderOnly?: boolean;
  usageLimit?: number;
  perCustomer?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
}): Promise<Result<PromotionRow>> {
  const patch: Record<string, unknown> = {};

  if (args.kind) patch.kind = args.kind === 'flat' ? 'flat' : 'percent';
  if (args.value != null) patch.value = Math.round(args.value);
  if (args.minOrder != null) patch.minOrder = Math.max(0, Math.round(args.minOrder));
  if (args.maxDiscount != null) patch.maxDiscount = Math.max(0, Math.round(args.maxDiscount));
  if (args.firstOrderOnly != null) patch.firstOrderOnly = !!args.firstOrderOnly;
  if (args.usageLimit != null) patch.usageLimit = Math.max(0, Math.round(args.usageLimit));
  if (args.perCustomer != null) patch.perCustomer = Math.max(0, Math.round(args.perCustomer));
  if (args.active != null) patch.active = !!args.active;
  if (args.startsAt !== undefined) patch.startsAt = args.startsAt ? new Date(args.startsAt) : null;
  if (args.endsAt !== undefined) patch.endsAt = args.endsAt ? new Date(args.endsAt) : null;

  /* A percentage over 100 would pay the customer to order. */
  const kind = (patch.kind as string) ?? 'percent';
  const value = patch.value as number | undefined;
  if (value != null && (value <= 0 || (kind === 'percent' && value > 100))) {
    return fail(ERR.BAD_AMOUNT);
  }

  if (args.id) {
    /* The code is never edited: it is printed on posters and typed from
       memory, and a campaign whose code changes underneath it is a support
       queue. A wrong code is deactivated and a right one made. */
    const row = await Promotion.findByIdAndUpdate(args.id, patch, { new: true })
      .lean()
      .catch(() => null);
    if (!row) return fail(ERR.NO_PRODUCT);
    return ok(shape(row as Row));
  }

  const code = normaliseCode(args.code ?? '');
  if (!code) return fail(ERR.NAME_REQUIRED);
  if (value == null) return fail(ERR.BAD_AMOUNT);

  try {
    const created = await Promotion.create({
      code,
      kind,
      value,
      minOrder: patch.minOrder ?? 0,
      maxDiscount: patch.maxDiscount ?? 0,
      firstOrderOnly: patch.firstOrderOnly ?? false,
      usageLimit: patch.usageLimit ?? 0,
      perCustomer: patch.perCustomer ?? 1,
      startsAt: patch.startsAt ?? null,
      endsAt: patch.endsAt ?? null,
      active: patch.active ?? true,
    });
    return ok(shape(created.toObject() as Row));
  } catch (error) {
    if (isDuplicateKey(error)) return fail(ERR.DUPLICATE);
    throw error;
  }
}
