import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { resetEnv } from '../src/config/env.js';
import { registerCook } from '../src/logic/cook-signup.js';
import { balanceFor } from '../src/logic/ledger.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';
import { topUp } from '../src/logic/wallet.js';
import { Account, Dish, Kitchen, Order, OtpChallenge, Setting } from '../src/models/index.js';

/**
 * Closed holes, kept closed.
 *
 * Each case here is an exploit that worked before: an OTP handed back in a
 * production response, a phone number typed into the cook form taking over the
 * customer who owns it, a wallet top-up with nothing behind it, and an order
 * whose price, kind and status the device chose.
 */

const VICTIM = '+8801711111111';
const BUYER = '+8801833333333';

let app: FastifyInstance;
let kitchenId: string;
let dishId: string;

const json = (res: { body: string }) => JSON.parse(res.body);
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Run `fn` as if the process were production, then put the environment back. */
async function inProduction<T>(fn: () => Promise<T>, allowDev = false): Promise<T> {
  const before = { env: process.env.NODE_ENV, flag: process.env.ALLOW_DEV_FLOWS };
  process.env.NODE_ENV = 'production';
  if (allowDev) process.env.ALLOW_DEV_FLOWS = 'true';
  else delete process.env.ALLOW_DEV_FLOWS;
  resetEnv();
  try {
    return await fn();
  } finally {
    process.env.NODE_ENV = before.env;
    if (before.flag === undefined) delete process.env.ALLOW_DEV_FLOWS;
    else process.env.ALLOW_DEV_FLOWS = before.flag;
    resetEnv();
  }
}

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
    customerKey: 'owner@example.com',
    role: 'cook',
    name: 'Owner',
    email: 'owner@example.com',
    emailVerifiedAt: new Date(),
  });
  const kitchen = await Kitchen.create({
    accountId: String(owner._id),
    name: 'Approved Kitchen',
    ownerName: 'Owner',
    area: 'Dhanmondi',
    isOpen: true,
    kycStatus: 'approved',
  });
  kitchenId = String(kitchen._id);
  dishId = String((await Dish.create({ kitchenId, name: 'Tehari', price: 200 }))._id);
});

describe('the phone OTP', () => {
  it('is handed back outside production, as it always was', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/request-otp',
      payload: { phone: VICTIM },
    });
    expect(json(res).devCode).toMatch(/^\d{6}$/);
  });

  it('never reaches a production response, and no challenge is minted', async () => {
    await inProduction(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/request-otp',
        payload: { phone: VICTIM },
      });
      expect(res.statusCode).toBe(400);
      expect(json(res).devCode).toBeUndefined();
      expect(res.body).not.toMatch(/\d{6}/);
    });
  });

  it('comes back in production only when ALLOW_DEV_FLOWS says so on purpose', async () => {
    await inProduction(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/request-otp',
        payload: { phone: VICTIM },
      });
      expect(json(res).devCode).toMatch(/^\d{6}$/);
    }, true);
  });
});

describe('guessing the code', () => {
  it('cannot be sped up by sending the guesses in parallel', async () => {
    await app.inject({ method: 'POST', url: '/api/app/v1/auth/request-otp', payload: { phone: VICTIM } });

    const replies = await Promise.all(
      Array.from({ length: 25 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/app/v1/auth/verify-otp',
          payload: { phone: VICTIM, code: '000000' },
        }),
      ),
    );
    expect(replies.every((r) => r.statusCode >= 400)).toBe(true);

    const challenge = await OtpChallenge.findOne({ phone: VICTIM }).lean();
    expect(challenge?.attempts).toBe(5);
  });
});

describe('signing out', () => {
  it('kills the token on the server, not just on the handset', async () => {
    const token = await signIn(BUYER);
    const me = () => app.inject({ method: 'GET', url: '/api/app/v1/auth/me', headers: auth(token) });

    expect((await me()).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/app/v1/auth/logout', headers: auth(token) });
    expect(out.statusCode).toBe(200);
    expect((await me()).statusCode).toBe(401);
  });

  it('is not an error to sign out something already dead', async () => {
    const out = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/logout',
      headers: auth('not-a-token'),
    });
    expect(out.statusCode).toBe(200);
  });
});

describe('the sign-in rate limit', () => {
  it('answers 429 once one email has been tried too often, whatever the address', async () => {
    process.env.RATE_LIMIT_TEST = '1';
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/app/v1/auth/cook/sign-in',
          payload: { email: 'victim@example.com', password: `wrong-password-${i}` },
        });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
    } finally {
      delete process.env.RATE_LIMIT_TEST;
    }
  });
});

describe('cook registration', () => {
  const form = (over: Record<string, unknown> = {}) => ({
    name: 'Attacker',
    phone: VICTIM,
    email: 'attacker@example.com',
    password: 'hunter2hunter2',
    kitchenName: 'Fake Kitchen',
    specialties: ['Traditional Heritage'],
    nid: '1234567890',
    ...over,
  });

  it('cannot take over a customer who signed in with that phone', async () => {
    await signIn(VICTIM);
    const before = await Account.findOne({ phone: VICTIM }).lean();
    expect(before?.role).toBe('user');

    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/register',
      payload: form(),
    });
    expect(res.statusCode).toBe(409);

    const after = await Account.findOne({ phone: VICTIM }).lean();
    expect(after?.role).toBe('user');
    expect(after?.email ?? null).toBe(before?.email ?? null);
    expect(after?.passwordHash ?? null).toBe(before?.passwordHash ?? null);
  });

  it('still lets a cook resume their own unfinished registration', async () => {
    /* The logic, not the route: a second POST would hit the email-code resend
       cooldown, which is a different guard with its own behaviour. */
    const input = {
      name: 'Cook',
      phone: '+8801944444444',
      email: 'cook@example.com',
      password: 'hunter2hunter2',
      kitchenName: 'First Name',
      specialties: ['Traditional Heritage'],
      nid: '1234567890',
    };
    expect((await registerCook(input)).ok).toBe(true);

    const again = await registerCook({ ...input, kitchenName: 'Renamed Kitchen' });
    expect(again.ok).toBe(true);
    expect(await Account.countDocuments({ email: 'cook@example.com' })).toBe(1);
    expect(await Kitchen.countDocuments({ name: 'Renamed Kitchen' })).toBe(1);
  });
});

describe('the wallet top-up', () => {
  it('prints no money in production', async () => {
    const token = await signIn(BUYER);
    await inProduction(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/app/v1/wallet/topup',
        headers: auth(token),
        payload: { amount: 1_000_000 },
      });
      expect(res.statusCode).toBe(403);
    });
    expect(await balanceFor('customer', BUYER.toLowerCase())).toBe(0);
  });
});

describe('POST /orders', () => {
  const place = async (token: string, over: Record<string, unknown> = {}) => {
    // New orders can only be paid from the wallet, so every placement is funded.
    await topUp(BUYER.toLowerCase(), 2000);
    return json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/orders',
        headers: auth(token),
        payload: {
          orders: [
            {
              code: `RB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
              kind: 'wallet',
              chefId: kitchenId,
              items: [{ id: dishId, name: 'Tehari', price: 200, qty: 2 }],
              ...over,
            },
          ],
        },
      }),
    ).results[0];
  };

  it('prices the order from the menu, whatever the device says', async () => {
    const token = await signIn(BUYER);
    const out = await place(token, {
      items: [{ id: dishId, name: 'Tehari', price: 1, qty: 2 }],
      subtotal: 2,
      total: 2,
      deliveryFee: 9999,
      platformFee: 9999,
    });
    expect(out.ok).toBe(true);

    const order = await Order.findOne({ code: out.code }).lean();
    expect(order?.subtotal).toBe(400);
    expect(order?.deliveryFee).toBe(DEFAULT_SETTINGS.deliveryFee);
    expect(order?.platformFee).toBe(DEFAULT_SETTINGS.platformFee);
    expect(order?.amount).toBe(400 + DEFAULT_SETTINGS.deliveryFee + DEFAULT_SETTINGS.platformFee);
  });

  it('refuses a line that is not a dish this kitchen sells', async () => {
    const token = await signIn(BUYER);
    const out = await place(token, { items: [{ id: 'not-a-dish', name: 'Gold', price: 50000, qty: 1 }] });
    expect(out.ok).toBe(false);
  });

  it('refuses the kinds that belong to other server paths', async () => {
    const token = await signIn(BUYER);
    for (const kind of ['store', 'meal', 'request']) {
      expect((await place(token, { kind })).ok).toBe(false);
    }
    expect(await Order.countDocuments()).toBe(0);
  });

  it('cannot open an order already delivered', async () => {
    const token = await signIn(BUYER);
    const out = await place(token, { status: 'delivered', history: [{ status: 'delivered', at: 'x' }] });
    expect(out.ok).toBe(true);
    const order = await Order.findOne({ code: out.code }).lean();
    // The wallet rail opens at 'confirmed'; the device's 'delivered' is ignored.
    expect(order?.status).toBe('confirmed');
    expect(order?.history).toHaveLength(1);
  });

  it('refuses an unapproved kitchen', async () => {
    await Kitchen.updateOne({ _id: kitchenId }, { kycStatus: 'pending' });
    const token = await signIn(BUYER);
    expect((await place(token)).ok).toBe(false);
  });

  it("refuses a cook ordering from their own kitchen", async () => {
    const owner = await Account.findOne({ email: 'owner@example.com' });
    await Account.updateOne({ _id: owner!._id }, { phone: '+8801955555555' });
    const token = await signIn('+8801955555555');
    expect((await place(token)).ok).toBe(false);
  });
});
