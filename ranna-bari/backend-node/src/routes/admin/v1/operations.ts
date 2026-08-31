import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ClientSession, PipelineStage } from 'mongoose';
import { z } from 'zod';

import { isService, readSession, type AdminSession } from '../../../auth/admin-auth.js';
import { ERR, can, errText, type Role } from '../../../lib/domain.js';
import { isDuplicateKey, tx } from '../../../config/db.js';
import { todayKey } from '../../../lib/format.js';
import { getSettings } from '../../../logic/settings.js';
import { cancelMeal, closeMeal } from '../../../logic/meals.js';
import { pendingPreorders, setStock, toggleProduct, toggleStoreOpen } from '../../../logic/stores.js';
import { standing, turnOf, type PriceMove } from '../../../logic/requests.js';
import { notify } from '../../../logic/wallet.js';
import {
  addCategory,
  moveCategory,
  retireCategory,
  taxonomyOf,
  updateCategory,
} from '../../../logic/taxonomy.js';
import {
  AuditLog,
  Dish,
  Kitchen,
  Meal,
  Notification,
  Offer,
  Order,
  Product,
  Request,
  Review,
  SearchTerm,
  Store,
  TopUp,
  Zone,
} from '../../../models/index.js';

/**
 * The rest of the admin panel's API — the boards an operator works from.
 *
 * Everything here is the *operator's* view of a surface the app already has a
 * party-scoped view of. That difference is the whole design: a cook's read of
 * a request hides a rival's price, a customer's read of a meal hides the other
 * forty orders, and an operator answering a support call needs both. So the
 * party-scoped readers in `logic/` are deliberately not reused on the read
 * paths; the writes go through them, because the rules a write must not break
 * belong to the module that owns them.
 */

/* ------------------------------------------------------------------ *
 * refusing
 * ------------------------------------------------------------------ */

type Reply = { status: (n: number) => { send: (body: unknown) => unknown } };

const fail = (reply: Reply, code: string, status = 400) =>
  reply.status(status).send({ error: code, message: errText(code) });

/**
 * The refusal for a row the panel addressed by id and did not find.
 *
 * The ERR map has no code for a missing review, top-up or zone, and
 * `taxonomy.ts` already met this and reused an existing one rather than widen a
 * vocabulary three codebases branch on — a string invented here refuses in a
 * language neither the app nor the panel speaks. These surfaces answer with the
 * same miss it does, and the 404, not the noun, is what a caller acts on.
 */
const MISSING = ERR.NO_PRODUCT;

/** What each refusal is over HTTP. A miss is 404; the rest are bad requests. */
const STATUS: Record<string, number> = {
  [ERR.NO_MEAL]: 404,
  [ERR.NO_STORE]: 404,
  [ERR.NO_PRODUCT]: 404,
  [ERR.NO_ORDER]: 404,
  [ERR.NO_REQUEST]: 404,
  [ERR.NO_OFFER]: 404,
  [ERR.NO_KITCHEN]: 404,
  [ERR.FORBIDDEN]: 403,
  [ERR.CATEGORY_IN_USE]: 409,
  [ERR.DUPLICATE]: 409,
};

const refuse = (reply: Reply, code: string) => fail(reply, code, STATUS[code] ?? 400);

/* ------------------------------------------------------------------ *
 * who is acting
 * ------------------------------------------------------------------ */

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
  reply: Reply,
  capability: string,
): Promise<AdminSession | null> {
  const actor = await actorOf(request);
  if (!actor) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!can(actor.role, capability)) {
    fail(reply, ERR.FORBIDDEN, 403);
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
  session?: ClientSession,
) {
  await AuditLog.create(
    [
      {
        actorId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        summary: entry.summary ?? '',
        before: entry.before ?? null,
        after: entry.after ?? null,
      },
    ],
    session ? { session } : undefined,
  );
}

/* ------------------------------------------------------------------ *
 * shared shapes
 * ------------------------------------------------------------------ */

const withId = <T extends { _id: unknown }>(row: T) => ({ ...row, id: String(row._id) });

const paging = {
  skip: z.coerce.number().min(0).default(0),
  take: z.coerce.number().min(1).max(100).default(25),
};

/** Kitchens behind a set of ids. A malformed id is a miss, not a crash. */
async function kitchensByIds(ids: string[]): Promise<Map<string, { name?: string }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();

  const rows = await Kitchen.find({ _id: { $in: unique } })
    .select({ name: 1 })
    .lean()
    .catch(() => []);

  return new Map(rows.map((row) => [String(row._id), row]));
}

export async function operationRoutes(app: FastifyInstance) {
  /* ---------------- meals ---------------- */

  app.get('/meals', async (request, reply) => {
    const actor = await require(request, reply, 'order.read');
    if (!actor) return;

    const query = z
      .object({
        status: z.string().optional(),
        kitchenId: z.string().optional(),
        view: z.string().optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.kitchenId) where.kitchenId = query.kitchenId;

    /* Stale is a meal whose day has gone and which nobody closed: still on the
       board, still taking orders for food that will not be cooked.

       `serveDate` is a Dhaka calendar day written 'YYYY-MM-DD', so the compare
       is a string one against today's key. Against a timestamp the board would
       roll over at UTC midnight — six hours early — and condemn a dinner that
       has not been served yet. */
    if (query.view === 'stale') {
      where.status = 'published';
      where.serveDate = { $lt: todayKey() };
    }

    const [rows, total] = await Promise.all([
      Meal.find(where).sort({ serveDate: -1 }).skip(query.skip).limit(query.take).lean(),
      Meal.countDocuments(where),
    ]);

    /* One grouped count for the page rather than a query per meal: 25 meals is
       25 round trips otherwise, and the number is what makes a stale meal
       urgent — forty plates of held money is not the same problem as none. */
    const ids = rows.map((row) => String(row._id));
    const counts = await Order.aggregate<{ _id: string; confirmed: number; held: number }>([
      { $match: { mealId: { $in: ids }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$mealId',
          confirmed: { $sum: 1 },
          held: { $sum: { $cond: [{ $eq: ['$payment', 'held'] }, 1, 0] } },
        },
      },
    ]);
    const byMeal = new Map(counts.map((row) => [row._id, row]));

    return {
      meals: rows.map((row) => ({
        ...withId(row),
        confirmed: byMeal.get(String(row._id))?.confirmed ?? 0,
        held: byMeal.get(String(row._id))?.held ?? 0,
      })),
      total,
    };
  });

  app.post('/meals/:id/close', async (request, reply) => {
    const actor = await require(request, reply, 'meal.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const before = await Meal.findById(id).lean().catch(() => null);

    /* No `kitchenId`. `closeMeal` reads that argument as an ownership clause
       and an operator owns no kitchen; naming one here would make the panel
       act as whichever cook it happened to pass. The capability is the check. */
    const out = await closeMeal({ mealId: id });
    if (!out.ok) return refuse(reply, out.error);

    /* `closeMeal` owns its write and accepts no session: the update is
       conditional on the meal still being published, which is what makes it
       atomic and safe to lose a race against a second operator. Handing it a
       session it does not take would run that write *outside* the transaction
       and roll back only the audit row — the silent failure `tx()` warns
       about — so the trail is written after the change it describes. */
    await audit(actor, {
      action: 'meal.close',
      targetType: 'Meal',
      targetId: id,
      summary: `${before?.title ?? id} — closed`,
      before: { status: before?.status },
      after: { status: 'closed' },
    });

    return out.result;
  });

  app.post('/meals/:id/cancel', async (request, reply) => {
    const actor = await require(request, reply, 'meal.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    /* The reason is not paperwork: it is the sentence forty customers read
       when their money comes back, so a blank one is refused rather than
       defaulted into a shrug. */
    if (!body.success || !body.data.reason.trim()) return refuse(reply, ERR.NAME_REQUIRED);

    const before = await Meal.findById(id).lean().catch(() => null);

    const out = await cancelMeal({ mealId: id, reason: body.data.reason.trim() });
    if (!out.ok) return refuse(reply, out.error);

    /* `cancelMeal` runs one transaction *per order* on purpose — forty
       customers must not go unrefunded because the forty-first row is broken —
       so no single transaction spans this change and none could carry the
       audit row. What it records instead is the outcome, `failed` included:
       the list of orders somebody still has to chase is the part of this
       action an operator will be asked about. */
    await audit(actor, {
      action: 'meal.cancel',
      targetType: 'Meal',
      targetId: id,
      summary: `${before?.title ?? id} — ${out.result.orders} refunded, ${out.result.failed.length} failed`,
      before: { status: before?.status },
      after: { status: 'cancelled', reason: body.data.reason.trim(), ...out.result },
    });

    return out.result;
  });

  /* ---------------- stores ---------------- */

  /**
   * One meal, with the orders against it.
   *
   * The board links every row to a detail page, and the ids on that board are
   * this database's. Without this the panel had to read its own mirror to
   * open one of them, which holds different rows under different ids — so the
   * link resolved to nothing and the screen 404'd.
   */
  app.get('/meals/:id', async (request, reply) => {
    const actor = await require(request, reply, 'order.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const meal = await Meal.findById(id)
      .lean()
      .catch(() => null);
    if (!meal) return fail(reply, ERR.NO_MEAL, 404);

    const [kitchen, orders] = await Promise.all([
      Kitchen.findById(meal.kitchenId)
        .select({ name: 1, area: 1, isVerified: 1 })
        .lean()
        .catch(() => null),
      Order.find({ mealId: id }).sort({ createdAt: -1 }).lean(),
    ]);

    return {
      meal: withId(meal),
      kitchen: kitchen ? { ...kitchen, id: String(kitchen._id) } : null,
      orders: orders.map(withId),
    };
  });

  app.get('/stores', async (request, reply) => {
    const actor = await require(request, reply, 'order.read');
    if (!actor) return;

    const query = z
      .object({ view: z.string().optional(), q: z.string().optional(), ...paging })
      .parse(request.query ?? {});

    if (query.view === 'stock') {
      const settings = await getSettings();
      const cutoff = new Date(Date.now() - settings.stockAlarmDays * 86_400_000);

      /* The same three clauses the overview's `stockZero` badge counts, so the
         number on the dashboard and the list behind it can never disagree
         about what "out of stock" means. `outOfStockSince` is when the count
         last reached zero, which is what makes the alarm age honestly rather
         than firing on a jar sold out an hour ago. */
      const where = { active: true, stock: 0, outOfStockSince: { $lt: cutoff } };

      const [rows, total] = await Promise.all([
        Product.find(where).sort({ outOfStockSince: 1 }).skip(query.skip).limit(query.take).lean(),
        Product.countDocuments(where),
      ]);

      const stores = await Store.find({ _id: { $in: rows.map((row) => row.storeId) } })
        .lean()
        .catch(() => []);
      const byStore = new Map(stores.map((row) => [String(row._id), row]));
      const kitchens = await kitchensByIds(stores.map((row) => row.kitchenId));

      return {
        view: 'stock',
        agedDays: settings.stockAlarmDays,
        products: rows.map((row) => {
          const store = byStore.get(row.storeId);
          return {
            ...withId(row),
            storeName: store?.name ?? '',
            kitchenId: store?.kitchenId ?? null,
            kitchenName: store ? (kitchens.get(store.kitchenId)?.name ?? '') : '',
          };
        }),
        total,
      };
    }

    if (query.view === 'preorders') {
      /* Every kitchen's, so `null` rather than a kitchen id — the cook's screen
         passes their own and gets their own; this board is the platform's. A
         pre-order sitting here is a customer whose money is held against food
         no cook has agreed to make yet, which is why it is a board at all. */
      const rows = await pendingPreorders(null);
      const kitchens = await kitchensByIds(rows.map((row) => row.kitchenId));

      return {
        view: 'preorders',
        orders: rows.slice(query.skip, query.skip + query.take).map((row) => ({
          ...withId(row),
          kitchenName: kitchens.get(row.kitchenId)?.name ?? row.cookName ?? '',
        })),
        total: rows.length,
      };
    }

    const where: Record<string, unknown> = {};
    if (query.q) where.name = new RegExp(query.q, 'i');

    const [rows, total] = await Promise.all([
      Store.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Store.countDocuments(where),
    ]);

    const ids = rows.map((row) => String(row._id));
    const counts = await Product.aggregate<{ _id: string; products: number; live: number }>([
      { $match: { storeId: { $in: ids } } },
      {
        $group: {
          _id: '$storeId',
          products: { $sum: 1 },
          live: { $sum: { $cond: [{ $and: ['$active', { $gt: ['$stock', 0] }] }, 1, 0] } },
        },
      },
    ]);
    const byStore = new Map(counts.map((row) => [row._id, row]));
    const kitchens = await kitchensByIds(rows.map((row) => row.kitchenId));

    return {
      stores: rows.map((row) => ({
        ...withId(row),
        kitchenName: kitchens.get(row.kitchenId)?.name ?? '',
        products: byStore.get(String(row._id))?.products ?? 0,
        live: byStore.get(String(row._id))?.live ?? 0,
      })),
      total,
    };
  });

  app.post('/stores/:id/toggle', async (request, reply) => {
    const actor = await require(request, reply, 'store.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const store = await Store.findById(id).lean().catch(() => null);

    const out = await toggleStoreOpen({ storeId: id });
    if (!out.ok) return refuse(reply, out.error);

    /* The flip happens in the document (`$not`), never read-then-written, so
       two taps land on one shop — which also means the previous value is
       exactly the negation of the new one and needs no second read. */
    await audit(actor, {
      action: 'store.toggle',
      targetType: 'Store',
      targetId: id,
      summary: `${store?.name || id} — ${out.result ? 'open' : 'closed'}`,
      before: { isOpen: !out.result },
      after: { isOpen: out.result },
    });

    return { isOpen: out.result };
  });

  app.post('/products/:id/stock', async (request, reply) => {
    const actor = await require(request, reply, 'store.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z.object({ stock: z.coerce.number().int().min(0) }).safeParse(request.body);
    // A negative count is not a correction of anything — it is a typo that
    // would make every availability check downstream read as out of stock.
    if (!body.success) return refuse(reply, ERR.BAD_AMOUNT);

    const before = await Product.findById(id).lean().catch(() => null);

    const out = await setStock({ productId: id, stock: body.data.stock });
    if (!out.ok) return refuse(reply, out.error);

    await audit(actor, {
      action: 'product.stock',
      targetType: 'Product',
      targetId: id,
      summary: `${before?.name ?? id}: ${before?.stock ?? '?'} → ${out.result}`,
      before: { stock: before?.stock ?? null, outOfStockSince: before?.outOfStockSince ?? null },
      after: { stock: out.result },
    });

    return { stock: out.result };
  });

  app.post('/products/:id/toggle', async (request, reply) => {
    const actor = await require(request, reply, 'store.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const before = await Product.findById(id).lean().catch(() => null);

    const out = await toggleProduct({ productId: id });
    if (!out.ok) return refuse(reply, out.error);

    await audit(actor, {
      action: 'product.toggle',
      targetType: 'Product',
      targetId: id,
      summary: `${before?.name ?? id} — ${out.result ? 'on sale' : 'off sale'}`,
      before: { active: !out.result },
      after: { active: out.result },
    });

    return { active: out.result };
  });

  /* ---------------- requests ---------------- */

  app.get('/requests', async (request, reply) => {
    const actor = await require(request, reply, 'request.read');
    if (!actor) return;

    const query = z
      .object({ status: z.string().optional(), view: z.string().optional(), ...paging })
      .parse(request.query ?? {});

    if (query.view === 'dead') {
      /* Open, and nobody has bid. That is not a quiet day — it is the
         broadcast failing: `eligible` is frozen when the request goes out, so
         a request that reached nobody can never gain a cook afterwards and
         will sit open until it expires with the customer waiting.

         `eligible` comes back with every row precisely so the two failures can
         be told apart: an empty list is a coverage bug in the broadcast, a
         full one with no offers is a request nobody wanted to take. */
      const stages: PipelineStage[] = [
        { $match: { status: 'open' } },
        // `Offer.requestId` holds the request's id as a string while `_id` is
        // an ObjectId, so the join needs the string form or it matches nothing
        // and every open request reads as dead.
        { $addFields: { rid: { $toString: '$_id' } } },
        { $lookup: { from: 'offers', localField: 'rid', foreignField: 'requestId', as: 'bids' } },
        { $match: { bids: { $size: 0 } } },
      ];

      const [rows, totals] = await Promise.all([
        Request.aggregate<Record<string, unknown> & { _id: unknown }>([
          ...stages,
          { $sort: { createdAt: -1 } },
          { $skip: query.skip },
          { $limit: query.take },
          { $project: { bids: 0, rid: 0 } },
        ]),
        Request.aggregate<{ n: number }>([...stages, { $count: 'n' }]),
      ]);

      return {
        view: 'dead',
        requests: rows.map((row) => ({
          ...withId(row),
          eligible: (row.eligible as string[] | undefined) ?? [],
          reached: ((row.eligible as string[] | undefined) ?? []).length,
        })),
        total: totals[0]?.n ?? 0,
      };
    }

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      Request.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Request.countDocuments(where),
    ]);

    const ids = rows.map((row) => String(row._id));
    const counts = await Offer.aggregate<{ _id: string; offers: number; priced: number }>([
      { $match: { requestId: { $in: ids } } },
      {
        $group: {
          _id: '$requestId',
          offers: { $sum: 1 },
          priced: { $sum: { $cond: [{ $gt: ['$price', null] }, 1, 0] } },
        },
      },
    ]);
    const byRequest = new Map(counts.map((row) => [row._id, row]));

    return {
      requests: rows.map((row) => ({
        ...withId(row),
        offers: byRequest.get(String(row._id))?.offers ?? 0,
        priced: byRequest.get(String(row._id))?.priced ?? 0,
      })),
      total,
    };
  });

  /**
   * One request, whole.
   *
   * An operator sees everything: every offer, every price, the full
   * negotiation history on each one, and the order it became. That is the
   * deliberate difference from `logic/requests.ts`, whose reads are scoped to a
   * party because a cook must never see a rival's price and a customer must
   * never see another customer's request. An operator is not a party to the
   * negotiation — they are the person a customer calls when it goes wrong, and
   * half a board cannot answer "why was I charged this". So this path reads the
   * models directly rather than borrowing a scope built to hide the other half.
   */
  app.get('/requests/:id', async (request, reply) => {
    const actor = await require(request, reply, 'request.read');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const row = await Request.findById(id).lean().catch(() => null);
    if (!row) return refuse(reply, ERR.NO_REQUEST);

    const offers = await Offer.find({ requestId: String(row._id) }).sort({ createdAt: 1 }).lean();
    const kitchens = await kitchensByIds(offers.map((offer) => offer.kitchenId));
    const order = row.orderId
      ? await Order.findById(row.orderId).lean().catch(() => null)
      : null;

    return {
      request: withId(row),
      offers: offers.map((offer) => {
        const history = (offer.history ?? []) as PriceMove[];
        return {
          ...withId(offer),
          kitchenName: kitchens.get(offer.kitchenId)?.name ?? offer.cookName ?? '',
          history,
          /* Both derived from the history rather than stored, which is why they
             are read here instead of copied: a `turn` column would be a second
             answer to a question the history already settles. */
          standing: standing({ history }),
          turn: turnOf({ status: offer.status, history }),
        };
      }),
      order: order ? withId(order) : null,
    };
  });

  /* ---------------- reviews ---------------- */

  app.get('/reviews', async (request, reply) => {
    const actor = await require(request, reply, 'kitchen.read');
    if (!actor) return;

    const query = z
      .object({
        kitchenId: z.string().optional(),
        rating: z.coerce.number().min(1).max(5).optional(),
        hidden: z.enum(['true', 'false']).optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.kitchenId) where.kitchenId = query.kitchenId;
    if (query.rating) where.rating = query.rating;
    if (query.hidden) where.hidden = query.hidden === 'true';

    const [rows, total] = await Promise.all([
      Review.find(where).sort({ createdAt: -1 }).skip(query.skip).limit(query.take).lean(),
      Review.countDocuments(where),
    ]);

    const kitchens = await kitchensByIds(rows.map((row) => row.kitchenId));

    return {
      reviews: rows.map((row) => ({
        ...withId(row),
        // A moderation queue without kitchen names is a list of orphan
        // paragraphs — the kitchen is half of what makes a review judgeable.
        kitchenName: kitchens.get(row.kitchenId)?.name ?? '',
      })),
      total,
    };
  });

  /**
   * Every dish on every menu.
   *
   * The cook's app has a Menu tab and the panel had no way to see it. A
   * kitchen's dishes were reachable only through `GET /kitchens/:id`, one
   * kitchen at a time — which answers "what does this cook sell" but never
   * "who sells this", "what is unavailable right now", or "what does a
   * biryani cost across the platform", and those are the questions an
   * operator actually opens a menu board for.
   *
   * `available` is the cook's own toggle, the switch in the screenshot of
   * their Menu tab. It is not moderation and the panel does not write it.
   */
  app.get('/dishes', async (request, reply) => {
    const actor = await require(request, reply, 'kitchen.read');
    if (!actor) return;

    const query = z
      .object({
        kitchenId: z.string().optional(),
        available: z.enum(['true', 'false']).optional(),
        q: z.string().optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.kitchenId) where.kitchenId = query.kitchenId;
    if (query.available) where.available = query.available === 'true';
    if (query.q?.trim()) {
      /* Escaped before it becomes a regex: a dish search for "100% beef" is a
         customer's words, not a pattern, and an unescaped one is both a wrong
         result and a way to hand the database a catastrophic backtrack. */
      const safe = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      where.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
      ];
    }

    const [rows, total, unavailable] = await Promise.all([
      Dish.find(where).sort({ name: 1 }).skip(query.skip).limit(query.take).lean(),
      Dish.countDocuments(where),
      Dish.countDocuments({ ...where, available: false }),
    ]);

    const kitchens = await kitchensByIds(rows.map((row) => row.kitchenId));

    return {
      dishes: rows.map((row) => ({
        ...withId(row),
        // A menu row without the kitchen behind it is an orphan price.
        kitchenName: kitchens.get(row.kitchenId)?.name ?? '',
      })),
      total,
      unavailable,
    };
  });

  /**
   * One dish, with the rest of the menu it sits on.
   *
   * A dish is only judgeable next to its neighbours — a price is high or low
   * against the same cook's other dishes, and "switched off" means something
   * different on a menu where everything else is on than on one where nothing
   * is. So the siblings come back with it rather than costing a second call.
   */
  app.get('/dishes/:id', async (request, reply) => {
    const actor = await require(request, reply, 'kitchen.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const dish = await Dish.findById(id)
      .lean()
      .catch(() => null);
    if (!dish) return fail(reply, MISSING, 404);

    const [kitchen, siblings, store] = await Promise.all([
      Kitchen.findById(dish.kitchenId)
        .select({ name: 1, area: 1, isVerified: 1, isOpen: 1, ownerName: 1 })
        .lean()
        .catch(() => null),
      Dish.find({ kitchenId: dish.kitchenId, _id: { $ne: dish._id } })
        .sort({ name: 1 })
        .lean(),
      Store.findOne({ kitchenId: dish.kitchenId }).select({ name: 1 }).lean(),
    ]);

    return {
      dish: withId(dish),
      kitchen: kitchen ? { ...kitchen, id: String(kitchen._id) } : null,
      siblings: siblings.map(withId),
      store: store ? { ...store, id: String(store._id) } : null,
    };
  });

  app.post('/reviews/:id/moderate', async (request, reply) => {
    const actor = await require(request, reply, 'review.moderate');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ hidden: z.boolean(), note: z.string().default('') })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    const note = body.data.note.trim();
    // Hiding a customer's words without saying why is indistinguishable, a
    // month later, from having hidden them by mistake.
    if (body.data.hidden && !note) return refuse(reply, ERR.NAME_REQUIRED);

    const out = await tx(async (session) => {
      const before = await Review.findById(id).session(session).lean().catch(() => null);
      if (!before) return null;

      await Review.updateOne(
        { _id: before._id },
        {
          hidden: body.data.hidden,
          hiddenBy: body.data.hidden ? actor.email : null,
          hiddenAt: body.data.hidden ? new Date() : null,
          hiddenNote: body.data.hidden ? note : null,
        },
        { session },
      );

      /* The score is recomputed from what is still *visible*, in this
         transaction, because hiding and recounting are one decision. A hidden
         review that still counts towards the average has had its evidence
         removed and its verdict left standing, which is worse than not hiding
         it at all — and a recount in a second transaction is a window in which
         the two disagree. Reading the reviews back after the update, rather
         than adjusting the stored average by one row, is what makes this
         self-correcting: an average that had already drifted comes back right. */
      const [stats] = await Review.aggregate<{ _id: null; count: number; avg: number }>([
        { $match: { kitchenId: before.kitchenId, hidden: false } },
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      ]).session(session);

      /* One decimal, the way every card in the app renders it. Storing the raw
         mean would sort two kitchens that both display 4.8 by digits nobody is
         ever shown. No visible reviews is 0 and 0 — the schema's own default,
         and an unrated kitchen rather than a one-star one. */
      const reviewCount = stats?.count ?? 0;
      const rating = reviewCount ? Math.round(stats.avg * 10) / 10 : 0;

      await Kitchen.updateOne({ _id: before.kitchenId }, { rating, reviewCount }, { session });

      await audit(
        actor,
        {
          action: body.data.hidden ? 'review.hide' : 'review.show',
          targetType: 'Review',
          targetId: id,
          summary: `${before.rating}★ ${body.data.hidden ? 'hidden' : 'restored'} — ${note || 'no note'}`,
          before: { hidden: before.hidden, rating: before.rating },
          after: { hidden: body.data.hidden, note, kitchen: { rating, reviewCount } },
        },
        session,
      );

      return { hidden: body.data.hidden, kitchenId: before.kitchenId, rating, reviewCount };
    });

    if (!out) return refuse(reply, MISSING);
    return out;
  });

  /* ---------------- top-ups ---------------- */

  /* ---------------- what people looked for ---------------- */

  /**
   * The demand report: what customers searched for, and what they did not find.
   *
   * Grouped by the normalised term rather than listed row by row — a page of
   * individual searches is a log, and what ops needs is a ranking. `misses`
   * is the column the page is for: a term searched forty times that returned
   * nothing every time is a cook to recruit, and it is the only place on the
   * platform that fact is written down. The customer who found nothing placed
   * no order, so no other collection ever heard about them.
   *
   * `people` counts distinct customers, which is what stops one person
   * hammering a word from looking like a market.
   */
  app.get('/search-terms', async (request, reply) => {
    const actor = await require(request, reply, 'kitchen.read');
    if (!actor) return;

    const query = z
      .object({
        /* Default to the empty ones: a term that already has results is
           working, and the report exists for the ones that are not. */
        only: z.enum(['misses', 'all']).default('misses'),
        days: z.coerce.number().min(1).max(365).default(30),
        area: z.string().optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const since = new Date(Date.now() - query.days * 86_400_000);
    const where: Record<string, unknown> = { createdAt: { $gte: since } };
    if (query.only === 'misses') where.results = 0;
    if (query.area) where.area = query.area;

    const grouped = await SearchTerm.aggregate<{
      _id: string;
      searches: number;
      misses: number;
      people: string[];
      lastAt: Date;
      spellings: string[];
      areas: string[];
    }>([
      { $match: where },
      {
        $group: {
          _id: '$normalised',
          searches: { $sum: 1 },
          misses: { $sum: { $cond: [{ $eq: ['$results', 0] }, 1, 0] } },
          people: { $addToSet: '$customerKey' },
          lastAt: { $max: '$createdAt' },
          spellings: { $addToSet: '$term' },
          areas: { $addToSet: '$area' },
        },
      },
      { $sort: { searches: -1, lastAt: -1 } },
      { $skip: query.skip },
      { $limit: query.take },
    ]);

    const distinct = await SearchTerm.distinct('normalised', where);

    return {
      terms: grouped.map((row) => ({
        term: row._id,
        searches: row.searches,
        misses: row.misses,
        /* `$addToSet` keeps one null for every anonymous search, so it is
           dropped rather than counted as a person. */
        people: row.people.filter(Boolean).length,
        spellings: row.spellings.slice(0, 6),
        areas: row.areas.filter(Boolean).slice(0, 6),
        lastAt: row.lastAt,
      })),
      total: distinct.length,
      days: query.days,
    };
  });

  app.get('/topups', async (request, reply) => {
    const actor = await require(request, reply, 'ledger.read');
    if (!actor) return;

    const query = z
      .object({
        state: z.enum(['orphan', 'matched', 'disputed']).optional(),
        customerKey: z.string().optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.state) where.reconciled = query.state;
    if (query.customerKey) where.customerKey = query.customerKey;

    const [rows, total, states] = await Promise.all([
      TopUp.find(where).sort({ at: -1 }).skip(query.skip).limit(query.take).lean(),
      TopUp.countDocuments(where),
      /* The three counts come back with every page. Reconciliation is a
         shrinking pile, and a page of rows says nothing about whether the pile
         is shrinking. */
      TopUp.aggregate<{ _id: string; count: number; amount: number }>([
        { $group: { _id: '$reconciled', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      topups: rows.map(withId),
      total,
      states: Object.fromEntries(
        states.map((row) => [row._id, { count: row.count, amount: row.amount }]),
      ),
    };
  });

  app.post('/topups/:id/reconcile', async (request, reply) => {
    const actor = await require(request, reply, 'topup.reconcile');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({ pspRef: z.string().min(1), pspAmount: z.coerce.number() })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);
    if (!Number.isFinite(body.data.pspAmount) || body.data.pspAmount < 0) {
      return refuse(reply, ERR.BAD_AMOUNT);
    }

    const pspRef = body.data.pspRef.trim();
    const pspAmount = body.data.pspAmount;

    const out = await tx(async (session) => {
      const row = await TopUp.findById(id).session(session).lean().catch(() => null);
      if (!row) return null;

      /* Compared exactly, never against a tolerance. A statement line that
         disagrees by any amount *is* the discrepancy this endpoint exists to
         find; filing it as 'matched' because it is close marks the top-up
         settled and takes it off the only list anybody looks at, which is the
         one outcome the whole reconciliation surface exists to prevent. */
      const state = pspAmount === row.amount ? 'matched' : 'disputed';

      // The row says what is wrong with it, so the dispute needs no second
      // system to explain itself.
      const note =
        state === 'disputed'
          ? `PSP ${pspRef} settled ${pspAmount}; the wallet was credited ${row.amount}.`
          : `Matched to ${pspRef} by ${actor.email}.`;

      await TopUp.updateOne(
        { _id: row._id },
        { reconciled: state, pspRef, pspAmount, note },
        { session },
      );

      await audit(
        actor,
        {
          action: `topup.${state}`,
          targetType: 'TopUp',
          targetId: id,
          summary: note,
          before: { reconciled: row.reconciled, pspRef: row.pspRef, pspAmount: row.pspAmount },
          after: { reconciled: state, pspRef, pspAmount },
        },
        session,
      );

      return { reconciled: state, amount: row.amount, pspRef, pspAmount, note };
    });

    if (!out) return refuse(reply, MISSING);
    return out;
  });

  /* ---------------- taxonomy ---------------- */

  /**
   * The whole vocabulary, retired rows included.
   *
   * The panel is the only place a retired category can be brought back, so it
   * has to be in the list the panel draws. Hiding them is the app's job — the
   * `/config` the phone fetches filters them out, which is the surface where
   * "not offered any more" actually means something.
   */
  /**
   * One credit, and the rest of that customer's.
   *
   * Reconciliation is comparative: a single orphaned top-up is a clerical
   * question, and the same customer's fourth orphan in a week is a different
   * one entirely. The neighbours are half the answer, so they come back with
   * it rather than costing a second round trip.
   */
  app.get('/topups/:id', async (request, reply) => {
    const actor = await require(request, reply, 'ledger.read');
    if (!actor) return;

    const { id } = request.params as { id: string };

    const topup = await TopUp.findById(id)
      .lean()
      .catch(() => null);
    if (!topup) return fail(reply, MISSING, 404);

    const [others, totals] = await Promise.all([
      TopUp.find({ customerKey: topup.customerKey, _id: { $ne: topup._id } })
        .sort({ at: -1 })
        .limit(8)
        .lean(),
      TopUp.aggregate<{ _id: null; amount: number; count: number }>([
        { $match: { customerKey: topup.customerKey } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      topup: withId(topup),
      others: others.map(withId),
      wallet: { amount: totals[0]?.amount ?? 0, count: totals[0]?.count ?? 0 },
    };
  });

  app.get('/taxonomy', async (request, reply) => {
    const actor = await require(request, reply, 'config.read');
    if (!actor) return;

    return { taxonomy: await taxonomyOf({ includeRetired: true }) };
  });

  app.post('/taxonomy', async (request, reply) => {
    const actor = await require(request, reply, 'config.write');
    if (!actor) return;

    const body = z
      .object({ key: z.string().optional(), label: z.string().min(1), emoji: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    const out = await addCategory(body.data);
    if (!out.ok) {
      /* This one refusal carries a payload and it has to survive the trip: a
         clash on a *retired* key is answered by reviving that row, and its id
         is how the panel offers exactly that instead of telling an operator a
         word they can plainly read on screen is taken. */
      return reply.status(STATUS[out.error] ?? 400).send({
        error: out.error,
        message: errText(out.error),
        detail: out.detail ?? null,
      });
    }

    await audit(actor, {
      action: 'taxonomy.add',
      targetType: 'TaxonomyCategory',
      targetId: out.result.id,
      summary: `${out.result.label} (${out.result.key})`,
      after: out.result,
    });

    return out.result;
  });

  /**
   * Rename one, re-emoji it, or move it along the list.
   *
   * `key` is absent from the patch and there is no path to it from here — it is
   * the tag stamped on every dish and kitchen, and editing it orphans all of
   * them at once, silently, with nothing to catch it. `logic/taxonomy.ts` omits
   * it from its own patch type for the same reason; a field the schema never
   * reads is a better refusal than an error message.
   */
  app.patch('/taxonomy/:id', async (request, reply) => {
    const actor = await require(request, reply, 'config.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({
        label: z.string().optional(),
        emoji: z.string().optional(),
        /** Places to move, signed. Not an absolute index: the list renumbers. */
        move: z.coerce.number().int().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    if (body.data.move) {
      const moved = await moveCategory(id, body.data.move);
      if (!moved.ok) return refuse(reply, moved.error);

      await audit(actor, {
        action: 'taxonomy.move',
        targetType: 'TaxonomyCategory',
        targetId: id,
        summary: `moved ${body.data.move > 0 ? 'down' : 'up'} ${Math.abs(body.data.move)}`,
        after: { order: moved.result.map((row) => row.key) },
      });

      return { taxonomy: moved.result };
    }

    const out = await updateCategory(id, { label: body.data.label, emoji: body.data.emoji });
    if (!out.ok) return refuse(reply, out.error);

    await audit(actor, {
      action: 'taxonomy.update',
      targetType: 'TaxonomyCategory',
      targetId: id,
      summary: `${out.result.key} → ${out.result.label}`,
      after: out.result,
    });

    return out.result;
  });

  app.post('/taxonomy/:id/retire', async (request, reply) => {
    const actor = await require(request, reply, 'config.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    // Retiring and restoring are the same door. There is no delete: the row
    // survives because the dishes tagged with its key do.
    const body = z.object({ retired: z.boolean().default(true) }).safeParse(request.body ?? {});
    const retired = body.success ? body.data.retired : true;

    const out = await retireCategory(id, retired);
    if (!out.ok) return refuse(reply, out.error);

    await audit(actor, {
      action: retired ? 'taxonomy.retire' : 'taxonomy.restore',
      targetType: 'TaxonomyCategory',
      targetId: id,
      summary: `${out.result.label} — ${retired ? 'retired' : 'restored'}`,
      before: { retired: !retired },
      after: { retired },
    });

    return out.result;
  });

  /* ---------------- zones ---------------- */

  app.get('/zones', async (request, reply) => {
    const actor = await require(request, reply, 'config.read');
    if (!actor) return;

    const rows = await Zone.find().sort({ order: 1 }).lean();

    /* How many kitchens sit in each, counted rather than assumed. A zone with
       no kitchens is a delivery area the app offers and nobody serves, and the
       only place that is visible is here. */
    const counts = await Kitchen.aggregate<{ _id: string; kitchens: number }>([
      { $group: { _id: '$area', kitchens: { $sum: 1 } } },
    ]);
    const byArea = new Map(counts.map((row) => [row._id, row.kitchens]));

    return {
      zones: rows.map((row) => ({ ...withId(row), kitchens: byArea.get(row.name) ?? 0 })),
    };
  });

  app.post('/zones', async (request, reply) => {
    const actor = await require(request, reply, 'config.write');
    if (!actor) return;

    const body = z
      .object({
        name: z.string().min(1),
        active: z.boolean().default(true),
        deliveryFee: z.number().nullable().optional(),
        platformFee: z.number().nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    const name = body.data.name.trim();
    if (!name) return refuse(reply, ERR.NAME_REQUIRED);

    const out = await tx(async (session) => {
      // Past the end of the list rather than at `count`, so a zone deleted
      // once cannot hand out an order number two rows already share.
      const last = await Zone.findOne().sort({ order: -1 }).session(session).lean();

      const [zone] = await Zone.create(
        [
          {
            name,
            active: body.data.active,
            deliveryFee: body.data.deliveryFee ?? null,
            platformFee: body.data.platformFee ?? null,
            lat: body.data.lat ?? null,
            lng: body.data.lng ?? null,
            order: (last?.order ?? -1) + 1,
          },
        ],
        { session },
      );

      await audit(
        actor,
        {
          action: 'zone.add',
          targetType: 'Zone',
          targetId: String(zone._id),
          summary: name,
          after: zone.toObject(),
        },
        session,
      );

      return withId(zone.toObject());
    }).catch((error) => {
      // Two operators adding the same area at once. The unique index picked a
      // winner and this is the loser, which is a refusal rather than a fault.
      if (isDuplicateKey(error)) return null;
      throw error;
    });

    if (!out) return refuse(reply, ERR.DUPLICATE);
    return out;
  });

  /**
   * Change a zone's fees, coordinates, or whether it is offered at all.
   *
   * `name` is not in the patch, and that is the same rule taxonomy's `key`
   * follows: the name is the join. A kitchen's `area`, a meal's `area` and a
   * request's `area` are all that string, matched literally, and the app's
   * `/config` sorts the list longest-first so "Old Dhaka" beats "Dhaka".
   * Renaming a zone would orphan every row carrying the old spelling at once.
   * A zone that should not be offered is deactivated; a zone spelled wrongly is
   * replaced, with the kitchens moved deliberately.
   */
  app.patch('/zones/:id', async (request, reply) => {
    const actor = await require(request, reply, 'config.write');
    if (!actor) return;

    const { id } = request.params as { id: string };
    const body = z
      .object({
        active: z.boolean().optional(),
        deliveryFee: z.number().nullable().optional(),
        platformFee: z.number().nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        order: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    const patch: Record<string, unknown> = {};
    for (const key of ['active', 'deliveryFee', 'platformFee', 'lat', 'lng', 'order'] as const) {
      if (body.data[key] !== undefined) patch[key] = body.data[key];
    }
    if (!Object.keys(patch).length) return refuse(reply, ERR.NAME_REQUIRED);

    const out = await tx(async (session) => {
      const before = await Zone.findById(id).session(session).lean().catch(() => null);
      if (!before) return null;

      await Zone.updateOne({ _id: before._id }, patch, { session });

      await audit(
        actor,
        {
          action: 'zone.update',
          targetType: 'Zone',
          targetId: id,
          summary: `${before.name} — ${Object.keys(patch).join(', ')}`,
          before,
          after: patch,
        },
        session,
      );

      return { ...withId(before), ...patch };
    });

    if (!out) return refuse(reply, MISSING);
    return out;
  });

  /* ---------------- notifications ---------------- */

  app.get('/notifications', async (request, reply) => {
    const actor = await require(request, reply, 'notification.broadcast');
    if (!actor) return;

    const query = z
      .object({
        audience: z.enum(['customer', 'cook']).optional(),
        kind: z.string().optional(),
        view: z.string().optional(),
        ...paging,
      })
      .parse(request.query ?? {});

    const where: Record<string, unknown> = {};
    if (query.audience) where.audience = query.audience;
    if (query.kind) where.kind = query.kind;
    /* A broadcast is the row addressed to nobody in particular — both refs
       null. It is also the only kind an operator sent, so this is the filter
       that answers "what have we already told everybody". */
    if (query.view === 'broadcast') {
      where.customerKey = null;
      where.kitchenId = null;
    }

    const [rows, total] = await Promise.all([
      Notification.find(where).sort({ at: -1 }).skip(query.skip).limit(query.take).lean(),
      Notification.countDocuments(where),
    ]);

    return {
      notifications: rows.map((row) => ({
        ...withId(row),
        broadcast: !row.customerKey && !row.kitchenId,
      })),
      total,
    };
  });

  app.post('/notifications/broadcast', async (request, reply) => {
    const actor = await require(request, reply, 'notification.broadcast');
    if (!actor) return;

    const body = z
      .object({
        audience: z.enum(['customer', 'cook']),
        title: z.string().min(1),
        body: z.string().min(1),
        zone: z.string().optional(),
        kind: z.string().default('broadcast'),
      })
      .safeParse(request.body);
    if (!body.success) return refuse(reply, ERR.NAME_REQUIRED);

    const out = await tx(async (session) => {
      const filed = await notify(session, {
        audience: body.data.audience,
        kind: body.data.kind,
        /* An explicit key, and a unique one per send.

           `notify` dedupes against a standing *unread* row, and a broadcast is
           never read by anybody — it carries no reader, so nothing marks it
           read. A derived key would therefore sit unread for ever and silence
           every later broadcast to that audience: one announcement, and then
           years of silence that raises no error anywhere. Naming this send is
           what keeps the next one deliverable. */
        key: `${body.data.audience}:${body.data.kind}:${randomUUID()}`,
        title: body.data.title.trim(),
        /* Stored as written, placeholders and all — the app translates and
           fills `{title}` / `{amount}` on read, and a sentence interpolated
           here would miss the Bangla string table entirely. */
        body: body.data.body,
        // Both null is what makes it a broadcast rather than one person's mail.
        customerKey: null,
        kitchenId: null,
        zone: body.data.zone ?? null,
        broadcastBy: actor.email,
      });

      await audit(
        actor,
        {
          action: 'notification.broadcast',
          targetType: 'Notification',
          targetId: filed.id ?? '',
          summary: `${body.data.audience}: ${body.data.title.trim()}`,
          after: {
            audience: body.data.audience,
            kind: body.data.kind,
            zone: body.data.zone ?? null,
            body: body.data.body,
          },
        },
        session,
      );

      return filed;
    });

    return { ok: true, notificationId: out.id };
  });
}
