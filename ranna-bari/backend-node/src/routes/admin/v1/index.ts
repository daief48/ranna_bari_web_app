import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  hashPassword,
  isService,
  readSession,
  signIn,
  type AdminSession,
} from '../../../auth/admin-auth.js';
import { ERR, can, errText, type Role } from '../../../lib/domain.js';
import { tx } from '../../../config/db.js';
import {
  balanceFor,
  balances,
  cookBalances,
  reconcile,
  refundEscrow,
  releaseEscrow,
} from '../../../logic/ledger.js';
import { getFlags, getSettings, saveSetting, SETTING_META } from '../../../logic/settings.js';
import { notify } from '../../../logic/wallet.js';
import { taka } from '../../../lib/format.js';
import {
  markRead,
  messagesFor,
  sendMessage,
  shapeThread,
  threadFor,
  threadsFor,
} from '../../../logic/chat.js';
import {
  AdminUser,
  AuditLog,
  ChatMessage,
  ChatThread,
  Dish,
  Dispute,
  Kitchen,
  LedgerEntry,
  Meal,
  Notification,
  Order,
  Product,
  Request,
  Review,
  Store,
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

  /**
   * Everything the dashboard draws below its attention board.
   *
   * `gmv` counts orders that were not cancelled, which is the only sense in
   * which money "moved". `commission` is what the ledger actually posted;
   * `codCommission` is what cash-on-delivery *implies* but never posts,
   * because the rider takes the cash and no entry is written. Kept apart so
   * revenue is neither overstated nor quietly short.
   */
  app.get('/dashboard', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({ days: z.coerce.number().min(1).max(365).default(30) })
      .parse(request.query ?? {});

    const since = new Date(Date.now() - query.days * 86_400_000);
    const settings = await getSettings();
    const live = { $nin: ['cancelled', 'rejected'] };

    const [totals, commission, byKind, cod, series, inFlight, kitchensOpen, storesOpen, openRequests] =
      await Promise.all([
        Order.aggregate<{ _id: null; amount: number; orders: number }>([
          { $match: { createdAt: { $gte: since }, status: live } },
          { $group: { _id: null, amount: { $sum: '$amount' }, orders: { $sum: 1 } } },
        ]),
        LedgerEntry.aggregate<{ _id: null; amount: number }>([
          { $match: { kind: 'commission', at: { $gte: since } } },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        Order.aggregate<{ _id: string; amount: number; count: number }>([
          { $match: { createdAt: { $gte: since }, status: live } },
          { $group: { _id: '$kind', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        Order.aggregate<{ _id: null; amount: number }>([
          { $match: { createdAt: { $gte: since }, status: live, kind: 'cod' } },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        /* Grouped in Mongo rather than fetched and folded here: a busy month
           is tens of thousands of orders, and the chart wants thirty numbers. */
        Order.aggregate<{ _id: string; gmv: number; orders: number }>([
          { $match: { createdAt: { $gte: since }, status: live } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  /* Dhaka, not UTC. A day on this chart is a day a cook
                     worked, and grouping in UTC moves six hours of every
                     evening into tomorrow. */
                  timezone: 'Asia/Dhaka',
                },
              },
              gmv: { $sum: '$amount' },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Order.countDocuments({
          status: {
            $in: [
              'confirmed', 'preparing', 'ready', 'delivering',
              'accepted', 'cooking', 'on_the_way', 'placed',
            ],
          },
        }),
        Kitchen.countDocuments({ isOpen: true, suspended: false }),
        Store.countDocuments({ isOpen: true }),
        Request.countDocuments({ status: 'open' }),
      ]);

    /* Every day in the window, not only the ones with orders — a chart that
       skips empty days draws a busy month and a quiet one identically. */
    const found = new Map(series.map((row) => [row._id, row]));
    const days: { day: string; gmv: number; orders: number }[] = [];
    for (let i = query.days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Dhaka',
      });
      const row = found.get(key);
      days.push({ day: key, gmv: row?.gmv ?? 0, orders: row?.orders ?? 0 });
    }

    const codAmount = cod[0]?.amount ?? 0;

    return {
      money: {
        gmv: totals[0]?.amount ?? 0,
        orders: totals[0]?.orders ?? 0,
        commission: commission[0]?.amount ?? 0,
        codCommission: Math.round(codAmount * settings.commissionCod),
        revenue: (commission[0]?.amount ?? 0) + Math.round(codAmount * settings.commissionCod),
        byKind: byKind.map((row) => ({
          kind: row._id,
          amount: row.amount,
          count: row.count,
        })),
      },
      series: days,
      live: { inFlight, kitchensOpen, storesOpen, openRequests },
    };
  });

  /* ---------------- the support desk ---------------- */

  /** The operator, as a chat viewer. Never anything else. */
  const deskViewer = (actor: AdminSession) =>
    ({ side: 'admin', email: actor.email, name: actor.name }) as const;

  /**
   * What the desk is carrying, for the header of the chat page.
   *
   * Three counts in one call because they are one sentence — how much is
   * waiting, how many support cases are open, and how busy today has been.
   */
  app.get('/chat/stats', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const [waiting, openSupport, today] = await Promise.all([
      ChatThread.aggregate<{ _id: null; n: number }>([
        { $group: { _id: null, n: { $sum: '$unreadAdmin' } } },
      ]),
      ChatThread.countDocuments({ kind: 'support', status: 'open' }),
      ChatMessage.countDocuments({ sentAt: { $gte: new Date(Date.now() - 86_400_000) } }),
    ]);

    return {
      waiting: waiting[0]?.n ?? 0,
      openSupport,
      today,
    };
  });

  app.get('/chat/threads', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        take: z.coerce.number().min(1).max(100).default(50),
        /* The desk filters by conversation type — support versus a customer
           and their cook — and by whether the case is still open. */
        kind: z.string().optional(),
        status: z.string().optional(),
      })
      .parse(request.query ?? {});

    const rows = await threadsFor(deskViewer(actor), {
      take: query.take,
      kind: query.kind,
      status: query.status,
    });

    /* The desk lists the order code beside the subject, and a thread carries
       only the id. One grouped lookup rather than one per row. */
    const orderIds = rows.map((t) => t.orderId).filter(Boolean) as string[];
    const orders = orderIds.length
      ? await Order.find({ _id: { $in: orderIds } }).select({ code: 1 }).lean().catch(() => [])
      : [];
    const codeById = new Map(orders.map((o) => [String(o._id), o.code]));

    return {
      threads: rows.map((t) => ({
        ...shapeThread(t, 'admin'),
        orderCode: t.orderId ? (codeById.get(String(t.orderId)) ?? null) : null,
      })),
    };
  });

  app.get('/chat/messages', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({ threadId: z.string().min(1), take: z.coerce.number().min(1).max(200).optional() })
      .safeParse(request.query ?? {});
    if (!query.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const viewer = deskViewer(actor);
    const thread = await threadFor(viewer, query.data.threadId);
    if (!thread) return fail(reply as never, ERR.NO_ORDER, 404);

    const out = await messagesFor(viewer, query.data.threadId, { take: query.data.take });
    if (!out.ok) return fail(reply as never, out.error, 403);
    return { thread: shapeThread(thread, 'admin'), messages: out.result.messages };
  });

  /**
   * Answer as support.
   *
   * `clientId` is the device's own key and the replay guard — the desk sends
   * one per message so a retry after a dropped connection posts once, exactly
   * as the app's outbox does.
   */
  app.post('/chat/messages', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const body = z
      .object({
        threadId: z.string().min(1),
        body: z.string().min(1),
        /* Required, not optional: it is the replay guard, and a message
           posted without one cannot be de-duplicated on retry. */
        clientId: z.string().min(1),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const out = await sendMessage(deskViewer(actor), {
      threadId: body.data.threadId,
      body: body.data.body,
      clientId: body.data.clientId,
    });
    if (!out.ok) return fail(reply as never, out.error, out.error === ERR.FORBIDDEN ? 403 : 400);

    return out.result;
  });

  app.post('/chat/read', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const body = z.object({ threadId: z.string().min(1) }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    await markRead(deskViewer(actor), body.data.threadId);
    return { ok: true };
  });

  /* ---------------- operators ---------------- */

  /**
   * Who can open this console.
   *
   * Never returns `passwordHash` or `totpSecret`. They are credentials, and
   * a list endpoint that hands them out has made every operator account as
   * strong as the weakest reader of this response.
   */
  app.get('/admins', async (request, reply) => {
    const actor = await require(request, reply as never, 'admin.manage');
    if (!actor) return;

    const rows = await AdminUser.find()
      .select({ passwordHash: 0, totpSecret: 0 })
      .sort({ active: -1, createdAt: 1 })
      .lean();

    /* How much each one has actually done, which is the column that tells an
       owner whether a dormant account is dormant or merely quiet. */
    const counts = await AuditLog.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$actorId', n: { $sum: 1 } } },
    ]);
    const byActor = new Map(counts.map((row) => [row._id, row.n]));

    return {
      admins: rows.map((row) => ({
        ...row,
        id: String(row._id),
        actions: byActor.get(String(row._id)) ?? 0,
      })),
    };
  });

  app.post('/admins', async (request, reply) => {
    const actor = await require(request, reply as never, 'admin.manage');
    if (!actor) return;

    const body = z
      .object({
        email: z.string().email(),
        name: z.string().trim().min(1),
        password: z.string().min(10),
        role: z.enum(['superadmin', 'ops', 'finance', 'support']),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const email = body.data.email.trim().toLowerCase();
    if (await AdminUser.exists({ email })) {
      return fail(reply as never, ERR.DUPLICATE, 409);
    }

    const created = await AdminUser.create({
      email,
      name: body.data.name.trim(),
      passwordHash: await hashPassword(body.data.password),
      role: body.data.role,
      active: true,
    });

    await audit(actor, {
      action: 'admin.create',
      targetType: 'admin',
      targetId: String(created._id),
      summary: email + ' as ' + body.data.role,
    });

    return { id: String(created._id), email, role: body.data.role };
  });

  /**
   * Turn an operator off, or back on.
   *
   * Deactivating rather than deleting: every audit row points at an operator
   * id, and a deleted account turns its own history into an unattributable
   * list of things that happened. The last active superadmin cannot switch
   * themselves off — a console nobody can administer is a console nobody can
   * fix.
   */
  app.post('/admins/:id/active', async (request, reply) => {
    const actor = await require(request, reply as never, 'admin.manage');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ active: z.boolean() }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const target = await AdminUser.findById(id).catch(() => null);
    if (!target) return fail(reply as never, ERR.NO_PRODUCT, 404);

    if (!body.data.active && target.role === 'superadmin') {
      const others = await AdminUser.countDocuments({
        role: 'superadmin',
        active: true,
        _id: { $ne: target._id },
      });
      if (others === 0) return fail(reply as never, ERR.FORBIDDEN, 403);
    }

    target.active = body.data.active;
    await target.save();

    await audit(actor, {
      action: body.data.active ? 'admin.enable' : 'admin.disable',
      targetType: 'admin',
      targetId: id,
      summary: target.email,
    });

    return { ok: true, active: target.active };
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
        /* Same two states as the escrow board: a confirmed order still holds
           its money, because confirming closes the order and no longer
           releases the hold. */
        Order.countDocuments({
          payment: 'held',
          status: { $in: ['delivered', 'completed'] },
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

  /**
   * One kitchen, with everything the panel's profile page draws.
   *
   * Ten orders and eight meals rather than all of them: this is a support
   * screen, not an export, and a cook with nine hundred orders would other-
   * wise send nine hundred rows to render a list that shows ten.
   */
  app.get('/kitchens/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const kitchen = await Kitchen.findById(id)
      .lean()
      .catch(() => null);
    if (!kitchen) return fail(reply as never, ERR.NO_KITCHEN, 404);

    const [store, dishes, orders, meals, totals, cancelled, owed, settled, reviews] =
      await Promise.all([
        Store.findOne({ kitchenId: id }).lean(),
        Dish.find({ kitchenId: id }).sort({ createdAt: 1 }).lean(),
        Order.find({ kitchenId: id }).sort({ createdAt: -1 }).limit(10).lean(),
        Meal.find({ kitchenId: id }).sort({ serveDate: -1 }).limit(8).lean(),
        /* GMV and the order count come from one grouped pass rather than two
           round trips that could disagree by an order placed between them. */
        Order.aggregate<{ _id: null; amount: number; count: number }>([
          { $match: { kitchenId: id, status: { $nin: ['cancelled', 'rejected'] } } },
          { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        Order.countDocuments({ kitchenId: id, status: { $in: ['cancelled', 'rejected'] } }),
        balanceFor('cook', id),
        Order.aggregate<{ _id: null; cook: number; platform: number }>([
          { $match: { kitchenId: id, payment: 'released' } },
          {
            $group: {
              _id: null,
              cook: { $sum: '$cookAmount' },
              platform: { $sum: '$platformAmount' },
            },
          },
        ]),
        Review.countDocuments({ kitchenId: id }),
      ]);

    const productCount = store
      ? await Product.countDocuments({ storeId: String(store._id) })
      : 0;

    return {
      kitchen: { ...kitchen, id: String(kitchen._id) },
      store: store ? { ...store, id: String(store._id), productCount } : null,
      dishes: dishes.map((d) => ({ ...d, id: String(d._id) })),
      orders: orders.map((o) => ({ ...o, id: String(o._id) })),
      meals: meals.map((m) => ({ ...m, id: String(m._id) })),
      counts: {
        orders: totals[0]?.count ?? 0,
        cancelled,
        meals: await Meal.countDocuments({ kitchenId: id }),
        reviews,
      },
      money: {
        gmv: totals[0]?.amount ?? 0,
        /* What is sitting in this cook's ledger account — earned and released
           but not yet paid out. */
        owed,
        releasedToCook: settled[0]?.cook ?? 0,
        platformTook: settled[0]?.platform ?? 0,
      },
    };
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

  /**
   * One order, with the case against it if there is one.
   *
   * An operator opening this is answering a question about money, so the
   * dispute and the ledger entries that touched this order come with it —
   * fetching them separately is three screens' worth of round trips to
   * answer "what happened to this order".
   */
  app.get('/orders/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const order = await Order.findById(id)
      .lean()
      .catch(() => null);
    if (!order) return fail(reply as never, ERR.NO_ORDER, 404);

    const [kitchen, dispute, entries] = await Promise.all([
      Kitchen.findById(order.kitchenId).select({ name: 1, area: 1, ownerName: 1 }).lean().catch(() => null),
      Dispute.findOne({ orderId: id }).sort({ createdAt: -1 }).lean(),
      LedgerEntry.find({ orderId: id }).sort({ at: 1 }).lean(),
    ]);

    return {
      order: { ...order, id: String(order._id) },
      kitchen: kitchen ? { ...kitchen, id: String(kitchen._id) } : null,
      dispute: dispute ? { ...dispute, id: String(dispute._id) } : null,
      entries: entries.map((e) => ({ ...e, id: String(e._id) })),
    };
  });

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

  /**
   * One ledger entry, with everything posted alongside it.
   *
   * A release and its commission are two rows written together, and reading
   * one without the other is how people conclude the numbers do not add up.
   * So the whole movement for that order comes back, not just the row asked
   * for — the entry is the question, the movement is the answer.
   */
  app.get('/ledger/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const entry = await LedgerEntry.findById(id)
      .lean()
      .catch(() => null);
    if (!entry) return fail(reply as never, ERR.NO_ORDER, 404);

    const [order, siblings] = await Promise.all([
      entry.orderId
        ? Order.findById(entry.orderId)
            .lean()
            .catch(() => null)
        : null,
      entry.orderId
        ? LedgerEntry.find({ orderId: entry.orderId }).sort({ at: 1 }).lean()
        : [],
    ]);

    return {
      entry: { ...entry, id: String(entry._id) },
      order: order ? { ...order, id: String(order._id) } : null,
      siblings: siblings.map((row) => ({ ...row, id: String(row._id) })),
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

      /* The cook has to be told, and this is now the only place that can tell
         them. `confirmReceived` used to release the hold and raise this
         notification in the same breath; it no longer moves money, so without
         this line a cook is paid and never hears about it. */
      await notify(session, {
        audience: 'cook',
        kind: 'payment-released',
        key: `cook:payment-released:${id}`,
        title: 'Payment released',
        body: `${taka(result.result.cook)} for ${before?.title ?? 'your order'} is in your wallet.`,
        kitchenId: before?.kitchenId,
        mealId: before?.mealId ?? undefined,
        orderId: id,
      });

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
