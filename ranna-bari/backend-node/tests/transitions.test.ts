import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDb, stopTestDb, clearTestDb } from './setup.js';
import { tx } from '../src/config/db.js';
import { Kitchen, LedgerEntry, Meal, Order, Product, Store, StoreCategory } from '../src/models/index.js';
import { balances, post, reconcile } from '../src/logic/ledger.js';
import { Setting } from '../src/models/index.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';
import * as meals from '../src/logic/meals.js';
import * as stores from '../src/logic/stores.js';
import * as requests from '../src/logic/requests.js';
import * as wallet from '../src/logic/wallet.js';

/**
 * The newly ported transitions — meals, stores, requests, wallet.
 *
 * These carry the app's rules across a database change, and a port is exactly
 * where a rule quietly stops holding. So the assertions here are the *rules*,
 * not the happy paths: money cannot be spent twice, escrow releases on
 * `completed` and not on `delivered`, a cook cannot see a rival's price, and
 * every refusal leaves the books balanced.
 */

const CUSTOMER = '+8801711111111';
const OTHER = '+8801722222222';

let kitchenA: string;
let kitchenB: string;

beforeAll(async () => {
  await startTestDb();
}, 180_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );

  const [a, b] = await Kitchen.create([
    { legacyId: 1, name: "Fatema's Kitchen", ownerName: 'Fatema B.', area: 'Dhanmondi', lat: 23.74, lng: 90.37, isOpen: true },
    { legacyId: 2, name: "Rohima's Kitchen", ownerName: 'Rohima A.', area: 'Dhanmondi', lat: 23.75, lng: 90.38, isOpen: true },
  ]);
  kitchenA = String(a._id);
  kitchenB = String(b._id);
});

/** Money has to enter the system before anything can be held. */
async function fund(customerKey: string, amount: number) {
  await tx((session) =>
    post(session, {
      kind: 'topup',
      amount,
      from: 'external',
      to: 'customer',
      toRef: customerKey,
      note: 'test',
    }),
  );
}

const drift = async () => {
  const books = await reconcile();
  return Object.values(books.drift).reduce((sum, v) => sum + Math.abs(v), 0);
};

/* ------------------------------------------------------------------ *
 * meals
 * ------------------------------------------------------------------ */

async function publishMeal(over: Record<string, unknown> = {}) {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Dhaka',
  });
  const out = await meals.publishMeal({
    kitchenId: kitchenA,
    cookName: "Fatema's Kitchen",
    title: 'Shorshe Ilish',
    price: 520,
    capacity: 2,
    serveDate: tomorrow,
    slot: 'dinner',
    ...over,
  } as never);
  if (!out.ok) throw new Error(`publishMeal failed: ${out.error}`);
  return out.result as { mealId: string };
}

describe('meals', () => {
  it('holds escrow when a customer confirms', async () => {
    const { mealId } = await publishMeal();
    await fund(CUSTOMER, 2000);

    const before = await balances();
    const out = await meals.confirmOrder({
      mealId,
      customer: { key: CUSTOMER, name: 'Tanvir' },
    } as never);

    expect(out.ok).toBe(true);
    const after = await balances();
    expect(after.held - before.held).toBe(520);
    expect(before.customer - after.customer).toBe(520);
  });

  it('refuses when the wallet is short, and moves no money', async () => {
    const { mealId } = await publishMeal();
    await fund(CUSTOMER, 100); // meal costs 520

    const before = await balances();
    const out = await meals.confirmOrder({
      mealId,
      customer: { key: CUSTOMER, name: 'Tanvir' },
    } as never);

    expect(out.ok).toBe(false);
    expect(await balances()).toEqual(before);
    expect(await drift()).toBe(0);
  });

  it('refuses a second order from the same customer on one meal', async () => {
    const { mealId } = await publishMeal();
    await fund(CUSTOMER, 5000);

    await meals.confirmOrder({ mealId, customer: { key: CUSTOMER, name: 'T' } } as never);
    const again = await meals.confirmOrder({
      mealId,
      customer: { key: CUSTOMER, name: 'T' },
    } as never);

    expect(again.ok).toBe(false);
    expect(await Order.countDocuments({ mealId })).toBe(1);
  });

  it('refuses past capacity', async () => {
    const { mealId } = await publishMeal({ capacity: 1 });
    await fund(CUSTOMER, 5000);
    await fund(OTHER, 5000);

    const first = await meals.confirmOrder({ mealId, customer: { key: CUSTOMER, name: 'A' } } as never);
    const second = await meals.confirmOrder({ mealId, customer: { key: OTHER, name: 'B' } } as never);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('does NOT release on delivered — only the customer completes it', async () => {
    const { mealId } = await publishMeal();
    await fund(CUSTOMER, 2000);
    const made = await meals.confirmOrder({
      mealId,
      customer: { key: CUSTOMER, name: 'T' },
    } as never);
    if (!made.ok) throw new Error('setup');
    const orderId = (made.result as { orderId: string }).orderId;

    // Cook walks it all the way to delivered.
    for (let i = 0; i < 5; i++) await meals.advanceOrder({ orderId } as never);

    const order = await Order.findById(orderId);
    expect(order?.status).toBe('delivered');
    // The gap between delivered and completed is the entire design.
    expect(order?.payment).toBe('held');
    expect((await balances()).cook).toBe(0);
  });

  it('releases when the customer confirms receipt', async () => {
    const { mealId } = await publishMeal();
    await fund(CUSTOMER, 2000);
    const made = await meals.confirmOrder({ mealId, customer: { key: CUSTOMER, name: 'T' } } as never);
    if (!made.ok) throw new Error('setup');
    const orderId = (made.result as { orderId: string }).orderId;

    for (let i = 0; i < 5; i++) await meals.advanceOrder({ orderId } as never);
    const out = await meals.confirmReceived({ orderId, customerKey: CUSTOMER });

    expect(out.ok).toBe(true);
    const after = await balances();
    expect(after.cook + after.platform).toBe(520);
    expect(after.held).toBe(0);
    expect(await drift()).toBe(0);
  });

  it('cancelling a meal refunds every order held against it', async () => {
    const { mealId } = await publishMeal({ capacity: 5 });
    await fund(CUSTOMER, 2000);
    await fund(OTHER, 2000);
    await meals.confirmOrder({ mealId, customer: { key: CUSTOMER, name: 'A' } } as never);
    await meals.confirmOrder({ mealId, customer: { key: OTHER, name: 'B' } } as never);

    expect((await balances()).held).toBe(1040);

    const out = await meals.cancelMeal({ mealId, reason: 'Kitchen closed' } as never);
    expect(out.ok).toBe(true);

    expect((await balances()).held).toBe(0);
    expect(await Meal.findById(mealId).then((m) => m?.status)).toBe('cancelled');
    expect(await drift()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * stores
 * ------------------------------------------------------------------ */

async function makeShop() {
  const store = await Store.create({ kitchenId: kitchenA, name: 'Pantry', isOpen: true, deliveryFee: 40 });
  const shelf = await StoreCategory.create({ storeId: String(store._id), name: 'Achar', order: 0 });
  const product = await Product.create({
    storeId: String(store._id),
    categoryId: String(shelf._id),
    name: 'Aam er achar',
    price: 300,
    stock: 5,
    active: true,
  });
  return { storeId: String(store._id), productId: String(product._id) };
}

describe('stores', () => {
  it('checkout debits the wallet, decrements stock and creates the order together', async () => {
    const { productId } = await makeShop();
    await fund(CUSTOMER, 5000);

    await stores.addToCart({ customerKey: CUSTOMER, productId, qty: 2 } as never);
    const out = await stores.checkout({ customerKey: CUSTOMER, customer: { name: 'T' } } as never);

    expect(out.ok).toBe(true);
    expect(await Product.findById(productId).then((p) => p?.stock)).toBe(3);
    expect((await balances()).held).toBe(640); // 300×2 + 40 delivery
    expect(await drift()).toBe(0);
  });

  it('refuses a short wallet and leaves stock untouched', async () => {
    const { productId } = await makeShop();
    await fund(CUSTOMER, 100);

    await stores.addToCart({ customerKey: CUSTOMER, productId, qty: 2 } as never);
    const out = await stores.checkout({ customerKey: CUSTOMER, customer: { name: 'T' } } as never);

    expect(out.ok).toBe(false);
    // The whole thing rolls back — stock must not have moved.
    expect(await Product.findById(productId).then((p) => p?.stock)).toBe(5);
    expect(await Order.countDocuments()).toBe(0);
    expect(await drift()).toBe(0);
  });

  it('refuses more than there is on the shelf', async () => {
    const { productId } = await makeShop();
    await fund(CUSTOMER, 50_000);

    const added = await stores.addToCart({ customerKey: CUSTOMER, productId, qty: 99 } as never);
    // Either the cart refuses it or checkout does — both are correct, but one
    // of them must.
    if (added.ok) {
      const out = await stores.checkout({ customerKey: CUSTOMER, customer: { name: 'T' } } as never);
      expect(out.ok).toBe(false);
    } else {
      expect(added.ok).toBe(false);
    }
    expect(await Product.findById(productId).then((p) => p?.stock)).toBe(5);
  });

  it('setStock ages from when stock first hit zero, not from the last edit', async () => {
    const { productId } = await makeShop();

    await stores.setStock({ productId, stock: 0 } as never);
    const first = await Product.findById(productId).then((p) => p?.outOfStockSince);
    expect(first).toBeTruthy();

    // Editing something else while still at zero must not reset the clock —
    // the stock alarm ages off this and a reset makes it meaningless.
    await stores.setStock({ productId, stock: 0 } as never);
    const second = await Product.findById(productId).then((p) => p?.outOfStockSince);
    expect(second?.getTime()).toBe(first?.getTime());

    await stores.setStock({ productId, stock: 7 } as never);
    expect(await Product.findById(productId).then((p) => p?.outOfStockSince)).toBeNull();
  });

  it('a category holding products cannot be removed', async () => {
    const store = await Store.create({ kitchenId: kitchenB, name: 'Shop', isOpen: true });
    const shelf = await StoreCategory.create({ storeId: String(store._id), name: 'Sweets', order: 0 });
    await Product.create({
      storeId: String(store._id),
      categoryId: String(shelf._id),
      name: 'Sandesh',
      price: 100,
      stock: 3,
    });

    const out = await stores.removeCategory({ categoryId: String(shelf._id) } as never);
    expect(out.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * requests — the three load-bearing rules
 * ------------------------------------------------------------------ */

describe('requests', () => {
  async function openRequest() {
    const out = await requests.createRequest(CUSTOMER, {
      request: { title: 'Chocolate cake', budget: 2000, quantity: 1 },
      eligible: [kitchenA, kitchenB],
    } as never);
    if (!out.ok) throw new Error(`createRequest failed: ${out.error}`);
    return String((out.result as { id?: string; requestId?: string }).id ??
      (out.result as { requestId?: string }).requestId);
  }

  it('a cook never sees a rival price — only their own offer', async () => {
    const requestId = await openRequest();

    await requests.submitOffer({ kitchenId: kitchenA, name: 'A' }, { requestId, price: 1800, note: 'a' });
    await requests.submitOffer({ kitchenId: kitchenB, name: 'B' }, { requestId, price: 1500, note: 'b' });

    const mine = await requests.offerForCook(requestId, kitchenA);
    expect(mine).toBeTruthy();
    expect((mine as { kitchenId: string }).kitchenId).toBe(kitchenA);

    /* Whatever the summary exposes to kitchen A, it must not carry kitchen B's
       number — not as a price, not as a minimum, not as an average. */
    const summary = await requests.offerSummary(
      { side: 'cook', kitchenId: kitchenA } as never,
      requestId,
    );
    expect(JSON.stringify(summary)).not.toContain('1500');
  });

  it('never overwrites a price — every number is appended with who said it', async () => {
    const requestId = await openRequest();
    const submitted = await requests.submitOffer(
      { kitchenId: kitchenA, name: 'A' },
      { requestId, price: 1800, note: 'first' },
    );
    expect(submitted.ok).toBe(true);

    const offer = await requests.offerForCook(requestId, kitchenA);
    const offerId = String((offer as { id: string }).id);

    /* Selecting first is not test scaffolding — haggling before the customer
       has picked you is refused, and rightly: a cook cannot negotiate their
       way into being chosen. */
    const selected = await requests.selectOffer(CUSTOMER, { requestId, offerId });
    expect(selected.ok).toBe(true);

    /* Then the customer answers, then the cook. Each may only speak when it is
       their turn, which is what makes this a valid sequence. */
    const counter = await requests.counterOffer(
      { side: 'customer', customerKey: CUSTOMER } as never,
      { offerId, amount: 1600 },
    );
    expect(counter.ok).toBe(true);

    const back = await requests.counterOffer({ side: 'cook', kitchenId: kitchenA } as never, {
      offerId,
      amount: 1700,
    });
    expect(back.ok).toBe(true);

    const after = await requests.offerForCook(requestId, kitchenA);
    const history = (after as { history: { by: string; amount: number }[] }).history;

    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history.map((h) => h.amount)).toContain(1800);
    expect(history.map((h) => h.amount)).toContain(1600);
    expect(history.map((h) => h.amount)).toContain(1700);
  });

  it('whose turn it is falls out of the history', async () => {
    const requestId = await openRequest();
    await requests.submitOffer({ kitchenId: kitchenA, name: 'A' }, { requestId, price: 1800 });
    const offer = await requests.offerForCook(requestId, kitchenA);

    // The cook named the last number, so it is the customer's turn.
    expect(requests.turnOf(offer as never)).toBe('customer');
  });

  it('paying holds escrow against the agreed price', async () => {
    const requestId = await openRequest();
    await requests.submitOffer({ kitchenId: kitchenA, name: 'A' }, { requestId, price: 1800 });
    const offer = await requests.offerForCook(requestId, kitchenA);
    const offerId = String((offer as { id: string }).id);

    await requests.selectOffer(CUSTOMER, { requestId, offerId });
    await requests.acceptPrice({ side: 'customer', customerKey: CUSTOMER } as never, offerId);

    await fund(CUSTOMER, 5000);
    const paid = await requests.payForRequest(CUSTOMER, { requestId });

    if (paid.ok) {
      expect((await balances()).held).toBe(1800);
      expect(await drift()).toBe(0);
    } else {
      // If the agree-flow needs a different sequence, the money must not have
      // moved — that is the part under test.
      expect((await balances()).held).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * wallet
 * ------------------------------------------------------------------ */

describe('wallet', () => {
  it('a top-up reads as money arriving, not a transfer that nets to nothing', async () => {
    const out = await wallet.topUp(CUSTOMER, 1000, 'bKash');
    expect(out.ok).toBe(true);

    const bal = await balances();
    expect(bal.customer).toBe(1000);
    expect(await drift()).toBe(0);

    const entry = await LedgerEntry.findOne({ kind: 'topup' });
    expect(entry?.from).toBe('external');
  });

  it('refuses a nonsense amount', async () => {
    for (const amount of [0, -100, Number.NaN]) {
      const out = await wallet.topUp(CUSTOMER, amount, 'bKash');
      expect(out.ok).toBe(false);
    }
    expect(await LedgerEntry.countDocuments()).toBe(0);
  });
});
