import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { issueSession } from '../src/auth/app-auth.js';
import { tx } from '../src/config/db.js';
import { ERR } from '../src/lib/domain.js';
import { balanceFor, post, reconcile, releaseEscrow } from '../src/logic/ledger.js';
import { advanceOrder, cancelOrder, confirmReceived } from '../src/logic/orders.js';
import * as requests from '../src/logic/requests.js';
import { leaveReview } from '../src/logic/reviews.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';
import {
  Account,
  Kitchen,
  Notification,
  Offer,
  Order,
  Request,
  Setting,
} from '../src/models/index.js';

/**
 * A food request is paid from the wallet or not at all.
 *
 * The cases are the rules, not the happy path: no order exists before the
 * hold, a second payer cannot overdraw, a kitchen that stopped trading cannot
 * be paid, and an unpaid agreement lapses without moving money.
 */

const CUSTOMER = '+8801711111111';
const OTHER = '+8801722222222';

let app: FastifyInstance;
let kitchenA: string;
let kitchenB: string;
let cookToken: string;

const json = (res: { body: string }) => JSON.parse(res.body);
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

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

  const owner = await Account.create({
    customerKey: 'cook-a@example.com',
    role: 'cook',
    name: 'Cook A',
    email: 'cook-a@example.com',
    emailVerifiedAt: new Date(),
  });
  const [a, b] = await Kitchen.create([
    { accountId: String(owner._id), name: "Fatema's Kitchen", ownerName: 'Fatema', area: 'Dhanmondi', isOpen: true, kycStatus: 'approved' },
    { name: "Rohima's Kitchen", ownerName: 'Rohima', area: 'Dhanmondi', isOpen: true, kycStatus: 'approved' },
  ]);
  kitchenA = String(a._id);
  kitchenB = String(b._id);
  cookToken = (await issueSession(owner, { name: 'test', platform: 'web' })).token;
});

async function fund(customerKey: string, amount: number) {
  await tx((session) =>
    post(session, { kind: 'topup', amount, from: 'external', to: 'customer', toRef: customerKey, note: 'test' }),
  );
}

/** A request taken all the way to an agreed price with one kitchen. */
async function agreed(customerKey = CUSTOMER, kitchenId = kitchenA, price = 1800) {
  const made = await requests.createRequest(customerKey, {
    request: { title: 'Chocolate cake', budget: 2000, quantity: 1 },
    eligible: [kitchenA, kitchenB],
  } as never);
  if (!made.ok) throw new Error(`createRequest: ${made.error}`);
  const requestId = String((made.result as { id: string }).id);

  await requests.submitOffer({ kitchenId, name: 'Cook' }, { requestId, price });
  const offer = await requests.offerForCook(requestId, kitchenId);
  const offerId = String((offer as { id: string }).id);
  await requests.selectOffer(customerKey, { requestId, offerId });
  const accepted = await requests.acceptPrice({ side: 'customer', customerKey } as never, offerId);
  if (!accepted.ok) throw new Error(`acceptPrice: ${accepted.error}`);
  return { requestId, offerId };
}

const drift = async () =>
  Object.values((await reconcile()).drift).reduce((sum, v) => sum + Math.abs(v), 0);

/* ------------------------------------------------------------------ *
 * wallet-only
 * ------------------------------------------------------------------ */

describe('paying for a request', () => {
  it('holds the agreed price from the wallet and only then creates the order', async () => {
    const { requestId } = await agreed();
    expect(await Order.countDocuments()).toBe(0);

    await fund(CUSTOMER, 2500);
    const paid = await requests.payForRequest(CUSTOMER, { requestId });
    expect(paid.ok).toBe(true);

    const order = await Order.findOne({ kind: 'request' }).lean();
    expect(order?.payment).toBe('held');
    expect(order?.status).toBe('confirmed');
    const paidNote = await Notification.findOne({ kind: 'request-paid' }).lean();
    expect(String(paidNote?.orderId)).toBe(String(order?._id));
    expect(String(paidNote?.requestId)).toBe(requestId);
    expect(await balanceFor('customer', CUSTOMER)).toBe(700);
    expect(await drift()).toBe(0);
    expect((await Request.findById(requestId).lean())?.status).toBe('ordered');
  });

  it('low balance: refuses with short and balance, no order, no hold', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 500);

    const out = await requests.payForRequest(CUSTOMER, { requestId });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe(ERR.LOW_BALANCE);
    expect(out.detail).toEqual({ short: 1300, balance: 500 });

    expect(await Order.countDocuments()).toBe(0);
    expect(await balanceFor('customer', CUSTOMER)).toBe(500);
    expect((await Request.findById(requestId).lean())?.status).toBe('agreed');
  });

  it('refuses before agreement', async () => {
    const made = await requests.createRequest(CUSTOMER, {
      request: { title: 'Cake', budget: 1000, quantity: 1 },
      eligible: [kitchenA],
    } as never);
    if (!made.ok) throw new Error('create');
    await fund(CUSTOMER, 5000);
    const out = await requests.payForRequest(CUSTOMER, { requestId: String((made.result as { id: string }).id) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.NOT_AGREED);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('refuses when the kitchen was suspended after the agreement', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 5000);
    await Kitchen.updateOne({ _id: kitchenA }, { suspended: true });

    const out = await requests.payForRequest(CUSTOMER, { requestId });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.NO_KITCHEN);
    expect(await Order.countDocuments()).toBe(0);
    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
  });

  it('refuses when the kitchen lost its approval after the agreement', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 5000);
    await Kitchen.updateOne({ _id: kitchenA }, { kycStatus: 'rejected' });
    const out = await requests.payForRequest(CUSTOMER, { requestId });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(ERR.NO_KITCHEN);
  });

  it('refuses a second payment once ordered', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 5000);
    expect((await requests.payForRequest(CUSTOMER, { requestId })).ok).toBe(true);

    const again = await requests.payForRequest(CUSTOMER, { requestId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe(ERR.ALREADY_SETTLED);
    expect(await Order.countDocuments({ kind: 'request' })).toBe(1);
    expect(await balanceFor('customer', CUSTOMER)).toBe(3200);
  });

  it("refuses somebody else's request", async () => {
    const { requestId } = await agreed();
    await fund(OTHER, 5000);
    const out = await requests.payForRequest(OTHER, { requestId });
    expect(out.ok).toBe(false);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('race: two simultaneous pays of one agreed request make exactly one order', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 5000);

    const results = await Promise.all([
      requests.payForRequest(CUSTOMER, { requestId }),
      requests.payForRequest(CUSTOMER, { requestId }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await Order.countDocuments({ kind: 'request' })).toBe(1);
    expect(await balanceFor('customer', CUSTOMER)).toBe(3200);
    expect(await drift()).toBe(0);
  });

  it('race: two requests on a balance that covers one — exactly one succeeds', async () => {
    const first = await agreed(CUSTOMER, kitchenA, 1800);
    const second = await agreed(CUSTOMER, kitchenB, 1800);
    await fund(CUSTOMER, 2000);

    const results = await Promise.all([
      requests.payForRequest(CUSTOMER, { requestId: first.requestId }),
      requests.payForRequest(CUSTOMER, { requestId: second.requestId }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const lost = results.find((r) => !r.ok);
    expect(lost && !lost.ok && lost.error).toBe(ERR.LOW_BALANCE);
    expect(await Order.countDocuments({ kind: 'request' })).toBe(1);
    expect(await balanceFor('customer', CUSTOMER)).toBe(200);
    expect(await balanceFor('customer', CUSTOMER)).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ *
 * the HTTP route
 * ------------------------------------------------------------------ */

async function signIn(phone: string) {
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
  return out.token as string;
}

describe('POST /requests/:id/pay', () => {
  it('reads the flat body the app sends', async () => {
    const token = await signIn(CUSTOMER);
    const { requestId } = await agreed(CUSTOMER.toLowerCase());
    await fund(CUSTOMER.toLowerCase(), 3000);

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/requests/${requestId}/pay`,
      headers: auth(token),
      payload: { name: 'Flat Name', phone: '+8801999999999', address: { area: 'Gulshan', detail: 'Road 1' } },
    });
    expect(res.statusCode).toBe(201);
    const order = await Order.findOne({ kind: 'request' }).lean();
    expect(order?.customerName).toBe('Flat Name');
    expect(order?.phone).toBe('+8801999999999');
    expect((order?.address as { area?: string })?.area).toBe('Gulshan');
  });

  it('still reads the nested { customer } shape', async () => {
    const token = await signIn(CUSTOMER);
    const { requestId } = await agreed(CUSTOMER.toLowerCase());
    await fund(CUSTOMER.toLowerCase(), 3000);

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/requests/${requestId}/pay`,
      headers: auth(token),
      payload: { customer: { name: 'Nested', phone: '+8801888888888', address: { area: 'Banani' } } },
    });
    expect(res.statusCode).toBe(201);
    const order = await Order.findOne({ kind: 'request' }).lean();
    expect(order?.customerName).toBe('Nested');
    expect((order?.address as { area?: string })?.area).toBe('Banani');
  });

  it('answers a low balance with 400, the code and { short, balance }', async () => {
    const token = await signIn(CUSTOMER);
    const { requestId } = await agreed(CUSTOMER.toLowerCase());
    await fund(CUSTOMER.toLowerCase(), 300);

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/requests/${requestId}/pay`,
      headers: auth(token),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe('wallet-low-balance');
    expect(json(res).detail).toEqual({ short: 1500, balance: 300 });
    expect(await Order.countDocuments()).toBe(0);
  });

  it('a body cannot pick an amount, kind or payment method', async () => {
    const token = await signIn(CUSTOMER);
    const { requestId } = await agreed(CUSTOMER.toLowerCase());
    await fund(CUSTOMER.toLowerCase(), 3000);

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/requests/${requestId}/pay`,
      headers: auth(token),
      payload: { amount: 1, payment: 'cod', kind: 'cod', method: 'cash' },
    });
    expect(res.statusCode).toBe(201);
    const order = await Order.findOne({}).lean();
    expect(order?.kind).toBe('request');
    expect(order?.payment).toBe('held');
    expect(order?.amount).toBe(1800);
  });

  it('no sync path can create a request order', async () => {
    const token = await signIn(OTHER);
    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/orders',
      headers: auth(token),
      payload: {
        orders: [{ code: 'RB-AAAAAA', kind: 'request', chefId: kitchenA, items: [], payment: 'cod' }],
      },
    });
    expect(json(res).results[0].ok).toBe(false);
    expect(await Order.countDocuments()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * unpaid agreements expire
 * ------------------------------------------------------------------ */

describe('unpaid agreements', () => {
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  it('records when the price was agreed', async () => {
    const { offerId } = await agreed();
    expect((await Offer.findById(offerId).lean())?.agreedAt).toBeTruthy();
  });

  it('exposes agreedAt and payByAt while agreed, and the window in /config', async () => {
    const { requestId } = await agreed();
    const token = await signIn(CUSTOMER);
    const res = await app.inject({
      method: 'GET',
      url: `/api/app/v1/requests/${requestId}`,
      headers: auth(token),
    });
    const body = json(res);
    const request = body.request ?? body;
    expect(request.agreedAt).toBeTruthy();
    expect(new Date(request.payByAt).getTime() - new Date(request.agreedAt).getTime()).toBe(
      DEFAULT_SETTINGS.requestPayWindowHours * 3_600_000,
    );
    const config = json(await app.inject({ method: 'GET', url: '/api/app/v1/config' }));
    expect(config.requests.payWindowHours).toBe(DEFAULT_SETTINGS.requestPayWindowHours);
  });

  it('leaves a fresh agreement alone', async () => {
    const { requestId, offerId } = await agreed();
    await Offer.updateOne({ _id: offerId }, { agreedAt: ago(23) });
    const out = await requests.expireUnpaidAgreements();
    expect(out.ok && out.result.reopened).toBe(0);
    expect((await Request.findById(requestId).lean())?.status).toBe('agreed');
  });

  it('reopens an old one, moves no money, and is idempotent', async () => {
    const { requestId, offerId } = await agreed();
    await fund(CUSTOMER, 5000);
    await Offer.updateOne({ _id: offerId }, { agreedAt: ago(25) });

    const first = await requests.expireUnpaidAgreements();
    expect(first.ok && first.result.reopened).toBe(1);

    const request = await Request.findById(requestId).lean();
    expect(request?.status).toBe('open');
    expect(request?.selectedOfferId).toBeNull();
    const offer = await Offer.findById(offerId).lean();
    expect(offer?.status).toBe('priced');
    expect(offer?.agreedPrice).toBeNull();

    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Notification.countDocuments({ kind: 'agreement-expired' })).toBe(2);

    const second = await requests.expireUnpaidAgreements();
    expect(second.ok && second.result.reopened).toBe(0);
    expect(await Notification.countDocuments({ kind: 'agreement-expired' })).toBe(2);
  });

  it('lets the customer pick another cook afterwards, and the same one again', async () => {
    const made = await requests.createRequest(CUSTOMER, {
      request: { title: 'Cake', budget: 2000, quantity: 1 },
      eligible: [kitchenA, kitchenB],
    } as never);
    if (!made.ok) throw new Error('create');
    const requestId = String((made.result as { id: string }).id);
    await requests.submitOffer({ kitchenId: kitchenA, name: 'A' }, { requestId, price: 1800 });
    await requests.submitOffer({ kitchenId: kitchenB, name: 'B' }, { requestId, price: 1500 });
    const offerA = await requests.offerForCook(requestId, kitchenA);
    const offerB = await requests.offerForCook(requestId, kitchenB);
    const offerId = String((offerA as { id: string }).id);
    await requests.selectOffer(CUSTOMER, { requestId, offerId });
    await requests.acceptPrice({ side: 'customer', customerKey: CUSTOMER } as never, offerId);
    await Offer.updateOne({ _id: offerId }, { agreedAt: ago(30) });
    await requests.expireUnpaidAgreements();

    const again = await requests.selectOffer(CUSTOMER, { requestId, offerId: String((offerB as { id: string }).id) });
    expect(again.ok).toBe(true);
  });

  it('can be agreed and paid again after reopening', async () => {
    const { requestId, offerId } = await agreed();
    await Offer.updateOne({ _id: offerId }, { agreedAt: ago(30) });
    await requests.expireUnpaidAgreements();

    expect((await requests.selectOffer(CUSTOMER, { requestId, offerId })).ok).toBe(true);
    expect((await requests.acceptPrice({ side: 'customer', customerKey: CUSTOMER } as never, offerId)).ok).toBe(true);
    await fund(CUSTOMER, 5000);
    expect((await requests.payForRequest(CUSTOMER, { requestId })).ok).toBe(true);
  });

  it('never touches a paid request', async () => {
    const { requestId } = await agreed();
    await fund(CUSTOMER, 5000);
    await requests.payForRequest(CUSTOMER, { requestId });
    await Offer.updateMany({}, { agreedAt: ago(100) });
    const out = await requests.expireUnpaidAgreements();
    expect(out.ok && out.result.reopened).toBe(0);
    expect((await Request.findById(requestId).lean())?.status).toBe('ordered');
  });

  it('the cron route needs the service token', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/internal/requests/sweep' });
    expect(bad.statusCode).toBe(401);

    const { offerId } = await agreed();
    await Offer.updateOne({ _id: offerId }, { agreedAt: ago(30) });
    const good = await app.inject({
      method: 'POST',
      url: '/api/internal/requests/sweep',
      headers: { 'x-service-token': process.env.BACKEND_SERVICE_TOKEN as string },
    });
    expect(good.statusCode).toBe(200);
    expect(json(good).reopened).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * after payment: cancel, rail, release, review
 * ------------------------------------------------------------------ */

async function paidOrder(price = 1800) {
  const { requestId } = await agreed(CUSTOMER, kitchenA, price);
  await fund(CUSTOMER, 5000);
  const paid = await requests.payForRequest(CUSTOMER, { requestId });
  if (!paid.ok) throw new Error(paid.error);
  return { requestId, orderId: paid.result.id };
}

describe('cancelling a paid request order', () => {
  it('cook cancel via HTTP refunds the wallet, cancels the request, records the reason', async () => {
    const { requestId, orderId } = await paidOrder();
    expect(await balanceFor('customer', CUSTOMER)).toBe(3200);

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/orders/${orderId}/cancel`,
      headers: auth(cookToken),
      payload: { reason: 'Out of cocoa' },
    });
    expect(res.statusCode).toBe(200);

    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
    expect((await Request.findById(requestId).lean())?.status).toBe('cancelled');
    const order = await Order.findById(orderId).lean();
    expect(order?.status).toBe('cancelled');
    expect(order?.cancelReason).toBe('Out of cocoa');
    expect(order?.payment).not.toBe('held');
    expect(await Notification.countDocuments({ kind: 'order-cancelled', audience: 'customer' })).toBe(1);
    expect(await drift()).toBe(0);
    const note = await Notification.findOne({ kind: 'order-cancelled', audience: 'customer' }).lean();
    expect(String(note?.orderId)).toBe(orderId);
    expect(String(note?.requestId)).toBe(requestId);
  });

  it('customer may cancel before cooking, and a second cancel is refused without a second refund', async () => {
    const { requestId, orderId } = await paidOrder();
    const first = await cancelOrder({ orderId, by: 'customer', reason: 'Changed my mind' });
    expect(first.ok).toBe(true);
    expect((await Request.findById(requestId).lean())?.status).toBe('cancelled');

    const second = await cancelOrder({ orderId, by: 'customer', reason: 'again' });
    expect(second.ok).toBe(false);
    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
  });

  it('customer cannot cancel once cooking has started; admin can', async () => {
    const { requestId, orderId } = await paidOrder();
    await advanceOrder({ orderId, kitchenId: kitchenA });

    const mine = await cancelOrder({ orderId, by: 'customer', reason: 'x' });
    expect(mine.ok).toBe(false);

    const admin = await cancelOrder({ orderId, by: 'admin', reason: 'ops' });
    expect(admin.ok).toBe(true);
    expect((await Request.findById(requestId).lean())?.status).toBe('cancelled');
    expect(await balanceFor('customer', CUSTOMER)).toBe(5000);
  });
});

describe('the order rail for a request order', () => {
  it('tells the customer at each step, and releases the cook price less commissionRequest', async () => {
    const { orderId } = await paidOrder(1800);

    for (const step of ['preparing', 'ready', 'delivering', 'delivered']) {
      const out = await advanceOrder({ orderId, kitchenId: kitchenA });
      expect(out.ok && out.result.status).toBe(step);
      expect(
        await Notification.countDocuments({ kind: `order-${step}`, audience: 'customer' }),
      ).toBe(1);
    }

    expect((await confirmReceived({ orderId, customerKey: CUSTOMER })).ok).toBe(true);

    const released = await tx((session) => releaseEscrow(session, orderId, { note: 'test' }));
    expect(released.ok).toBe(true);
    // 10% commission on 1800.
    expect(released.ok && released.result.cook).toBe(1620);
    expect(released.ok && released.result.platform).toBe(180);
    expect(await balanceFor('cook', kitchenA)).toBe(1620);
    expect(await drift()).toBe(0);
  });

  it('the customer can review the cook after it completes, once', async () => {
    const { orderId } = await paidOrder();

    const early = await leaveReview({ orderId, customerKey: CUSTOMER, rating: 5 });
    expect(early.ok).toBe(false);

    for (let i = 0; i < 4; i += 1) await advanceOrder({ orderId, kitchenId: kitchenA });
    await confirmReceived({ orderId, customerKey: CUSTOMER });

    const res = await app.inject({
      method: 'POST',
      url: `/api/app/v1/orders/${orderId}/review`,
      headers: auth(await signIn(CUSTOMER)),
      payload: { rating: 5, text: 'Lovely cake' },
    });
    expect(res.statusCode).toBe(200);
    expect(json(res).reviewCount).toBe(1);

    const listed = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/orders', headers: auth(await signIn(CUSTOMER)) }),
    );
    const mine = (listed.orders ?? listed).find((o: { id: string }) => o.id === orderId);
    expect(mine.reviewed).toBe(true);
    expect(mine.requestId).toBeTruthy();
    expect(mine.quantity).toBe(1);

    const again = await leaveReview({ orderId, customerKey: CUSTOMER, rating: 4 });
    expect(again.ok).toBe(false);
  });
});
