import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ClientSession } from 'mongoose';
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
import { advanceOrder } from '../../../logic/meals.js';
import { pendingPreorders } from '../../../logic/stores.js';
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
  Account,
  AdminUser,
  SearchTerm,
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
  PayoutRun,
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

/** What a refusal from the logic layer is over HTTP. */
const STATUS_FOR: Record<string, number> = {
  [ERR.NO_ORDER]: 404,
  [ERR.FORBIDDEN]: 403,
  [ERR.WRONG_STATE]: 409,
};

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
  /* A real session type. The conditional that stood here resolved to `never`,
     so the parameter existed but nothing could ever be passed to it — the
     first caller that tried to write an audit row inside a transaction did
     not compile. */
  session?: ClientSession,
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
        /*
         * Cash the platform expects to earn on but has not booked yet.
         *
         * `commission` above sums real ledger entries, and a cash order now
         * posts one when it is released — so imputing 15% of *every* cash
         * order on top of that counted the released ones twice. Only the ones
         * still short of a release have a commission that exists solely as
         * arithmetic, which is exactly what this figure is for.
         */
        Order.aggregate<{ _id: null; amount: number }>([
          {
            $match: {
              createdAt: { $gte: since },
              status: live,
              kind: 'cod',
              payment: { $nin: ['released', 'refunded'] },
            },
          },
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

    const [
      bal,
      books,
      kyc,
      disputes,
      escrowAged,
      preorders,
      stockZero,
      reviewsFlagged,
      aging,
      heldCount,
    ] = await Promise.all([
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
        /* Every held order bucketed by how long it has been held, done in the
           database because the panel cannot: it would have to hold all of them
           to bucket them, and its paged read quietly stopped counting at a
           hundred.

           Age runs from delivery where there is one and from creation where
           there is not — an order still on its way has been holding money
           since it was placed. */
        Order.aggregate<{ _id: string; amount: number }>([
          { $match: { payment: 'held' } },
          {
            $group: {
              _id: {
                $let: {
                  vars: {
                    age: {
                      $divide: [
                        { $subtract: ['$$NOW', { $ifNull: ['$deliveredAt', '$createdAt'] }] },
                        86_400_000,
                      ],
                    },
                  },
                  in: {
                    $switch: {
                      branches: [
                        { case: { $lt: ['$$age', 1] }, then: '< 1 day' },
                        { case: { $lt: ['$$age', 3] }, then: '1–3 days' },
                        { case: { $lt: ['$$age', 7] }, then: '3–7 days' },
                      ],
                      default: '7 days +',
                    },
                  },
                },
              },
              amount: { $sum: '$amount' },
            },
          },
        ]),
        Order.countDocuments({ payment: 'held' }),
      ]);

    /* The buckets come back unordered and only for ages that exist, so they
       are laid onto the fixed four the chart draws. A bucket with nothing in
       it is a zero bar, not a missing one — a chart that drops its empty
       categories reads as though the money moved. */
    const held = new Map(aging.map((row) => [row._id, row.amount]));
    const escrowAging = ['< 1 day', '1–3 days', '3–7 days', '7 days +'].map((bucket, i) => ({
      bucket,
      amount: held.get(bucket) ?? 0,
      /* Saffron once the bucket's floor is past the release window. */
      overdue: [0, 1, 3, 7][i] >= settings.escrowAutoReleaseDays,
    }));

    return {
      balances: bal,
      books,
      attention: { kyc, disputes, escrowAged, preorders, stockZero, reviewsFlagged },
      escrow: { aging: escrowAging, count: heldCount },
    };
  });

  /* ---------------- kitchens and KYC ---------------- */


  /* ------------------------------------------------------------------ *
   * customers
   * ------------------------------------------------------------------ */

  /**
   * The people who buy the food.
   *
   * Every other list here is about supply — kitchens, menus, shelves, payouts.
   * This is the other half, and it was missing entirely: an operator on a
   * support call could not look a caller up by the number they were calling
   * from, which is the first thing anyone needs.
   *
   * Sorted by most recent order rather than by sign-up, because the question
   * a support desk asks is "who is active", and an account that ordered this
   * morning matters more than one that registered this morning.
   */
  app.get('/accounts', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        q: z.string().optional(),
        area: z.string().optional(),
        /* active = ordered in the last 30 days · dormant = has ordered, but
           not lately · new = an account that has never ordered at all. */
        state: z.enum(['active', 'dormant', 'new']).optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(100).default(25),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.q) {
      /* A support call gives you a number or a name, and the number is
         stored with a country code the caller will not say. */
      const loose = new RegExp(query.q.replace(/[^\w\u0980-\u09FF]/g, ''), 'i');
      where.$or = [
        { name: new RegExp(query.q, 'i') },
        { phone: loose },
        { customerKey: loose },
        { email: new RegExp(query.q, 'i') },
      ];
    }
    if (query.area) where.area = query.area;

    const rows = await Account.find(where)
      .sort({ updatedAt: -1 })
      .skip(query.skip)
      .limit(query.take)
      .lean();
    const total = await Account.countDocuments(where);

    /*
     * Orders and money are folded per account in two queries rather than two
     * per row: twenty-five customers would otherwise be fifty round trips to
     * render one page.
     */
    const keys = rows.map((a) => a.customerKey);

    const [orderStats, held] = await Promise.all([
      Order.aggregate<{ _id: string; orders: number; spent: number; last: Date }>([
        { $match: { customerKey: { $in: keys }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: '$customerKey',
            orders: { $sum: 1 },
            spent: { $sum: '$amount' },
            last: { $max: '$createdAt' },
          },
        },
      ]),
      LedgerEntry.aggregate<{ _id: string; total: number }>([
        { $match: { kind: 'hold', fromRef: { $in: keys } } },
        { $group: { _id: '$fromRef', total: { $sum: '$amount' } } },
      ]),
    ]);

    const byKey = new Map(orderStats.map((r) => [r._id, r]));
    const heldBy = new Map(held.map((r) => [r._id, r.total]));

    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const accounts = await Promise.all(
      rows.map(async (a) => {
        const stat = byKey.get(a.customerKey);
        const last = stat?.last ? new Date(stat.last).getTime() : null;
        return {
          id: String(a._id),
          name: a.name ?? '',
          phone: a.phone ?? a.customerKey,
          email: a.email ?? '',
          area: a.area ?? '',
          role: a.role ?? 'user',
          orders: stat?.orders ?? 0,
          spent: stat?.spent ?? 0,
          lastOrderAt: stat?.last ?? null,
          wallet: await balanceFor('customer', a.customerKey),
          held: heldBy.get(a.customerKey) ?? 0,
          addresses: (a.addresses ?? []).length,
          state: !last ? 'new' : last > monthAgo ? 'active' : 'dormant',
        };
      }),
    );

    const filtered = query.state
      ? accounts.filter((a) => a.state === query.state)
      : accounts;

    return { accounts: filtered, total };
  });

  /**
   * One customer, with everything a support conversation needs on screen at
   * once: who they are, where they asked for food to go, what they ordered,
   * and every taka that moved.
   */
  app.get('/accounts/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const account = await Account.findById(id)
      .lean()
      .catch(() => null);
    if (!account) return fail(reply as never, ERR.NO_ORDER, 404);

    const key = account.customerKey;

    const [orders, ledger, requests, reviews, threads, wallet] = await Promise.all([
      Order.find({ customerKey: key }).sort({ createdAt: -1 }).limit(20).lean(),
      LedgerEntry.find({ $or: [{ fromRef: key }, { toRef: key }] })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      Request.find({ customerKey: key }).sort({ createdAt: -1 }).limit(10).lean(),
      Review.find({ reviewerKey: key }).sort({ createdAt: -1 }).limit(10).lean(),
      ChatThread.find({ customerKey: key }).sort({ updatedAt: -1 }).limit(10).lean(),
      balanceFor('customer', key),
    ]);

    const lifetime = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.amount ?? 0), 0);

    return {
      account: {
        id: String(account._id),
        customerKey: key,
        name: account.name ?? '',
        phone: account.phone ?? key,
        email: account.email ?? '',
        avatar: account.avatar ?? '',
        role: account.role ?? 'user',
        area: account.area ?? '',
        addressDetail: account.addressDetail ?? '',
        addressLabel: account.addressLabel ?? '',
        lat: account.lat ?? null,
        lng: account.lng ?? null,
        addresses: account.addresses ?? [],
        createdAt: account.createdAt ?? null,
      },
      wallet,
      lifetime,
      orders: orders.map((o) => ({ ...o, id: String(o._id) })),
      ledger: ledger.map((e) => ({ ...e, id: String(e._id) })),
      requests: requests.map((r) => ({ ...r, id: String(r._id) })),
      reviews: reviews.map((r) => ({ ...r, id: String(r._id) })),
      threads: threads.map((th) => ({ ...th, id: String(th._id) })),
    };
  });


  /* ------------------------------------------------------------------ *
   * pre-orders and refunds
   * ------------------------------------------------------------------ */

  /**
   * Pre-orders nobody has answered.
   *
   * A pre-order holds the customer's money the moment they ask — the cook's
   * own screen says "৳{n} is held. Declining returns it in full." A cook who
   * never answers leaves that money held indefinitely, and until now the
   * console showed only a count on the stores board, with no way to see whose
   * money or for how long.
   *
   * Oldest first, because age is the whole problem.
   */
  app.get('/preorders', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const rows = await pendingPreorders();

    const now = Date.now();
    const preorders = rows
      .map((order) => {
        const at = order.createdAt ? new Date(order.createdAt).getTime() : now;
        return {
          id: String(order._id),
          code: order.code,
          title: order.title,
          cookName: order.cookName,
          kitchenId: order.kitchenId ? String(order.kitchenId) : null,
          storeId: order.storeId ? String(order.storeId) : null,
          customerKey: order.customerKey,
          customerName: order.customerName ?? '',
          amount: order.amount ?? 0,
          createdAt: order.createdAt ?? null,
          waitingHours: Math.max(0, Math.round((now - at) / 3_600_000)),
        };
      })
      .sort((a, b) => b.waitingHours - a.waitingHours);

    return {
      preorders,
      total: preorders.length,
      held: preorders.reduce((sum, o) => sum + o.amount, 0),
    };
  });

  /**
   * Money that went back out, in one place.
   *
   * `POST /orders/:id/refund` and `POST /ledger/adjustment` both existed and
   * neither had a board: the only way to see a refund was to scroll the whole
   * ledger or open the dispute that caused it. This is the first thing asked
   * for in a finance review and the second thing an auditor asks for.
   */
  app.get('/refunds', async (request, reply) => {
    const actor = await require(request, reply as never, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({
        kind: z.enum(['refund', 'adjustment']).optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(100).default(25),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {
      kind: query.kind ? query.kind : { $in: ['refund', 'adjustment'] },
    };

    const [rows, total] = await Promise.all([
      LedgerEntry.find(where)
        .sort({ at: -1 })
        .skip(query.skip)
        .limit(query.take)
        .lean(),
      LedgerEntry.countDocuments(where),
    ]);

    /* Folded over everything, not the page — a finance question is about the
       whole period, not about whichever twenty-five rows are on screen. */
    const totals = await LedgerEntry.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { kind: { $in: ['refund', 'adjustment'] } } },
      { $group: { _id: '$kind', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    return {
      refunds: rows.map((entry) => ({
        id: String(entry._id),
        kind: entry.kind,
        amount: entry.amount,
        from: entry.from,
        to: entry.to,
        toRef: entry.toRef ?? null,
        orderId: entry.orderId ? String(entry.orderId) : null,
        note: entry.note ?? '',
        at: entry.at ?? null,
      })),
      total,
      totals: Object.fromEntries(totals.map((t) => [t._id, { amount: t.total, count: t.count }])),
    };
  });


  /**
   * The map the product runs on.
   *
   * Three layers, because the gap between them is the answer: kitchens with
   * the circle they will actually deliver inside, customers with a pin, and
   * the searches that came back empty. Somewhere a customer sits outside
   * every circle is somewhere the catalogue cannot serve, however many
   * kitchens exist in total.
   *
   * Coordinates only — no names on the customer layer. An operator planning
   * supply needs the density, not the identity, and shipping a list of every
   * customer's home address to a browser to draw dots would be a poor trade.
   */
  app.get('/coverage', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.read');
    if (!actor) return;

    const [kitchens, customers, misses] = await Promise.all([
      Kitchen.find(
        { lat: { $ne: null }, lng: { $ne: null } },
        { name: 1, area: 1, lat: 1, lng: 1, deliveryRadiusKm: 1, isOpen: 1, isVerified: 1 },
      ).lean(),
      Account.find(
        { lat: { $ne: null }, lng: { $ne: null } },
        { lat: 1, lng: 1, area: 1 },
      ).lean(),
      SearchTerm.aggregate<{ _id: string | null; searches: number; terms: string[] }>([
        { $match: { results: 0 } },
        {
          $group: {
            _id: '$area',
            searches: { $sum: 1 },
            terms: { $addToSet: '$term' },
          },
        },
        { $sort: { searches: -1 } },
        { $limit: 40 },
      ]),
    ]);

    /*
     * Who is outside every circle.
     *
     * Straight-line distance rather than a road network: the app itself ranks
     * and filters on the same measure, so this agrees with what the customer
     * was actually shown.
     */
    const R = 6371;
    const rad = (d: number) => (d * Math.PI) / 180;
    const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const reachable = (point: { lat: number; lng: number }) =>
      kitchens.some((k) => {
        if (k.lat == null || k.lng == null) return false;
        const radius = typeof k.deliveryRadiusKm === 'number' && k.deliveryRadiusKm > 0
          ? k.deliveryRadiusKm
          : 3;
        return km(point, { lat: k.lat, lng: k.lng }) <= radius;
      });

    const points = customers
      .filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
      .map((a) => ({
        lat: a.lat as number,
        lng: a.lng as number,
        area: a.area ?? '',
        covered: reachable({ lat: a.lat as number, lng: a.lng as number }),
      }));

    const areasWithKitchen = new Set(kitchens.map((k) => k.area).filter(Boolean));

    return {
      kitchens: kitchens.map((k) => ({
        id: String(k._id),
        name: k.name,
        area: k.area ?? '',
        lat: k.lat,
        lng: k.lng,
        radiusKm:
          typeof k.deliveryRadiusKm === 'number' && k.deliveryRadiusKm > 0
            ? k.deliveryRadiusKm
            : 3,
        isOpen: k.isOpen !== false,
        isVerified: !!k.isVerified,
      })),
      customers: points,
      misses: misses.map((m) => ({
        area: m._id ?? '',
        searches: m.searches,
        terms: m.terms.slice(0, 6),
        hasKitchen: !!m._id && areasWithKitchen.has(m._id),
      })),
      summary: {
        kitchens: kitchens.length,
        pinned: points.length,
        stranded: points.filter((p) => !p.covered).length,
        emptySearches: misses.reduce((sum, m) => sum + m.searches, 0),
      },
    };
  });

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

    const [rows, total, areas] = await Promise.all([
      Kitchen.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Kitchen.countDocuments(where),
      /* Every area that has a kitchen in it, deliberately not narrowed by the
         filter above: the dropdown has to offer Mirpur while you are looking
         at Dhanmondi, and narrowing it would delete the only option that gets
         you back out of the area you are already in. */
      Kitchen.distinct('area'),
    ]);

    return {
      kitchens: rows.map((k) => ({ ...k, id: String(k._id) })),
      total,
      areas: (areas as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    };
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

    /*
     * The owner, for the KYC panel.
     *
     * `nid` is selected here and nowhere a customer can reach — the same
     * four fields the KYC queue joins, under the same rule: KYC only, never
     * on a customer-facing endpoint.
     *
     * A kitchen with no `accountId` is genuinely one of the seeded
     * directory rows, and null is the honest answer for those.
     */
    const account = kitchen.accountId
      ? await Account.findById(kitchen.accountId)
          .select({ name: 1, phone: 1, email: 1, nid: 1 })
          .lean()
          .catch(() => null)
      : null;

    return {
      kitchen: {
        ...kitchen,
        id: String(kitchen._id),
        account: account ? { ...account, id: String(account._id) } : null,
      },
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
        q: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(100).default(25),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    for (const key of ['kind', 'status', 'payment', 'kitchenId'] as const) {
      if (query[key]) where[key] = query[key];
    }

    /* An operator searches by the code off a customer's screen, or by a name
       they were just given on the phone. The code is upper-case, the names are
       not, so the term is matched case-insensitively across all four and
       escaped first — a pasted code with a "+" in it should search, not throw
       a syntax error out of the driver. */
    if (query.q) {
      const needle = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      where.$or = [
        { code: needle },
        { customerName: needle },
        { title: needle },
        { cookName: needle },
      ];
    }

    const [rows, total, held] = await Promise.all([
      Order.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Order.countDocuments(where),
      /* Held money across the whole filtered set, not just the page — the
         figure is the reason the filter was applied. */
      Order.aggregate<{ _id: null; amount: number; count: number }>([
        { $match: { ...where, payment: 'held' } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    /* Which of these orders have a case open against them. After the rows,
       because it is keyed on them: the badge is drawn per row, and every
       dispute in the system is not the question being asked. */
    const disputed = await Dispute.find({ orderId: { $in: rows.map((o) => String(o._id)) } })
      .select({ orderId: 1 })
      .lean()
      .catch(() => []);

    return {
      orders: rows.map((o) => ({ ...o, id: String(o._id) })),
      total,
      held: { amount: held[0]?.amount ?? 0, count: held[0]?.count ?? 0 },
      disputed: [...new Set(disputed.map((d) => d.orderId))],
    };
  });

  /**
   * Grant or withdraw the verified badge.
   *
   * Separate from the KYC decision: that one closes an application, this one
   * corrects a badge afterwards, and conflating them would let a correction
   * silently reopen a decided case.
   */
  app.post('/kitchens/:id/verified', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ verified: z.boolean() }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const kitchen = await Kitchen.findById(id).catch(() => null);
    if (!kitchen) return fail(reply as never, ERR.NO_KITCHEN, 404);

    const before = { isVerified: kitchen.isVerified };
    kitchen.isVerified = body.data.verified;
    kitchen.kycStatus = body.data.verified ? 'approved' : 'pending';
    kitchen.kycDecidedAt = new Date();
    kitchen.kycDecidedBy = actor.email;
    await kitchen.save();

    await audit(actor, {
      action: body.data.verified ? 'kitchen.verify' : 'kitchen.unverify',
      targetType: 'Kitchen',
      targetId: id,
      summary: kitchen.name,
      before,
      after: { isVerified: body.data.verified },
    });

    return { id, isVerified: kitchen.isVerified };
  });

  /**
   * Suspend a kitchen, and the account behind it.
   *
   * Not a delete — the orders, the menu and the history are evidence. Both
   * rows move together: a cook whose kitchen is hidden but who can still sign
   * in and accept an order is not suspended in any sense a customer notices.
   */
  app.post('/kitchens/:id/suspend', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ suspended: z.boolean(), reason: z.string().default('') })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const reason = body.data.reason.trim();
    /* A suspension with no reason is one nobody can review later. */
    if (body.data.suspended && !reason) return fail(reply as never, ERR.NAME_REQUIRED);

    const kitchen = await Kitchen.findById(id).catch(() => null);
    if (!kitchen) return fail(reply as never, ERR.NO_KITCHEN, 404);

    const before = { suspended: kitchen.suspended, suspendedReason: kitchen.suspendedReason };

    await tx(async (session) => {
      kitchen.suspended = body.data.suspended;
      kitchen.suspendedReason = body.data.suspended ? reason : null;
      await kitchen.save({ session });

      if (kitchen.accountId) {
        await Account.updateOne(
          { _id: kitchen.accountId },
          { $set: { suspended: body.data.suspended, suspendedReason: body.data.suspended ? reason : null } },
          { session },
        );
      }

      await audit(
        actor,
        {
          action: body.data.suspended ? 'kitchen.suspend' : 'kitchen.unsuspend',
          targetType: 'Kitchen',
          targetId: id,
          summary: kitchen.name + (reason ? ' — ' + reason : ''),
          before,
          after: { suspended: body.data.suspended, suspendedReason: reason },
        },
        session,
      );
    });

    return { id, suspended: body.data.suspended };
  });

  /** The two fields that decide who can see a kitchen at all. */
  app.post('/kitchens/:id/coverage', async (request, reply) => {
    const actor = await require(request, reply as never, 'kitchen.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ area: z.string().trim().min(1), radiusKm: z.coerce.number().min(1).max(50) })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const kitchen = await Kitchen.findById(id).catch(() => null);
    if (!kitchen) return fail(reply as never, ERR.NO_KITCHEN, 404);

    const before = { area: kitchen.area, deliveryRadiusKm: kitchen.deliveryRadiusKm };
    kitchen.area = body.data.area;
    kitchen.deliveryRadiusKm = body.data.radiusKm;
    await kitchen.save();

    await audit(actor, {
      action: 'kitchen.coverage',
      targetType: 'Kitchen',
      targetId: id,
      summary: kitchen.name + ' to ' + body.data.area + ', ' + body.data.radiusKm + ' km',
      before,
      after: { area: body.data.area, deliveryRadiusKm: body.data.radiusKm },
    });

    return { id, area: kitchen.area, deliveryRadiusKm: kitchen.deliveryRadiusKm };
  });

  /**
   * Push an order one step along its rail, on a cook's behalf.
   *
   * Same helper the cook's own screen calls, without a kitchen id — an
   * operator doing this is standing in for a kitchen that is not answering,
   * which is the whole reason the button is on the order page.
   */
  app.post('/orders/:id/advance', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.write');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const before = await Order.findById(id)
      .select({ status: 1, code: 1 })
      .lean()
      .catch(() => null);
    if (!before) return fail(reply as never, ERR.NO_ORDER, 404);

    const out = await advanceOrder({ orderId: id });
    if (!out.ok) return fail(reply as never, out.error, STATUS_FOR[out.error] ?? 400);

    await audit(actor, {
      action: 'order.advance',
      targetType: 'Order',
      targetId: id,
      summary: before.code + ' — ' + before.status + ' to ' + out.result.status,
      before: { status: before.status },
      after: { status: out.result.status },
    });

    return { id, status: out.result.status };
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

    const [order, siblings, meal, payoutRun] = await Promise.all([
      entry.orderId
        ? Order.findById(entry.orderId)
            .lean()
            .catch(() => null)
        : null,
      entry.orderId
        ? LedgerEntry.find({ orderId: entry.orderId }).sort({ at: 1 }).lean()
        : [],
      /* The meal a held plate belongs to, and the run that paid the entry out.
         The panel drew both from its own mirror because this endpoint joined
         neither, which put a title and a payout code on the screen that no
         live record stood behind. */
      entry.mealId
        ? Meal.findById(entry.mealId)
            .lean()
            .catch(() => null)
        : null,
      entry.payoutRunId
        ? PayoutRun.findById(entry.payoutRunId)
            .lean()
            .catch(() => null)
        : null,
    ]);

    return {
      entry: { ...entry, id: String(entry._id) },
      order: order ? { ...order, id: String(order._id) } : null,
      siblings: siblings.map((row) => ({ ...row, id: String(row._id) })),
      meal: meal ? { ...meal, id: String(meal._id) } : null,
      payoutRun: payoutRun ? { ...payoutRun, id: String(payoutRun._id) } : null,
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

  /* The actions that moved money. The panel draws a count of these at the top
     of the trail, and it is the one figure on that screen an auditor cares
     about, so the list lives beside the query rather than in the client. */
  const MONEY_ACTIONS = [
    'escrow.release',
    'escrow.refund',
    'escrow.auto-release',
    'payout.paid',
    'ledger.adjustment',
    'dispute.refund',
    'dispute.release',
    'dispute.split',
  ];

  /**
   * One trail row, with the two lists that give it context.
   *
   * What else this operator did, and what else was done to this target. An
   * audit row on its own says what happened; those two say whether it was
   * part of a pattern, which is the question anybody opening this is asking.
   */
  /**
   * Move an operator between roles.
   *
   * Separate from the create route because it is a different decision: minting
   * an account is adding a person, and this is handing one the ability to move
   * money. The audit row spells out the move rather than the new value alone —
   * "ops to finance" is the fact a reviewer needs, and "finance" on its own
   * does not carry it.
   */
  app.post('/admins/:id/role', async (request, reply) => {
    const actor = await require(request, reply as never, 'admin.manage');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ role: z.enum(['superadmin', 'ops', 'finance', 'support']) })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply as never, ERR.NAME_REQUIRED);

    const target = await AdminUser.findById(id).catch(() => null);
    if (!target) return fail(reply as never, ERR.NO_PRODUCT, 404);

    /* Not your own. Otherwise ops could promote itself to finance and the
       separation between the two would be decorative. */
    if (String(target._id) === actor.sub) return fail(reply as never, ERR.FORBIDDEN, 403);

    /* Nor the last superadmin out of the role — the same reasoning that stops
       one deactivating themselves, by the other route. */
    if (target.role === 'superadmin' && body.data.role !== 'superadmin') {
      const others = await AdminUser.countDocuments({
        role: 'superadmin',
        active: true,
        _id: { $ne: target._id },
      });
      if (others === 0) return fail(reply as never, ERR.FORBIDDEN, 403);
    }

    const before = target.role;
    if (before === body.data.role) return { id, role: before, changed: false };

    target.role = body.data.role;
    await target.save();

    await audit(actor, {
      action: 'admin.role',
      targetType: 'admin',
      targetId: id,
      summary: target.email + ': ' + before + ' to ' + body.data.role,
      before: { role: before },
      after: { role: body.data.role },
    });

    return { id, role: body.data.role, changed: true };
  });

  app.get('/audit/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const row = await AuditLog.findById(id)
      .lean()
      .catch(() => null);
    if (!row) return fail(reply as never, ERR.NO_ORDER, 404);

    const [operator, byActor, sameTarget] = await Promise.all([
      AdminUser.findOne({ email: row.actorEmail })
        .select({ name: 1, email: 1, role: 1, active: 1 })
        .lean()
        .catch(() => null),
      AuditLog.find({ actorEmail: row.actorEmail, _id: { $ne: row._id } })
        .sort({ at: -1 })
        .limit(8)
        .lean(),
      AuditLog.find({
        targetType: row.targetType,
        targetId: row.targetId,
        _id: { $ne: row._id },
      })
        .sort({ at: -1 })
        .limit(8)
        .lean(),
    ]);

    return {
      row: { ...row, id: String(row._id) },
      operator: operator ? { ...operator, id: String(operator._id) } : null,
      byActor: byActor.map((r) => ({ ...r, id: String(r._id) })),
      sameTarget: sameTarget.map((r) => ({ ...r, id: String(r._id) })),
    };
  });

  /**
   * One operator, and what they have actually done.
   *
   * The counts are the point: an account that has been dormant for a year is
   * a different decision from one that signs in and moves money weekly, and
   * the list alone does not distinguish them.
   */
  app.get('/admins/:id', async (request, reply) => {
    const actor = await require(request, reply as never, 'admin.manage');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const admin = await AdminUser.findById(id)
      .select({ passwordHash: 0, totpSecret: 0 })
      .lean()
      .catch(() => null);
    if (!admin) return fail(reply as never, ERR.NO_ORDER, 404);

    const [recent, byAction, total] = await Promise.all([
      AuditLog.find({ actorEmail: admin.email }).sort({ at: -1 }).limit(20).lean(),
      AuditLog.aggregate<{ _id: string; n: number }>([
        { $match: { actorEmail: admin.email } },
        { $group: { _id: '$action', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 6 },
      ]),
      AuditLog.countDocuments({ actorEmail: admin.email }),
    ]);

    return {
      admin: { ...admin, id: String(admin._id) },
      recent: recent.map((r) => ({ ...r, id: String(r._id) })),
      byAction: byAction.map((r) => ({ action: r._id, count: r.n })),
      total,
    };
  });

  app.get('/audit', async (request, reply) => {
    const actor = await require(request, reply as never, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        actor: z.string().optional(),
        /* Comma-separated so the money view can ask for its nine actions in
           one filter. A single action still works, which is what the row
           links send. */
        action: z.string().optional(),
        targetType: z.string().optional(),
        q: z.string().optional(),
        skip: z.coerce.number().default(0),
        take: z.coerce.number().max(200).default(50),
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.actor) where.actorEmail = query.actor;
    if (query.targetType) where.targetType = query.targetType;
    if (query.action) {
      const actions = query.action.split(',').map((a) => a.trim()).filter(Boolean);
      where.action = actions.length > 1 ? { $in: actions } : actions[0];
    }
    /* Escaped before it becomes a RegExp: an operator pasting an order code
       with a "+" in it should search for that code, not throw a syntax error
       out of the driver. */
    if (query.q) {
      const needle = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      where.$or = [{ summary: needle }, { targetId: needle }, { actorEmail: needle }];
    }

    const dayAgo = new Date(Date.now() - 86_400_000);

    const [rows, total, actors, types, moneyCount, todayCount] = await Promise.all([
      AuditLog.find(where).sort({ at: -1 }).skip(query.skip).limit(query.take).lean(),
      AuditLog.countDocuments(where),
      /* The two dropdowns and the two header counts, which had no endpoint at
         all and so were read from a table with nothing in it. Deliberately
         unfiltered: a filter list narrowed by the active filter cannot offer
         the operator a way back out of it. */
      AuditLog.distinct('actorEmail'),
      AuditLog.distinct('targetType'),
      AuditLog.countDocuments({ action: { $in: MONEY_ACTIONS } }),
      AuditLog.countDocuments({ at: { $gte: dayAgo } }),
    ]);

    return {
      rows: rows.map((r) => ({ ...r, id: String(r._id) })),
      total,
      facets: {
        actors: (actors as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        types: (types as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        moneyCount,
        todayCount,
      },
    };
  });
}
