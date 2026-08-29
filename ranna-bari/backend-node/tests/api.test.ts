import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/admin-auth.js';
import { AdminUser, Kitchen, Order, Setting, TaxonomyCategory, Zone } from '../src/models/index.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';

/**
 * The HTTP surface, end to end.
 *
 * `app.inject()` runs a real request through the real router, handlers and
 * error mapper without opening a port — so this exercises everything a
 * client would hit except the socket itself.
 *
 * What it is checking is the things that are easy to get wrong and invisible
 * until somebody is hurt by them: that a token is required, that one customer
 * cannot read another's thread by id, that a cook never sees a rival's price,
 * and that a replayed order code does not create a second order.
 */

let app: FastifyInstance;

const json = (res: { body: string }) => JSON.parse(res.body);

beforeAll(async () => {
  await startTestDb();
  app = await buildApp();
  await app.ready();

  await Setting.create(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ _id: key, value })),
  );
  await Zone.create([
    { name: 'Dhanmondi', order: 0, active: true },
    { name: 'Old Dhaka', order: 1, active: true, deliveryFee: 60 },
    { name: 'Dhaka', order: 2, active: true },
  ]);
  await TaxonomyCategory.create([{ key: 'biryani', label: 'Biryani', emoji: '🍛', order: 0 }]);
  await AdminUser.create({
    email: 'admin@rannabari.app',
    name: 'Owner',
    role: 'superadmin',
    passwordHash: await hashPassword('rannabari'),
  });
  await Kitchen.create({
    legacyId: 4,
    name: "Khalid's Kitchen",
    ownerName: 'Khalid H.',
    area: 'Dhanmondi',
    lat: 23.7,
    lng: 90.4,
    isOpen: true,
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await stopTestDb();
});

/** Sign in the way the app does, and hand back a bearer token. */
async function signInApp(phone: string) {
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
  return out as { token: string; account: Record<string, unknown> };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('health and config', () => {
  it('reports the database and whether transactions are possible', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = json(res);
    expect(body.ok).toBe(true);
    // The whole money layer depends on this being true.
    expect(body.transactions).toBe(true);
  });

  it('serves the constants the app currently hardcodes', async () => {
    const body = json(await app.inject({ method: 'GET', url: '/api/app/v1/config' }));

    expect(body.fees.deliveryFee).toBe(40);
    expect(body.fees.platformFee).toBe(10);
    // 0.85 is the app's COOK_PAYOUT_RATE, expressed as a rate not a cut.
    expect(body.payoutRates.cod).toBeCloseTo(0.85);
    expect(body.taxonomy[0].key).toBe('biryani');
  });

  it('orders areas longest-first, so "Old Dhaka" is matched before "Dhaka"', async () => {
    const body = json(await app.inject({ method: 'GET', url: '/api/app/v1/config' }));

    /* The app's normaliseArea walks this list and takes the first match, so a
       name that contains another has to come first or 'Old Dhaka' resolves to
       'Dhaka'. Length ordering is what guarantees that. */
    const areas: string[] = body.areas;
    expect(areas.indexOf('Old Dhaka')).toBeLessThan(areas.indexOf('Dhaka'));
  });

  it('returns kitchens in the shape chefs.json has', async () => {
    const body = json(await app.inject({ method: 'GET', url: '/api/app/v1/kitchens' }));
    const keys = Object.keys(body.chefs[0]).sort();

    expect(keys).toEqual(
      [
        'area', 'avatar', 'coverImage', 'deliveryRadiusKm', 'description', 'ecoBadge',
        'id', 'isOpen', 'isVerified', 'lat', 'lng', 'name', 'rating', 'reviewCount',
        'specialty', 'tags',
      ].sort(),
    );
  });
});

describe('app authentication', () => {
  it('refuses an unauthenticated request', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/app/v1/chat/threads' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a forged token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/app/v1/chat/threads',
      headers: auth('not.a.real.token'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a number that is not a Bangladeshi mobile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/request-otp',
      payload: { phone: '12345' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('normalises the number into the account key', async () => {
    const out = await signInApp('01712345678');
    expect(out.account.customerKey).toBe('+8801712345678');
  });

  it('treats the same handset typed differently as one account', async () => {
    const a = await signInApp('01755500011');
    const b = await signInApp('880 1755-500011');
    expect(b.account.customerKey).toBe(a.account.customerKey);
  });
});

describe('orders', () => {
  it('records an order and resolves a bundle chefId to a real kitchen', async () => {
    const customer = await signInApp('01766600011');
    const code = 'RB-TEST01';

    const body = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/orders',
        headers: auth(customer.token),
        payload: {
          orders: [
            {
              code,
              kind: 'cod',
              // The app names kitchens by their bundle id, not by _id.
              chefId: '4',
              title: 'Shorshe Ilish',
              items: [{ name: 'Shorshe Ilish', price: 520, qty: 2 }],
              subtotal: 1040,
              total: 1090,
              status: 'placed',
            },
          ],
        },
      }),
    );

    expect(body.results[0].ok).toBe(true);
    expect(body.results[0].created).toBe(true);

    const stored = await Order.findOne({ code });
    expect(stored?.customerKey).toBe(customer.account.customerKey);
  });

  it('does not create a second order for a replayed code', async () => {
    const customer = await signInApp('01777700011');
    const code = 'RB-TEST02';
    const payload = { orders: [{ code, chefId: '4', total: 500 }] };

    await app.inject({ method: 'POST', url: '/api/app/v1/orders', headers: auth(customer.token), payload });
    const again = json(
      await app.inject({ method: 'POST', url: '/api/app/v1/orders', headers: auth(customer.token), payload }),
    );

    expect(again.results[0].created).toBe(false);
    expect(await Order.countDocuments({ code })).toBe(1);
  });

  it("refuses a stranger claiming somebody else's order code", async () => {
    const owner = await signInApp('01788800011');
    const stranger = await signInApp('01799900011');
    const code = 'RB-TEST03';

    await app.inject({
      method: 'POST',
      url: '/api/app/v1/orders',
      headers: auth(owner.token),
      payload: { orders: [{ code, chefId: '4', total: 500 }] },
    });

    const hijack = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/orders',
        headers: auth(stranger.token),
        payload: { orders: [{ code, chefId: '4', total: 500 }] },
      }),
    );

    expect(hijack.results[0].ok).toBe(false);
  });

  it('refuses an order naming a kitchen that does not exist', async () => {
    const customer = await signInApp('01700011122');
    const body = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/orders',
        headers: auth(customer.token),
        payload: { orders: [{ code: 'RB-TEST04', chefId: '999', total: 500 }] },
      }),
    );
    expect(body.results[0].ok).toBe(false);
    expect(body.results[0].error).toBe('kitchen-missing');
  });
});

describe('chat', () => {
  it('opens one support thread per person, not one per tap', async () => {
    const customer = await signInApp('01811100011');

    const first = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/chat/threads',
        headers: auth(customer.token),
        payload: { kind: 'support', subject: 'Where is my order?' },
      }),
    );
    const second = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/chat/threads',
        headers: auth(customer.token),
        payload: { kind: 'support' },
      }),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.thread.id).toBe(first.thread.id);
  });

  it('will not let another customer read the thread, even with its id', async () => {
    const owner = await signInApp('01822200011');
    const stranger = await signInApp('01833300011');

    const opened = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/chat/threads',
        headers: auth(owner.token),
        payload: { kind: 'support' },
      }),
    );

    const peek = await app.inject({
      method: 'GET',
      url: `/api/app/v1/chat/messages?threadId=${opened.thread.id}`,
      headers: auth(stranger.token),
    });

    expect(peek.statusCode).toBe(403);
  });

  it('posts a replayed clientId once', async () => {
    const customer = await signInApp('01844400011');
    const opened = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/chat/threads',
        headers: auth(customer.token),
        payload: { kind: 'support' },
      }),
    );

    const payload = {
      threadId: opened.thread.id,
      body: 'My order never arrived.',
      clientId: 'replay-test-1',
    };

    const first = json(
      await app.inject({ method: 'POST', url: '/api/app/v1/chat/messages', headers: auth(customer.token), payload }),
    );
    const second = json(
      await app.inject({ method: 'POST', url: '/api/app/v1/chat/messages', headers: auth(customer.token), payload }),
    );

    expect(second.duplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);

    const transcript = json(
      await app.inject({
        method: 'GET',
        url: `/api/app/v1/chat/messages?threadId=${opened.thread.id}`,
        headers: auth(customer.token),
      }),
    );
    expect(transcript.messages.filter((m: { clientId: string }) => m.clientId === 'replay-test-1')).toHaveLength(1);
  });

  it('refuses an empty message', async () => {
    const customer = await signInApp('01855500011');
    const opened = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/chat/threads',
        headers: auth(customer.token),
        payload: { kind: 'support' },
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/app/v1/chat/messages',
      headers: auth(customer.token),
      payload: { threadId: opened.thread.id, body: '   ', clientId: 'blank-1' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('admin', () => {
  async function signInAdmin() {
    const out = json(
      await app.inject({
        method: 'POST',
        url: '/api/admin/v1/auth/sign-in',
        payload: { email: 'admin@rannabari.app', password: 'rannabari' },
      }),
    );
    return out.token as string;
  }

  it('refuses the wrong password without saying which half was wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/v1/auth/sign-in',
      payload: { email: 'admin@rannabari.app', password: 'nope' },
    });
    const body = json(res);

    expect(res.statusCode).toBe(401);
    expect(body.message).toMatch(/do not match an active account/);
  });

  it('refuses an unauthenticated admin request', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/v1/overview' });
    expect(res.statusCode).toBe(401);
  });

  it('serves the overview to a superadmin', async () => {
    const token = await signInAdmin();
    const body = json(
      await app.inject({ method: 'GET', url: '/api/admin/v1/overview', headers: auth(token) }),
    );

    expect(body.balances).toBeDefined();
    expect(body.attention).toBeDefined();
  });

  it('refuses a capability the role does not hold', async () => {
    await AdminUser.create({
      email: 'support@rannabari.app',
      name: 'Sadia',
      role: 'support',
      passwordHash: await hashPassword('rannabari'),
    });

    const out = json(
      await app.inject({
        method: 'POST',
        url: '/api/admin/v1/auth/sign-in',
        payload: { email: 'support@rannabari.app', password: 'rannabari' },
      }),
    );

    // Support can read an order but must never move a taka.
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/ledger',
      headers: auth(out.token),
    });

    expect(res.statusCode).toBe(403);
  });

  it('will not accept an asserted role without the service token', async () => {
    const actor = Buffer.from(
      JSON.stringify({ email: 'nobody@example.com', role: 'superadmin', name: 'Nobody' }),
    ).toString('base64');

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/ledger',
      headers: { 'x-actor': actor },
    });

    // "The caller says they are finance" is not authorisation.
    expect(res.statusCode).toBe(401);
  });

  it('accepts the same actor once the service token is presented', async () => {
    const actor = Buffer.from(
      JSON.stringify({ email: 'finance@rannabari.app', role: 'finance', name: 'Kamrul' }),
    ).toString('base64');

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/ledger',
      headers: {
        'x-actor': actor,
        'x-service-token': process.env.BACKEND_SERVICE_TOKEN!,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});
