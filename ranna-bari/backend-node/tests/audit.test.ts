import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { issueSession, type AppIdentity } from '../src/auth/app-auth.js';
import { tx } from '../src/config/db.js';
import { ERR } from '../src/lib/domain.js';
import { todayKey } from '../src/lib/format.js';
import { registerCook } from '../src/logic/cook-signup.js';
import {
  balanceFor,
  balances,
  post,
  reconcile,
  refundEscrow,
  releaseEscrow,
  splitEscrow,
} from '../src/logic/ledger.js';
import { bookMeals, monthDays, seedMealCategories } from '../src/logic/mealplan.js';
import { advanceOrder, cancelOrder, sweepEscrow } from '../src/logic/orders.js';
import { redeem } from '../src/logic/promotions.js';
import { DEFAULT_SETTINGS, invalidateFlags } from '../src/logic/settings.js';
import * as stores from '../src/logic/stores.js';
import { recordOrder } from '../src/logic/sync.js';
import { topUp } from '../src/logic/wallet.js';
import {
  Account,
  Dish,
  Dispute,
  FeatureFlag,
  Kitchen,
  LedgerEntry,
  MealPlan,
  MealService,
  Order,
  Product,
  Promotion,
  Redemption,
  Review,
  Setting,
  Store,
} from '../src/models/index.js';

/**
 * The audit's findings, kept fixed.
 *
 * Every case here is a hole that was open: two spends of one balance both
 * passing, a partial refund stranding money in escrow, a release paying a
 * cook out from under an open dispute, a flag the panel could flip that the
 * server never read, a cash order nobody could cancel. The assertions are
 * about the books as much as the replies — a fix that balances a wallet by
 * unbalancing the ledger is not a fix.
 */

let app: FastifyInstance;
let kitchenId: string;
let kitchenAccountId: string;
let dishId: string;

const json = (res: { body: string }) => JSON.parse(res.body);
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const drift = async () => {
  const books = await reconcile();
  return Object.values(books.drift).reduce((sum, v) => sum + Math.abs(v), 0);
};

const code = () => `RB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** A customer identity the logic layer accepts, without a round trip through sign-in. */
const customerOf = (customerKey: string): AppIdentity => ({
  accountId: `acct-${customerKey}`,
  customerKey,
  role: 'user',
  name: 'Tanvir',
  phone: customerKey,
  kitchenId: null,
  kitchenName: null,
});

/** Sign in the way the app does and fund the wallet. */
async function customer(phone: string, balance = 0) {
  const asked = json(
    await app.inject({ method: 'POST', url: '/api/app/v1/auth/request-otp', payload: { phone } }),
  );
  const out = json(
    await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/verify-otp',
      payload: { phone, code: asked.devCode },
    }),
  );
  if (balance) await topUp(out.account.customerKey, balance);
  return { token: out.token as string, key: out.account.customerKey as string };
}

async function cookWithKitchen(email: string, kyc: 'approved' | 'pending' = 'approved') {
  const account = await Account.create({
    customerKey: email,
    role: 'cook',
    name: email,
    email,
    emailVerifiedAt: new Date(),
  });
  const kitchen = await Kitchen.create({
    accountId: String(account._id),
    name: `${email} kitchen`,
    ownerName: email,
    area: 'Dhanmondi',
    isOpen: true,
    kycStatus: kyc,
  });
  const session = await issueSession(account, { name: 'test', platform: 'web' });
  return { token: session.token, kitchenId: String(kitchen._id), accountId: String(account._id) };
}

async function makeShop(ownerKitchenId = kitchenId) {
  const store = await Store.create({ kitchenId: ownerKitchenId, name: 'Pantry', isOpen: true, deliveryFee: 40 });
  const product = await Product.create({
    storeId: String(store._id),
    name: 'Aam er achar',
    price: 300,
    stock: 50,
    active: true,
  });
  return { storeId: String(store._id), productId: String(product._id) };
}

/** A held escrow order written straight into the collections. */
async function heldOrder(customerKey: string, amount: number, overrides: Record<string, unknown> = {}) {
  const [order] = await Order.create([
    {
      code: code(),
      kind: 'wallet',
      kitchenId,
      cookName: 'Owner',
      title: 'Shorshe Ilish',
      customerKey,
      amount,
      price: amount,
      subtotal: amount,
      paid: amount,
      status: 'delivered',
      payment: 'held',
      deliveredAt: new Date(Date.now() - 10 * 86_400_000),
      ...overrides,
    },
  ]);
  await tx((session) =>
    post(session, {
      kind: 'hold',
      amount: Math.round((overrides.paid as number | undefined) ?? amount),
      from: 'customer',
      to: 'held',
      fromRef: customerKey,
      orderId: String(order._id),
      idemKey: `hold:${String(order._id)}`,
      note: 'test hold',
    }),
  );
  return String(order._id);
}

beforeAll(async () => {
  await startTestDb();
  app = await buildApp();
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  invalidateFlags();
  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );
  const cook = await cookWithKitchen('owner@example.com');
  kitchenId = cook.kitchenId;
  kitchenAccountId = cook.accountId;
  dishId = String((await Dish.create({ kitchenId, name: 'Tehari', price: 200 }))._id);
});

/* ------------------------------------------------------------------ *
 * 1 + 2 — the wallet cannot be spent twice, and an order and its hold land together
 * ------------------------------------------------------------------ */

describe('spending the wallet', () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    code: code(),
    kind: 'wallet' as const,
    chefId: kitchenId,
    items: [{ id: dishId, name: 'Tehari', price: 200, qty: 3 }],
    ...over,
  });

  it('lets exactly one of two concurrent spends of the same balance through', async () => {
    const key = '+8801711111111';
    // Two orders of 650 each (600 + 40 + 10); the wallet holds enough for one.
    await topUp(key, 700);
    const me = customerOf(key);

    const [a, b] = await Promise.all([recordOrder(me, draft()), recordOrder(me, draft())]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const refused = a.ok ? b : a;
    if (!refused.ok) expect(refused.error).toBe(ERR.LOW_BALANCE);

    expect(await balanceFor('customer', key)).toBe(50);
    expect(await balanceFor('customer', key)).toBeGreaterThanOrEqual(0);
    expect(await Order.countDocuments({ customerKey: key })).toBe(1);
    expect(await drift()).toBe(0);
  });

  it('serialises a dish order against a shop checkout on the same wallet', async () => {
    const key = '+8801711111112';
    await topUp(key, 700);
    const { productId } = await makeShop();
    await stores.addToCart({ customerKey: key, productId, qty: 2 });

    const [a, b] = await Promise.all([
      recordOrder(customerOf(key), draft()),
      stores.checkout({ customerKey: key, customer: { name: 'T' } }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await balanceFor('customer', key)).toBeGreaterThanOrEqual(0);
    expect(await drift()).toBe(0);
  });

  it('writes no order at all when the wallet is short', async () => {
    const key = '+8801711111113';
    await topUp(key, 100);
    const out = await recordOrder(customerOf(key), draft());
    expect(out.ok).toBe(false);
    expect(await Order.countDocuments({ customerKey: key })).toBe(0);
    expect(await LedgerEntry.countDocuments({ kind: 'hold' })).toBe(0);
  });

  it('replays a code without charging twice', async () => {
    const key = '+8801711111114';
    await topUp(key, 2000);
    const one = draft();
    const first = await recordOrder(customerOf(key), one);
    const again = await recordOrder(customerOf(key), one);
    expect(first.ok && first.result.created).toBe(true);
    expect(again.ok && !again.result.created).toBe(true);
    expect(await balanceFor('customer', key)).toBe(2000 - 650);
  });
});

/* ------------------------------------------------------------------ *
 * 10 — fees are the server's, once per basket
 * ------------------------------------------------------------------ */

describe('basket fees', () => {
  it('charges delivery and platform on the first order of a basket and ignores the body', async () => {
    const other = await Kitchen.create({ name: 'Second', kycStatus: 'approved', isOpen: true });
    const dish2 = await Dish.create({ kitchenId: String(other._id), name: 'Khichuri', price: 100 });
    const buyer = await customer('+8801722222221', 5000);

    const body = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/orders',
        headers: auth(buyer.token),
        payload: {
          orders: [
            { code: code(), kind: 'wallet', chefId: kitchenId, items: [{ id: dishId, qty: 1 }], deliveryFee: 0, platformFee: 0 },
            { code: code(), kind: 'wallet', chefId: String(other._id), items: [{ id: String(dish2._id), qty: 1 }], deliveryFee: 500, platformFee: 500 },
          ],
        },
      }),
    );
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);

    const [first, second] = await Promise.all(
      body.results.map((r: { orderId: string }) => Order.findById(r.orderId).lean()),
    );
    expect(first?.deliveryFee).toBe(DEFAULT_SETTINGS.deliveryFee);
    expect(first?.platformFee).toBe(DEFAULT_SETTINGS.platformFee);
    expect(second?.deliveryFee).toBe(0);
    expect(second?.platformFee).toBe(0);
    expect(first!.amount + second!.amount).toBe(300 + DEFAULT_SETTINGS.deliveryFee + DEFAULT_SETTINGS.platformFee);
  });
});

/* ------------------------------------------------------------------ *
 * 3 — a partial refund leaves nothing in escrow
 * ------------------------------------------------------------------ */

describe('partial refund', () => {
  it('returns the part and releases the remainder, with commission, and reconciles', async () => {
    const key = '+8801733333331';
    await topUp(key, 1000);
    const orderId = await heldOrder(key, 1000);

    const before = await balances();
    const out = await tx((session) => refundEscrow(session, orderId, { amount: 400 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.result.refunded).toBe(400);
    expect(out.result.released).toBe(600);
    expect(await balanceFor('customer', key)).toBe(400);

    const after = await balances();
    expect(before.held - after.held).toBe(1000);
    // 600 at the COD-rail default of 15%: 90 to the platform, 510 to the cook.
    expect(await balanceFor('cook', kitchenId)).toBe(510);
    expect(after.platform - before.platform).toBe(90);

    const order = await Order.findById(orderId).lean();
    expect(order?.payment).toBe('released');
    expect(order?.cookAmount).toBe(510);
    expect(await drift()).toBe(0);

    // Nothing further can move: the release keys are spent.
    const again = await tx((session) => releaseEscrow(session, orderId));
    expect(again.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 4 — an open dispute holds the money
 * ------------------------------------------------------------------ */

describe('disputes', () => {
  it('refuse a release while open, allow their own resolution, and are skipped by the sweep', async () => {
    const key = '+8801744444441';
    await topUp(key, 1000);
    const orderId = await heldOrder(key, 1000);
    const dispute = await Dispute.create({ code: 'DP-1', orderId, status: 'investigating', reason: 'Cold' });

    const blocked = await tx((session) => releaseEscrow(session, orderId));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe(ERR.DISPUTE_OPEN);
    expect(await LedgerEntry.countDocuments({ kind: 'release' })).toBe(0);

    const swept = await sweepEscrow();
    expect(swept.released).toBe(0);
    expect(swept.failures[0]?.error).toBe(ERR.DISPUTE_OPEN);

    const resolved = await tx((session) =>
      releaseEscrow(session, orderId, { disputeId: String(dispute._id) }),
    );
    expect(resolved.ok).toBe(true);
    expect(await drift()).toBe(0);
  });

  it('the sweep releases what has aged past the window', async () => {
    const key = '+8801744444442';
    await topUp(key, 1000);
    await heldOrder(key, 1000);

    const swept = await sweepEscrow();
    expect(swept.released).toBe(1);
    expect(await balanceFor('cook', kitchenId)).toBe(850);
    expect(await drift()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 5 + 9 — a promotion is unwound to the party that funded it
 * ------------------------------------------------------------------ */

describe('promotions on refund', () => {
  async function discounted(key: string) {
    await topUp(key, 800);
    const orderId = await heldOrder(key, 1000, { discount: 200, paid: 800, promoCode: 'WELCOME', status: 'delivering' });
    await tx((session) =>
      post(session, {
        kind: 'promo',
        amount: 200,
        from: 'platform',
        to: 'held',
        orderId,
        idemKey: `promo:${orderId}`,
        note: 'WELCOME',
      }),
    );
    const promo = await Promotion.create({ code: 'WELCOME', kind: 'flat', value: 200 });
    await Redemption.create({ promotionId: String(promo._id), code: 'WELCOME', customerKey: key, orderId, amount: 200 });
    return { orderId, promotionId: String(promo._id) };
  }

  it('a split never refunds the customer more than they paid', async () => {
    const key = '+8801755555551';
    const { orderId } = await discounted(key);

    const out = await tx((session) => splitEscrow(session, orderId, 500, 500, 'dispute'));
    expect(out.ok).toBe(true);

    // Half the order back: half of the 800 the customer paid, half of the platform's 200.
    expect(await balanceFor('customer', key)).toBe(400);
    expect(await LedgerEntry.findOne({ kind: 'promo-return' }).then((e) => e?.amount)).toBe(100);
    expect((await balances()).held).toBe(0);
    expect(await drift()).toBe(0);
    // Partially eaten: the code stays used.
    expect(await Redemption.countDocuments({ orderId })).toBe(1);
  });

  it('a full refund gives the code back; a full-refund split does too', async () => {
    const key = '+8801755555552';
    const { orderId } = await discounted(key);

    const out = await tx((session) => refundEscrow(session, orderId));
    expect(out.ok).toBe(true);
    expect(await balanceFor('customer', key)).toBe(800);
    expect(await Redemption.countDocuments({ orderId })).toBe(0);
    expect(await drift()).toBe(0);
  });

  it('re-checks the usage limit inside the transaction', async () => {
    const promo = await Promotion.create({ code: 'LAST1', kind: 'flat', value: 50, usageLimit: 1 });
    await Redemption.create({ promotionId: String(promo._id), code: 'LAST1', customerKey: 'x', orderId: 'o1', amount: 50 });

    const out = await tx((session) =>
      redeem(session, {
        quote: { promotionId: String(promo._id), code: 'LAST1', discount: 50, paid: 100 },
        customerKey: 'y',
        orderId: 'o2',
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.PROMO_EXHAUSTED);
    expect(await Redemption.countDocuments()).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 6 + 20 — trading gates on the buy paths
 * ------------------------------------------------------------------ */

describe('trading gates', () => {
  it('closes a shop whose kitchen is pending or suspended to shoppers', async () => {
    const pending = await cookWithKitchen('pending@example.com', 'pending');
    const { productId } = await makeShop(pending.kitchenId);
    const key = '+8801766666661';
    await topUp(key, 5000);

    await stores.addToCart({ customerKey: key, productId, qty: 1 });
    const out = await stores.checkout({ customerKey: key, customer: { name: 'T' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.STORE_CLOSED);

    await Kitchen.updateOne({ _id: pending.kitchenId }, { kycStatus: 'approved', suspended: true });
    const still = await stores.checkout({ customerKey: key, customer: { name: 'T' } });
    expect(still.ok).toBe(false);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('refuses a cook buying from their own shop', async () => {
    const { productId } = await makeShop();
    const key = 'owner@example.com';
    await topUp(key, 5000);
    await stores.addToCart({ customerKey: key, productId, qty: 1 });

    const out = await stores.checkout({ customerKey: key, customer: { name: 'Me' }, buyerKitchenId: kitchenId });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.BAD_REQUEST);
  });

  it('refuses a meal booking on a pending kitchen, and a cook booking their own', async () => {
    await seedMealCategories();
    const month = (() => {
      const [y, m] = todayKey().slice(0, 7).split('-').map(Number);
      const d = new Date(Date.UTC(y, m, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const days = monthDays(month);
    await MealService.create({ kitchenId, categoryKey: 'student', minMeals: 1, maxMeals: 5, active: true });
    await MealPlan.create({
      scope: 'system', kitchenId: '', categoryKey: 'student', month, status: 'published',
      days: days.map((date) => ({ date, breakfast: 'Khichuri', lunch: 'Tehari', dinner: 'Ruti' })),
    });
    const key = '+8801766666662';
    await topUp(key, 5000);
    const selections = [{ date: days[0], slot: 'lunch' }];

    const own = await bookMeals({ customerKey: 'owner@example.com', kitchenId, month, selections, callerKitchenId: kitchenId });
    expect(own.ok).toBe(false);

    await Kitchen.updateOne({ _id: kitchenId }, { kycStatus: 'pending' });
    const out = await bookMeals({ customerKey: key, kitchenId, month, selections });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.SERVICE_INACTIVE);

    await Kitchen.updateOne({ _id: kitchenId }, { kycStatus: 'approved' });
    const fine = await bookMeals({ customerKey: key, kitchenId, month, selections });
    expect(fine.ok).toBe(true);

    /* 18 — the index refuses a second plate for the same sitting, whatever
       the reads said. */
    await expect(
      Order.create({
        code: code(), kind: 'meal', kitchenId, customerKey: key,
        serveDate: days[0], slot: 'lunch', amount: 80, status: 'confirmed', payment: 'held',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    const again = await bookMeals({ customerKey: key, kitchenId, month, selections });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe(ERR.ALREADY_ORDERED);
    expect(await drift()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 7 — the directory is bounded and lists kitchens that may trade
 * ------------------------------------------------------------------ */

describe('GET /kitchens', () => {
  it('leaves out a pending kitchen for everyone but its owner, and pages', async () => {
    const pending = await cookWithKitchen('pending2@example.com', 'pending');

    const anon = json(await app.inject({ method: 'GET', url: '/api/app/v1/kitchens' }));
    expect(anon.chefs.map((c: { id: string }) => c.id)).toEqual([kitchenId]);

    const own = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/kitchens', headers: auth(pending.token) }),
    );
    expect(own.chefs.map((c: { id: string }) => c.id).sort()).toEqual([kitchenId, pending.kitchenId].sort());

    const page = json(await app.inject({ method: 'GET', url: '/api/app/v1/kitchens?take=1&skip=1' }));
    expect(page.chefs).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: '/api/app/v1/kitchens?take=999' })).statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ *
 * 11 — feature flags are enforced, not just reported
 * ------------------------------------------------------------------ */

describe('feature flags', () => {
  it('a switched-off system refuses with feature-off; a missing row means on', async () => {
    const { productId } = await makeShop();
    const key = '+8801777777771';
    await topUp(key, 5000);
    await stores.addToCart({ customerKey: key, productId, qty: 1 });

    expect((await stores.checkout({ customerKey: key, customer: { name: 'T' } })).ok).toBe(true);

    await FeatureFlag.create({ _id: 'system.stores', enabled: false });
    invalidateFlags();
    await stores.addToCart({ customerKey: key, productId, qty: 1 });
    const off = await stores.checkout({ customerKey: key, customer: { name: 'T' } });
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toBe(ERR.FEATURE_OFF);
  });

  it('gates the top-up and the cook sign-up over HTTP', async () => {
    const buyer = await customer('+8801777777772');
    await FeatureFlag.create([
      { _id: 'system.topup', enabled: false },
      { _id: 'signup.cook', enabled: false },
    ]);
    invalidateFlags();

    const topup = await app.inject({
      method: 'POST', url: '/api/app/v1/wallet/topup', headers: auth(buyer.token), payload: { amount: 100 },
    });
    expect(topup.statusCode).toBe(403);
    expect(json(topup).error).toBe(ERR.FEATURE_OFF);

    const reg = await app.inject({
      method: 'POST', url: '/api/app/v1/auth/cook/register',
      payload: { name: 'Cook', phone: '+8801944444444', email: 'c@example.com', password: 'hunter2hunter2', kitchenName: 'K', specialties: ['x'], nid: '12345' },
    });
    expect(reg.statusCode).toBe(403);
    expect(await Account.countDocuments({ email: 'c@example.com' })).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 12 — cancelling, on cash and in a window
 * ------------------------------------------------------------------ */

describe('cancelling', () => {
  async function cashOrder(status = 'placed') {
    const [order] = await Order.create([{
      code: code(), kind: 'cod', kitchenId, title: 'Tehari', customerKey: '+8801788888881',
      amount: 250, status, payment: 'cod',
    }]);
    return String(order._id);
  }

  it('lets a customer cancel a cash order before the cook starts, with no ledger movement', async () => {
    const orderId = await cashOrder('placed');
    const out = await cancelOrder({ orderId, by: 'customer', reason: 'Changed my mind' });
    expect(out.ok).toBe(true);
    expect(await Order.findById(orderId).then((o) => o?.status)).toBe('cancelled');
    expect(await LedgerEntry.countDocuments()).toBe(0);
  });

  it('closes the customer window once cooking starts, but not the cook\'s', async () => {
    const orderId = await cashOrder('cooking');
    const late = await cancelOrder({ orderId, by: 'customer', reason: 'Too slow' });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toBe(ERR.WRONG_STATE);

    const cook = await cancelOrder({ orderId, by: 'cook', reason: 'Out of rice' });
    expect(cook.ok).toBe(true);
  });

  it('refuses everyone once the food is on its way', async () => {
    const orderId = await cashOrder('on_the_way');
    expect((await cancelOrder({ orderId, by: 'cook', reason: 'x' })).ok).toBe(false);
    expect((await cancelOrder({ orderId, by: 'admin', reason: 'x' })).ok).toBe(false);
  });

  it('on the escrow rail the customer may cancel at confirmed and not at preparing', async () => {
    const key = '+8801788888882';
    await topUp(key, 1000);
    const orderId = await heldOrder(key, 500, { status: 'confirmed', deliveredAt: null });

    await advanceOrder({ orderId, kitchenId });
    const late = await cancelOrder({ orderId, by: 'customer', reason: 'x' });
    expect(late.ok).toBe(false);

    const cook = await cancelOrder({ orderId, by: 'cook', reason: 'Ran out' });
    expect(cook.ok).toBe(true);
    expect(await balanceFor('customer', key)).toBe(1000);
    expect(await drift()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 22 — a replayed post does not abort the transaction
 * ------------------------------------------------------------------ */

describe('post()', () => {
  it('answers posted:false on a replayed key and lets the transaction commit', async () => {
    const out = await tx(async (session) => {
      const first = await post(session, { kind: 'topup', amount: 10, from: 'external', to: 'customer', toRef: 'k', idemKey: 'once' });
      const second = await post(session, { kind: 'topup', amount: 10, from: 'external', to: 'customer', toRef: 'k', idemKey: 'once' });
      // A later write in the same transaction, which used to die with NoSuchTransaction.
      await post(session, { kind: 'topup', amount: 5, from: 'external', to: 'customer', toRef: 'k' });
      return { first: first.posted, second: second.posted };
    });
    expect(out).toEqual({ first: true, second: false });
    expect(await balanceFor('customer', 'k')).toBe(15);
  });
});

/* ------------------------------------------------------------------ *
 * 19 + 23 — accounts and the cook resume
 * ------------------------------------------------------------------ */

describe('accounts', () => {
  it('refuses a duplicate email on the profile with account-exists, and lower-cases it', async () => {
    const a = await customer('+8801799999991');
    const b = await customer('+8801799999992');

    const first = await app.inject({
      method: 'POST', url: '/api/app/v1/account', headers: auth(a.token), payload: { email: 'Someone@Example.com' },
    });
    expect(first.statusCode).toBe(200);
    expect(json(first).account.email).toBe('someone@example.com');

    const dup = await app.inject({
      method: 'POST', url: '/api/app/v1/account', headers: auth(b.token), payload: { email: 'someone@example.com' },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error).toBe(ERR.ACCOUNT_EXISTS);

    const bad = await app.inject({
      method: 'POST', url: '/api/app/v1/account', headers: auth(b.token), payload: { email: 'not-an-email' },
    });
    expect(json(bad).error).toBe(ERR.EMAIL_INVALID);
  });

  it('a resumed cook registration keeps its credentials', async () => {
    const input = {
      name: 'Cook', phone: '+8801944444445', email: 'resume@example.com', password: 'hunter2hunter2',
      kitchenName: 'First', specialties: ['Traditional Heritage'], nid: '1234567890',
    };
    expect((await registerCook(input)).ok).toBe(true);
    const before = await Account.findOne({ email: input.email }).lean();

    // A stranger with the email and a different phone, or password, gets nothing.
    const stranger = await registerCook({ ...input, phone: '+8801955555556', password: 'attackerpass1' });
    expect(stranger.ok).toBe(false);

    const same = await registerCook({ ...input, password: 'different-password', kitchenName: 'Renamed' });
    expect(same.ok).toBe(true);

    const after = await Account.findOne({ email: input.email }).lean();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.phone).toBe(input.phone);
    expect(await Kitchen.countDocuments({ name: 'Renamed' })).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 15 — the kitchen body is shaped
 * ------------------------------------------------------------------ */

describe('POST /kitchens/mine', () => {
  it('keeps a pending kitchen shut however the body asks, and refuses a bad radius', async () => {
    const pending = await cookWithKitchen('shutter@example.com', 'pending');

    const open = await app.inject({
      method: 'POST', url: '/api/app/v1/kitchens/mine', headers: auth(pending.token), payload: { isOpen: true },
    });
    expect(open.statusCode).toBe(200);
    expect(await Kitchen.findById(pending.kitchenId).then((k) => k?.isOpen)).toBe(false);

    const bad = await app.inject({
      method: 'POST', url: '/api/app/v1/kitchens/mine', headers: auth(pending.token), payload: { deliveryRadiusKm: 900 },
    });
    expect(bad.statusCode).toBe(400);
    expect(json(bad).error).toBe(ERR.BAD_REQUEST);

    const nulls = await app.inject({
      method: 'POST', url: '/api/app/v1/kitchens/mine', headers: auth(pending.token), payload: { lat: null, lng: null, name: 'Still here' },
    });
    expect(nulls.statusCode).toBe(200);
  });
});

/* ------------------------------------------------------------------ *
 * the two additions — idempotent store checkout, recent reviews
 * ------------------------------------------------------------------ */

describe('POST /store-checkout with a code', () => {
  it('replays without charging twice', async () => {
    const { productId } = await makeShop();
    const buyer = await customer('+8801700000001', 5000);
    await stores.addToCart({ customerKey: buyer.key, productId, qty: 1 });

    const payload = { name: 'Buyer', code: 'RB-ABC123' };
    const first = json(
      await app.inject({ method: 'POST', url: '/api/app/v1/store-checkout', headers: auth(buyer.token), payload }),
    );
    expect(first.created).toBe(true);
    expect(first.orders[0].code).toBe('RB-ABC123');

    const again = json(
      await app.inject({ method: 'POST', url: '/api/app/v1/store-checkout', headers: auth(buyer.token), payload }),
    );
    expect(again.created).toBe(false);
    expect(again.orders.map((o: { id: string }) => o.id)).toEqual(first.orders.map((o: { id: string }) => o.id));

    expect(await Order.countDocuments()).toBe(1);
    expect(await balanceFor('customer', buyer.key)).toBe(5000 - 340);

    // Somebody else's code is not a replay.
    const other = await customer('+8801700000002', 5000);
    const theft = await app.inject({ method: 'POST', url: '/api/app/v1/store-checkout', headers: auth(other.token), payload });
    expect(theft.statusCode).toBe(403);
  });
});

describe('GET /reviews/recent', () => {
  it('lists the newest visible reviews of kitchens that may trade, lean', async () => {
    const pending = await cookWithKitchen('quiet@example.com', 'pending');
    await Review.create([
      { kitchenId, name: 'Tanvir', rating: 5, text: 'Lovely', avatar: 'data:image/png;base64,AAAA', customerKey: 'secret' },
      { kitchenId, name: 'Hidden', rating: 1, text: 'Nope', hidden: true },
      { kitchenId: pending.kitchenId, name: 'Early', rating: 4, text: 'Not yet' },
    ]);

    const res = await app.inject({ method: 'GET', url: '/api/app/v1/reviews/recent?take=6' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    const { reviews } = json(res);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ kitchenId, kitchenName: 'owner@example.com kitchen', customerName: 'Tanvir', rating: 5, text: 'Lovely' });
    expect(reviews[0].avatar).toBeUndefined();
    expect(reviews[0].customerKey).toBeUndefined();

    expect(json(await app.inject({ method: 'GET', url: '/api/app/v1/reviews/recent?take=99' })).reviews).toHaveLength(1);
  });
});
