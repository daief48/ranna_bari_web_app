import type { ClientSession } from 'mongoose';

import { Order, Product } from '../models/index.js';
import { tx } from '../config/db.js';
import { ERR, fail, isFinished, nextStatus, ok, type Result } from '../lib/domain.js';
import { makeCode, taka } from '../lib/format.js';
import { post, refundEscrow } from './ledger.js';
import { syncBookingStatus } from './mealplan.js';
import { notify } from './wallet.js';

/**
 * The order rail — shared by every system that sells into this wallet.
 *
 * A pre-booked meal, a store purchase, a paid request and a wallet order all
 * walk the same steps once money is held: the cook advances, the customer says
 * it arrived, an operator releases. Only one place may own those steps, and
 * this is it — relocated from `logic/meals.ts` when the old meal board was
 * removed, because the rail outlives any one thing sold on it.
 */

/* ------------------------------------------------------------------ *
 * shared bits
 * ------------------------------------------------------------------ */

const idOf = (doc: { _id: unknown }) => String(doc._id);

/** A malformed id is a miss, not a crash — every caller here means NO_ORDER by it. */
const findOrder = (orderId: string, session?: ClientSession) =>
  Order.findById(orderId)
    .session(session ?? null)
    .lean()
    .catch(() => null);

/**
 * A code nothing else holds, drawn before the transaction opens.
 *
 * A duplicate key *inside* a transaction aborts the whole thing, and a
 * one-in-a-billion clash on a six-character code is no reason to fail a
 * purchase. Checking first turns the clash into another draw.
 */
export async function freeCode(
  taken: (code: string) => Promise<boolean>,
  prefix = 'RB',
): Promise<string> {
  let code = makeCode(prefix);
  for (let i = 0; i < 5 && (await taken(code)); i += 1) code = makeCode(prefix);
  return code;
}

export const historyStep = (status: string, by?: string) => ({
  status,
  at: new Date().toISOString(),
  ...(by ? { by } : {}),
});

/**
 * What the customer is told at each step the cook drives.
 *
 * `{title}` is filled in below, server-side — the only notifications in this
 * file built from a table rather than a template literal, and the only ones
 * nobody used to substitute.
 */
const TOLD: Record<string, [string, string]> = {
  preparing: ['Being prepared', '{title} is being cooked.'],
  ready: ['Ready', '{title} is ready.'],
  delivering: ['On the way', '{title} is out for delivery.'],
  delivered: ['Delivered', 'Confirm you received {title} to complete the order.'],
};

/* ------------------------------------------------------------------ *
 * transitions
 * ------------------------------------------------------------------ */

/**
 * The cook pushes an order one step along its own rail.
 *
 * A pending pre-order has no next step here on purpose — accepting it is a
 * decision, not a stage, and it belongs to the store's own transition. The
 * table in `domain.ts` simply has no entry for `pending`, so it falls out as
 * WRONG_STATE rather than needing a check of its own.
 *
 * `nextStatus` covers the legacy cash-on-delivery rail too. That one *ends* at
 * `delivered` — there is no escrow behind it — so the nudge to confirm receipt
 * is not filed for it: it would ask a customer to complete something that is
 * already finished.
 */
export async function advanceOrder(args: {
  orderId: string;
  kitchenId?: string;
}): Promise<Result<{ status: string }>> {
  const order = await findOrder(args.orderId);
  if (!order) return fail(ERR.NO_ORDER);
  if (args.kitchenId && order.kitchenId !== args.kitchenId) return fail(ERR.FORBIDDEN);

  const to = nextStatus({ kind: order.kind, status: order.status, handover: order.handover });
  if (!to) return fail(ERR.WRONG_STATE);

  const orderId = idOf(order);

  return tx(async (session) => {
    const moved = await Order.updateOne(
      { _id: orderId, status: order.status },
      {
        $set: {
          status: to,
          // The escrow ageing board sorts on this, and it is only honest if
          // it is stamped at the moment the status says delivered.
          ...(to === 'delivered' ? { deliveredAt: new Date() } : {}),
        },
        $push: { history: historyStep(to, 'cook') },
      },
      { session },
    );
    // Somebody else advanced it while we were deciding; their step stands.
    if (moved.matchedCount === 0) return fail(ERR.WRONG_STATE);

    /* Every rail now ends with the customer's word, cash included — the
       doorstep confirmation is what closes a cash order and what puts its
       collected cash on the release queue. This used to skip the nudge for
       cash on the grounds that `delivered` was the end of that rail; it is
       not any more, and a customer who is never asked never confirms. */
    const told = TOLD[to];
    if (told) {
      await notify(session, {
        audience: 'customer',
        kind: `order-${to}`,
        key: `customer:order-${to}:${orderId}`,
        title: told[0],
        body: told[1].replace('{title}', order.title ?? 'Your order'),
        customerKey: order.customerKey,
        mealId: order.mealId,
        orderId,
      });
    }

    return ok({ status: to });
  });
}

/**
 * The customer says it arrived. The order is finished; the money is not.
 *
 * A courier marking an order delivered is a claim about a van, not about a
 * doorstep, which is why that moves the status and this closes the order.
 *
 * ## Why this does not pay the cook
 *
 * It used to do both in one transaction: release the escrow and set
 * `completed`. That made the customer the last authority on money, and there
 * is no step between them pressing a button and a cook being paid — nothing
 * catches an order confirmed by mistake, under pressure, or by someone who
 * has already opened a dispute in the same minute.
 *
 * So the two are separate decisions with separate owners. The customer
 * closes the order; releasing the hold is an operator's call, from the
 * panel's order screen or the escrow sweep. `payment` stays `held`, which is
 * what keeps the row on the release queue and what stops it being released
 * twice by any route.
 *
 * ## Cash orders
 *
 * A cash order carries `payment: 'cod'` and never had a hold — the rider took
 * the money at the door. That used to be refused here as "already settled",
 * which left every cash order sitting on `delivered` for ever: the courier's
 * word was the last one anybody could say about it, and the customer had no
 * way to disagree or to close it. Closing is not a money operation, so it is
 * allowed on both rails; what differs is only that there is nothing for an
 * operator to release afterwards, and the cook is told so.
 */
export async function confirmReceived(args: {
  orderId: string;
  /** The customer acting. Only they can say the food arrived. */
  customerKey?: string;
}): Promise<Result<{ amount: number }>> {
  const order = await findOrder(args.orderId);
  if (!order) return fail(ERR.NO_ORDER);
  if (args.customerKey && order.customerKey !== args.customerKey) return fail(ERR.FORBIDDEN);
  if (order.status !== 'delivered') return fail(ERR.WRONG_STATE);
  const cash = order.payment === 'cod';
  /* A hold that has already been paid out or given back has nothing left to
     confirm against; a cash order has nothing to confirm against by design,
     and that is fine. */
  if (!cash && order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const orderId = idOf(order);

  return tx(async (session) => {
    await Order.updateOne(
      { _id: orderId },
      {
        $set: { status: 'completed' },
        $push: { history: historyStep('completed', 'customer') },
      },
      { session },
    );

    /*
     * Cash collected at the door, entering the books.
     *
     * A cash order posted nothing at all before this, which left two things
     * wrong at once: the cook's share of a cash sale was never payable
     * through the panel, and the platform's cut existed only as a figure the
     * dashboard multiplied out (`codCommission`) against no entry anybody
     * could audit. `commissionCod` has been in settings the whole time.
     *
     * `external` rather than `customer` is the source, because no platform
     * balance was debited — the money came in from outside, the way a top-up
     * does. Posted here rather than at `delivered` so that the customer
     * saying the food arrived is what makes it payable, exactly as it is on
     * the wallet rail. From this point the order is an ordinary held order
     * and `releaseEscrow` splits it with no idea it was ever cash.
     */
    if (cash && order.amount > 0) {
      await post(session, {
        kind: 'hold',
        amount: order.amount,
        from: 'external',
        to: 'held',
        orderId,
        note: `Cash collected at the door for ${order.title}`,
        idemKey: `hold:${orderId}`,
      });

      await Order.updateOne({ _id: orderId }, { $set: { payment: 'held' } }, { session });
    }

    /* One meal of a month, closing. The booking is a receipt rather than an
       authority, so it holds no status until its last item is finished — and
       when it is, that has to land in the same transaction as the item that
       finished it or the two disagree. */
    if (order.bookingId) await syncBookingStatus(session, order.bookingId);

    await notify(session, {
      audience: 'cook',
      kind: 'order-confirmed',
      key: `cook:order-confirmed:${orderId}`,
      title: 'Customer confirmed delivery',
      body: cash
        ? `${order.title} is complete. The rider collected ${taka(order.amount)} in cash at the door, and your share will be released to you by RannaBari.`
        : `${order.title} is complete. ${taka(order.amount)} is held and will be released to you by RannaBari.`,
      kitchenId: order.kitchenId,
      mealId: order.mealId,
      orderId,
    });

    await notify(session, {
      audience: 'customer',
      kind: 'order-completed',
      key: `customer:order-completed:${orderId}`,
      title: 'Order completed',
      body: 'Thank you — this order is closed.',
      customerKey: order.customerKey,
      mealId: order.mealId,
      orderId,
    });

    return ok({ amount: order.amount });
  });
}

/**
 * Put a cancelled store order's units back on the shelf.
 *
 * A pre-order never took any stock, so there is nothing to return. Exported
 * because the store's own cancellation path has to do exactly this and two
 * implementations of "give the stock back" is one too many.
 */
export async function restock(
  session: ClientSession,
  order: { kind: string; preorder?: boolean; lines?: unknown },
): Promise<void> {
  if (order.kind !== 'store' || order.preorder) return;

  const lines = Array.isArray(order.lines)
    ? (order.lines as { productId?: string; qty?: number }[])
    : [];

  const back = new Map<string, number>();
  for (const line of lines) {
    if (!line?.productId) continue;
    back.set(line.productId, (back.get(line.productId) ?? 0) + Math.round(Number(line.qty ?? 0)));
  }

  for (const [productId, qty] of back) {
    if (qty > 0) {
      await Product.updateOne({ _id: productId }, { $inc: { stock: qty } }, { session });
    }
  }
}

/**
 * Cancel one order and put the held money back.
 *
 * Allowed right up until the food is on its way; after that it is a dispute
 * rather than a cancellation, and this module does not pretend to settle
 * those — `splitEscrow` does, from the panel.
 */
export async function cancelOrder(args: {
  orderId: string;
  by?: 'cook' | 'customer' | 'admin';
  reason?: string;
}): Promise<Result<{ refunded: number }>> {
  const order = await findOrder(args.orderId);
  if (!order) return fail(ERR.NO_ORDER);
  if (isFinished(order.status)) return fail(ERR.ALREADY_SETTLED);
  if (order.status === 'delivering' || order.status === 'delivered') {
    return fail(ERR.WRONG_STATE);
  }
  if (order.payment !== 'held') return fail(ERR.ALREADY_SETTLED);

  const orderId = idOf(order);
  const by = args.by ?? 'customer';
  const reason = String(args.reason ?? '').trim() || 'Order cancelled';
  const tell = by === 'cook' ? 'customer' : 'cook';

  return tx(async (session) => {
    const back = await refundEscrow(session, orderId, { note: reason });
    if (!back.ok) return back;

    await Order.updateOne(
      { _id: orderId },
      {
        $set: { status: 'cancelled', cancelReason: reason },
        $push: { history: historyStep('cancelled', by) },
      },
      { session },
    );

    await restock(session, order);

    /* A month is not cancelled because one Tuesday was — the booking only
       closes when every meal on it has, which is what this decides. */
    if (order.bookingId) await syncBookingStatus(session, order.bookingId);

    await notify(session, {
      audience: tell,
      kind: 'order-cancelled',
      key: `${tell}:order-cancelled:${orderId}`,
      title: 'Order cancelled',
      body: `${order.title} was cancelled. ${taka(back.result.refunded)} was refunded.`,
      customerKey: tell === 'customer' ? order.customerKey : null,
      kitchenId: tell === 'cook' ? order.kitchenId : null,
      mealId: order.mealId,
      orderId,
    });

    /* And the side that did the cancelling. They knew a second ago; they will
       not a week later, and an order that vanished from the list with no row
       explaining it is the thing support calls are made of. An operator
       cancelling tells both parties and needs no copy itself. */
    if (by !== 'admin') {
      const actor = by === 'cook' ? 'cook' : 'customer';
      await notify(session, {
        audience: actor,
        kind: 'order-cancelled',
        key: `${actor}:order-cancelled:${orderId}`,
        title: 'You cancelled this order',
        body: `${order.title} was cancelled. ৳${order.amount} was refunded to the customer.`,
        customerKey: actor === 'customer' ? order.customerKey : null,
        kitchenId: actor === 'cook' ? order.kitchenId : null,
        mealId: order.mealId,
        orderId,
      });
    }

    return ok({ refunded: back.result.refunded });
  });
}

/**
 * Escrow standing against a cook's orders: earned, but not yet theirs.
 *
 * The kitchen is an argument — omitting it gives the platform's entire
 * escrow, which is what the operator's board wants and what no cook screen
 * should ever be handed.
 *
 * This is the **held** figure, not the cook's share of it: the commission is
 * taken at release, so what lands in a wallet is this less the platform's cut.
 */
export async function pendingEarnings(
  kitchenId?: string,
  session?: ClientSession,
): Promise<number> {
  const rows = await Order.aggregate<{ _id: null; total: number }>([
    { $match: { payment: 'held', ...(kitchenId ? { kitchenId } : {}) } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session ?? null);

  return rows[0]?.total ?? 0;
}
