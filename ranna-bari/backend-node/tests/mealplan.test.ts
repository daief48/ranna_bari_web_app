import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { tx } from '../src/config/db.js';
import { ERR } from '../src/lib/domain.js';
import { todayKey } from '../src/lib/format.js';
import { balanceFor, balances, post, reconcile, releaseEscrow } from '../src/logic/ledger.js';
import {
  bookMeals,
  mealCategoriesOf,
  monthDays,
  seedMealCategories,
} from '../src/logic/mealplan.js';
import { advanceOrder, cancelOrder, confirmReceived } from '../src/logic/orders.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';
import {
  Kitchen,
  LedgerEntry,
  MealBooking,
  MealCategory,
  MealPlan,
  MealService,
  Order,
  Setting,
} from '../src/models/index.js';

/**
 * The monthly meal system.
 *
 * What is under test is not the happy path — it is the promises the shape makes.
 * A booking is many orders and one receipt, so the assertions are about that
 * seam: one hold per meal with a key of its own, a refusal that leaves the
 * wallet exactly as it found it, a rate that cannot be re-written after the
 * fact, and a booking that closes only when its last meal does. The books are
 * checked for drift after every flow, because a system that sells thirty things
 * at once is the one where a rounding or a missing `fromRef` hides best.
 */

const CUSTOMER = '+8801711111111';
const OTHER = '+8801822222222';

let app: FastifyInstance;
let kitchenA: string;

/**
 * Next month, entirely.
 *
 * Every day of it is in the future in Dhaka, which the booking rules require —
 * running these against the current month would pass on the 3rd and fail on the
 * 30th, when there are not three days left to pick.
 */
function nextMonth(): string {
  const [year, month] = todayKey().slice(0, 7).split('-').map(Number);
  const first = new Date(Date.UTC(year, month, 1));
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH = nextMonth();
const DAYS = monthDays(MONTH);
const [D1, D2, D3] = DAYS;

/** A full month of dish names, with one deliberate hole on D3's dinner. */
const planDays = () =>
  DAYS.map((date) => ({
    date,
    breakfast: 'Khichuri',
    lunch: 'Beef tehari',
    dinner: date === D3 ? '' : 'Ruti and bhaji',
  }));

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
  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );

  const kitchen = await Kitchen.create({
    legacyId: 1,
    name: "Fatema's Kitchen",
    ownerName: 'Fatema B.',
    area: 'Dhanmondi',
    lat: 23.74,
    lng: 90.37,
    isOpen: true,
    kycStatus: 'approved',
  });
  kitchenA = String(kitchen._id);

  await seedMealCategories();

  // Student meals: ৳80 by default, two to ten of them.
  await MealService.create({
    kitchenId: kitchenA,
    categoryKey: 'student',
    rate: null,
    minMeals: 2,
    maxMeals: 10,
    active: true,
    cookName: 'Fatema B.',
  });

  await MealPlan.create({
    scope: 'system',
    kitchenId: '',
    categoryKey: 'student',
    month: MONTH,
    status: 'published',
    days: planDays(),
  });
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

/** The ordinary two-meal booking most of these start from. */
const book = (
  selections = [
    { date: D1, slot: 'lunch' },
    { date: D2, slot: 'lunch' },
  ],
  customerKey = CUSTOMER,
) =>
  bookMeals({
    customerKey,
    customer: { name: 'Tanvir', phone: CUSTOMER, address: null },
    kitchenId: kitchenA,
    month: MONTH,
    selections,
  });

/* ------------------------------------------------------------------ *
 * categories
 * ------------------------------------------------------------------ */

describe('meal categories', () => {
  it('seeds the three rates once and never re-writes them', async () => {
    await MealCategory.deleteMany({});

    expect((await seedMealCategories()).created).toBe(3);
    // Idempotent: a second boot adds nothing and duplicates nothing.
    expect((await seedMealCategories()).created).toBe(0);
    expect(await MealCategory.countDocuments()).toBe(3);

    const student = await MealCategory.findOne({ key: 'student' }).lean();
    expect(student?.rate).toBe(80);

    /* An operator re-pricing a category must survive a redeploy — that is the
       whole reason the seed is `$setOnInsert` rather than `$set`. */
    await MealCategory.updateOne({ key: 'student' }, { $set: { rate: 95 } });
    await seedMealCategories();
    expect(await MealCategory.findOne({ key: 'student' }).then((c) => c?.rate)).toBe(95);

    const listed = await mealCategoriesOf();
    expect(listed.map((c) => c.key)).toEqual(['business', 'student', 'regular']);
  });
});

/* ------------------------------------------------------------------ *
 * booking
 * ------------------------------------------------------------------ */

describe('booking', () => {
  it('holds one entry per meal, each with a key of its own', async () => {
    await fund(CUSTOMER, 5000);

    const out = await book();
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.result.count).toBe(2);
    expect(out.result.total).toBe(160);
    expect(out.result.code.startsWith('MB-')).toBe(true);
    expect(out.result.orderIds).toHaveLength(2);

    const orders = await Order.find({ bookingId: out.result.bookingId }).lean();
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order.kind).toBe('meal');
      expect(order.status).toBe('confirmed');
      expect(order.payment).toBe('held');
      expect(order.amount).toBe(80);
      expect(order.title).toBe('Beef tehari');
      expect(order.code.startsWith('RB-')).toBe(true);
    }

    /* One hold per order, keyed per order — which is what makes release and
       refund per meal possible at all. */
    const holds = await LedgerEntry.find({ kind: 'hold' }).lean();
    expect(holds).toHaveLength(2);
    expect(new Set(holds.map((h) => h.idemKey)).size).toBe(2);
    for (const hold of holds) {
      expect(hold.idemKey).toBe(`hold:${hold.orderId}`);
      // Without `fromRef` the hold debits nobody and the wallet still reads full.
      expect(hold.fromRef).toBe(CUSTOMER);
      expect(hold.amount).toBe(80);
    }

    expect((await balances()).held).toBe(160);
    expect(await balanceFor('customer', CUSTOMER)).toBe(4840);

    const booking = await MealBooking.findById(out.result.bookingId).lean();
    expect(booking?.status).toBe('active');
    expect(booking?.totalAmount).toBe(160);
    expect(booking?.items).toHaveLength(2);
    expect(booking?.items[0].name).toBe('Beef tehari');
    expect(await drift()).toBe(0);
  });

  it('refuses a basket outside the cook’s range and moves no money', async () => {
    await fund(CUSTOMER, 5000);

    const few = await book([{ date: D1, slot: 'lunch' }]);
    expect(few.ok).toBe(false);
    if (!few.ok) {
      expect(few.error).toBe(ERR.MEAL_COUNT);
      expect(few.detail).toMatchObject({ min: 2, max: 10, count: 1 });
    }

    const many = await book(DAYS.slice(0, 11).map((date) => ({ date, slot: 'lunch' })));
    expect(many.ok).toBe(false);
    if (!many.ok) expect(many.error).toBe(ERR.MEAL_COUNT);

    // Nothing was created and nothing was spent.
    expect(await Order.countDocuments()).toBe(0);
    expect(await MealBooking.countDocuments()).toBe(0);
    expect(await LedgerEntry.countDocuments({ kind: 'hold' })).toBe(0);
    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
    expect(await drift()).toBe(0);
  });

  it('refuses a short wallet and says by how much', async () => {
    await fund(CUSTOMER, 100);

    const out = await book();
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe(ERR.LOW_BALANCE);
      expect(out.detail).toMatchObject({ short: 60, balance: 100 });
    }

    expect(await Order.countDocuments()).toBe(0);
    expect(await balanceFor('customer', CUSTOMER)).toBe(100);
    expect(await drift()).toBe(0);
  });

  it('refuses a switched-off service and an unpublished month', async () => {
    await fund(CUSTOMER, 5000);

    await MealService.updateOne({ kitchenId: kitchenA }, { $set: { active: false } });
    const off = await book();
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toBe(ERR.SERVICE_INACTIVE);

    await MealService.updateOne({ kitchenId: kitchenA }, { $set: { active: true } });
    await MealPlan.updateOne({ scope: 'system' }, { $set: { status: 'draft' } });

    const unpublished = await book();
    expect(unpublished.ok).toBe(false);
    // A draft is not a calendar — only a published plan can be booked against.
    if (!unpublished.ok) expect(unpublished.error).toBe(ERR.PLAN_MISSING);

    expect(await Order.countDocuments()).toBe(0);
    expect(await drift()).toBe(0);
  });

  it('refuses a day the cook published nothing for', async () => {
    await fund(CUSTOMER, 5000);

    const out = await book([
      { date: D1, slot: 'lunch' },
      { date: D3, slot: 'dinner' },
    ]);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe(ERR.NO_MEAL);
      expect(out.detail).toMatchObject({ date: D3, slot: 'dinner' });
    }
    // The other meal in the basket must not have been sold on its own.
    expect(await Order.countDocuments()).toBe(0);
  });

  it('lets a cook’s published month override the platform’s', async () => {
    await fund(CUSTOMER, 5000);

    /* A draft override is the cook's working copy and must not be sold from,
       even though it is theirs and it is newer. */
    await MealPlan.create({
      scope: 'cook',
      kitchenId: kitchenA,
      categoryKey: 'student',
      month: MONTH,
      status: 'draft',
      days: DAYS.map((date) => ({ date, breakfast: '', lunch: 'Cook special', dinner: '' })),
    });

    const first = await book();
    expect(first.ok).toBe(true);
    if (first.ok) {
      const order = await Order.findById(first.result.orderIds[0]).lean();
      expect(order?.title).toBe('Beef tehari');
    }

    await MealPlan.updateOne({ scope: 'cook' }, { $set: { status: 'published' } });

    const second = await book([
      { date: DAYS[4], slot: 'lunch' },
      { date: DAYS[5], slot: 'lunch' },
    ]);
    expect(second.ok).toBe(true);
    if (second.ok) {
      const order = await Order.findById(second.result.orderIds[0]).lean();
      expect(order?.title).toBe('Cook special');
    }

    // Copy-on-write: the platform's calendar is never touched by a cook.
    const system = await MealPlan.findOne({ scope: 'system' }).lean();
    expect(system?.days.find((d) => d.date === D1)?.lunch).toBe('Beef tehari');
    expect(await drift()).toBe(0);
  });

  it('refuses the same date and slot twice, in one basket or across two', async () => {
    await fund(CUSTOMER, 5000);

    const twice = await book([
      { date: D1, slot: 'lunch' },
      { date: D1, slot: 'lunch' },
    ]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toBe(ERR.ALREADY_ORDERED);

    const first = await book();
    expect(first.ok).toBe(true);

    const again = await book([
      { date: D1, slot: 'lunch' },
      { date: D3, slot: 'lunch' },
    ]);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error).toBe(ERR.ALREADY_ORDERED);
      expect(again.detail).toMatchObject({ date: D1, slot: 'lunch' });
    }

    // Two meals from the first booking, and nothing from the refused ones.
    expect(await Order.countDocuments()).toBe(2);
    expect(await drift()).toBe(0);
  });

  it('refuses yesterday, a slot that is not a meal, and a day outside the month', async () => {
    await fund(CUSTOMER, 5000);

    const past = await book([
      { date: '2020-01-01', slot: 'lunch' },
      { date: D1, slot: 'lunch' },
    ]);
    expect(past.ok).toBe(false);

    const nonsense = await book([
      { date: D1, slot: 'brunch' },
      { date: D2, slot: 'lunch' },
    ]);
    expect(nonsense.ok).toBe(false);
    if (!nonsense.ok) expect(nonsense.detail).toMatchObject({ field: 'slot' });

    expect(await Order.countDocuments()).toBe(0);
  });

  it('snapshots the rate, so a later price change cannot re-price a sold month', async () => {
    await fund(CUSTOMER, 5000);

    const out = await book();
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    await MealService.updateOne({ kitchenId: kitchenA }, { $set: { rate: 200 } });
    await MealCategory.updateOne({ key: 'student' }, { $set: { rate: 500 } });

    const booking = await MealBooking.findById(out.result.bookingId).lean();
    expect(booking?.rate).toBe(80);
    expect(booking?.totalAmount).toBe(160);
    expect(booking?.items.every((i) => i.amount === 80)).toBe(true);

    const orders = await Order.find({ bookingId: out.result.bookingId }).lean();
    expect(orders.every((o) => o.amount === 80)).toBe(true);

    // And the next booking pays the new price.
    const next = await book([
      { date: DAYS[6], slot: 'lunch' },
      { date: DAYS[7], slot: 'lunch' },
    ]);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.result.total).toBe(400);
  });
});

/* ------------------------------------------------------------------ *
 * the rail, per meal
 * ------------------------------------------------------------------ */

describe('the rail under a booking', () => {
  async function booked() {
    await fund(CUSTOMER, 5000);
    const out = await book();
    if (!out.ok) throw new Error(`booking failed: ${out.error}`);
    return out.result;
  }

  it('runs a meal on the short rail: confirmed → preparing → delivered', async () => {
    const { orderIds } = await booked();

    const first = await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    expect(first.ok && first.result.status).toBe('preparing');

    /* The two steps in between say nothing a customer expecting lunch did not
       already assume, so a meal skips them. */
    const second = await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    expect(second.ok && second.result.status).toBe('delivered');

    const third = await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    expect(third.ok).toBe(false);
  });

  it('a customer confirming does not pay the cook', async () => {
    const { orderIds } = await booked();

    await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });

    const done = await confirmReceived({ orderId: orderIds[0], customerKey: CUSTOMER });
    expect(done.ok).toBe(true);

    const order = await Order.findById(orderIds[0]).lean();
    expect(order?.status).toBe('completed');
    // Closing the order and releasing the money are separate decisions.
    expect(order?.payment).toBe('held');
    expect(await balanceFor('cook', kitchenA)).toBe(0);
    expect((await balances()).held).toBe(160);
    expect(await drift()).toBe(0);
  });

  it('releases one meal at a time, and pays for it exactly once', async () => {
    const { orderIds } = await booked();

    await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    await advanceOrder({ orderId: orderIds[0], kitchenId: kitchenA });
    await confirmReceived({ orderId: orderIds[0], customerKey: CUSTOMER });

    const paid = await tx((session) => releaseEscrow(session, orderIds[0]));
    expect(paid.ok).toBe(true);
    // ৳80 at the meal commission of 15%: ৳12 to the platform, the rest the cook's.
    if (paid.ok) expect(paid.result.cook + paid.result.platform).toBe(80);
    expect(await balanceFor('cook', kitchenA)).toBe(68);

    const twice = await tx((session) => releaseEscrow(session, orderIds[0]));
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toBe(ERR.ALREADY_SETTLED);

    expect(await LedgerEntry.countDocuments({ kind: 'release' })).toBe(1);
    expect(await balanceFor('cook', kitchenA)).toBe(68);
    // The other meal is untouched — its money is still held.
    expect((await balances()).held).toBe(80);
    expect(await drift()).toBe(0);
  });

  it('cancels one meal, refunds it, and leaves the booking standing', async () => {
    const { bookingId, orderIds } = await booked();

    const back = await cancelOrder({ orderId: orderIds[0], by: 'customer', reason: 'Away' });
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.result.refunded).toBe(80);

    expect(await Order.findById(orderIds[0]).then((o) => o?.status)).toBe('cancelled');
    expect(await balanceFor('customer', CUSTOMER)).toBe(4920);

    /* A month is not over because one Tuesday was called off. */
    expect(await MealBooking.findById(bookingId).then((b) => b?.status)).toBe('active');

    await cancelOrder({ orderId: orderIds[1], by: 'customer', reason: 'Away' });
    expect(await MealBooking.findById(bookingId).then((b) => b?.status)).toBe('cancelled');
    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
    expect(await drift()).toBe(0);
  });

  it('closes the booking when the last meal is confirmed, with the books balanced', async () => {
    const { bookingId, orderIds } = await booked();

    for (const orderId of orderIds) {
      await advanceOrder({ orderId, kitchenId: kitchenA });
      await advanceOrder({ orderId, kitchenId: kitchenA });
      const done = await confirmReceived({ orderId, customerKey: CUSTOMER });
      expect(done.ok).toBe(true);
    }

    expect(await MealBooking.findById(bookingId).then((b) => b?.status)).toBe('completed');

    for (const orderId of orderIds) {
      const paid = await tx((session) => releaseEscrow(session, orderId));
      expect(paid.ok).toBe(true);
    }

    expect((await balances()).held).toBe(0);
    expect(await balanceFor('cook', kitchenA)).toBe(136);
    expect(await balanceFor('customer', CUSTOMER)).toBe(4840);
    expect(await drift()).toBe(0);
  });

  it('a booking with one cancelled meal still completes', async () => {
    const { bookingId, orderIds } = await booked();

    await cancelOrder({ orderId: orderIds[0], by: 'cook', reason: 'Closed that day' });

    await advanceOrder({ orderId: orderIds[1], kitchenId: kitchenA });
    await advanceOrder({ orderId: orderIds[1], kitchenId: kitchenA });
    await confirmReceived({ orderId: orderIds[1], customerKey: CUSTOMER });

    // Not every meal was cancelled, so the month happened.
    expect(await MealBooking.findById(bookingId).then((b) => b?.status)).toBe('completed');
    expect(await drift()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * over HTTP
 * ------------------------------------------------------------------ */

describe('the booking endpoint', () => {
  const json = (res: { body: string }) => JSON.parse(res.body);
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Sign in the way the app does, and hand back a bearer token. */
  async function signIn(phone: string) {
    const asked = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/request-otp',
        payload: { phone },
      }),
    );
    const out = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/verify-otp',
        payload: { phone, code: asked.devCode },
      }),
    );
    return out.token as string;
  }

  it('refuses an unauthenticated booking', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/meal-bookings',
      payload: { kitchenId: kitchenA, month: MONTH, selections: [{ date: D1, slot: 'lunch' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('books a month, then shows it back with a live status per meal', async () => {
    const token = await signIn(CUSTOMER);
    await fund(CUSTOMER, 5000);

    const created = await app.inject({
      method: 'POST',
      url: '/api/app/v1/meal-bookings',
      headers: auth(token),
      payload: {
        kitchenId: kitchenA,
        month: MONTH,
        selections: [
          { date: D1, slot: 'lunch' },
          { date: D2, slot: 'breakfast' },
        ],
        name: 'Tanvir',
      },
    });

    expect(created.statusCode).toBe(201);
    const booked = json(created);
    expect(booked.count).toBe(2);
    expect(booked.total).toBe(160);
    expect(booked.orderIds).toHaveLength(2);

    const list = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/meal-bookings', headers: auth(token) }),
    );
    expect(list.bookings).toHaveLength(1);
    expect(list.bookings[0].code).toBe(booked.code);
    expect(list.bookings[0].kitchenName).toBe("Fatema's Kitchen");
    expect(list.bookings[0].items.map((i: { name: string }) => i.name)).toEqual([
      'Beef tehari',
      'Khichuri',
    ]);
    // The per-item status is read off the orders, never off the booking.
    expect(list.bookings[0].items.every((i: { status: string }) => i.status === 'confirmed')).toBe(
      true,
    );

    await advanceOrder({ orderId: booked.orderIds[0], kitchenId: kitchenA });

    const one = json(
      await app.inject({
        method: 'GET',
        url: `/api/app/v1/meal-bookings/${booked.bookingId}`,
        headers: auth(token),
      }),
    );
    expect(one.booking.items[0].status).toBe('preparing');
    expect(one.booking.items[0].reviewed).toBe(false);

    /* Somebody else's booking is a 404, not a 403 — a stranger learns nothing
       about whether the id exists. */
    const stranger = await signIn(OTHER);
    const denied = await app.inject({
      method: 'GET',
      url: `/api/app/v1/meal-bookings/${booked.bookingId}`,
      headers: auth(stranger),
    });
    expect(denied.statusCode).toBe(404);
  });

  it('hands the refusals back as codes the app can branch on', async () => {
    const token = await signIn(CUSTOMER);
    await fund(CUSTOMER, 5000);

    const tooFew = await app.inject({
      method: 'POST',
      url: '/api/app/v1/meal-bookings',
      headers: auth(token),
      payload: { kitchenId: kitchenA, month: MONTH, selections: [{ date: D1, slot: 'lunch' }] },
    });
    expect(tooFew.statusCode).toBe(400);
    expect(json(tooFew).error).toBe(ERR.MEAL_COUNT);
    expect(json(tooFew).detail).toMatchObject({ min: 2, max: 10, count: 1 });

    await MealService.updateOne({ kitchenId: kitchenA }, { $set: { active: false } });
    const off = await app.inject({
      method: 'POST',
      url: '/api/app/v1/meal-bookings',
      headers: auth(token),
      payload: {
        kitchenId: kitchenA,
        month: MONTH,
        selections: [
          { date: D1, slot: 'lunch' },
          { date: D2, slot: 'lunch' },
        ],
      },
    });
    expect(json(off).error).toBe(ERR.SERVICE_INACTIVE);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/app/v1/meal-bookings',
      headers: auth(token),
      payload: {
        kitchenId: '0'.repeat(24),
        month: MONTH,
        selections: [
          { date: D1, slot: 'lunch' },
          { date: D2, slot: 'lunch' },
        ],
      },
    });
    expect(missing.statusCode).toBe(404);
    expect(json(missing).error).toBe(ERR.NO_MEAL);

    expect(await Order.countDocuments()).toBe(0);
    expect(await drift()).toBe(0);
  });

  it('serves the month a customer picks from, and greys what they already have', async () => {
    const token = await signIn(CUSTOMER);
    await fund(CUSTOMER, 5000);

    const categories = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/meal-categories' }),
    );
    expect(categories.categories.map((c: { key: string }) => c.key)).toEqual([
      'business',
      'student',
      'regular',
    ]);

    const list = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/meal-services', headers: auth(token) }),
    );
    expect(list.services).toHaveLength(1);
    expect(list.services[0]).toMatchObject({
      kitchenId: kitchenA,
      kitchenName: "Fatema's Kitchen",
      categoryKey: 'student',
      categoryLabel: 'Student Meal',
      rate: 80,
      minMeals: 2,
      maxMeals: 10,
    });

    const out = await book();
    expect(out.ok).toBe(true);

    const month = json(
      await app.inject({
        method: 'GET',
        url: `/api/app/v1/meal-services/${kitchenA}?month=${MONTH}`,
        headers: auth(token),
      }),
    );
    expect(month.month).toBe(MONTH);
    expect(month.days).toHaveLength(DAYS.length);
    expect(month.days[0]).toMatchObject({ date: D1, lunch: 'Beef tehari' });
    expect(month.booked).toHaveLength(2);
    expect(month.booked[0]).toMatchObject({ date: D1, slot: 'lunch', status: 'confirmed' });
  });
});
