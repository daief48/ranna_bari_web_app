import { Schema, model, type InferSchemaType, type Query } from 'mongoose';

/**
 * The money. Append-only, and that is enforced rather than intended.
 *
 * SQLite had a trigger; MongoDB has none, so this needs two guards and they
 * do different jobs:
 *
 *   1. the middleware below, which catches application bugs — a transition
 *      that tries to "correct" an entry instead of posting a reversing one;
 *   2. an Atlas custom role granting the application user only `find` and
 *      `insert` on this collection, which catches everything else, including
 *      a maintenance script written by somebody who never read this file.
 *
 * The first is a lint. The second is the control. `README.md` documents the
 * role, because a guard that lives only in a dashboard is a guard that gets
 * deleted by whoever inherits the dashboard.
 */

const ledgerSchema = new Schema(
  {
    /** topup | hold | release | refund | commission | payout | adjustment */
    kind: { type: String, required: true, index: true },

    /** Whole taka. Never a float — see lib/format.ts. */
    amount: { type: Number, required: true, min: 1 },

    /** 'customer' | 'held' | 'cook' | 'platform' | 'external' */
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },

    /**
     * Which party each side is.
     *
     * The app's three buckets are global, which is fine on one device with
     * one customer. A platform needs per-party answers — what is *this* cook
     * owed — and these carry it.
     */
    fromRef: { type: String, default: null, index: true },
    toRef: { type: String, default: null, index: true },

    mealId: { type: String, default: null },
    orderId: { type: String, default: null, index: true },
    payoutRunId: { type: String, default: null, index: true },

    note: { type: String, default: '' },

    /**
     * Idempotency. A double-clicked "Release" carries the same key and the
     * second insert loses on the index rather than paying twice.
     *
     * Sparse, because most entries have no key and a plain unique index would
     * reject the second null.
     */
    idemKey: { type: String, default: null },

    at: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false, collection: 'ledgerEntries' },
);

ledgerSchema.index(
  { idemKey: 1 },
  { unique: true, partialFilterExpression: { idemKey: { $type: 'string' } } },
);

/* Reads that the balance fold and the ledger page actually make. */
ledgerSchema.index({ to: 1, toRef: 1 });
ledgerSchema.index({ from: 1, fromRef: 1 });
ledgerSchema.index({ kind: 1, at: -1 });

/* ------------------------------------------------------------------ *
 * the guard
 * ------------------------------------------------------------------ */

export class AppendOnlyError extends Error {
  constructor(operation: string) {
    super(
      `ledger-append-only: a ledger entry cannot be ${operation}. ` +
        'Post a reversing entry instead.',
    );
    this.name = 'AppendOnlyError';
  }
}

const MUTATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

for (const operation of MUTATIONS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ledgerSchema.pre(operation as any, function (this: Query<unknown, unknown>) {
    throw new AppendOnlyError(operation);
  });
}

/* A document loaded and re-saved is the same mutation wearing a different
   hat, so `save()` is refused too — but only for a document that already
   exists, or nothing could ever be inserted. */
ledgerSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new AppendOnlyError('updated'));
    return;
  }
  next();
});

export type LedgerEntryDoc = InferSchemaType<typeof ledgerSchema>;
export const LedgerEntry = model('LedgerEntry', ledgerSchema);
