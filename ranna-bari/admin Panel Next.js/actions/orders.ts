'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { requireCapability } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ERR, nextStatus } from '@/lib/domain';
import { makeCode, taka } from '@/lib/format';
import { pushHistory } from '@/lib/mappers';
import { refundEscrow, releaseEscrow, splitEscrow } from '@/lib/logic/ledger';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Orders, meals and disputes — everything an operator does to work in flight.
 *
 * A forced status change is stamped with `by: <operator email>` in the order's
 * history, so a timeline can always answer "did the cook do this, or did we".
 */

/* ------------------------------------------------------------------ *
 * orders
 * ------------------------------------------------------------------ */

/** Push an order one step along its own rail, on the cook's behalf. */
export async function forceAdvance(orderId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('order.write');
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return bad(ERR.NO_ORDER);

    const to = nextStatus(order);
    if (!to) return bad(ERR.WRONG_STATE);

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: to,
          history: pushHistory(order.history, {
            status: to,
            at: new Date().toISOString(),
            by: user.email,
          }),
          ...(to === 'delivered' ? { deliveredAt: new Date() } : null),
        },
      });
      await audit(
        user,
        {
          action: 'order.advance',
          targetType: 'Order',
          targetId: orderId,
          summary: `${order.code} — ${order.status} → ${to}`,
          before: { status: order.status },
          after: { status: to },
        },
        tx,
      );
    });

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return good(`Moved to ${to.replace(/_/g, ' ')}.`);
  });
}

/**
 * Cancel an order and put the held money back.
 *
 * The app refuses this once the food is on its way — after that it calls the
 * situation a dispute and declines to settle it. An operator can, because an
 * operator can look at the photographs.
 */
export async function forceCancel(orderId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('order.write');
    if (!reason.trim()) return bad('A cancellation needs a reason.');

    const out = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return { ok: false as const, error: ERR.NO_ORDER };
      if (['completed', 'cancelled', 'rejected'].includes(order.status)) {
        return { ok: false as const, error: ERR.ALREADY_SETTLED };
      }

      // COD never held anything, so there is nothing to give back.
      if (order.payment === 'held') {
        const refund = await refundEscrow(tx, orderId, {
          note: `Cancelled by ${user.email} — ${reason}`,
        });
        if (!refund.ok) return refund;
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelReason: reason.trim(),
          history: pushHistory(order.history, {
            status: 'cancelled',
            at: new Date().toISOString(),
            by: user.email,
          }),
        },
      });

      await audit(
        user,
        {
          action: 'order.cancel',
          targetType: 'Order',
          targetId: orderId,
          summary: `${order.code} — ${reason}`,
          before: { status: order.status, payment: order.payment },
          after: { status: 'cancelled', refunded: order.payment === 'held' ? order.amount : 0 },
        },
        tx,
      );

      return { ok: true as const, refunded: order.payment === 'held' ? order.amount : 0 };
    });

    if (!out.ok) return bad(out.error);

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    revalidatePath('/ledger');
    return good(
      out.refunded > 0 ? `Cancelled and refunded ${taka(out.refunded)}.` : 'Cancelled.',
    );
  });
}

/* ------------------------------------------------------------------ *
 * disputes
 * ------------------------------------------------------------------ */

export async function openDispute(orderId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('dispute.open');
    if (!reason.trim()) return bad('A dispute needs a description.');

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { dispute: true },
    });
    if (!order) return bad(ERR.NO_ORDER);
    if (order.dispute) return bad('This order already has a dispute open.');

    const dispute = await db.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          code: makeCode('DP'),
          orderId,
          status: 'open',
          openedBy: 'admin',
          reason: reason.trim(),
          notes: JSON.stringify([
            { at: new Date().toISOString(), by: user.email, text: reason.trim() },
          ]),
        },
      });
      await audit(
        user,
        {
          action: 'dispute.open',
          targetType: 'Dispute',
          targetId: created.id,
          summary: `${created.code} on ${order.code} — ${reason.trim()}`,
          after: { orderId, reason: reason.trim() },
        },
        tx,
      );
      return created;
    });

    revalidatePath('/disputes');
    revalidatePath(`/orders/${orderId}`);
    return good(`Opened ${dispute.code}.`);
  });
}

export async function addDisputeNote(disputeId: string, text: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('dispute.open');
    if (!text.trim()) return bad('Write something first.');

    const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) return bad(ERR.NO_DISPUTE);

    const notes = JSON.parse(dispute.notes || '[]');
    notes.push({ at: new Date().toISOString(), by: user.email, text: text.trim() });

    await db.dispute.update({
      where: { id: disputeId },
      data: { notes: JSON.stringify(notes), status: dispute.status === 'open' ? 'investigating' : dispute.status },
    });

    revalidatePath('/disputes');
    return good('Noted.');
  });
}

/**
 * Settle a dispute, and move the money the decision implies.
 *
 * Four outcomes, three of which post to the ledger. A split has to account
 * for the whole held amount — a leftover taka would sit in escrow attached to
 * a resolved order, which is precisely the state the escrow board exists to
 * make impossible.
 */
export async function resolveDispute(
  disputeId: string,
  resolution: 'refund' | 'release' | 'split' | 'no-action',
  refundAmount: number,
  note: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('dispute.resolve');
    if (!note.trim()) return bad('A resolution needs a reason on the record.');

    const out = await db.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({
        where: { id: disputeId },
        include: { order: true },
      });
      if (!dispute) return { ok: false as const, error: ERR.NO_DISPUTE };
      if (dispute.status === 'resolved') return { ok: false as const, error: ERR.DISPUTE_CLOSED };

      const order = dispute.order;
      let moved = '';

      if (resolution === 'refund') {
        const result = await refundEscrow(tx, order.id, {
          note: `Dispute ${dispute.code} — ${note.trim()}`,
        });
        if (!result.ok) return result;
        await tx.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
        moved = `${taka(result.result.refunded)} refunded`;
      } else if (resolution === 'release') {
        const result = await releaseEscrow(tx, order.id, {
          note: `Dispute ${dispute.code} — ${note.trim()}`,
        });
        if (!result.ok) return result;
        await tx.order.update({ where: { id: order.id }, data: { status: 'completed' } });
        moved = `${taka(result.result.cook)} released`;
      } else if (resolution === 'split') {
        const refund = Math.round(refundAmount);
        const result = await splitEscrow(
          tx,
          order.id,
          refund,
          order.amount - refund,
          `Dispute ${dispute.code}`,
        );
        if (!result.ok) return result;
        await tx.order.update({ where: { id: order.id }, data: { status: 'completed' } });
        moved = `${taka(result.result.refunded)} refunded, ${taka(result.result.released)} released`;
      } else {
        moved = 'no money moved';
      }

      const notes = JSON.parse(dispute.notes || '[]');
      notes.push({ at: new Date().toISOString(), by: user.email, text: note.trim() });

      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolution,
          resolutionNote: note.trim(),
          refundAmount: resolution === 'split' ? Math.round(refundAmount) : null,
          releaseAmount:
            resolution === 'split' ? order.amount - Math.round(refundAmount) : null,
          notes: JSON.stringify(notes),
          resolvedAt: new Date(),
          resolvedBy: user.email,
        },
      });

      await audit(
        user,
        {
          action: `dispute.${resolution}`,
          targetType: 'Dispute',
          targetId: disputeId,
          summary: `${dispute.code} on ${order.code} — ${moved} — ${note.trim()}`,
          before: { status: dispute.status, payment: order.payment },
          after: { status: 'resolved', resolution, moved },
        },
        tx,
      );

      return { ok: true as const, moved };
    });

    if (!out.ok) return bad(out.error);

    revalidatePath('/disputes');
    revalidatePath('/ledger');
    revalidatePath('/orders');
    return good(`Resolved — ${out.moved}.`);
  });
}

/* ------------------------------------------------------------------ *
 * meals
 * ------------------------------------------------------------------ */

/** Stop a meal taking orders. The orders already placed are untouched. */
export async function closeMeal(mealId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('meal.write');
    const meal = await db.meal.findUnique({ where: { id: mealId } });
    if (!meal) return bad(ERR.NO_MEAL);
    if (meal.status !== 'published') return bad(ERR.MEAL_CLOSED);

    await db.$transaction(async (tx) => {
      await tx.meal.update({ where: { id: mealId }, data: { status: 'closed' } });
      await audit(
        user,
        {
          action: 'meal.close',
          targetType: 'Meal',
          targetId: mealId,
          summary: `${meal.title} — ${meal.serveDate} ${meal.slot}`,
          before: { status: 'published' },
          after: { status: 'closed' },
        },
        tx,
      );
    });

    revalidatePath('/meals');
    return good('Closed to new orders.');
  });
}

/**
 * Cancel a meal and refund every order on it.
 *
 * The refunds run one transaction each: forty customers should not go
 * unrefunded because the forty-first row is broken.
 */
export async function cancelMeal(mealId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('meal.write');
    if (!reason.trim()) return bad('A cancellation needs a reason — the customers are told it.');

    const meal = await db.meal.findUnique({ where: { id: mealId } });
    if (!meal) return bad(ERR.NO_MEAL);
    if (meal.status === 'cancelled') return bad(ERR.ALREADY_SETTLED);

    const held = await db.order.findMany({
      where: { mealId, payment: 'held' },
      select: { id: true, customerKey: true, amount: true },
    });

    let refunded = 0;
    let total = 0;

    for (const order of held) {
      const out = await db.$transaction(async (tx) => {
        const result = await refundEscrow(tx, order.id, {
          note: `Meal cancelled — ${reason.trim()}`,
        });
        if (!result.ok) return result;
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'cancelled', cancelReason: reason.trim() },
        });
        await tx.notification.create({
          data: {
            key: `customer:meal-cancelled:${order.id}`,
            audience: 'customer',
            kind: 'meal-cancelled',
            orderId: order.id,
            mealId,
            customerKey: order.customerKey,
            title: 'Meal cancelled',
            body: `${meal.title} was cancelled. ${taka(order.amount)} is back in your wallet.`,
            broadcastBy: user.email,
          },
        });
        return result;
      });
      if (out.ok) {
        refunded++;
        total += out.result.refunded;
      }
    }

    await db.$transaction(async (tx) => {
      await tx.meal.update({
        where: { id: mealId },
        data: { status: 'cancelled', cancelReason: reason.trim() },
      });
      await audit(
        user,
        {
          action: 'meal.cancel',
          targetType: 'Meal',
          targetId: mealId,
          summary: `${meal.title} — ${refunded} refunds, ${taka(total)} — ${reason.trim()}`,
          before: { status: meal.status },
          after: { status: 'cancelled', refunded, total },
        },
        tx,
      );
    });

    revalidatePath('/meals');
    revalidatePath('/ledger');
    return good(
      held.length
        ? `Cancelled. ${refunded} of ${held.length} orders refunded — ${taka(total)}.`
        : 'Cancelled. Nothing was held against it.',
    );
  });
}
