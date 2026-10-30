'use server';

import { revalidatePath } from 'next/cache';

import { BackendError, post } from '@/lib/backend';
import { requireCapability } from '@/lib/auth';
import { taka } from '@/lib/format';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Orders, meals and disputes — everything an operator does to work in flight.
 *
 * A forced status change is stamped with `by: <operator email>` in the order's
 * history, so a timeline can always answer "did the cook do this, or did we".
 */

/**
 * Run one backend call and turn a refusal into a sentence.
 *
 * `guard` expects a bare error code and looks it up; a `BackendError` already
 * carries the resolved sentence, so letting it reach `guard` would flatten
 * "This dispute is already resolved." into "That did not work."
 */
type Called<T> = { ok: true; value: T } | { ok: false; refusal: ActionResult };

async function call<T>(run: () => Promise<T>): Promise<Called<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof BackendError) return { ok: false, refusal: bad(error.message) };
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * orders
 * ------------------------------------------------------------------ */

/**
 * Push an order one step along its own rail, on the cook's behalf.
 *
 * The backend runs the same `advanceOrder` the cook's own screen calls, minus
 * the kitchen id — an operator doing this is standing in for a kitchen that is
 * not answering, which is the whole reason the button exists. That helper is
 * transactional, refuses if somebody else moved the order first, stamps
 * `deliveredAt` only on the delivery step, and tells the customer.
 *
 * This used to write to the panel's own database with an id from a board
 * reading the other one, so it answered "that order no longer exists" for
 * every order.
 */
export async function forceAdvance(orderId: string): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('order.write');

    const out = await call(() => post<{ status: string }>(`/orders/${orderId}/advance`));
    if (!out.ok) return out.refusal;

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return good(`Moved to ${out.value.status.replace(/_/g, ' ')}.`);
  });
}

/**
 * Cancel an order and put the held money back.
 *
 * The app refuses this once the food is on its way — after that it calls the
 * situation a dispute and declines to settle it. An operator can, because an
 * operator can look at the photographs.
 *
 * The backend settles it as a refund: `refundEscrow` puts the money back and
 * the order lands on `cancelled` with the reason attached. That also means it
 * only covers an order still holding money — a COD order, which never held
 * any, is refused rather than cancelled.
 *
 * A cancellation that refunds is a money movement, so it is finance's:
 * `payout.write`, the same capability the backend gates `/orders/:id/refund`
 * on. It was `order.write` here, which let operations press a button the
 * backend then refused — a control that only looked like one.
 */
export async function forceCancel(orderId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('payout.write');
    if (!reason.trim()) return bad('A cancellation needs a reason.');

    const out = await call(() =>
      post<{ refunded: number }>(`/orders/${orderId}/refund`, { reason: reason.trim() }),
    );
    if (!out.ok) return out.refusal;

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    revalidatePath('/ledger');
    return good(
      out.value.refunded > 0
        ? `Cancelled and refunded ${taka(out.value.refunded)}.`
        : 'Cancelled.',
    );
  });
}

/* ------------------------------------------------------------------ *
 * disputes
 * ------------------------------------------------------------------ */

export async function openDispute(orderId: string, reason: string): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('dispute.open');
    if (!reason.trim()) return bad('A dispute needs a description.');

    /* One case per order is the backend's unique index rather than a read
       here — two operators opening one at the same moment is exactly the race
       a check-then-write would lose. */
    const out = await call(() =>
      post<{ id: string; code: string }>('/disputes', { orderId, reason: reason.trim() }),
    );
    if (!out.ok) return out.refusal;

    revalidatePath('/disputes');
    revalidatePath(`/orders/${orderId}`);
    return good(`Opened ${out.value.code}.`);
  });
}

export async function addDisputeNote(disputeId: string, text: string): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('dispute.open');
    if (!text.trim()) return bad('Write something first.');

    const out = await call(() =>
      post<{ status: string }>(`/disputes/${disputeId}/note`, { text: text.trim() }),
    );
    if (!out.ok) return out.refusal;

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
    await requireCapability('dispute.resolve');
    if (!note.trim()) return bad('A resolution needs a reason on the record.');

    const out = await call(() =>
      post<{ code: string; resolution: string; moved: string }>(
        `/disputes/${disputeId}/resolve`,
        {
          resolution,
          // JSON has no NaN, and the null it would become fails the schema.
          refundAmount: Math.round(refundAmount) || 0,
          note: note.trim(),
        },
      ),
    );
    if (!out.ok) return out.refusal;

    revalidatePath('/disputes');
    revalidatePath('/ledger');
    revalidatePath('/orders');
    return good(`Resolved — ${out.value.moved}.`);
  });
}

/* `closeMeal` and `cancelMeal` stood here, calling `/meals/:id/close` and
   `/meals/:id/cancel` — routes the meal-plan rewrite deleted along with the
   Meal collection. Nothing imported them; two actions aimed at a dead board
   are gone rather than left to answer 404 to the first screen that tries. */
