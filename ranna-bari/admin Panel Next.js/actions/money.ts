'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { BackendError, post } from '@/lib/backend';
import { ERR } from '@/lib/domain';
import { taka } from '@/lib/format';
import { good, bad, guard, type ActionResult } from './shared';

/**
 * Money.
 *
 * Nothing in this file moves money. Every action names a transition on
 * `backend-node`, which posts the ledger entries, writes the audit row in the
 * same transaction and refuses in the vocabulary `lib/domain.ts` shares with
 * the app. What is left here is the operator's half: check the capability
 * before asking, and turn the answer into a sentence somebody can act on.
 *
 * There is deliberately no local fallback. The panel's own database holds
 * different rows under different ids, so a money write aimed at it would
 * succeed against the wrong books — worse in every way than a button that
 * says the backend is not running.
 */

/**
 * Turn a refusal from the backend into the sentence an operator reads.
 *
 * `guard()` translates an error *code* into English; a `BackendError` already
 * carries the translated sentence, so letting one reach guard would land on
 * its generic "That did not work." and lose the reason the money did not move.
 *
 * `missing` exists because the backend answers every row it addressed by id
 * and did not find with one code — and "That product no longer exists." is not
 * what happened to a payout run.
 */
function refused(error: unknown, missing?: string): ActionResult {
  if (!(error instanceof BackendError)) throw error;
  if (error.status === 0) {
    return bad('The backend is not running. Start it with: cd backend-node && npm run dev');
  }
  if (error.status === 404 && missing) return bad(missing);
  return bad(error.message);
}

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
    await requireCapability('payout.write');

    try {
      const out = await post<{ cook: number; platform: number }>(
        `/orders/${orderId}/release`,
        { note: reason },
      );

      revalidatePath('/ledger');
      revalidatePath('/orders');
      revalidatePath(`/orders/${orderId}`);
      return good(`Released ${taka(out.cook)} to the cook.`);
    } catch (error) {
      return refused(error);
    }
  });
}

/** Refund one order's escrow to the customer, in whole or in part. */
export async function forceRefund(
  orderId: string,
  amount: number | null,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('payout.write');
    if (!reason.trim()) return bad('A refund needs a reason on the record.');

    try {
      /* `undefined` and not `null`: the key is dropped from the body, which is
         how the endpoint is told to refund the whole held amount. */
      const out = await post<{ refunded: number }>(`/orders/${orderId}/refund`, {
        amount: amount ?? undefined,
        reason,
      });

      revalidatePath('/ledger');
      revalidatePath('/orders');
      revalidatePath(`/orders/${orderId}`);
      return good(`Refunded ${taka(out.refunded)}.`);
    } catch (error) {
      return refused(error);
    }
  });
}

/**
 * Release everything that has sat past the auto-release window.
 *
 * The policy the app has no way to express. The backend runs one order at a
 * time inside its own transaction — a single bad row must not roll back forty
 * good releases — and counts what it could not move.
 */
export async function sweepEscrow(): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('payout.write');

    try {
      const out = await post<{
        considered: number;
        released: number;
        total: number;
        failures: { orderId: string; error: string }[];
      }>('/escrow/sweep');

      if (!out.considered) return good('Nothing is past the release window.');

      revalidatePath('/ledger');
      revalidatePath('/orders');
      revalidatePath('/');
      return good(
        `Released ${out.released} of ${out.considered} — ${taka(out.total)} moved out of escrow.`,
      );
    } catch (error) {
      return refused(error);
    }
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
    await requireCapability('payout.write');

    try {
      const out = await post<{ id: string; code: string; total: number; cookCount: number }>(
        '/payouts',
        { method, note },
      );

      revalidatePath('/payouts');
      return good(`Drafted ${out.code}: ${out.cookCount} cooks, ${taka(out.total)}.`);
    } catch (error) {
      return refused(error);
    }
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
    await requireCapability('payout.write');

    try {
      const out = await post<{ code: string; total: number; cooks: number; paid: number }>(
        `/payouts/${runId}/pay`,
      );

      revalidatePath('/payouts');
      revalidatePath('/ledger');
      return good(`${out.code} paid — ${taka(out.total)} left the platform.`);
    } catch (error) {
      return refused(error, 'That payout run no longer exists.');
    }
  });
}

export async function cancelPayoutRun(runId: string): Promise<ActionResult> {
  return guard(async () => {
    await requireCapability('payout.write');

    try {
      await post<{ code: string; moved: number }>(`/payouts/${runId}/cancel`);

      revalidatePath('/payouts');
      return good('Draft cancelled. No money moved.');
    } catch (error) {
      return refused(error, 'That payout run no longer exists.');
    }
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
    await requireCapability('topup.reconcile');
    if (!pspRef.trim()) return bad('A reference is required.');

    try {
      /* The verdict is the endpoint's, not this file's. It compares the two
         figures exactly rather than against a tolerance, so a statement line
         that disagrees by any amount comes back `disputed` — which is the
         discrepancy this desk exists to surface. */
      const out = await post<{
        reconciled: string;
        amount: number;
        pspRef: string;
        pspAmount: number;
        note: string;
      }>(`/topups/${topUpId}/reconcile`, { pspRef: pspRef.trim(), pspAmount });

      revalidatePath('/topups');
      return out.reconciled === 'matched'
        ? good('Matched.')
        : bad(
            `Flagged: the wallet says ${taka(out.amount)}, the reference says ${taka(out.pspAmount)}.`,
          );
    } catch (error) {
      return refused(error, 'That top-up no longer exists.');
    }
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
    await requireCapability('payout.write');
    const value = Math.round(amount);
    if (!Number.isFinite(value) || value <= 0) return bad(ERR.BAD_AMOUNT);
    if (!reason.trim()) return bad('An adjustment needs a reason on the record.');

    try {
      await post<{ customerKey: string; direction: string; amount: number }>(
        '/ledger/adjustment',
        { customerKey, amount: value, direction, reason: reason.trim() },
      );

      revalidatePath('/ledger');
      revalidatePath('/topups');
      return good(`Posted a ${direction} of ${taka(value)}.`);
    } catch (error) {
      return refused(error);
    }
  });
}
