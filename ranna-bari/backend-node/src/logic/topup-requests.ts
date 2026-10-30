import { isDuplicateKey, tx } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { taka } from '../lib/format.js';
import { AuditLog, TopUp } from '../models/index.js';
import { balanceFor, post } from './ledger.js';
import { TOPUP_MAX, TOPUP_MIN, getTopupConfig, topupConfigured } from './settings.js';
import { notify } from './wallet.js';

/**
 * Manual wallet top-ups.
 *
 * The customer pays the platform's bKash or Nagad number from their own phone,
 * then files amount + the provider's transaction id + the number they sent
 * from. That is a *request*: it moves no money. An operator checks the payment
 * actually arrived and approves, and only the approval posts the ledger
 * `topup` — idempotent on `topup:<id>`, inside one transaction with the status
 * flip, the customer's notice and the audit row.
 *
 * Why not a "credit now, check later" flow: the instant `/wallet/topup` is shut
 * in production precisely because crediting from a request body creates money.
 * A transaction id the customer typed is still a request body.
 */

export const TOPUP_METHODS = ['bkash', 'nagad'] as const;
export type TopupMethod = (typeof TOPUP_METHODS)[number];

/** A customer with this many requests waiting cannot file another. */
const MAX_PENDING = 3;

/** A row written before `status` existed was credited on the spot. */
export const statusOf = (row: { status?: string | null }) => row.status ?? 'approved';

export type TopupRequestView = {
  id: string;
  amount: number;
  method: string;
  txnId: string | null;
  senderNumber: string | null;
  status: string;
  note: string;
  at: Date;
  decidedAt: Date | null;
};

const shape = (row: {
  _id: unknown;
  amount: number;
  method?: string | null;
  txnId?: string | null;
  senderNumber?: string | null;
  status?: string | null;
  note?: string | null;
  at?: Date | null;
  decidedAt?: Date | null;
}): TopupRequestView => ({
  id: String(row._id),
  amount: row.amount,
  method: row.method ?? '',
  txnId: row.txnId ?? null,
  senderNumber: row.senderNumber ?? null,
  status: statusOf(row),
  note: row.note ?? '',
  at: row.at ?? new Date(0),
  decidedAt: row.decidedAt ?? null,
});

/** What the app shows on the "add money" screen. */
export async function topupInfo() {
  const config = await getTopupConfig();
  return {
    configured: topupConfigured(config),
    bkash: config.bkash,
    nagad: config.nagad,
    note: config.note,
    min: TOPUP_MIN,
    max: TOPUP_MAX,
  };
}

/** The customer's own requests, newest first. Only manual ones carry a txnId. */
export async function myTopupRequests(customerKey: string): Promise<TopupRequestView[]> {
  const rows = await TopUp.find({ customerKey, txnId: { $type: 'string' } })
    .sort({ at: -1 })
    .limit(30)
    .lean();
  return rows.map(shape);
}

export async function requestTopup(
  customerKey: string,
  input: { amount: number; method: string; txnId: string; senderNumber: string },
): Promise<Result<{ request: TopupRequestView }>> {
  const config = await getTopupConfig();
  if (!topupConfigured(config)) return fail(ERR.TOPUP_NOT_CONFIGURED);

  const amount = Math.round(Number(input.amount));
  if (!Number.isSafeInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
    return fail(ERR.BAD_AMOUNT, { min: TOPUP_MIN, max: TOPUP_MAX });
  }

  const method = input.method as TopupMethod;
  if (!TOPUP_METHODS.includes(method)) return fail(ERR.BAD_REQUEST, { field: 'method' });
  /* Only a rail the operator has set up. Otherwise the customer would be
     paying a number the screen never showed them. */
  if (!config[method]) return fail(ERR.TOPUP_NOT_CONFIGURED);

  /* Upper-cased because bKash/Nagad ids are, and "8n7x1" vs "8N7X1" must be
     one id for the duplicate guard to mean anything. */
  const txnId = input.txnId.trim().toUpperCase();
  const senderNumber = input.senderNumber.trim();

  try {
    return await tx(async (session) => {
      const waiting = await TopUp.countDocuments({ customerKey, status: 'pending' }).session(session);
      if (waiting >= MAX_PENDING) return fail(ERR.DUPLICATE, { pending: waiting });

      const [row] = await TopUp.create(
        [
          {
            customerKey,
            amount,
            method,
            status: 'pending',
            txnId,
            senderNumber,
            reconciled: 'orphan',
            pspRef: null,
            note: '',
          },
        ],
        { session },
      );
      return ok({ request: shape(row) });
    });
  } catch (error) {
    if (isDuplicateKey(error)) return fail(ERR.TOPUP_TXN_USED);
    throw error;
  }
}

type Actor = { sub: string; email: string; role: string };

const auditOf = (actor: Actor, id: string, action: string, summary: string, after: unknown) =>
  ({
    actorId: actor.sub,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    targetType: 'TopUp',
    targetId: id,
    summary,
    before: { status: 'pending' },
    after,
  }) as const;

/**
 * Operator: the payment arrived. Posts the one ledger `topup`.
 *
 * Idempotent: the status guard (a second click finds it `approved`), the
 * guarded update, and the ledger key `topup:<id>` — any one of the three alone
 * would stop a double credit.
 */
export async function approveTopup(
  id: string,
  actor: Actor,
): Promise<Result<{ amount: number; customerKey: string; balance: number; duplicate: boolean }>> {
  if (!/^[a-f\d]{24}$/i.test(id)) return fail(ERR.NO_TOPUP);

  return tx(async (session) => {
    const row = await TopUp.findById(id).session(session).lean();
    if (!row) return fail(ERR.NO_TOPUP);

    const status = statusOf(row);
    if (status === 'approved') {
      const balance = await balanceFor('customer', row.customerKey, session);
      return ok({ amount: row.amount, customerKey: row.customerKey, balance, duplicate: true });
    }
    if (status !== 'pending') return fail(ERR.TOPUP_CLOSED);

    const entry = await post(session, {
      kind: 'topup',
      amount: row.amount,
      from: 'external',
      to: 'customer',
      /* Without the ref the money lands in the global customer bucket and in
         nobody's wallet — `balanceFor` matches on the ref. */
      toRef: row.customerKey,
      note: `Top up via ${row.method} ${row.txnId ?? ''}`.trim(),
      idemKey: `topup:${id}`,
    });

    const moved = await TopUp.updateOne(
      { _id: id, status: 'pending' },
      {
        status: 'approved',
        decidedAt: new Date(),
        decidedBy: actor.email,
        /* The provider's own id is the reference an operator will match to a
           statement line later; `reconciled` stays 'orphan' until they do. */
        pspRef: row.txnId ?? null,
        ...(entry.id ? { ledgerEntryId: entry.id } : {}),
      },
      { session },
    );
    if (!moved.modifiedCount) {
      const balance = await balanceFor('customer', row.customerKey, session);
      return ok({ amount: row.amount, customerKey: row.customerKey, balance, duplicate: true });
    }

    await notify(session, {
      audience: 'customer',
      customerKey: row.customerKey,
      kind: 'topup',
      key: `customer:topup:${id}`,
      title: 'Wallet topped up',
      body: `${taka(row.amount)} added to your wallet.`,
    });

    await AuditLog.create(
      [
        auditOf(actor, id, 'topup.approved', `${taka(row.amount)} via ${row.method} ${row.txnId ?? ''}`, {
          status: 'approved',
          amount: row.amount,
          ledgerEntryId: entry.id,
        }),
      ],
      { session },
    );

    const balance = await balanceFor('customer', row.customerKey, session);
    return ok({ amount: row.amount, customerKey: row.customerKey, balance, duplicate: false });
  });
}

/** Operator: no payment found. Nothing moved, so nothing to reverse. */
export async function rejectTopup(
  id: string,
  note: string,
  actor: Actor,
): Promise<Result<{ amount: number }>> {
  if (!/^[a-f\d]{24}$/i.test(id)) return fail(ERR.NO_TOPUP);
  const reason = String(note ?? '').trim().slice(0, 300);
  if (!reason) return fail(ERR.NAME_REQUIRED);

  return tx(async (session) => {
    const row = await TopUp.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { status: 'rejected', decidedAt: new Date(), decidedBy: actor.email, note: reason },
      { new: false, session },
    ).lean();
    if (!row) {
      const exists = await TopUp.exists({ _id: id }).session(session);
      return fail(exists ? ERR.TOPUP_CLOSED : ERR.NO_TOPUP);
    }

    await notify(session, {
      audience: 'customer',
      customerKey: row.customerKey,
      kind: 'topup',
      key: `customer:topup-declined:${id}`,
      title: 'Top-up declined',
      body: `${taka(row.amount)} was not added: ${reason}`,
    });

    await AuditLog.create(
      [auditOf(actor, id, 'topup.rejected', `${taka(row.amount)} declined: ${reason}`, { status: 'rejected', note: reason })],
      { session },
    );

    return ok({ amount: row.amount });
  });
}
