import type { ClientSession } from 'mongoose';

import { LedgerEntry, Notification, Order, TopUp } from '../models/index.js';
import { tx } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { balanceFor, post } from './ledger.js';

/**
 * The customer's wallet, and the notification helper the rest of the backend
 * files through.
 *
 * Both halves come from the app's `src/lib/ledger.js`, where they sat side by
 * side for a reason: nearly every money transition ends by telling somebody it
 * happened, and a transition that moved money but told nobody is a support
 * ticket. Keeping `notify` here means the two are written in the same
 * transaction or neither is.
 *
 * The money itself is not this module's to write. Every taka goes through
 * `post()` in `./ledger.js`, which is append-only; nothing here touches a
 * LedgerEntry except to read one back.
 */

export type Audience = 'customer' | 'cook';

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */

export type NotifyArgs = {
  audience: Audience;
  kind: string;
  /** Overrides the derived dedupe key when the event needs a finer one. */
  key?: string | null;
  title?: string;
  body?: string;

  /** Who it is for. Both null is a broadcast — see `addressedTo` below. */
  customerKey?: string | null;
  kitchenId?: string | null;
  zone?: string | null;

  mealId?: string | null;
  orderId?: string | null;
  requestId?: string | null;
  offerId?: string | null;

  broadcastBy?: string | null;
};

/**
 * File a notification, unless the same one is already sitting unread.
 *
 * Both sides of the app asked for no duplicates, and the events that repeat
 * are the repeatable ones — a status pushed forward and back, a reminder that
 * comes round again tomorrow. Keying on the *event* rather than on the text
 * means re-wording a string does not defeat the dedupe, and reading the
 * standing one is what re-arms it: yesterday's reminder, once read, lets
 * today's through.
 *
 * `title` and `body` are stored as written, placeholders and all — the app's
 * `notificationText` translates and fills `{title}` / `{amount}` on read, so a
 * notice written when an order was confirmed still reads correctly a week
 * later, after the price changed or the meal was renamed. Interpolating here
 * would freeze a stale number *and* miss the Bangla string table, which is
 * keyed on the untranslated sentence.
 *
 * The socket push is deliberately not here. `publish()` from
 * `../realtime/hub.js` belongs after the commit: a push for a row that then
 * rolls back cannot be taken back.
 *
 * The session is the first argument and explicitly nullable so that a caller
 * inside a transaction cannot forget it by leaving an optional off the end.
 */
export async function notify(
  session: ClientSession | null,
  args: NotifyArgs,
): Promise<{ filed: boolean; id: string | null }> {
  const key =
    args.key ??
    `${args.audience}:${args.kind}:${args.orderId ?? args.requestId ?? args.mealId ?? ''}`;

  const standing = await Notification.findOne({ key, read: false }).session(session).lean();
  /* Two writers can pass this check at once and file the same badge twice.
     The row carries no unique index because that is the right trade: a
     duplicate here is a cosmetic repeat, and an index that could reject a
     notification would let it take down the money transition that raised it. */
  if (standing) return { filed: false, id: String(standing._id) };

  const [note] = await Notification.create(
    [
      {
        key,
        audience: args.audience,
        kind: args.kind,
        title: args.title ?? '',
        body: args.body ?? '',
        customerKey: args.customerKey ?? null,
        kitchenId: args.kitchenId ?? null,
        zone: args.zone ?? null,
        mealId: args.mealId ?? null,
        orderId: args.orderId ?? null,
        requestId: args.requestId ?? null,
        offerId: args.offerId ?? null,
        broadcastBy: args.broadcastBy ?? null,
        read: false,
      },
    ],
    { session: session ?? undefined },
  );

  return { filed: true, id: String(note._id) };
}

/**
 * The rows one reader owns.
 *
 * A broadcast — `customerKey` and `kitchenId` both null — is one document
 * every reader sees, so it is deliberately outside this filter. Flipping its
 * `read`, or deleting it, would clear it for everybody at once on behalf of
 * whoever opened their inbox first. Per-reader state for a broadcast needs a
 * row per reader; until there is one, a broadcast is a feed item rather than
 * something that badges and clears.
 */
const addressedTo = (audience: Audience, ref: string) =>
  audience === 'cook'
    ? { audience, kitchenId: ref }
    : { audience, customerKey: ref };

/** What the badge shows. The app counted the same thing over its own array. */
export async function unreadFor(
  audience: Audience,
  ref: string,
  session?: ClientSession,
): Promise<number> {
  if (!ref) return 0;

  return Notification.countDocuments({ ...addressedTo(audience, ref), read: false }).session(
    session ?? null,
  );
}

export async function markRead(
  audience: Audience,
  ref: string,
): Promise<Result<{ marked: number }>> {
  if (!ref) return fail(ERR.NAME_REQUIRED);

  // Filtering on `read: false` rather than stamping everything hits the
  // { audience, read } index and makes the count mean "how many changed".
  const out = await Notification.updateMany(
    { ...addressedTo(audience, ref), read: false },
    { read: true },
  );

  return ok({ marked: out.modifiedCount });
}

export async function clearNotifications(
  audience: Audience,
  ref: string,
): Promise<Result<{ cleared: number }>> {
  if (!ref) return fail(ERR.NAME_REQUIRED);

  const out = await Notification.deleteMany(addressedTo(audience, ref));
  return ok({ cleared: out.deletedCount });
}

/* ------------------------------------------------------------------ *
 * money in
 * ------------------------------------------------------------------ */

/**
 * Money in from outside.
 *
 * There is no payment gateway behind this. The app said so plainly and
 * nothing has changed: the ledger records the arrival as coming `from:
 * 'external'` so no fold downstream mistakes it for earnings, and the TopUp
 * row is written `reconciled: 'orphan'` because that is the literal truth —
 * no statement line has been matched to it. Writing 'matched' would produce a
 * top-up that reconciliation can never catch, which is the one outcome the
 * whole reconciliation surface exists to prevent.
 *
 * The entry, the row and the customer's notice are one transaction. A ledger
 * entry with no TopUp row is money nobody can trace to a payment; a TopUp row
 * with no entry is a balance that does not exist.
 */
export async function topUp(
  customerKey: string,
  amount: number,
  method?: string,
): Promise<Result<{ topUpId: string; amount: number; balance: number }>> {
  const ref = String(customerKey ?? '').trim();
  if (!ref) return fail(ERR.NAME_REQUIRED);

  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return fail(ERR.BAD_AMOUNT);

  const via = String(method ?? '').trim();

  return tx(async (session) => {
    const entry = await post(session, {
      kind: 'topup',
      amount: value,
      from: 'external',
      to: 'customer',
      // Without this the money lands in the global customer bucket and in
      // nobody's wallet — `balanceFor` matches on the ref, not the account.
      toRef: ref,
      note: via || 'Top up',
    });

    const [row] = await TopUp.create(
      [
        {
          customerKey: ref,
          amount: value,
          method: via || 'bKash',
          reconciled: 'orphan',
          ledgerEntryId: entry.id,
        },
      ],
      { session },
    );

    /* Keyed on this top-up rather than on the event, so two top-ups in one
       afternoon both announce themselves. The dedupe exists for events that
       repeat; a second payment is not a repeat of the first. */
    await notify(session, {
      audience: 'customer',
      customerKey: ref,
      kind: 'topup',
      key: `customer:topup:${String(row._id)}`,
      title: 'Wallet topped up',
      body: '৳{amount} added to your wallet.',
    });

    const balance = await balanceFor('customer', ref, session);

    return ok({ topUpId: String(row._id), amount: value, balance });
  });
}

/* ------------------------------------------------------------------ *
 * reading the wallet
 * ------------------------------------------------------------------ */

export type WalletEntry = {
  id: string;
  kind: string;
  amount: number;
  from: string;
  to: string;
  mealId: string | null;
  orderId: string | null;
  note: string;
  at: Date;
};

/**
 * One customer's balance and what made it.
 *
 * The balance is folded from the entries rather than read off a stored total,
 * for the reason the ledger's header gives: a running total beside the ledger
 * is two numbers that can disagree, and by the time they do the money is
 * already wrong.
 *
 * `from`/`to` are handed back as stored instead of being flattened into a
 * signed amount. The customer is on one side of every row here, so which side
 * *is* the direction, and the app's wallet screen already reads them.
 */
/**
 * One person's three numbers, in one answer.
 *
 * The app's wallet is not a single figure. A customer sees what they can
 * spend *and* what is held against orders they have not confirmed receipt of;
 * a cook sees what has been released to them. All three fold out of the same
 * ledger, and returning them together is what stops a screen from showing a
 * balance and a held amount that were read a second apart.
 *
 * `held` is folded from the orders rather than the ledger: the escrow account
 * is platform-wide, so the ledger can say how much is held in total but not
 * how much of it is *this* customer's. The orders can.
 */
export async function walletFor(
  customerKey: string,
  take = 50,
  kitchenId?: string | null,
): Promise<{
  balance: number;
  held: number;
  earnings: number;
  entries: WalletEntry[];
}> {
  const [balance, earnings, heldRows, rows] = await Promise.all([
    balanceFor('customer', customerKey),
    // Only a cook has one of these; everyone else is owed nothing.
    kitchenId ? balanceFor('cook', kitchenId) : Promise.resolve(0),
    Order.aggregate<{ _id: null; total: number }>([
      { $match: { customerKey, payment: 'held' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    LedgerEntry.find({
      $or: [
        { to: 'customer', toRef: customerKey },
        { from: 'customer', fromRef: customerKey },
      ],
    })
      // `at` and not `createdAt`: the ledger keeps no timestamps of its own,
      // it stamps `at` when the movement happened, and that is the index.
      .sort({ at: -1 })
      .limit(take)
      .lean(),
  ]);

  return {
    balance,
    held: heldRows[0]?.total ?? 0,
    earnings,
    entries: rows.map((row) => ({
      id: String(row._id),
      kind: row.kind,
      amount: row.amount,
      from: row.from,
      to: row.to,
      mealId: row.mealId ?? null,
      orderId: row.orderId ?? null,
      note: row.note,
      at: row.at,
    })),
  };
}
