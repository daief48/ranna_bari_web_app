import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { isService, readSession, signIn, type AdminSession } from '../../../auth/admin-auth.js';
import { can, errText, type Role } from '../../../lib/domain.js';
import { tx } from '../../../config/db.js';
import {
  balances,
  cookBalances,
  reconcile,
  refundEscrow,
  releaseEscrow,
} from '../../../logic/ledger.js';
import { getFlags, getSettings, saveSetting, SETTING_META } from '../../../logic/settings.js';
import {
  AuditLog,
  Dispute,
  Kitchen,
  LedgerEntry,
  Notification,
  Order,
  Product,
  Review,
} from '../../../models/index.js';

/**
 * The admin panel's API.
 *
 * The panel currently calls Prisma directly from server components. It
 * becomes a client of these, one module at a time — reads first, then
 * non-money writes, then money — so each step is verifiable on its own.
 */

const fail = (reply: never, code: string, status = 400) =>
  (reply as unknown as { status: (n: number) => { send: (b: unknown) => unknown } })
    .status(status)
    .send({ error: code, message: errText(code) });

/**
 * Who is acting, according to the panel — but only if the panel proved it is
 * the panel.
 *
 * The service token is the actual authentication; the actor header is what it
 * is allowed to assert once authenticated. Taking the actor on its own would
 * mean anybody who can reach this port is finance.
 */
async function actorOf(request: FastifyRequest): Promise<AdminSession | null> {
  const service = request.headers['x-service-token'];
  if (isService(typeof service === 'string' ? service : undefined)) {
    const raw = request.headers['x-actor'];
    if (typeof raw === 'string') {
      try {
        const actor = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (actor?.email && actor?.role) {
          return {
            sub: String(actor.sub ?? ''),
            email: String(actor.email),
            name: String(actor.name ?? actor.email),
            role: actor.role as Role,
          };
        }
      } catch {
        /* A malformed actor header is no actor, not an error. */
      }
    }
  }

  /* Falls back to a session the backend issued itself, so the API is usable
     directly — for a script, or before the panel is migrated. */
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return readSession(header.slice(7).trim());
  }
  return null;
}

/** Require a capability, or refuse. Authorisation lives next to the data. */
async function require(
  request: FastifyRequest,
  reply: never,
  capability: string,
): Promise<AdminSession | null> {
  const actor = await actorOf(request);
  if (!actor) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!can(actor.role, capability)) {
    fail(reply, 'admin-forbidden', 403);
    return null;
  }
  return actor;
}

/** Every state-changing action writes one of these, in the same transaction. */
async function audit(
  actor: AdminSession,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
  session?: Parameters<typeof AuditLog.create>[1] extends { session: infer S } ? S : never,
) {
  await AuditLog.create(
    [
      {
        actorId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        ...entry,
        summary: entry.summary ?? '',
        before: entry.before ?? null,
        after: entry.after ?? null,
      },
    ],
    session ? { session } : undefined,
  );
}

export async function adminRoutes(app: FastifyInstance) {
  /* ---------------- sign in ---------------- */

  app.post('/auth/sign-in', async (request, reply) => {
    const body = z
      .object({ email: z.string(), password: z.string(), totp: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, 'name-required');

    const out = await signIn(body.data.email, body.data.password, body.data.totp);
    if (!out.ok) {
      return reply
        .status(401)
        .send({ error: 'sign-in-failed', message: out.error, needsTotp: out.needsTotp });
    }
    return { token: out.token, session: out.session };
  });

  /* ---------------- overview ---------------- */

  app.get('/overview', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const settings = await getSettings();
    const escrowCutoff = new Date(Date.now() - settings.escrowAutoReleaseDays * 86_400_000);
    const stockCutoff = new Date(Date.now() - settings.stockAlarmDays * 86_400_000);

    const [bal, books, kyc, disputes, escrowAged, preorders, stockZero, reviewsFlagged] =
      await Promise.all([
        balances(),
        reconcile(),
        Kitchen.countDocuments({ kycStatus: 'pending' }),
        Dispute.countDocuments({ status: { $in: ['open', 'investigating'] } }),
        Order.countDocuments({
          payment: 'held',
          status: 'delivered',
          deliveredAt: { $lt: escrowCutoff },
        }),
        Order.countDocuments({ status: 'pending', preorder: true }),
        Product.countDocuments({
          active: true,
          stock: 0,
          outOfStockSince: { $lt: stockCutoff },
        }),
        Review.countDocuments({ hidden: false, rating: 1 }),
      ]);

    return {
      balances: bal,
      books,
      attention: { kyc, disputes, escrowAged, preorders, stockZero, reviewsFlagged },
    };
  });

  /* ---------------- kitchens and KYC ---------------- */

  app.get('/kitchens', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.read');
    if (!actor) return;

    const query = z
      .object({
        q: z.string().optional(),
        area: z.string().optional(),
        status: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(100).default(25),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.q) where.$or = [{ name: new RegExp(query.q, 'i') }, { ownerName: new RegExp(query.q, 'i') }];
    if (query.area) where.area = query.area;
    if (query.status === 'verified') where.isVerified = true;
    if (query.status === 'unverified') where.isVerified = false;
    if (query.status === 'suspended') where.suspended = true;

    const [rows, total] = await Promise.all([
      Kitchen.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Kitchen.countDocuments(where),
    ]);

    return { kitchens: rows.map((k) => ({ ...k, id: String(k._id) })), total };
  });

  app.post('/kitchens/:id/kyc', async (request, reply) => {
    const actor = await require(request, reply as never, 'kyc.decide');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ decision: z.enum(['approved', 'rejected']), note: z.string().default('') })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, 'name-required');

    const kitchen = await Kitchen.findById(id).catch(() => null);
    if (!kitchen) return fail(reply as never, 'kitchen-missing', 404);

    if (body.data.decision === 'rejected' && !body.data.note.trim()) {
      return fail(reply as never, 'name-required');
    }

    await tx(async (session) => {
      await Kitchen.updateOne(
        { _id: id },
        {
          kycStatus: body.data.decision,
          kycNote: body.data.note.trim() || null,
          kycDecidedAt: new Date(),
          kycDecidedBy: actor.email,
          // The badge and the decision move together. Two sources of truth
          // for "is this cook checked" is one too many.
          isVerified: body.data.decision === 'approved',
        },
        { session },
      );

      await Notification.create(
        [
          {
            key: `cook:kyc-${body.data.decision}:${id}`,
            audience: 'cook',
            kind: `kyc-${body.data.decision}`,
            kitchenId: id,
            title:
              body.data.decision === 'approved'
                ? 'Your kitchen is verified'
                : 'Verification needs more',
            body:
              body.data.decision === 'approved'
                ? 'The verified badge is now on your kitchen.'
                : body.data.note.trim(),
            broadcastBy: actor.email,
          },
        ],
        { session },
      );

      await audit(
        actor,
        {
          action: `kyc.${body.data.decision}`,
          targetType: 'Kitchen',
          targetId: id,
          summary: `${kitchen.name} — ${body.data.decision}`,
          before: { isVerified: kitchen.isVerified, kycStatus: kitchen.kycStatus },
          after: { isVerified: body.data.decision === 'approved', kycStatus: body.data.decision },
        },
        session as never,
      );
    });

    return { ok: true };
  });

  /* ---------------- orders ---------------- */

  app.get('/orders', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        kind: z.string().optional(),
        status: z.string().optional(),
        payment: z.string().optional(),
        kitchenId: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(100).default(25),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    for (const key of ['kind', 'status', 'payment', 'kitchenId'] as const) {
      if (query[key]) where[key] = query[key];
    }

    const [rows, total] = await Promise.all([
      Order.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Order.countDocuments(where),
    ]);

    return { orders: rows.map((o) => ({ ...o, id: String(o._id) })), total };
  });

  /* ---------------- money ---------------- */

  app.get('/ledger', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({
        kind: z.string().optional(),
        account: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(200).default(50),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.kind) where.kind = query.kind;
    if (query.account) where.$or = [{ from: query.account }, { to: query.account }];

    const [entries, total, bal, books, owed] = await Promise.all([
      LedgerEntry.find(where).sort({ at: -1 }).skip(query.skip).limit(query.take).lean(),
      LedgerEntry.countDocuments(where),
      balances(),
      reconcile(),
      cookBalances(),
    ]);

    return {
      entries: entries.map((e) => ({ ...e, id: String(e._id) })),
      total,
      balances: bal,
      books,
      owed,
    };
  });

  app.post('/orders/:id/release', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const note = (request.body as { note?: string })?.note ?? '';

    const out = await tx(async (session) => {
      const before = await Order.findById(id).session(session).lean();
      const result = await releaseEscrow(session, id, {
        note: `Released by ${actor.email}${note ? ` — ${note}` : ''}`,
      });
      if (!result.ok) return result;

      await Order.updateOne({ _id: id }, { status: 'completed' }, { session });
      await audit(
        actor,
        {
          action: 'escrow.release',
          targetType: 'Order',
          targetId: id,
          summary: `${before?.code} — released`,
          before: { payment: before?.payment, status: before?.status },
          after: { payment: 'released', ...result.result },
        },
        session as never,
      );
      return result;
    });

    if (!out.ok) return fail(reply as never, out.error);
    return out.result;
  });

  app.post('/orders/:id/refund', async (request, reply) => {
    const actor = await require(request, reply as never, 'payout.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ amount: z.number().optional(), reason: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) return fail(reply as never, 'name-required');

    const out = await tx(async (session) => {
      const before = await Order.findById(id).session(session).lean();
      const result = await refundEscrow(session, id, {
        amount: body.data.amount,
        note: `Refunded by ${actor.email} — ${body.data.reason}`,
      });
      if (!result.ok) return result;

      await Order.updateOne(
        { _id: id },
        { status: 'cancelled', cancelReason: body.data.reason },
        { session },
      );
      await audit(
        actor,
        {
          action: 'escrow.refund',
          targetType: 'Order',
          targetId: id,
          summary: `${before?.code} — ${body.data.reason}`,
          before: { payment: before?.payment, status: before?.status },
          after: { payment: 'refunded', ...result.result },
        },
        session as never,
      );
      return result;
    });

    if (!out.ok) return fail(reply as never, out.error);
    return out.result;
  });

  /* ---------------- configuration ---------------- */

  app.get('/settings', async (request, reply) => {
    const actor = await require(request, reply as never, 'config.read');
    if (!actor) return;
    return { settings: await getSettings(), meta: SETTING_META, flags: await getFlags() };
  });

  app.patch('/settings', async (request, reply) => {
    const actor = await require(request, reply as never, 'config.write');
    if (!actor) return;

    const body = z.object({ key: z.string(), value: z.number() }).safeParse(request.body);
    if (!body.success) return fail(reply as never, 'name-required');

    // A commission over 100% would pay the cook a negative amount.
    if (body.data.key.startsWith('commission') && body.data.value > 1) {
      return fail(reply as never, 'amount-invalid');
    }

    const settings = await getSettings();
    const before = settings[body.data.key as keyof typeof settings];

    await saveSetting(body.data.key as never, body.data.value, actor.email);
    await audit(actor, {
      action: 'config.setting',
      targetType: 'Setting',
      targetId: body.data.key,
      summary: `${body.data.key}: ${before} → ${body.data.value}`,
      before: { value: before },
      after: { value: body.data.value },
    });

    return { ok: true };
  });

  /* ---------------- audit ---------------- */

  app.get('/audit', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        actor: z.string().optional(),
        action: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(200).default(50),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.actor) where.actorEmail = query.actor;
    if (query.action) where.action = query.action;

    const [rows, total] = await Promise.all([
      AuditLog.find(where).sort({ at: -1 }).skip(query.skip).limit(query.take).lean(),
      AuditLog.countDocuments(where),
    ]);

    return { rows: rows.map((r) => ({ ...r, id: String(r._id) })), total };
  });
}
