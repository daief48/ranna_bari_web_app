import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/admin-auth.js';
import { tx } from '../src/config/db.js';
import { post, releaseEscrow } from '../src/logic/ledger.js';
import {
  AdminUser,
  AuditLog,
  Dispute,
  Kitchen,
  KitchenDocument,
  LedgerEntry,
  Notification,
  Order,
  PayoutRun,
} from '../src/models/index.js';

/**
 * The admin surface's guard rails.
 *
 * Each of these is a way the console could have said one thing and done
 * another: an operator switched off who keeps acting, a payout run paid twice,
 * a sweep that settles a case nobody has decided, a setting written to a key
 * nothing reads, an approval with no evidence behind it. They are asserted
 * over HTTP because that is where the panel meets them.
 */

let app: FastifyInstance;

const json = (res: { body: string }) => JSON.parse(res.body);

/** The panel's two headers: proof it is the panel, and who is at the desk. */
const asActor = (actor: { sub?: string; email: string; role: string; name?: string }) => ({
  'x-service-token': process.env.BACKEND_SERVICE_TOKEN!,
  'x-actor': Buffer.from(JSON.stringify({ name: actor.email, ...actor })).toString('base64'),
});

let superadmin: { sub: string; email: string; role: string };
let finance: { sub: string; email: string; role: string };
let ops: { sub: string; email: string; role: string };

/** Four operators, one of them switched off. Rebuilt after every wipe. */
async function seedOperators() {
  const hash = await hashPassword('rannabari');
  const rows = await AdminUser.create([
    { email: 'owner@rannabari.app', name: 'Owner', role: 'superadmin', passwordHash: hash },
    { email: 'finance@rannabari.app', name: 'Kamrul', role: 'finance', passwordHash: hash },
    { email: 'ops@rannabari.app', name: 'Rumana', role: 'ops', passwordHash: hash },
    {
      email: 'gone@rannabari.app',
      name: 'Gone',
      role: 'superadmin',
      passwordHash: hash,
      active: false,
    },
  ]);
  const of = (row: (typeof rows)[number]) => ({
    sub: String(row._id),
    email: row.email,
    role: row.role,
  });
  superadmin = of(rows[0]);
  finance = of(rows[1]);
  ops = of(rows[2]);
}

async function makeOrder(overrides: Record<string, unknown> = {}) {
  const [order] = await Order.create([
    {
      code: `RB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      kind: 'meal',
      kitchenId: 'kitchen-a',
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

/** Top up a customer and hold `amount` of it against `orderId`. */
async function fundAndHold(customerKey: string, orderId: string, amount: number) {
  await tx(async (session) => {
    await post(session, {
      kind: 'topup',
      amount,
      from: 'external',
      to: 'customer',
      toRef: customerKey,
      note: 'test top-up',
    });
    await post(session, {
      kind: 'hold',
      amount,
      from: 'customer',
      to: 'held',
      fromRef: customerKey,
      orderId,
      note: 'test hold',
      idemKey: `hold:${orderId}`,
    });
  });
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
  await seedOperators();
});

/* ------------------------------------------------------------------ *
 * who is acting
 * ------------------------------------------------------------------ */

describe('operator identity is the row, not the cookie', () => {
  it('refuses a deactivated operator even with a valid service token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/overview',
      headers: asActor({ email: 'gone@rannabari.app', role: 'superadmin' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('takes the role from the row when the header asserts a grander one', async () => {
    /* ops has no ledger.read. A cookie minted before a demotion — or a
       forged header — says superadmin; the row says ops; the row wins. */
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/ledger',
      headers: asActor({ sub: ops.sub, email: ops.email, role: 'superadmin' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('still answers the row-backed operator with their real role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/v1/ledger',
      headers: asActor(finance),
    });
    expect(res.statusCode).toBe(200);
  });
});

/* ------------------------------------------------------------------ *
 * configuration
 * ------------------------------------------------------------------ */

describe('PATCH /settings', () => {
  const patch = (body: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: '/api/admin/v1/settings',
      headers: asActor(superadmin),
      payload: body,
    });

  it('refuses a key that is not a setting', async () => {
    const res = await patch({ key: 'somethingElse', value: 1 });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe('request-invalid');
  });

  it('keeps a commission at or below half', async () => {
    expect((await patch({ key: 'commissionCod', value: 0.6 })).statusCode).toBe(400);
    expect((await patch({ key: 'commissionCod', value: 0.2 })).statusCode).toBe(200);
  });

  it('keeps fees and windows whole and bounded', async () => {
    expect((await patch({ key: 'deliveryFee', value: 40.5 })).statusCode).toBe(400);
    expect((await patch({ key: 'deliveryFee', value: 5000 })).statusCode).toBe(400);
    expect((await patch({ key: 'escrowAutoReleaseDays', value: 31 })).statusCode).toBe(400);
    expect((await patch({ key: 'payoutMinimum', value: -1 })).statusCode).toBe(400);

    expect((await patch({ key: 'deliveryFee', value: 55 })).statusCode).toBe(200);

    const read = json(
      await app.inject({
        method: 'GET',
        url: '/api/admin/v1/settings',
        headers: asActor(superadmin),
      }),
    );
    expect(read.settings.deliveryFee).toBe(55);
  });
});

describe('PATCH /flags', () => {
  it('flips a known flag, audits it, and the read shows it', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/v1/flags',
      headers: asActor(ops),
      // system.cod is retired (off by default), so a flip would turn it ON; use a live flag.
      payload: { key: 'system.stores' },
    });
    expect(res.statusCode).toBe(200);
    expect(json(res)).toEqual({ key: 'system.stores', enabled: false });

    const read = json(
      await app.inject({
        method: 'GET',
        url: '/api/admin/v1/settings',
        headers: asActor(ops),
      }),
    );
    const flag = read.flags.find((f: { key: string }) => f.key === 'system.stores');
    expect(flag.enabled).toBe(false);
    // The description came across from the defaults, not an empty string.
    expect(flag.description).toBe('Cook stores');

    const audit = await AuditLog.findOne({ action: 'config.flag', targetId: 'system.stores' }).lean();
    expect(audit?.actorEmail).toBe(ops.email);
  });

  it('sets rather than flips when told to', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/v1/flags',
      headers: asActor(ops),
      payload: { key: 'system.cod', enabled: true },
    });
    expect(json(res).enabled).toBe(true);
  });

  it('refuses a flag nothing has ever read', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/v1/flags',
      headers: asActor(ops),
      payload: { key: 'system.teleport' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('is a config.write action', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/v1/flags',
      headers: asActor(finance),
      payload: { key: 'system.cod' },
    });
    expect(res.statusCode).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * KYC
 * ------------------------------------------------------------------ */

describe('POST /kitchens/:id/kyc', () => {
  async function pendingKitchen() {
    const kitchen = await Kitchen.create({
      name: "Rashida's Rannaghor",
      ownerName: 'Rashida',
      area: 'Dhanmondi',
      lat: 23.7,
      lng: 90.4,
      kycStatus: 'pending',
    });
    return String(kitchen._id);
  }

  const decide = (id: string, decision: string, note = '') =>
    app.inject({
      method: 'POST',
      url: `/api/admin/v1/kitchens/${id}/kyc`,
      headers: asActor(ops),
      payload: { decision, note },
    });

  it('will not approve a kitchen with no documents on file', async () => {
    const id = await pendingKitchen();
    const res = await decide(id, 'approved');
    expect(res.statusCode).toBe(409);
    expect(json(res).error).toBe('document-missing');

    const kitchen = await Kitchen.findById(id).lean();
    expect(kitchen?.kycStatus).toBe('pending');
  });

  it('approves once both NID faces are in, and refuses the same decision twice', async () => {
    const id = await pendingKitchen();
    await KitchenDocument.create([
      { kitchenId: id, kind: 'nid-front', data: 'data:image/png;base64,AA==' },
      { kitchenId: id, kind: 'nid-back', data: 'data:image/png;base64,AA==' },
    ]);

    expect((await decide(id, 'approved')).statusCode).toBe(200);
    const first = await Kitchen.findById(id).lean();
    expect(first?.kycStatus).toBe('approved');
    expect(first?.isVerified).toBe(true);

    const again = await decide(id, 'approved');
    expect(again.statusCode).toBe(409);
    expect(json(again).error).toBe('duplicate-request');

    // The second click did not restamp the decision.
    const second = await Kitchen.findById(id).lean();
    expect(String(second?.kycDecidedAt)).toBe(String(first?.kycDecidedAt));

    // One badge for the cook, not two.
    expect(await Notification.countDocuments({ key: `cook:kyc-approved:${id}` })).toBe(1);
  });

  it('still lets a decision change', async () => {
    const id = await pendingKitchen();
    expect((await decide(id, 'rejected', 'NID is blurred')).statusCode).toBe(200);
    expect((await decide(id, 'rejected', 'again')).statusCode).toBe(409);
  });
});

/* ------------------------------------------------------------------ *
 * payouts
 * ------------------------------------------------------------------ */

describe('payout runs', () => {
  /** Two cooks owed money: ৳850 and ৳425 after the 15% meal commission. */
  async function owe() {
    const a = await makeOrder({ kitchenId: 'kitchen-a', amount: 1000, price: 1000, subtotal: 1000 });
    const b = await makeOrder({ kitchenId: 'kitchen-b', amount: 500, price: 500, subtotal: 500, customerKey: '+8801722222222' });
    await fundAndHold('+8801711111111', String(a._id), 1000);
    await fundAndHold('+8801722222222', String(b._id), 500);
    await tx(async (session) => {
      expect((await releaseEscrow(session, String(a._id))).ok).toBe(true);
      expect((await releaseEscrow(session, String(b._id))).ok).toBe(true);
    });
  }

  const draft = () =>
    app.inject({
      method: 'POST',
      url: '/api/admin/v1/payouts',
      headers: asActor(finance),
      payload: { method: 'bKash', note: '' },
    });

  it('refuses a second draft while one is open, naming the first', async () => {
    await owe();
    const first = json(await draft());
    expect(first).toMatchObject({ cookCount: 2 });

    const second = await draft();
    expect(second.statusCode).toBe(409);
    expect(json(second).detail).toEqual({ runId: first.id, code: first.code });
  });

  it('pays only what still has cover, and marks the run partial', async () => {
    await owe();
    const run = json(await draft());

    /* Between the draft and the payment, cook B's balance is drained — a
       payout made by hand, a correction, a second run paid first. */
    await tx((session) =>
      post(session, {
        kind: 'payout',
        amount: 425,
        from: 'cook',
        to: 'external',
        fromRef: 'kitchen-b',
        note: 'paid by hand',
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/v1/payouts/${run.id}/pay`,
      headers: asActor(finance),
    });
    expect(res.statusCode).toBe(200);
    const out = json(res);
    expect(out.status).toBe('partial');
    expect(out.paid).toBe(1);
    expect(out.paidTotal).toBe(850);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]).toMatchObject({ kitchenId: 'kitchen-b', amount: 425, owed: 0 });

    const stored = await PayoutRun.findById(run.id).lean();
    expect(stored?.status).toBe('partial');

    // Exactly one ledger entry for this run — nothing posted for cook B.
    expect(await LedgerEntry.countDocuments({ payoutRunId: run.id })).toBe(1);

    // A run that has been paid, however partially, cannot be paid again.
    const again = await app.inject({
      method: 'POST',
      url: `/api/admin/v1/payouts/${run.id}/pay`,
      headers: asActor(finance),
    });
    expect(again.statusCode).toBe(400);
    expect(json(again).error).toBe('payout-run-closed');
  });

  it('marks a run paid when every cook had cover', async () => {
    await owe();
    const run = json(await draft());
    const out = json(
      await app.inject({
        method: 'POST',
        url: `/api/admin/v1/payouts/${run.id}/pay`,
        headers: asActor(finance),
      }),
    );
    expect(out.status).toBe('paid');
    expect(out.paid).toBe(2);
    expect(out.paidTotal).toBe(1275);
    expect(await LedgerEntry.countDocuments({ payoutRunId: run.id })).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * escrow and disputes
 * ------------------------------------------------------------------ */

describe('escrow under an open dispute', () => {
  const tenDaysAgo = () => new Date(Date.now() - 10 * 86_400_000);

  async function agedPair() {
    const clean = await makeOrder({ deliveredAt: tenDaysAgo() });
    const contested = await makeOrder({ deliveredAt: tenDaysAgo(), customerKey: '+8801722222222' });
    await fundAndHold('+8801711111111', String(clean._id), 1000);
    await fundAndHold('+8801722222222', String(contested._id), 1000);
    await Dispute.create({
      code: 'DP-TEST01',
      orderId: String(contested._id),
      status: 'open',
      openedBy: 'customer',
      reason: 'Wrong dish',
    });
    return { clean: String(clean._id), contested: String(contested._id) };
  }

  it('the sweep leaves the contested order alone and says so', async () => {
    const { clean, contested } = await agedPair();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/v1/escrow/sweep',
      headers: asActor(finance),
    });
    expect(res.statusCode).toBe(200);
    const out = json(res);
    expect(out.considered).toBe(2);
    expect(out.released).toBe(1);
    expect(out.skippedDisputed).toBe(1);
    expect(out.failures).toEqual([]);

    expect((await Order.findById(clean).lean())?.payment).toBe('released');
    expect((await Order.findById(contested).lean())?.payment).toBe('held');
  });

  it('a manual release is refused with dispute-open', async () => {
    const { contested } = await agedPair();

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/v1/orders/${contested}/release`,
      headers: asActor(finance),
      payload: { note: 'trying anyway' },
    });
    expect(res.statusCode).toBe(409);
    expect(json(res).error).toBe('dispute-open');
    expect((await Order.findById(contested).lean())?.payment).toBe('held');
  });
});
