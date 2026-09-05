import type { ClientSession } from 'mongoose';

import { Meal, MealInterest, Order, Product } from '../models/index.js';
import { tx } from '../config/db.js';
import {
  ERR,
  SLOTS,
  fail,
  isFinished,
  nextStatus,
  ok,
  slotMeta,
  type Result,
} from '../lib/domain.js';
import { deadlineFor, makeCode, taka, todayKey } from '../lib/format.js';
import { balanceFor, post, refundEscrow, releaseEscrow } from './ledger.js';
import { notify } from './wallet.js';

/**
 * Pre-booked meals.
 *
 * A cook publishes one service for one day; customers show interest, then
 * confirm — and confirming is where money leaves a wallet. Ported from the
 * app's `src/lib/mealLogic.js` together with the half of the order lifecycle
 * that file re-exported from `ledger.js`: on the device those were one import
 * because a meal order and a store order walk the same rail, and only one
 * place may own that rail.
 *
 * Four things changed shape on the way over, each marked where it happens:
 *
 *   - **interest is a collection**, not an array on the meal. Capacity is
 *     bounded; interest is not, and an unbounded array is how a document
 *     reaches 16MB. The API shape stays an array.
 *   - **a notification key has to name its recipient.** On one device
 *     `customer:meal-cancelled:<meal>` was unambiguous; here forty customers
 *     share that meal, and the first row filed would silence the other 39.
 *   - **the checks run inside the transaction that acts on them.** The app
 *     validated against live state at that instant because it had exactly one
 *     writer. This has many, so the refusals and the writes are one unit and
 *     the ones that must not interleave say so out loud.
 *   - **money is split at release**, not handed over whole. The app had no
 *     platform account; `releaseEscrow` does the arithmetic and this module
 *     never touches `LedgerEntry` itself.
 */

/* ------------------------------------------------------------------ *
 * shared bits
 * ------------------------------------------------------------------ */

export type MealLike = {
  _id: unknown;
  capacity?: number | null;
  status?: string;
  deadline?: Date | string | null;
};

const idOf = (meal: string | MealLike) => (typeof meal === 'string' ? meal : String(meal._id));

/** A malformed id is a miss, not a crash — every caller here means NO_MEAL by it. */
const findMeal = (mealId: string, session?: ClientSession) =>
  Meal.findById(mealId)
    .session(session ?? null)
    .lean()
    .catch(() => null);

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
 * publish. Checking first turns the clash into another draw.
 */
async function freeCode(taken: (code: string) => Promise<boolean>): Promise<string> {
  let code = makeCode();
  for (let i = 0; i < 5 && (await taken(code)); i += 1) code = makeCode();
  return code;
}

const historyStep = (status: string, by?: string) => ({
  status,
  at: new Date().toISOString(),
  ...(by ? { by } : {}),
});

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

/** Confirmed, uncancelled orders against a meal. */
export function ordersForMeal(mealId: string, session?: ClientSession) {
  return Order.find({ mealId, status: { $ne: 'cancelled' } })
    .sort({ createdAt: -1 })
    .session(session ?? null)
    .lean();
}

export function confirmedCount(mealId: string, session?: ClientSession): Promise<number> {
  return Order.countDocuments({ mealId, status: { $ne: 'cancelled' } })
    .session(session ?? null)
    .exec();
}

/**
 * Who said they were interested.
 *
 * A collection here, an array on the wire: the app reads `meal.interested`
 * and counts it to fill the `{n}` in a cook's notification, so the shape it
 * sees must not change with the storage underneath it.
 */
export async function interestedIn(mealId: string, session?: ClientSession): Promise<string[]> {
  const rows = await MealInterest.find({ mealId })
    .sort({ at: 1 })
    .session(session ?? null)
    .lean();
  return rows.map((row) => row.customerKey);
}

export function interestCount(mealId: string, session?: ClientSession): Promise<number> {
  return MealInterest.countDocuments({ mealId })
    .session(session ?? null)
    .exec();
}

/** How many portions are still buyable. `null` capacity means no limit. */
export async function remaining(
  meal: string | MealLike,
  session?: ClientSession,
): Promise<number | null> {
  const doc = typeof meal === 'string' ? await findMeal(meal, session) : meal;
  if (!doc || doc.capacity == null) return null;
  return Math.max(0, doc.capacity - (await confirmedCount(idOf(doc), session)));
}

/** Whether this meal can still take orders at `now`. */
export async function mealOpen(
  meal: string | MealLike,
  now: number = Date.now(),
  session?: ClientSession,
): Promise<boolean> {
  const doc = typeof meal === 'string' ? await findMeal(meal, session) : meal;
  if (!doc || doc.status !== 'published') return false;
  if (doc.deadline && new Date(doc.deadline).getTime() <= now) return false;
  const left = await remaining(doc, session);
  return left == null || left > 0;
}

/* ------------------------------------------------------------------ *
 * transitions — cook side
 * ------------------------------------------------------------------ */

export type MealDraft = {
  kitchenId: string;
  cookName?: string;
  title: string;
  description?: string;
  image?: string;
  price: number;
  /** null is uncapped, which is not the same as zero. */
  capacity?: number | null;
  /** Local calendar day in Asia/Dhaka, 'YYYY-MM-DD'. Never a timestamp. */
  serveDate: string;
  slot: string;
  deadline?: Date | string | null;
  handover?: string;
  handoverNote?: string;
  area?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusKm?: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Publish a meal for a future service.
 *
 * On the device `notifyNearby` was the caller's decision because only that
 * device knew where its one customer lived. Here the meal carries its own
 * area and radius, so the announcement is filed once as a broadcast — no
 * `customerKey`, no `kitchenId` — and the delivery-radius rule stays where
 * browse already applies it. One row rather than one per customer in range,
 * for the same reason interest is not an array.
 *
 * A deadline that has already passed is refused rather than stored: it would
 * create a meal on the board that nobody, including the cook, can order.
 */
export async function publishMeal(
  draft: MealDraft,
  opts: { notifyNearby?: boolean; now?: number } = {},
): Promise<Result<{ mealId: string; code: string; deadline: Date }>> {
  const title = String(draft.title ?? '').trim();
  if (!title) return fail(ERR.NAME_REQUIRED);
  if (!String(draft.kitchenId ?? '').trim()) return fail(ERR.NO_KITCHEN);

  const price = Math.round(Number(draft.price));
  if (!Number.isFinite(price) || price <= 0) return fail(ERR.BAD_AMOUNT, { field: 'price' });

  /* No capacity means uncapped, which is what the app's form has always
     offered — "how many plates (optional)". Everything that reads a meal
     already treats `null` that way: `remaining()` returns null rather than
     zero, and the card shows no "sold out" state. Refusing it on the way in
     was the one place that disagreed. */
  const capacity =
    draft.capacity == null
      ? null
      : Math.round(Number(draft.capacity));
  if (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0)) {
    return fail(ERR.BAD_AMOUNT, { field: 'capacity' });
  }

  const serveDate = String(draft.serveDate ?? '');
  if (!DAY.test(serveDate)) return fail(ERR.BAD_AMOUNT, { field: 'serveDate' });

  const slot = String(draft.slot ?? '');
  if (!SLOTS.some((s) => s.key === slot)) return fail(ERR.BAD_AMOUNT, { field: 'slot' });

  /* The app's `defaultDeadline`: a slot already knows when ordering for it
     shuts, so a cook who names nothing gets the platform's cutoff rather than
     a meal that takes orders while it is being served. */
  const deadline = draft.deadline
    ? new Date(draft.deadline)
    : deadlineFor(serveDate, slotMeta(slot).cutoffHour);
  if (Number.isNaN(deadline.getTime())) return fail(ERR.BAD_AMOUNT, { field: 'deadline' });
  if (deadline.getTime() <= (opts.now ?? Date.now())) return fail(ERR.PAST_DEADLINE);

  const code = await freeCode(async (c) => !!(await Meal.exists({ code: c })));

  return tx(async (session) => {
    const [meal] = await Meal.create(
      [
        {
          code,
          kitchenId: draft.kitchenId,
          cookName: draft.cookName ?? '',
          title,
          description: draft.description ?? '',
          image: draft.image ?? '',
          price,
          capacity,
          serveDate,
          slot,
          deadline,
          handover: draft.handover ?? 'delivery',
          handoverNote: draft.handoverNote ?? '',
          area: draft.area ?? '',
          lat: draft.lat ?? 0,
          lng: draft.lng ?? 0,
          deliveryRadiusKm: draft.deliveryRadiusKm ?? 3,
          status: 'published',
        },
      ],
      { session },
    );

    const mealId = String(meal._id);

    if (opts.notifyNearby) {
      await notify(session, {
        audience: 'customer',
        kind: 'meal-published',
        key: `customer:meal-published:${mealId}`,
        title: 'New meal near you',
        body: `${meal.title} from ${meal.cookName} — ${taka(meal.price)}`,
        zone: draft.area || null,
        mealId,
      });
    }

    /* The cook's own record of it. Not the customer's sentence — they know
       what they cooked; what they want later is confirmation it went out and
       when it stops taking bookings. */
    await notify(session, {
      audience: 'cook',
      kind: 'meal-live',
      key: `cook:meal-live:${mealId}`,
      title: 'Your meal is live',
      body: `${title} is taking bookings until ${deadline.toISOString().slice(11, 16)} on ${serveDate}.`,
      kitchenId: draft.kitchenId,
      mealId,
    });

    return ok({ mealId, code, deadline });
  });
}

/**
 * Stop taking orders without touching the ones already placed.
 *
 * One collection, so no transaction — but the update is conditional on the
 * meal still being published, which is the same race the app never had to
 * think about: two devices closing at once must not both report success.
 * The moment lands in `updatedAt`; the app's `closedAt` has no column here.
 */
export async function closeMeal(args: {
  mealId: string;
  /** The kitchen acting, when a cook drives this. Omitted for an operator. */
  kitchenId?: string;
}): Promise<Result<{ mealId: string }>> {
  const meal = await findMeal(args.mealId);
  if (!meal) return fail(ERR.NO_MEAL);
  if (args.kitchenId && meal.kitchenId !== args.kitchenId) return fail(ERR.FORBIDDEN);
  if (meal.status !== 'published') return fail(ERR.MEAL_CLOSED);

  const closed = await Meal.updateOne(
    { _id: args.mealId, status: 'published' },
    { status: 'closed' },
  );
  if (closed.matchedCount === 0) return fail(ERR.MEAL_CLOSED);

  /*
   * Tell the people who said they were interested and did not book.
   *
   * Marking interest is free and reversible, and its entire purpose is to
   * hear what happens to the meal. Closing it is what happens, and until now
   * that was the one transition in the whole order flow that told nobody
   * anything.
   *
   * Anyone who actually ordered is skipped: their plate is safe, nothing has
   * changed for them, and "this meal is closed" beside an order they are
   * waiting on reads as a cancellation.
   *
   * Outside the update on purpose. A notification that fails must not undo a
   * close the cook already saw succeed.
   */
  await notify(null, {
    audience: 'cook',
    kind: 'meal-closed',
    key: `cook:meal-closed:${args.mealId}`,
    title: 'Meal closed',
    body: `${meal.title} is no longer taking bookings.`,
    kitchenId: meal.kitchenId,
    mealId: args.mealId,
  }).catch(() => {
    /* Same reasoning as the customer copies below: telling nobody must not
       undo a close the cook already saw succeed. */
  });

  const [interested, ordered] = await Promise.all([
    MealInterest.find({ mealId: args.mealId }).select({ customerKey: 1 }).lean(),
    Order.find({ mealId: args.mealId, status: { $nin: ['cancelled', 'rejected'] } })
      .select({ customerKey: 1 })
      .lean(),
  ]);

  const booked = new Set(ordered.map((o) => o.customerKey));
  const missed = interested.map((i) => i.customerKey).filter((key) => key && !booked.has(key));

  for (const customerKey of missed) {
    await notify(null, {
      audience: 'customer',
      kind: 'meal-closed',
      key: `customer:meal-closed:${args.mealId}:${customerKey}`,
      title: 'A meal you liked has closed',
      body: `${meal.title} is no longer taking bookings.`,
      customerKey,
      mealId: args.mealId,
    }).catch(() => {
      /* One unreachable customer must not stop the rest being told. */
    });
  }

  return ok({ mealId: args.mealId });
}

/**
 * Call the whole service off.
 *
 * Every held payment goes back to the customer it came from. Orders are
 * marked cancelled rather than removed and the refunds are new ledger entries
 * rather than reversals, so the money can still be traced afterwards.
 *
 * Two decisions that are not the app's:
 *
 *   - the meal is shut **first**, in its own write. Refunding forty orders
 *     takes time, and a confirm landing halfway through would hold money on a
 *     meal that is already cancelled.
 *   - **one transaction per order**, not one around the sweep. Forty
 *     customers must not go unrefunded because the forty-first row is broken;
 *     what could not be refunded comes back in `failed` for somebody to chase,
 *     and re-running this on an already-cancelled meal retries exactly those.
 */
export async function cancelMeal(args: {
  mealId: string;
  reason?: string;
  kitchenId?: string;
}): Promise<Result<{ refunded: number; orders: number; failed: string[] }>> {
  const meal = await findMeal(args.mealId);
  if (!meal) return fail(ERR.NO_MEAL);
  if (args.kitchenId && meal.kitchenId !== args.kitchenId) return fail(ERR.FORBIDDEN);

  const reason = String(args.reason ?? '').trim() || 'Meal cancelled by the kitchen';

  await Meal.updateOne(
    { _id: args.mealId },
    { status: 'cancelled', cancelReason: reason },
  );

  const held = await Order.find({
    mealId: args.mealId,
    payment: 'held',
    status: { $ne: 'cancelled' },
  })
    .select({ _id: 1, customerKey: 1 })
    .lean();

  let refunded = 0;
  let orders = 0;
  const failed: string[] = [];

  for (const row of held) {
    const orderId = String(row._id);
    try {
      const out = await tx(async (session) => {
        const back = await refundEscrow(session, orderId, { note: reason });
        if (!back.ok) return back;

        await Order.updateOne(
          { _id: orderId },
          {
            $set: { status: 'cancelled', cancelReason: reason },
            $push: { history: historyStep('cancelled', 'cook') },
          },
          { session },
        );

        /* Keyed per customer, not per meal. On one device the meal id said
           everything; here the first row filed would sit unread and stop the
           other thirty-nine people ever being told their money came back. */
        await notify(session, {
          audience: 'customer',
          kind: 'meal-cancelled',
          key: `customer:meal-cancelled:${args.mealId}:${row.customerKey}`,
          title: 'Meal cancelled',
          body: `${meal.title} was cancelled. ${taka(back.result.refunded)} is back in your wallet.`,
          customerKey: row.customerKey,
          mealId: args.mealId,
          orderId,
        });

        return back;
      });

      if (out.ok) {
        refunded += out.result.refunded;
        orders += 1;
      } else {
        failed.push(orderId);
      }
    } catch {
      // A row that would not refund is an operator's problem, not a reason to
      // abandon the rest of the list.
      failed.push(orderId);
    }
  }

  /* One summary rather than one per plate. Forty rows saying "you cancelled
     a plate" is a flood, not a record — and the number refunded is the thing
     a cook will want to check later. Outside the per-order transactions
     because it describes all of them. */
  await notify(null, {
    audience: 'cook',
    kind: 'meal-cancelled',
    key: `cook:meal-cancelled:${args.mealId}`,
    title: 'Meal cancelled',
    body: orders
      ? `${orders} order${orders === 1 ? '' : 's'} refunded, ৳${refunded} returned to customers.`
      : 'No orders had been placed against it.',
    kitchenId: meal.kitchenId,
    mealId: args.mealId,
  }).catch(() => {
    /* The refunds already happened. A notification that will not file is not
       a reason to report the cancellation as failed. */
  });

  return ok({ refunded, orders, failed });
}

/* ------------------------------------------------------------------ *
 * transitions — customer side
 * ------------------------------------------------------------------ */

/**
 * Interest is not an order.
 *
 * It costs nothing and commits nobody, which is exactly what makes it useful
 * to a cook the night before — it is the difference between "how many might
 * want this" and "how many have paid for it". Nothing about the meal's status
 * gates it, deliberately: interest in a meal that just closed is still the
 * signal a cook wants for tomorrow.
 *
 * The toggle is a delete-then-insert inside one transaction. Two taps racing
 * on the same pair collide on the unique index as a write conflict rather
 * than a duplicate key, so `withTransaction` retries the loser and it reads
 * the winner's row — which is what makes a double tap land on one answer.
 */
export async function toggleInterest(args: {
  mealId: string;
  customerKey: string;
}): Promise<Result<{ interested: boolean; count: number }>> {
  const customerKey = String(args.customerKey ?? '').trim();
  if (!customerKey) return fail(ERR.NAME_REQUIRED);

  const meal = await findMeal(args.mealId);
  if (!meal) return fail(ERR.NO_MEAL);
  const mealId = String(meal._id);

  return tx(async (session) => {
    const dropped = await MealInterest.deleteOne({ mealId, customerKey }, { session });
    const interested = dropped.deletedCount === 0;

    if (interested) {
      await MealInterest.create([{ mealId, customerKey, at: new Date() }], { session });

      await notify(session, {
        audience: 'cook',
        kind: 'interest',
        /* Keyed per meal, not per tap: a cook wants "someone is interested",
           not one line per person on a list they can already see. */
        key: `cook:interest:${mealId}`,
        title: 'Someone is interested',
        body: `Someone is interested in ${meal.title}.`,
        kitchenId: meal.kitchenId,
        mealId,
      });
    }

    const count = await MealInterest.countDocuments({ mealId }).session(session);
    return ok({ interested, count });
  });
}

export type MealCustomer = {
  key: string;
  name?: string;
  phone?: string;
  address?: Record<string, unknown> | null;
};

/**
 * Take the money and create the order, or do neither.
 *
 * Order of checks matters and is the app's, unchanged: meal, status,
 * deadline, capacity, duplicate, balance. Everything that can refuse runs
 * before the ledger is touched, so there is no path that debits a wallet and
 * then discovers the meal sold out.
 *
 * All of it runs inside the transaction that creates the order. The app could
 * validate against live state because it had one writer; here a check made
 * outside is a check against a snapshot somebody else has already changed.
 */
export async function confirmOrder(args: {
  mealId: string;
  customer: MealCustomer;
  now?: number;
}): Promise<Result<{ orderId: string; code: string; amount: number }>> {
  const customerKey = String(args.customer?.key ?? '').trim();
  if (!customerKey) return fail(ERR.NAME_REQUIRED);

  const now = args.now ?? Date.now();
  const code = await freeCode(async (c) => !!(await Order.exists({ code: c })));

  return tx(async (session) => {
    const meal = await findMeal(args.mealId, session);
    if (!meal) return fail(ERR.NO_MEAL);
    if (meal.status !== 'published') return fail(ERR.MEAL_CLOSED);

    if (meal.deadline && new Date(meal.deadline).getTime() <= now) {
      return fail(ERR.PAST_DEADLINE);
    }

    const mealId = String(meal._id);

    const left = await remaining(meal, session);
    if (left != null && left <= 0) return fail(ERR.SOLD_OUT);

    const duplicate = await Order.exists({
      mealId,
      customerKey,
      status: { $ne: 'cancelled' },
    }).session(session);
    if (duplicate) return fail(ERR.ALREADY_ORDERED);

    const amount = Math.round(meal.price);
    if (!Number.isFinite(amount) || amount <= 0) return fail(ERR.BAD_AMOUNT);

    const balance = await balanceFor('customer', customerKey, session);
    if (balance < amount) return fail(ERR.LOW_BALANCE, { short: amount - balance, balance });

    /* Past every refusal. From here the whole thing lands or nothing does.

       Writing the meal itself is what makes that true across writers: two
       customers taking the last plate each read `remaining = 1` from their own
       snapshot and neither can see the other's order, so both would be sold
       it. Touching the meal turns the second one into a write conflict, and
       the retry re-reads a committed order and gets SOLD_OUT instead of a
       plate that does not exist. The filter re-asserts, at the instant of
       writing, that the meal is still open. */
    const claimed = await Meal.updateOne(
      { _id: mealId, status: 'published' },
      { $set: { updatedAt: new Date() } },
      { session },
    );
    if (claimed.matchedCount === 0) return fail(ERR.MEAL_CLOSED);

    const [order] = await Order.create(
      [
        {
          code,
          kind: 'meal',
          mealId,
          kitchenId: meal.kitchenId,
          cookName: meal.cookName,
          title: meal.title,
          image: meal.image,
          handover: meal.handover,
          serveDate: meal.serveDate,
          slot: meal.slot,
          customerKey,
          customerName: args.customer.name ?? '',
          phone: args.customer.phone ?? '',
          address: args.customer.address ?? null,
          price: amount,
          amount,
          status: 'confirmed',
          payment: 'held',
          history: [historyStep('confirmed')],
        },
      ],
      { session },
    );

    const orderId = String(order._id);

    /* `fromRef` is not decoration: `balanceFor('customer', key)` folds on it,
       so a hold posted without it debits nobody and the wallet that just paid
       still reads full. */
    const held = await post(session, {
      kind: 'hold',
      amount,
      from: 'customer',
      to: 'held',
      fromRef: customerKey,
      mealId,
      orderId,
      note: `Held for ${meal.title}`,
      idemKey: `hold:${orderId}`,
    });
    if (!held.posted) return fail(ERR.ALREADY_SETTLED);

    await notify(session, {
      audience: 'cook',
      kind: 'order-confirmed',
      // Per order: a cook needs to count these, so they must not collapse.
      key: `cook:order-confirmed:${orderId}`,
      title: 'New confirmed order',
      body: `${args.customer.name?.trim() || 'A customer'} confirmed ${meal.title}.`,
      kitchenId: meal.kitchenId,
      mealId,
      orderId,
    });

    await notify(session, {
      audience: 'customer',
      kind: 'order-placed',
      key: `customer:order-placed:${orderId}`,
      title: 'Order confirmed',
      body: `${taka(amount)} is held until you confirm the food arrived.`,
      customerKey,
      mealId,
      orderId,
    });

    return ok({ orderId, code, amount });
  });
}

/* ------------------------------------------------------------------ *
 * the order rail — shared by both systems that sell into this wallet
 * ------------------------------------------------------------------ */

/**
 * What the customer is told at each step the cook drives.
 *
 * `{title}` is filled in below. It used to be sent as written — the only
 * notifications in this file built from a table rather than a template
 * literal, and the only ones nobody substituted — so four of the messages a
 * customer actually reads said "{title} is being cooked."
 */
const TOLD: Record<string, [string, string]> = {
  preparing: ['Being prepared', '{title} is being cooked.'],
  ready: ['Ready', '{title} is ready.'],
  delivering: ['On the way', '{title} is out for delivery.'],
  delivered: ['Delivered', 'Confirm you received {title} to complete the order.'],
};

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

  const orderId = String(order._id);

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
 * ## Why this no longer pays the cook
 *
 * It used to do both in one transaction: release the escrow and set
 * `completed`. That made the customer the last authority on money, and there
 * is no step between them pressing a button and a cook being paid — nothing
 * catches an order confirmed by mistake, under pressure, or by someone who
 * has already opened a dispute in the same minute.
 *
 * So the two are now separate decisions with separate owners. The customer
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

  const orderId = String(order._id);

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

  const orderId = String(order._id);
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
 * Nudge anyone sitting on a delivered order.
 *
 * Held money helps nobody: the customer's is gone and the cook's has not
 * arrived. The dedupe key carries the day, so the reminder can come back
 * tomorrow but not twice this afternoon — five app opens file one line.
 *
 * The query is `awaitingReceipt()` from `domain.ts` written as a filter. It
 * excludes cash on delivery, which the app never had to: on the device every
 * order in this list was an escrow order, and here a COD order shares the
 * collection while ending at `delivered` with nothing to release.
 *
 * No transaction, on purpose. Each notification stands alone, so wrapping the
 * sweep would let one bad row lose the other thirty-nine — the same reason
 * `cancelMeal` refunds one order at a time.
 */
export async function remindReceipts(
  args: { today?: string; take?: number } = {},
): Promise<Result<{ filed: number; considered: number }>> {
  const today = args.today ?? todayKey();

  const waiting = await Order.find({
    kind: { $ne: 'cod' },
    status: 'delivered',
    payment: 'held',
  })
    .select({ _id: 1, customerKey: 1, mealId: 1, kitchenId: 1, title: 1 })
    .sort({ deliveredAt: 1 })
    .limit(args.take ?? 500)
    .lean();

  let filed = 0;
  for (const order of waiting) {
    const orderId = String(order._id);
    const wrote = await notify(null, {
      audience: 'customer',
      kind: 'confirm-receipt',
      key: `customer:confirm-receipt:${orderId}:${today}`,
      title: 'Did your food arrive?',
      body: 'Confirm {title} so the cook can be paid.',
      customerKey: order.customerKey,
      mealId: order.mealId,
      orderId,
    });
    if (wrote.filed) filed += 1;

    /* The cook has the larger stake in this one: it is the reason their
       money is still held. Without it, a delivered order that stalls looks to
       them like the platform sitting on their payment rather than a customer
       who has not pressed the button.

       Keyed by the day, like the customer copy, so a reminder that runs
       every morning files once per day rather than once per run. */
    await notify(null, {
      audience: 'cook',
      kind: 'confirm-receipt',
      key: `cook:confirm-receipt:${orderId}:${today}`,
      title: 'Waiting on a customer to confirm',
      body: `${order.title || 'An order'} is delivered. Payment is released once they confirm it arrived.`,
      kitchenId: order.kitchenId,
      mealId: order.mealId,
      orderId,
    });
  }

  return ok({ filed, considered: waiting.length });
}

/**
 * Escrow standing against a cook's orders: earned, but not yet theirs.
 *
 * The app summed the whole document because a device held exactly one cook's
 * orders. Here the collection holds every kitchen's, so the kitchen is an
 * argument — omitting it gives the platform's entire escrow, which is what
 * the operator's board wants and what no cook screen should ever be handed.
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
