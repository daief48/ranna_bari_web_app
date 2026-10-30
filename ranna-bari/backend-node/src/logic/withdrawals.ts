import { isDuplicateKey, tx } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { makeCode, taka } from '../lib/format.js';
import { AuditLog, Kitchen, Withdrawal } from '../models/index.js';
import { balanceFor, lockCook, post, reservedFor } from './ledger.js';
import { getSettings } from './settings.js';
import { notify } from './wallet.js';

/**
 * Cook withdrawals.
 *
 * A cook asks for money; an operator pays it. Between those two moments the
 * money does NOT move — it sits in the `cook` bucket, *reserved*:
 *
 *     available = cook balance − open (`requested`) withdrawals
 *
 * The admin batch payout subtracts the same reservation (`cookBalances` with
 * `excludeReserved`), so a draft run cannot also pay the taka a cook has
 * already asked for. The ledger entry is posted exactly once, by "Mark paid",
 * and every balance check on the way is repeated inside that transaction.
 *
 * One open request per kitchen. That is enforced by a partial unique index, not
 * by a read two concurrent taps would both pass, and it is also what keeps the
 * reservation a single row: the cook cannot stack requests to hide money from
 * the batch run.
 *
 * KYC: payouts today do not look at KYC (a kitchen that was never approved
 * cannot trade, so it cannot have earned anything to withdraw), and a
 * suspended kitchen loses its cook identity at the token. Withdrawals follow
 * the same rule — the caller must be a cook — rather than inventing a stricter
 * one that would strand money a payout run would have paid.
 */

export type WithdrawalView = {
  id: string;
  code: string;
  amount: number;
  method: string;
  account: string;
  status: string;
  requestedAt: Date;
  decidedAt: Date | null;
  note: string;
};

const shape = (row: {
  _id: unknown;
  code: string;
  amount: number;
  method?: string | null;
  account?: string | null;
  status: string;
  requestedAt?: Date | null;
  decidedAt?: Date | null;
  note?: string | null;
}): WithdrawalView => ({
  id: String(row._id),
  code: row.code,
  amount: row.amount,
  method: row.method ?? '',
  account: row.account ?? '',
  status: row.status,
  requestedAt: row.requestedAt ?? new Date(0),
  decidedAt: row.decidedAt ?? null,
  note: row.note ?? '',
});

/** The cook's withdrawal screen in one answer: figures, destination, history. */
export async function withdrawalsFor(kitchenId: string) {
  const [kitchen, settings, balance, reserved, rows] = await Promise.all([
    Kitchen.findById(kitchenId).select({ payoutMethod: 1, payoutAccount: 1 }).lean(),
    getSettings(),
    balanceFor('cook', kitchenId),
    reservedFor(kitchenId),
    Withdrawal.find({ kitchenId }).sort({ requestedAt: -1 }).limit(30).lean(),
  ]);

  return {
    balance,
    reserved,
    available: Math.max(0, balance - reserved),
    minimum: settings.payoutMinimum,
    method: kitchen?.payoutMethod ?? '',
    account: kitchen?.payoutAccount ?? '',
    withdrawals: rows.map(shape),
  };
}

/** File a request. Reserves, never moves. */
export async function requestWithdrawal(
  kitchenId: string,
  amountIn: number,
): Promise<Result<{ withdrawal: WithdrawalView; available: number }>> {
  const amount = Math.round(Number(amountIn));
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail(ERR.BAD_AMOUNT);

  try {
    return await tx(async (session) => {
      /* The same lock the payout paths take, so a request cannot read its
         cover from a snapshot that a concurrent "Mark paid" is spending. */
      await lockCook(session, kitchenId);

      const kitchen = await Kitchen.findById(kitchenId)
        .select({ payoutMethod: 1, payoutAccount: 1 })
        .session(session)
        .lean();
      if (!kitchen) return fail(ERR.NO_KITCHEN);

      /* Copied now: a later profile edit must not redirect an approved
         payout. The method is one the profile editor can actually write. */
      const method = kitchen.payoutMethod ?? '';
      const account = (kitchen.payoutAccount ?? '').trim();
      if ((method !== 'bkash' && method !== 'bank') || !account) {
        return fail(ERR.NO_PAYOUT_DESTINATION);
      }

      const open = await Withdrawal.findOne({ kitchenId, status: 'requested' })
        .select({ _id: 1 })
        .session(session)
        .lean();
      if (open) return fail(ERR.WITHDRAWAL_OPEN);

      const settings = await getSettings();
      if (amount < settings.payoutMinimum) {
        return fail(ERR.WITHDRAWAL_TOO_LOW, { minimum: settings.payoutMinimum });
      }

      const [balance, reserved] = await Promise.all([
        balanceFor('cook', kitchenId, session),
        reservedFor(kitchenId, session),
      ]);
      const available = balance - reserved;
      if (amount > available) {
        return fail(ERR.WITHDRAWAL_OVER_BALANCE, { available: Math.max(0, available) });
      }

      const [row] = await Withdrawal.create(
        [{ code: makeCode('WD'), kitchenId, amount, method, account }],
        { session },
      );

      return ok({ withdrawal: shape(row), available: available - amount });
    });
  } catch (error) {
    /* Two taps that both passed the read: the partial unique index is the
       backstop, and the loser is told what the winner already told the cook. */
    if (isDuplicateKey(error)) return fail(ERR.WITHDRAWAL_OPEN);
    throw error;
  }
}

/** The cook changes their mind, while nobody has acted on it. */
export async function cancelWithdrawal(
  kitchenId: string,
  id: string,
): Promise<Result<{ withdrawal: WithdrawalView }>> {
  if (!/^[a-f\d]{24}$/i.test(id)) return fail(ERR.NO_WITHDRAWAL);

  return tx(async (session) => {
    /* Guarded on the status in the filter itself, so a "Mark paid" that wins
       the race leaves this matching nothing. Scoped to the kitchen so another
       cook's id is a miss, not a cancel. */
    const row = await Withdrawal.findOneAndUpdate(
      { _id: id, kitchenId, status: 'requested' },
      { status: 'cancelled', decidedAt: new Date(), decidedBy: 'cook' },
      { new: true, session },
    ).lean();
    if (row) return ok({ withdrawal: shape(row) });

    const exists = await Withdrawal.exists({ _id: id, kitchenId }).session(session);
    return fail(exists ? ERR.WITHDRAWAL_CLOSED : ERR.NO_WITHDRAWAL);
  });
}

export type Actor = { sub: string; email: string; role: string };

async function audit(
  actor: Actor,
  entry: { action: string; targetId: string; summary: string; before?: unknown; after?: unknown },
  session: Parameters<typeof tx>[0] extends (s: infer S) => unknown ? S : never,
) {
  await AuditLog.create(
    [
      {
        actorId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: entry.action,
        targetType: 'Withdrawal',
        targetId: entry.targetId,
        summary: entry.summary,
        before: entry.before ?? null,
        after: entry.after ?? null,
      },
    ],
    { session },
  );
}

/**
 * Operator: the money has been sent. Posts the one `payout` entry.
 *
 * Idempotent three ways: the row's status (a second click finds it `paid` and
 * answers `duplicate`), the guarded update, and the ledger's own key
 * `withdrawal:<id>`. The cover is re-checked INSIDE the transaction behind the
 * cook lock — a refund posted against a released order since the request can
 * leave the cook short, and a payout that overdraws is money invented.
 */
export async function payWithdrawal(
  id: string,
  actor: Actor,
): Promise<Result<{ code: string; amount: number; duplicate: boolean; kitchenId: string }>> {
  if (!/^[a-f\d]{24}$/i.test(id)) return fail(ERR.NO_WITHDRAWAL);

  return tx(async (session) => {
    const row = await Withdrawal.findById(id).session(session).lean();
    if (!row) return fail(ERR.NO_WITHDRAWAL);
    if (row.status === 'paid') {
      return ok({ code: row.code, amount: row.amount, duplicate: true, kitchenId: row.kitchenId });
    }
    if (row.status !== 'requested') return fail(ERR.WITHDRAWAL_CLOSED);

    await lockCook(session, row.kitchenId);

    const balance = await balanceFor('cook', row.kitchenId, session);
    if (balance < row.amount) {
      return fail(ERR.WITHDRAWAL_OVER_BALANCE, { available: Math.max(0, balance) });
    }

    const entry = await post(session, {
      kind: 'payout',
      amount: row.amount,
      from: 'cook',
      to: 'external',
      fromRef: row.kitchenId,
      note: `Withdrawal ${row.code} via ${row.method}`,
      idemKey: `withdrawal:${id}`,
    });

    /* A replay of a payout whose row somehow still says `requested`: the
       money already left, so settle the row and post nothing twice. */
    const moved = await Withdrawal.updateOne(
      { _id: id, status: 'requested' },
      {
        status: 'paid',
        decidedAt: new Date(),
        decidedBy: actor.email,
        ...(entry.id ? { ledgerEntryId: entry.id } : {}),
      },
      { session },
    );
    if (!moved.modifiedCount) {
      return ok({ code: row.code, amount: row.amount, duplicate: true, kitchenId: row.kitchenId });
    }

    await notify(session, {
      audience: 'cook',
      kind: 'payout',
      key: `cook:withdrawal:${id}`,
      kitchenId: row.kitchenId,
      title: 'You have been paid',
      body: `${taka(row.amount)} sent via ${row.method}.`,
      broadcastBy: actor.email,
    });

    await audit(
      actor,
      {
        action: 'withdrawal.paid',
        targetId: id,
        summary: `${row.code} — ${taka(row.amount)} paid via ${row.method}`,
        before: { status: 'requested' },
        after: { status: 'paid', amount: row.amount, ledgerEntryId: entry.id },
      },
      session,
    );

    return ok({ code: row.code, amount: row.amount, duplicate: false, kitchenId: row.kitchenId });
  });
}

/** Operator: refuse, with a reason the cook can read. Nothing moved, so nothing to undo. */
export async function rejectWithdrawal(
  id: string,
  note: string,
  actor: Actor,
): Promise<Result<{ code: string; amount: number }>> {
  if (!/^[a-f\d]{24}$/i.test(id)) return fail(ERR.NO_WITHDRAWAL);
  const reason = String(note ?? '').trim().slice(0, 300);
  if (!reason) return fail(ERR.NAME_REQUIRED);

  return tx(async (session) => {
    const row = await Withdrawal.findOneAndUpdate(
      { _id: id, status: 'requested' },
      { status: 'rejected', decidedAt: new Date(), decidedBy: actor.email, note: reason },
      { new: false, session },
    ).lean();
    if (!row) {
      const exists = await Withdrawal.exists({ _id: id }).session(session);
      return fail(exists ? ERR.WITHDRAWAL_CLOSED : ERR.NO_WITHDRAWAL);
    }

    await notify(session, {
      audience: 'cook',
      kind: 'payout',
      key: `cook:withdrawal-declined:${id}`,
      kitchenId: row.kitchenId,
      title: 'Withdrawal declined',
      body: `${taka(row.amount)} was not sent: ${reason}`,
      broadcastBy: actor.email,
    });

    await audit(
      actor,
      {
        action: 'withdrawal.rejected',
        targetId: id,
        summary: `${row.code} — ${taka(row.amount)} declined: ${reason}`,
        before: { status: 'requested' },
        after: { status: 'rejected', note: reason },
      },
      session,
    );

    return ok({ code: row.code, amount: row.amount });
  });
}
