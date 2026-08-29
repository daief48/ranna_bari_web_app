import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDb, stopTestDb, clearTestDb } from './setup.js';
import { tx } from '../src/config/db.js';
import { LedgerEntry, Order, AppendOnlyError } from '../src/models/index.js';
import {
  balanceFor,
  balances,
  cookBalances,
  post,
  reconcile,
  refundEscrow,
  releaseEscrow,
  splitEscrow,
} from '../src/logic/ledger.js';

/**
 * The money invariants, against a real MongoDB replica set.
 *
 * These are the four rules the app's own ledger header claims, plus the
 * commission split the app has no account for. They are asserted here rather
 * than trusted because every one of them is the kind of thing that keeps
 * working right up until it silently does not.
 */

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

async function makeOrder(overrides: Record<string, unknown> = {}) {
  const [order] = await Order.create([
    {
      code: `RB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      kind: 'meal',
      kitchenId: 'kitchen-1',
      cookName: 'Fatema',
      title: 'Shorshe Ilish',
      customerKey: '+8801711111111',
      customerName: 'Tanvir',
      amount: 1000,
      price: 1000,
      subtotal: 1000,
      status: 'delivered',
      payment: 'held',
      ...overrides,
    },
  ]);
  return order;
}

/** Money has to enter the system before it can be held. */
async function fund(customerKey: string, amount: number) {
  await tx((session) =>
    post(session, {
      kind: 'topup',
      amount,
      from: 'external',
      to: 'customer',
      toRef: customerKey,
      note: 'test top-up',
    }),
  );
}

async function hold(orderId: string, customerKey: string, amount: number) {
  await tx((session) =>
    post(session, {
      kind: 'hold',
      amount,
      from: 'customer',
      to: 'held',
      fromRef: customerKey,
      orderId,
      idemKey: `hold:${orderId}`,
      note: 'test hold',
    }),
  );
}

describe('append-only', () => {
  it('refuses an update through the model', async () => {
    await fund('+8801711111111', 500);
    const entry = await LedgerEntry.findOne();

    await expect(
      LedgerEntry.updateOne({ _id: entry!._id }, { amount: 999_999 }),
    ).rejects.toThrow(AppendOnlyError);
  });

  it('refuses a delete through the model', async () => {
    await fund('+8801711111111', 500);
    const entry = await LedgerEntry.findOne();

    await expect(LedgerEntry.deleteOne({ _id: entry!._id })).rejects.toThrow(
      AppendOnlyError,
    );
  });

  it('refuses re-saving a loaded document', async () => {
    await fund('+8801711111111', 500);
    const entry = await LedgerEntry.findOne();
    entry!.amount = 1;

    await expect(entry!.save()).rejects.toThrow(AppendOnlyError);
  });

  it('leaves the entry untouched after all of that', async () => {
    await fund('+8801711111111', 500);
    const entry = await LedgerEntry.findOne();
    expect(entry!.amount).toBe(500);
  });
});

describe('balances', () => {
  it('folds a top-up as money arriving, not as a transfer', async () => {
    await fund('+8801711111111', 1000);
    const bal = await balances();

    expect(bal.customer).toBe(1000);
    // `external` is not one of the folded accounts, which is what makes this
    // an arrival rather than something that nets to zero.
    expect(bal.held).toBe(0);
  });

  it('answers per party, not just globally', async () => {
    await fund('+8801711111111', 1000);
    await fund('+8801722222222', 250);

    expect(await balanceFor('customer', '+8801711111111')).toBe(1000);
    expect(await balanceFor('customer', '+8801722222222')).toBe(250);
    expect(await balanceFor('customer', '+8801799999999')).toBe(0);
  });
});

describe('release', () => {
  it('splits the held amount and never invents or loses a taka', async () => {
    const order = await makeOrder();
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const before = await balances();
    const out = await tx((session) => releaseEscrow(session, String(order._id)));

    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.result.cook + out.result.platform).toBe(1000);

    const after = await balances();
    expect(before.held - after.held).toBe(1000);
    expect(after.cook - before.cook).toBe(out.result.cook);
    expect(after.platform - before.platform).toBe(out.result.platform);
  });

  it('pays once when the same order is released twice', async () => {
    const order = await makeOrder();
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const first = await tx((session) => releaseEscrow(session, String(order._id)));
    const second = await tx((session) => releaseEscrow(session, String(order._id)));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);

    const releases = await LedgerEntry.countDocuments({ kind: 'release' });
    expect(releases).toBe(1);
  });

  it('credits the cook it belongs to, not cooks in general', async () => {
    const order = await makeOrder({ kitchenId: 'kitchen-7' });
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);
    await tx((session) => releaseEscrow(session, String(order._id)));

    expect(await balanceFor('cook', 'kitchen-7')).toBeGreaterThan(0);
    expect(await balanceFor('cook', 'kitchen-1')).toBe(0);
  });
});

describe('refund', () => {
  it('returns exactly what was held', async () => {
    const order = await makeOrder({ status: 'confirmed' });
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const before = await balances();
    const out = await tx((session) => refundEscrow(session, String(order._id)));

    expect(out.ok).toBe(true);
    const after = await balances();
    expect(after.customer - before.customer).toBe(1000);
    expect(before.held - after.held).toBe(1000);
  });

  it('refunds once', async () => {
    const order = await makeOrder({ status: 'confirmed' });
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    await tx((session) => refundEscrow(session, String(order._id)));
    const again = await tx((session) => refundEscrow(session, String(order._id)));

    expect(again.ok).toBe(false);
    expect(await LedgerEntry.countDocuments({ kind: 'refund' })).toBe(1);
  });
});

describe('split', () => {
  it('refuses a split that leaves money behind', async () => {
    const order = await makeOrder({ status: 'delivering' });
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const out = await tx((session) =>
      splitEscrow(session, String(order._id), 10, 10, 'deliberately short'),
    );

    expect(out.ok).toBe(false);
  });

  it('accounts for the whole held amount when it is exact', async () => {
    const order = await makeOrder({ status: 'delivering' });
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const before = await balances();
    const out = await tx((session) =>
      splitEscrow(session, String(order._id), 400, 600, 'dispute'),
    );

    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.result.refunded + out.result.released).toBe(1000);
    const after = await balances();
    expect(before.held - after.held).toBe(1000);
  });
});

describe('transactions', () => {
  it('rolls the whole unit of work back when it throws', async () => {
    const order = await makeOrder();
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);

    const before = await LedgerEntry.countDocuments();

    await expect(
      tx(async (session) => {
        await post(session, {
          kind: 'release',
          amount: 500,
          from: 'held',
          to: 'cook',
          toRef: 'kitchen-1',
          note: 'half a release',
        });
        // Something later in the same unit of work fails.
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The entry posted before the throw must not have survived.
    expect(await LedgerEntry.countDocuments()).toBe(before);
  });
});

describe('reconciliation', () => {
  it('reports zero drift across a full lifecycle', async () => {
    const a = await makeOrder();
    const b = await makeOrder({ status: 'confirmed' });

    await fund(a.customerKey, 3000);
    await hold(String(a._id), a.customerKey, 1000);
    await hold(String(b._id), b.customerKey, 1000);

    await tx((session) => releaseEscrow(session, String(a._id)));
    await tx((session) => refundEscrow(session, String(b._id)));

    const books = await reconcile();
    const drift = Object.values(books.drift).reduce((sum, v) => sum + Math.abs(v), 0);

    expect(drift).toBe(0);
  });

  it('never reports a cook owed a negative amount', async () => {
    const order = await makeOrder();
    await fund(order.customerKey, 1000);
    await hold(String(order._id), order.customerKey, 1000);
    await tx((session) => releaseEscrow(session, String(order._id)));

    const owed = await cookBalances();
    expect(owed.every((row) => row.amount > 0)).toBe(true);
  });
});
