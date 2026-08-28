'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { requireCapability } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ERR } from '@/lib/domain';
import { taka, makeCode } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import {
  cookBalances,
  post,
  refundEscrow,
  releaseEscrow,
} from '@/lib/logic/ledger';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Money.
 *
 * Every action here posts ledger entries rather than editing anything, is
 * idempotent, and is audited with a before and after. The database refuses an
 * UPDATE or DELETE on a ledger row, so a bug in this file fails loudly rather
 * than quietly rewriting history.
 */

/* ------------------------------------------------------------------ *
 * escrow
 * ------------------------------------------------------------------ */

/**
 * Release one order's escrow to the cook.
 *
 * In the app only the customer can do this, by confirming the food arrived.
 * When they never do, the money sits in `held` forever: the customer has
 * paid, the cook has cooked, and neither has what they are owed. This is the
 * operator's hand on that.
 */
export async function forceRelease(orderId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');

    const out = await db.$transaction(async (tx) => {
      const before = await tx.order.findUnique({ where: { id: orderId } });
      const result = await releaseEscrow(tx, orderId, {
        note: `Released by ${user.email}${reason ? ` — ${reason}` : ''}`,
      });
      if (!result.ok) return result;

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'completed' },
      });

      await tx.notification.create({
        data: {
          key: `cook:payment-released:${orderId}`,
          audience: 'cook',
          kind: 'payment-released',
          orderId,
          kitchenId: before?.kitchenId,
          title: 'Payment released',
          body: `${taka(result.result.cook)} has been added to your earnings.`,
          broadcastBy: user.email,
        },
      });

      await audit(
        user,
        {
          action: 'escrow.release',
          targetType: 'Order',
          targetId: orderId,
          summary: `${before?.code} — ${taka(result.result.cook)} to cook, ${taka(result.result.platform)} commission${reason ? ` — ${reason}` : ''}`,
          before: { payment: before?.payment, status: before?.status },
          after: { payment: 'released', status: 'completed', ...result.result },
        },
        tx,
      );

      return result;
    });

    if (!out.ok) return bad(out.error);

    revalidatePath('/ledger');
    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return good(`Released ${taka(out.result.cook)} to the cook.`);
  });
}

/** Refund one order's escrow to the customer, in whole or in part. */
export async function forceRefund(
  orderId: string,
  amount: number | null,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');
    if (!reason.trim()) return bad('A refund needs a reason on the record.');

    const out = await db.$transaction(async (tx) => {
      const before = await tx.order.findUnique({ where: { id: orderId } });
      const result = await refundEscrow(tx, orderId, {
        amount: amount ?? undefined,
        note: `Refunded by ${user.email} — ${reason}`,
      });
      if (!result.ok) return result;

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled', cancelReason: reason },
      });

      await tx.notification.create({
        data: {
          key: `customer:refund:${orderId}`,
          audience: 'customer',
          kind: 'refund',
          orderId,
          customerKey: before?.customerKey,
          title: 'Refunded',
          body: `${taka(result.result.refunded)} is back in your wallet.`,
          broadcastBy: user.email,
        },
      });

      await audit(
        user,
        {
          action: 'escrow.refund',
          targetType: 'Order',
          targetId: orderId,
          summary: `${before?.code} — ${taka(result.result.refunded)} refunded — ${reason}`,
          before: { payment: before?.payment, status: before?.status },
          after: { payment: 'refunded', status: 'cancelled', ...result.result },
        },
        tx,
      );

      return result;
    });

    if (!out.ok) return bad(out.error);

    revalidatePath('/ledger');
    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return good(`Refunded ${taka(out.result.refunded)}.`);
  });
}

/**
 * Release everything that has sat past the auto-release window.
 *
 * The policy the app has no way to express. Runs one order at a time inside
 * its own transaction rather than one big one — a single bad row should not
 * roll back forty good releases.
 */
export async function sweepEscrow(): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');
    const settings = await getSettings();
    const cutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);

    const due = await db.order.findMany({
      where: { payment: 'held', status: 'delivered', deliveredAt: { lt: cutoff } },
      select: { id: true, code: true },
    });

    if (!due.length) return good('Nothing is past the release window.');

    let released = 0;
    let total = 0;

    for (const order of due) {
      const out = await db.$transaction(async (tx) => {
        const result = await releaseEscrow(tx, order.id, {
          note: `Auto-released after ${settings.escrowAutoReleaseDays} days`,
        });
        if (!result.ok) return result;
        await tx.order.update({ where: { id: order.id }, data: { status: 'completed' } });
        await audit(
          user,
          {
            action: 'escrow.auto-release',
            targetType: 'Order',
            targetId: order.id,
            summary: `${order.code} — ${taka(result.result.cook)} to cook after ${settings.escrowAutoReleaseDays} days`,
            after: result.result,
          },
          tx,
        );
        return result;
      });

      if (out.ok) {
        released++;
        total += out.result.cook + out.result.platform;
      }
    }

    revalidatePath('/ledger');
    revalidatePath('/orders');
    revalidatePath('/');
    return good(`Released ${released} of ${due.length} — ${taka(total)} moved out of escrow.`);
  });
}

/* ------------------------------------------------------------------ *
 * payouts
 * ------------------------------------------------------------------ */

/**
 * Draft a payout run from what cooks are currently owed.
 *
 * The app has `pendingEarnings()` and no way to pay anybody. A run is a draft
 * first so the numbers can be read before money is said to have moved; only
 * `payPayoutRun` posts to the ledger.
 */
export async function createPayoutRun(method: string, note: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');
    const settings = await getSettings();

    const owed = (await cookBalances()).filter((row) => row.amount >= settings.payoutMinimum);
    if (!owed.length) {
      return bad(`No cook is owed at least ${taka(settings.payoutMinimum)}.`);
    }

    const kitchens = await db.kitchen.findMany({
      where: { id: { in: owed.map((o) => o.kitchenId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(kitchens.map((k) => [k.id, k.name]));

    const total = owed.reduce((sum, row) => sum + row.amount, 0);

    const run = await db.$transaction(async (tx) => {
      const created = await tx.payoutRun.create({
        data: {
          code: makeCode('PR'),
          status: 'draft',
          method,
          note,
          total,
          cookCount: owed.length,
          createdBy: user.email,
          items: {
            create: owed.map((row) => ({
              kitchenId: row.kitchenId,
              kitchenName: nameOf.get(row.kitchenId) ?? row.kitchenId,
              amount: row.amount,
            })),
          },
        },
      });

      await audit(
        user,
        {
          action: 'payout.draft',
          targetType: 'PayoutRun',
          targetId: created.id,
          summary: `${created.code} — ${owed.length} cooks, ${taka(total)}`,
          after: { total, cookCount: owed.length, method },
        },
        tx,
      );

      return created;
    });

    revalidatePath('/payouts');
    return good(`Drafted ${run.code}: ${owed.length} cooks, ${taka(total)}.`);
  });
}

/**
 * Mark a run paid, and post the ledger entries that say so.
 *
 * `cook` → `external`: the money has left the platform. Each entry carries an
 * idempotency key built from the run and the kitchen, so a double-clicked
 * "Mark paid" pays once.
 */
export async function payPayoutRun(runId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');

    const out = await db.$transaction(async (tx) => {
      const run = await tx.payoutRun.findUnique({
        where: { id: runId },
        include: { items: true },
      });
      if (!run) return { ok: false as const, error: 'That payout run no longer exists.' };
      if (run.status !== 'draft') return { ok: false as const, error: ERR.RUN_CLOSED };

      for (const item of run.items) {
        await post(tx, {
          kind: 'payout',
          amount: item.amount,
          from: 'cook',
          to: 'external',
          fromRef: item.kitchenId,
          payoutRunId: run.id,
          note: `Payout ${run.code} via ${run.method}`,
          idemKey: `payout:${run.id}:${item.kitchenId}`,
        });

        await tx.notification.create({
          data: {
            key: `cook:payout:${run.id}:${item.kitchenId}`,
            audience: 'cook',
            kind: 'payout',
            kitchenId: item.kitchenId,
            title: 'You have been paid',
            body: `${taka(item.amount)} sent via ${run.method}.`,
            broadcastBy: user.email,
          },
        });
      }

      await tx.payoutRun.update({
        where: { id: runId },
        data: { status: 'paid', paidAt: new Date(), paidBy: user.email },
      });

      await audit(
        user,
        {
          action: 'payout.paid',
          targetType: 'PayoutRun',
          targetId: runId,
          summary: `${run.code} — ${taka(run.total)} to ${run.cookCount} cooks`,
          before: { status: 'draft' },
          after: { status: 'paid', total: run.total },
        },
        tx,
      );

      return { ok: true as const, total: run.total, code: run.code };
    });

    if (!out.ok) return bad(out.error);

    revalidatePath('/payouts');
    revalidatePath('/ledger');
    return good(`${out.code} paid — ${taka(out.total)} left the platform.`);
  });
}

export async function cancelPayoutRun(runId: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');
    const run = await db.payoutRun.findUnique({ where: { id: runId } });
    if (!run) return bad('That payout run no longer exists.');
    if (run.status !== 'draft') return bad(ERR.RUN_CLOSED);

    await db.$transaction(async (tx) => {
      await tx.payoutRun.update({ where: { id: runId }, data: { status: 'cancelled' } });
      await audit(
        user,
        {
          action: 'payout.cancel',
          targetType: 'PayoutRun',
          targetId: runId,
          summary: `${run.code} cancelled before payment`,
          before: { status: 'draft' },
          after: { status: 'cancelled' },
        },
        tx,
      );
    });

    revalidatePath('/payouts');
    return good('Draft cancelled. No money moved.');
  });
}

/* ------------------------------------------------------------------ *
 * top-up reconciliation
 * ------------------------------------------------------------------ */

/**
 * Attach a payment-service reference to a wallet credit.
 *
 * In the app every top-up is an orphan: `topUp(amount, 'bKash')` credits the
 * wallet with nothing behind it. Until a real PSP is wired in, this is where
 * a human says "yes, that money actually arrived".
 */
export async function reconcileTopUp(
  topUpId: string,
  pspRef: string,
  pspAmount: number,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('topup.reconcile');
    const row = await db.topUp.findUnique({ where: { id: topUpId } });
    if (!row) return bad('That top-up no longer exists.');
    if (!pspRef.trim()) return bad('A reference is required.');

    const matches = Math.round(pspAmount) === row.amount;

    await db.$transaction(async (tx) => {
      await tx.topUp.update({
        where: { id: topUpId },
        data: {
          pspRef: pspRef.trim(),
          pspAmount: Math.round(pspAmount),
          // A reference that does not agree on the amount is not a match —
          // it is a discrepancy, and calling it matched would hide it.
          reconciled: matches ? 'matched' : 'disputed',
        },
      });
      await audit(
        user,
        {
          action: matches ? 'topup.match' : 'topup.dispute',
          targetType: 'TopUp',
          targetId: topUpId,
          summary: `${row.customerKey} — wallet ${taka(row.amount)} vs PSP ${taka(pspAmount)} (${pspRef})`,
          before: { reconciled: row.reconciled, pspRef: row.pspRef },
          after: { reconciled: matches ? 'matched' : 'disputed', pspRef, pspAmount },
        },
        tx,
      );
    });

    revalidatePath('/topups');
    return matches
      ? good('Matched.')
      : bad(`Flagged: the wallet says ${taka(row.amount)}, the reference says ${taka(pspAmount)}.`);
  });
}

/**
 * Correct a wallet balance with a compensating entry.
 *
 * Never an edit. If a customer was credited ৳500 that never arrived, the fix
 * is a ৳500 entry in the other direction, and both rows stay in the history.
 */
export async function postAdjustment(
  customerKey: string,
  amount: number,
  direction: 'credit' | 'debit',
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireCapability('payout.write');
    const value = Math.round(amount);
    if (!Number.isFinite(value) || value <= 0) return bad(ERR.BAD_AMOUNT);
    if (!reason.trim()) return bad('An adjustment needs a reason on the record.');

    await db.$transaction(async (tx) => {
      await post(tx, {
        kind: 'adjustment',
        amount: value,
        from: direction === 'credit' ? 'external' : 'customer',
        to: direction === 'credit' ? 'customer' : 'external',
        fromRef: direction === 'debit' ? customerKey : null,
        toRef: direction === 'credit' ? customerKey : null,
        note: `Adjustment by ${user.email} — ${reason.trim()}`,
      });
      await audit(
        user,
        {
          action: 'ledger.adjustment',
          targetType: 'Account',
          targetId: customerKey,
          summary: `${direction} ${taka(value)} — ${reason.trim()}`,
          after: { direction, amount: value, reason: reason.trim() },
        },
        tx,
      );
    });

    revalidatePath('/ledger');
    revalidatePath('/topups');
    return good(`Posted a ${direction} of ${taka(value)}.`);
  });
}
