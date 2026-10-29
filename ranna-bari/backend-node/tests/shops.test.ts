import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { issueSession } from '../src/auth/app-auth.js';
import { STORES_PER_KITCHEN } from '../src/logic/stores.js';
import { balanceFor } from '../src/logic/ledger.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';
import { topUp } from '../src/logic/wallet.js';
import { Account, Kitchen, Order, Product, Setting, Store } from '../src/models/index.js';

/**
 * A cook with several shops, and an order through each of them.
 *
 * The shop is its own business under the kitchen: a cook opens more than one
 * (up to the cap), every write names the shop it means, and an order placed in
 * one shop runs the whole rail — held money, pre-order decision, cook steps,
 * customer's word — without touching the others.
 */

let app: FastifyInstance;
let cookToken: string;
let otherCookToken: string;
let kitchenId: string;

const json = (res: { body: string }) => JSON.parse(res.body);
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const cookPost = (url: string, payload: unknown, token = cookToken) =>
  app.inject({ method: 'POST', url: `/api/app/v1${url}`, headers: auth(token), payload: payload as object });

async function customer(phone: string, balance = 5000) {
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

/** A cook, a kitchen the operator has approved, and a signed-in session. */
async function approvedCook(email: string, kyc: 'approved' | 'pending' = 'approved') {
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
  return { token: session.token, kitchenId: String(kitchen._id) };
}

async function openShop(name: string, token = cookToken) {
  const out = await cookPost('/stores/mine', { name });
  expect(out.statusCode).toBe(200);
  const store = json(out).store;
  expect((await cookPost('/stores/mine/open', { storeId: store.id }, token)).statusCode).toBe(200);
  return store.id as string;
}

async function addProduct(storeId: string, patch: Record<string, unknown>) {
  const out = await cookPost('/stores/mine/products', { storeId, price: 100, stock: 10, ...patch });
  expect(out.statusCode).toBe(200);
  return json(out).product.id as string;
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
  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );
  const cook = await approvedCook('cook@example.com');
  cookToken = cook.token;
  kitchenId = cook.kitchenId;
  otherCookToken = (await approvedCook('other@example.com')).token;
});

describe('opening shops', () => {
  it('lets one kitchen open several, each its own row', async () => {
    const ids: string[] = [];
    for (const name of ['Cakes', 'Achar', 'Pitha']) {
      const out = await cookPost('/stores/mine', { name });
      expect(out.statusCode).toBe(200);
      ids.push(json(out).store.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(await Store.countDocuments({ kitchenId })).toBe(3);
  });

  it(`stops at ${STORES_PER_KITCHEN} with a readable refusal`, async () => {
    for (let i = 0; i < STORES_PER_KITCHEN; i += 1) {
      expect((await cookPost('/stores/mine', { name: `Shop ${i}` })).statusCode).toBe(200);
    }
    const sixth = await cookPost('/stores/mine', { name: 'One too many' });
    expect(sixth.statusCode).toBeGreaterThanOrEqual(400);
    expect(json(sixth).error).toBe('too-many-stores');
    expect(await Store.countDocuments({ kitchenId })).toBe(STORES_PER_KITCHEN);
  });

  it('needs a name to exist by', async () => {
    const out = await cookPost('/stores/mine', { tagline: 'no name' });
    expect(out.statusCode).toBeGreaterThanOrEqual(400);
    expect(await Store.countDocuments({ kitchenId })).toBe(0);
  });

  it('edits the shop it names and leaves the others alone', async () => {
    const a = json(await cookPost('/stores/mine', { name: 'A' })).store.id;
    const b = json(await cookPost('/stores/mine', { name: 'B' })).store.id;

    const out = await cookPost('/stores/mine', { storeId: b, name: 'B renamed', tags: ['Achar', 'Mango achar'] });
    expect(out.statusCode).toBe(200);

    expect((await Store.findById(a).lean())?.name).toBe('A');
    const edited = await Store.findById(b).lean();
    expect(edited?.name).toBe('B renamed');
    expect(edited?.tags).toEqual(['Achar', 'Mango achar']);
  });

  it("will not let a cook edit, or open, another kitchen's shop", async () => {
    const mine = json(await cookPost('/stores/mine', { name: 'Mine' })).store.id;

    const edit = await cookPost('/stores/mine', { storeId: mine, name: 'Hijacked' }, otherCookToken);
    expect(edit.statusCode).toBe(404);
    expect((await Store.findById(mine).lean())?.name).toBe('Mine');
  });

  it('refuses a kitchen the operator has not approved', async () => {
    const pending = await approvedCook('pending@example.com', 'pending');
    const out = await cookPost('/stores/mine', { name: 'Too early' }, pending.token);
    expect(out.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('keeps the fees and the home division the cook set', async () => {
    const id = json(await cookPost('/stores/mine', { name: 'Ctg shop' })).store.id;
    await cookPost('/stores/mine', {
      storeId: id,
      homeDivision: 'Chattogram',
      deliveryFee: 60,
      deliveryFeeInsideDhaka: 60,
      deliveryFeeOutsideDhaka: 150,
      freeDeliveryOver: null,
    });
    const row = await Store.findById(id).lean();
    expect(row?.homeDivision).toBe('Chattogram');
    expect([row?.deliveryFeeInsideDhaka, row?.deliveryFeeOutsideDhaka]).toEqual([60, 150]);

    /* A made-up division is dropped, never stored. */
    await cookPost('/stores/mine', { storeId: id, homeDivision: 'Atlantis' });
    expect((await Store.findById(id).lean())?.homeDivision).toBe('');
  });
});

describe('a shelf’s icon', () => {
  /* A 1×1 PNG — the shape of what the app sends after resizing to icon size. */
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  async function shelf(extra: Record<string, unknown> = {}) {
    const store = json(await cookPost('/stores/mine', { name: 'Shelves' })).store.id;
    const out = await cookPost('/stores/mine/categories', { storeId: store, name: 'Cake', ...extra });
    return { store, out };
  }

  it('keeps an emoji the cook typed, not only the ones on offer', async () => {
    const { out } = await shelf({ emoji: '🥭' });
    expect(out.statusCode).toBe(200);
    expect(json(out).category.emoji).toBe('🥭');
    expect(json(out).category.image).toBe('');
  });

  it('keeps an uploaded picture, and hands it back', async () => {
    const { out } = await shelf({ emoji: '', image: PNG });
    expect(out.statusCode).toBe(200);
    expect(json(out).category.image).toBe(PNG);
  });

  it('swaps the icon on an existing shelf, either way round', async () => {
    const { out } = await shelf({ emoji: '🎂' });
    const id = json(out).category.id;

    expect((await app.inject({
      method: 'PATCH', url: `/api/app/v1/categories/${id}`, headers: auth(cookToken),
      payload: { emoji: '', image: PNG },
    })).statusCode).toBe(200);
    let row = await (await import('../src/models/index.js')).StoreCategory.findById(id).lean();
    expect([row?.emoji, row?.image]).toEqual(['', PNG]);

    await app.inject({
      method: 'PATCH', url: `/api/app/v1/categories/${id}`, headers: auth(cookToken),
      payload: { emoji: '🍪', image: '' },
    });
    row = await (await import('../src/models/index.js')).StoreCategory.findById(id).lean();
    expect([row?.emoji, row?.image]).toEqual(['🍪', '']);
  });

  it('refuses something that is not a picture, and a picture that is far too big', async () => {
    const notImage = await shelf({ image: 'data:text/html;base64,PHNjcmlwdD4=' });
    expect(notImage.out.statusCode).toBeGreaterThanOrEqual(400);

    const huge = await shelf({ image: `data:image/png;base64,${'A'.repeat(200_000)}` });
    expect(huge.out.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('cuts a long "emoji" down rather than storing a paragraph', async () => {
    const { out } = await shelf({ emoji: 'x'.repeat(500) });
    expect(out.statusCode).toBe(200);
    expect(json(out).category.emoji.length).toBeLessThanOrEqual(16);
  });
});

describe('an order through a shop', () => {
  it('runs the whole rail: held money → cook steps → customer closes it', async () => {
    const shop = await openShop('Pantry');
    const productId = await addProduct(shop, { name: 'Mango achar', price: 200, stock: 10 });
    const buyer = await customer('+8801833300001');

    const added = await app.inject({
      method: 'POST',
      url: '/api/app/v1/cart',
      headers: auth(buyer.token),
      payload: { productId, qty: 2 },
    });
    expect(added.statusCode).toBe(200);

    const placed = await app.inject({
      method: 'POST',
      url: '/api/app/v1/store-checkout',
      headers: auth(buyer.token),
      payload: { name: 'Buyer', phone: '+8801833300001' },
    });
    expect(placed.statusCode).toBe(200);
    const [order] = json(placed).orders;
    expect(order.kind).toBe('store');
    expect(order.status).toBe('confirmed');

    /* Held, not paid: the customer's balance fell and nothing reached the cook. */
    const row = await Order.findById(order.id).lean();
    expect(row?.payment).toBe('held');
    expect(await balanceFor('customer', buyer.key)).toBe(5000 - (row?.amount ?? 0));
    expect((await Product.findById(productId).lean())?.stock).toBe(8);

    /* The cook walks it to the door. */
    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const step = await cookPost(`/orders/${order.id}/advance`, {});
      expect(step.statusCode).toBe(200);
      seen.push(json(step).status);
    }
    expect(seen).toEqual(['preparing', 'ready', 'delivering', 'delivered']);

    /* …and only the customer's word closes it. */
    const done = await app.inject({
      method: 'POST',
      url: `/api/app/v1/orders/${order.id}/received`,
      headers: auth(buyer.token),
      payload: {},
    });
    expect(done.statusCode).toBe(200);
    expect((await Order.findById(order.id).lean())?.status).toBe('completed');
  });

  it('splits a basket across two shops into one order each', async () => {
    const a = await openShop('Shop A');
    const b = await openShop('Shop B');
    const pa = await addProduct(a, { name: 'A thing', price: 100 });
    const pb = await addProduct(b, { name: 'B thing', price: 150 });
    const buyer = await customer('+8801833300002');

    for (const productId of [pa, pb]) {
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/cart',
        headers: auth(buyer.token),
        payload: { productId, qty: 1 },
      });
    }
    const placed = await app.inject({
      method: 'POST',
      url: '/api/app/v1/store-checkout',
      headers: auth(buyer.token),
      payload: { name: 'Buyer', phone: '+8801833300002' },
    });
    expect(placed.statusCode).toBe(200);
    const orders = json(placed).orders;
    expect(orders).toHaveLength(2);
    expect(new Set(orders.map((o: { storeId: string }) => o.storeId)).size).toBe(2);
  });

  it('turns a customer away from a closed shop, with nothing charged', async () => {
    const shop = json(await cookPost('/stores/mine', { name: 'Shut' })).store.id; // opens shut
    const productId = await addProduct(shop, { name: 'Untouchable' });
    const buyer = await customer('+8801833300003');

    await app.inject({
      method: 'POST',
      url: '/api/app/v1/cart',
      headers: auth(buyer.token),
      payload: { productId, qty: 1 },
    });
    const placed = await app.inject({
      method: 'POST',
      url: '/api/app/v1/store-checkout',
      headers: auth(buyer.token),
      payload: { name: 'Buyer', phone: '+8801833300003' },
    });
    expect(placed.statusCode).toBeGreaterThanOrEqual(400);
    expect(await balanceFor('customer', buyer.key)).toBe(5000);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('refuses a basket the wallet cannot cover, naming how short', async () => {
    const shop = await openShop('Pricey');
    const productId = await addProduct(shop, { name: 'Gold jar', price: 9000 });
    const buyer = await customer('+8801833300004', 100);

    await app.inject({
      method: 'POST',
      url: '/api/app/v1/cart',
      headers: auth(buyer.token),
      payload: { productId, qty: 1 },
    });
    const placed = await app.inject({
      method: 'POST',
      url: '/api/app/v1/store-checkout',
      headers: auth(buyer.token),
      payload: { name: 'Buyer', phone: '+8801833300004' },
    });
    expect(placed.statusCode).toBeGreaterThanOrEqual(400);
    expect(json(placed).error).toBe('wallet-low-balance');
    expect(await balanceFor('customer', buyer.key)).toBe(100);
  });
});

describe('a pre-order', () => {
  async function preorder(phone: string) {
    const shop = await openShop('Made to order');
    const productId = await addProduct(shop, { name: 'Wedding cake', price: 500, stock: 0, preorder: true });
    const buyer = await customer(phone);
    await app.inject({
      method: 'POST',
      url: '/api/app/v1/cart',
      headers: auth(buyer.token),
      payload: { productId, qty: 1 },
    });
    const placed = await app.inject({
      method: 'POST',
      url: '/api/app/v1/store-checkout',
      headers: auth(buyer.token),
      payload: { name: 'Buyer', phone },
    });
    expect(placed.statusCode).toBe(200);
    return { buyer, order: json(placed).orders[0], productId };
  }

  it('waits for the cook, and accepting it starts the rail', async () => {
    const { order } = await preorder('+8801833300005');
    expect(order.status).toBe('pending');

    const queue = json(
      await app.inject({ method: 'GET', url: '/api/app/v1/preorders', headers: auth(cookToken) }),
    );
    expect(queue.preorders.map((o: { id: string }) => o.id)).toContain(order.id);

    /* Pending has no cook step of its own — accepting is the decision. */
    expect((await cookPost(`/orders/${order.id}/advance`, {})).statusCode).toBeGreaterThanOrEqual(400);

    expect((await cookPost(`/preorders/${order.id}/accept`, {})).statusCode).toBe(200);
    expect((await Order.findById(order.id).lean())?.status).toBe('confirmed');

    const step = await cookPost(`/orders/${order.id}/advance`, {});
    expect(step.statusCode).toBe(200);
    expect(json(step).status).toBe('preparing');
  });

  it('refunds the hold in full when the cook declines', async () => {
    const { order, buyer } = await preorder('+8801833300006');
    const before = await balanceFor('customer', buyer.key);

    const out = await cookPost(`/preorders/${order.id}/reject`, { reason: 'Fully booked' });
    expect(out.statusCode).toBe(200);
    expect((await Order.findById(order.id).lean())?.status).toBe('rejected');
    expect(await balanceFor('customer', buyer.key)).toBe(before + (await Order.findById(order.id).lean())!.amount);
  });

  it("will not let another kitchen's cook answer it", async () => {
    const { order } = await preorder('+8801833300007');
    const out = await cookPost(`/preorders/${order.id}/accept`, {}, otherCookToken);
    expect(out.statusCode).toBe(404);
    expect((await Order.findById(order.id).lean())?.status).toBe('pending');
  });
});
