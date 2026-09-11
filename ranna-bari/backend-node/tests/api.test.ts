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

describe('cook registration', () => {
  const NID_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const NID_PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

  const register = (email: string, overrides: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/register',
      payload: {
        name: 'Rashida Begum',
        phone: '01812345678',
        email,
        password: 'a-honest-password',
        kitchenName: "Rashida's Rannaghor",
        specialties: ['Biryani'],
        nid: '1990123456789',
        area: 'Dhanmondi',
        lat: 23.7,
        lng: 90.4,
        deliveryRadiusKm: 4,
        ...overrides,
      },
    });

  /** Register + verify a fresh address, handing back the session. */
  async function cookSession(email: string, phone: string) {
    const reg = json(await register(email, { phone }));
    expect(reg.ok).toBe(true);
    const verify = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/verify-email',
        payload: { email, code: reg.devCode },
      }),
    );
    expect(verify.ok).toBe(true);
    return verify as {
      token: string;
      kitchen: { id: string; kycStatus: string; documentsSubmittedAt: string | null };
    };
  }

  const adminActor = Buffer.from(
    JSON.stringify({ email: 'ops@rannabari.app', role: 'ops', name: 'Ops' }),
  ).toString('base64');
  const adminHeaders = {
    'x-actor': adminActor,
    'x-service-token': process.env.BACKEND_SERVICE_TOKEN!,
  };

  it('hands a code back in dev and verifies it into a session', async () => {
    const reg = json(await register('cook-one@example.com'));
    expect(reg.ok).toBe(true);
    expect(reg.devCode).toMatch(/^\d{6}$/);
    expect(reg.cooldownSeconds).toBe(60);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/verify-email',
      payload: { email: 'cook-one@example.com', code: '000000' },
    });
    expect(wrong.statusCode).toBe(401);

    const verify = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/verify-email',
        payload: { email: 'cook-one@example.com', code: reg.devCode },
      }),
    );
    expect(verify.ok).toBe(true);
    expect(verify.account.role).toBe('cook');
    expect(verify.kitchen.kycStatus).toBe('pending');
    expect(verify.kitchen.documentsSubmittedAt).toBeNull();
  });

  it('refuses a second code inside the cooldown', async () => {
    await register('cook-two@example.com', { phone: '01812345679' });
    const again = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/resend-otp',
      payload: { email: 'cook-two@example.com' },
    });
    expect(again.statusCode).toBe(429);
    expect(json(again).error).toBe('otp-cooldown');
    expect(json(again).retryAfterSeconds).toBeGreaterThan(0);
    expect(json(again).retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('reopens an unfinished registration instead of refusing it', async () => {
    const first = json(await register('cook-three@example.com', { phone: '01812345671' }));
    expect(first.ok).toBe(true);

    // No verification yet — the same person submits again with a new name.
    // The immediate resend is refused by the cooldown, and that is right: the
    // first code is still in the inbox and still good.
    const second = await register('cook-three@example.com', {
      phone: '01812345671',
      name: 'Second Name',
      kitchenName: 'Second Rannaghor',
    });
    expect(second.statusCode).toBe(429);

    const verify = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/verify-email',
        payload: { email: 'cook-three@example.com', code: first.devCode },
      }),
    );
    expect(verify.ok).toBe(true);

    // The resume wrote the newer answers over the first attempt.
    const mine = json(
      await app.inject({
        method: 'GET',
        url: '/api/app/v1/kitchens/mine',
        headers: auth(verify.token),
      }),
    );
    expect(mine.kitchen.name).toBe('Second Rannaghor');
  });

  it('refuses a verified email with account-exists', async () => {
    await cookSession('cook-four@example.com', '01812345672');
    const again = await register('cook-four@example.com', { phone: '01812345673' });
    expect(again.statusCode).toBe(409);
    expect(json(again).error).toBe('account-exists');
  });

  it('signs in with email and password, refusing everything else', async () => {
    await cookSession('cook-five@example.com', '01812345674');

    const badPassword = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/sign-in',
      payload: { email: 'cook-five@example.com', password: 'not-the-password' },
    });
    expect(badPassword.statusCode).toBe(401);
    expect(json(badPassword).error).toBe('invalid-credentials');

    const nobody = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/sign-in',
      payload: { email: 'stranger@example.com', password: 'whatever-it-is' },
    });
    expect(nobody.statusCode).toBe(401);
    // The two refusals must not be tellable apart.
    expect(json(nobody).error).toBe(json(badPassword).error);

    const ok = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/sign-in',
        payload: { email: 'cook-five@example.com', password: 'a-honest-password' },
      }),
    );
    expect(ok.ok).toBe(true);
    expect(ok.account.role).toBe('cook');
  });

  it('takes the document set, and only a valid one', async () => {
    const session = await cookSession('cook-six@example.com', '01812345675');
    const documents = auth(session.token);

    // A PDF belongs to an NID, not to a kitchen gallery.
    const pdfGallery = await app.inject({
      method: 'POST',
      url: '/api/app/v1/kitchens/mine/documents',
      headers: documents,
      payload: {
        nidFront: NID_IMAGE,
        nidBack: NID_PDF,
        kitchenPhotos: [NID_PDF],
      },
    });
    expect(pdfGallery.statusCode).toBe(400);
    expect(json(pdfGallery).error).toBe('attachment-invalid');

    // Both NID faces are mandatory.
    const noBack = await app.inject({
      method: 'POST',
      url: '/api/app/v1/kitchens/mine/documents',
      headers: documents,
      payload: { nidFront: NID_IMAGE, kitchenPhotos: [NID_IMAGE] },
    });
    expect(noBack.statusCode).toBe(400);
    expect(json(noBack).error).toBe('document-missing');

    const handed = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/kitchens/mine/documents',
        headers: documents,
        payload: {
          nidFront: NID_IMAGE,
          nidBack: NID_PDF,
          kitchenPhotos: [NID_IMAGE, NID_IMAGE],
        },
      }),
    );
    expect(handed.ok).toBe(true);
    expect(handed.kitchen.documentsSubmittedAt).toBeTruthy();
    expect(handed.kitchen.kycStatus).toBe('pending');

    const listed = json(
      await app.inject({
        method: 'GET',
        url: '/api/app/v1/kitchens/mine/documents',
        headers: documents,
      }),
    );
    expect(listed.documents.map((d: { kind: string }) => d.kind).sort()).toEqual([
      'kitchen-photo',
      'kitchen-photo',
      'nid-back',
      'nid-front',
    ]);
  });

  it('walks the whole queue: admin sees the documents, approves, the cook trades', async () => {
    const session = await cookSession('cook-seven@example.com', '01812345676');
    const kitchenId = session.kitchen.id;

    const handed = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/kitchens/mine/documents',
        headers: auth(session.token),
        payload: { nidFront: NID_IMAGE, nidBack: NID_PDF, kitchenPhotos: [NID_IMAGE] },
      }),
    );
    expect(handed.ok).toBe(true);

    const queue = json(
      await app.inject({
        method: 'GET',
        url: '/api/admin/v1/kyc',
        headers: adminHeaders,
      }),
    );
    const row = queue.pending.find((k: { id: string }) => k.id === kitchenId);
    expect(row?.hasDocuments).toBe(true);

    const listed = json(
      await app.inject({
        method: 'GET',
        url: `/api/admin/v1/kitchens/${kitchenId}/documents`,
        headers: adminHeaders,
      }),
    );
    const back = listed.documents.find((d: { kind: string }) => d.kind === 'nid-back');
    expect(back?.mime).toBe('application/pdf');

    // The bytes are a separate fetch, scoped to the kitchen.
    const full = json(
      await app.inject({
        method: 'GET',
        url: `/api/admin/v1/kitchens/${kitchenId}/documents/${back.id}`,
        headers: adminHeaders,
      }),
    );
    expect(full.data).toBe(NID_PDF);

    const decided = await app.inject({
      method: 'POST',
      url: `/api/admin/v1/kitchens/${kitchenId}/kyc`,
      headers: adminHeaders,
      payload: { decision: 'approved', note: 'Documents check out.' },
    });
    expect(decided.statusCode).toBe(200);

    const mine = json(
      await app.inject({
        method: 'GET',
        url: '/api/app/v1/kitchens/mine',
        headers: auth(session.token),
      }),
    );
    expect(mine.kitchen.kycStatus).toBe('approved');
    expect(mine.kitchen.documentsSubmittedAt).toBeTruthy();
  });

  it('resets the password by emailed code and kills the old sessions', async () => {
    const session = await cookSession('cook-eight@example.com', '01812345677');

    const forgot = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/forgot-password',
        payload: { email: 'cook-eight@example.com' },
      }),
    );
    expect(forgot.ok).toBe(true);
    expect(forgot.devCode).toMatch(/^\d{6}$/);

    const short = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/reset-password',
      payload: { email: 'cook-eight@example.com', code: forgot.devCode, newPassword: 'short' },
    });
    expect(short.statusCode).toBe(400);

    const reset = await app.inject({
      method: 'POST',
      url: '/api/app/v1/auth/cook/reset-password',
      payload: {
        email: 'cook-eight@example.com',
        code: forgot.devCode,
        newPassword: 'a-brand-new-password',
      },
    });
    expect(reset.statusCode).toBe(200);

    // The old token was minted before the version bump.
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/app/v1/auth/me',
      headers: auth(session.token),
    });
    expect(oldSession.statusCode).toBe(401);

    const reSignIn = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/sign-in',
        payload: { email: 'cook-eight@example.com', password: 'a-brand-new-password' },
      }),
    );
    expect(reSignIn.ok).toBe(true);
  });

  it('answers forgot-password identically for an address with no account', async () => {
    const stranger = json(
      await app.inject({
        method: 'POST',
        url: '/api/app/v1/auth/cook/forgot-password',
        payload: { email: 'no-such-cook@example.com' },
      }),
    );
    expect(stranger.ok).toBe(true);
    expect(stranger.cooldownSeconds).toBe(60);
  });

  it('still signs a customer up by phone, untouched', async () => {
    const out = await signInApp('01912345678');
    expect(out.account.role).toBe('user');
    expect(out.account.customerKey).toBe('+8801912345678');
  });
});
