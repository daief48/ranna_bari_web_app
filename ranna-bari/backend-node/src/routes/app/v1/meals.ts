import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { ERR, errText, type Fail } from '../../../lib/domain.js';
import { todayKey } from '../../../lib/format.js';
import {
  addDish,
  bookMeals,
  categoryFor,
  clearPlan,
  effectiveRate,
  mealCategoriesOf,
  monthDays,
  monthOf,
  resolvePlan,
  retireDish,
  savePlan,
  saveService,
  shapeDish,
  shapeService,
  slotOrder,
  type MealCategoryRow,
} from '../../../logic/mealplan.js';
import { kitchenMayTrade, shapeOrder } from '../../../logic/sync.js';
import {
  Kitchen,
  MealBooking,
  MealDish,
  MealPlan,
  MealService,
  Order,
  Review,
  type OrderDoc,
} from '../../../models/index.js';

/**
 * Monthly meal plans, over HTTP.
 *
 * Every rule lives in `logic/mealplan.ts`; this file decides three things it
 * cannot: who is calling, whether they may, and what a refusal looks like on
 * the wire. The shared `/orders/:id/*` rail a booked meal then walks — advance,
 * received, review, cancel — is in `./orders.ts`, because it belongs to every
 * kind of order and not to this one.
 *
 * Two halves: what a customer browses and buys, and what a cook sets up. The
 * asymmetry between them is the trading gate. A cook may edit their service,
 * their calendar and their dish list with no approval at all — that is
 * housekeeping, and half of it is how a kitchen winds *down*. Only switching
 * the service on and adding to the catalogue create an obligation to somebody
 * else, so only those ask `kitchenMayTrade`.
 */

/* ------------------------------------------------------------------ *
 * replies
 * ------------------------------------------------------------------ */

/** Structural, so a handler's `reply` fits whatever generics Fastify gave it. */
type Replyish = { status: (n: number) => { send: (body: unknown) => unknown } };

const fail = (
  reply: Replyish,
  code: string,
  status = 400,
  detail?: Record<string, unknown>,
) =>
  reply
    .status(status)
    .send({ error: code, message: errText(code), ...(detail ? { detail } : {}) });

/**
 * The few codes that are not a plain 400.
 *
 * Everything else stays 400 on purpose: a refused booking — too few meals, no
 * calendar published, a day already taken — is a well-formed request the domain
 * said no to, and the app branches on the code. Inventing a status per refusal
 * would give it a second thing to branch on that says less.
 */
const STATUS: Record<string, number> = {
  [ERR.NO_MEAL]: 404,
  [ERR.NO_ORDER]: 404,
  [ERR.NO_KITCHEN]: 404,
  [ERR.FORBIDDEN]: 403,
};

/** Hand a logic refusal back whole — `detail` carries the range, the shortfall. */
const refuse = (reply: Replyish, out: Fail) =>
  fail(reply, out.error, STATUS[out.error] ?? 400, out.detail);

/*
 * Which refusal a malformed body deserves, and which field caused it.
 *
 * `ERR` has no "malformed request", so the refusal names the kind of thing that
 * was wrong instead: a missing name and a negative rate are different repairs,
 * and the app rings one field. The set of fields that count as amounts is this
 * file's own — `rate`, `minMeals` and `maxMeals` are the numbers a cook types
 * here, and telling them "some of that was not valid" about a price would send
 * them looking at the wrong box.
 */
const AMOUNT_FIELDS = new Set(['price', 'amount', 'rate', 'minMeals', 'maxMeals', 'take']);

function badBody(reply: Replyish, error: z.ZodError) {
  const field = String(error.issues[0]?.path[0] ?? '');
  const code =
    field === 'name' || field === 'title' || field === 'reason'
      ? ERR.NAME_REQUIRED
      : AMOUNT_FIELDS.has(field)
        ? ERR.BAD_AMOUNT
        : ERR.BAD_REQUEST;
  return fail(reply, code, 400, { field });
}

/** A malformed id is a miss, not a cast error five frames down. */
const isId = (value: string) => /^[a-f\d]{24}$/i.test(String(value ?? ''));

/* ------------------------------------------------------------------ *
 * callers
 * ------------------------------------------------------------------ */

const callerOf = (request: FastifyRequest) =>
  identify(bearerFrom(request.headers.authorization));

type Cook = AppIdentity & { kitchenId: string };

/**
 * A caller who owns a kitchen, or a refusal already sent.
 *
 * `kitchenId` is null for a customer *and* for a cook whose kitchen is
 * suspended — `toIdentity` drops it there — so this one check covers both
 * without the routes learning what suspension is.
 */
async function cookOf(
  request: FastifyRequest,
  reply: Replyish,
  opts: { trading?: boolean } = {},
): Promise<Cook | null> {
  const caller = await callerOf(request);
  if (!caller) {
    fail(reply, 'unauthenticated', 401);
    return null;
  }
  if (!caller.kitchenId) {
    /* The vocabulary's only refusal-by-role. It reads `admin-`, but the logic
       module answers a service owned by another kitchen with the same code, so
       the app has one branch rather than two. */
    fail(reply, ERR.FORBIDDEN, 403);
    return null;
  }

  /* Switching a meal service on is a promise to cook every day it sells, so it
     waits for approval. Editing one, un-publishing a calendar or switching it
     off do not — a kitchen must always be able to stop. */
  if (opts.trading && !(await kitchenMayTrade(caller.kitchenId))) {
    fail(reply, ERR.KITCHEN_UNAPPROVED, 403);
    return null;
  }

  return caller as Cook;
}

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

/** The month asked for, or the one we are in. A bad one is not an error here. */
const monthFrom = (value: unknown) => {
  const month = String(value ?? '');
  return monthDays(month).length ? month : monthOf();
};

type KitchenLike = {
  _id: unknown;
  name: string;
  ownerName?: string;
  avatar?: string;
  area?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusKm?: number;
  rating?: number;
  reviewCount?: number;
};

type ServiceLike = {
  _id: unknown;
  kitchenId: string;
  categoryKey: string;
  rate?: number | null;
  minMeals: number;
  maxMeals: number;
  active: boolean;
  cookName?: string;
};

/**
 * One service as a customer sees it — the kitchen and the offer in one row.
 *
 * `rate` here is the *effective* one, because a customer has no use for the
 * distinction between a cook's own price and the category default they fell
 * back to. The cook's own screen reads `shapeService` from the logic module
 * instead, which keeps both.
 */
const shapeOffer = (
  service: ServiceLike,
  kitchen: KitchenLike,
  category: MealCategoryRow | null,
) => ({
  kitchenId: service.kitchenId,
  kitchenName: kitchen.name,
  cookName: service.cookName || kitchen.ownerName || '',
  avatar: kitchen.avatar ?? '',
  area: kitchen.area ?? '',
  lat: kitchen.lat ?? 0,
  lng: kitchen.lng ?? 0,
  deliveryRadiusKm: kitchen.deliveryRadiusKm ?? 3,
  rating: kitchen.rating ?? 0,
  reviewCount: kitchen.reviewCount ?? 0,
  categoryKey: service.categoryKey,
  categoryLabel: category?.label ?? '',
  rate: effectiveRate(service, category),
  minMeals: service.minMeals,
  maxMeals: service.maxMeals,
  active: !!service.active,
});

type BookingLike = {
  _id: unknown;
  code: string;
  customerKey: string;
  customerName: string;
  kitchenId: string;
  cookName: string;
  categoryKey: string;
  categoryLabel: string;
  month: string;
  rate: number;
  minMeals: number;
  maxMeals: number;
  totalAmount: number;
  status: string;
  createdAt?: Date;
  items: { orderId: string; date: string; slot: string; name: string; amount: number }[];
};

/**
 * Bookings with a live status against every meal on them.
 *
 * The per-item status and payment are read from the Orders, never from the
 * booking — it snapshots what was sold, not what has since happened to it. One
 * `$in` for every item on the page and one for the kitchen names, rather than
 * two queries per row: a customer with a month booked is thirty items, and a
 * cook's inbox is thirty of those.
 */
async function shapeBookings(rows: BookingLike[], opts: { reviewed?: boolean } = {}) {
  const orderIds = rows.flatMap((b) => (b.items ?? []).map((i) => i.orderId)).filter(isId);

  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } })
        .select({ status: 1, payment: 1 })
        .lean()
    : [];
  const byOrder = new Map(orders.map((o) => [String(o._id), o]));

  const kitchenIds = [...new Set(rows.map((b) => b.kitchenId))].filter(isId);
  const kitchens = kitchenIds.length
    ? await Kitchen.find({ _id: { $in: kitchenIds } })
        .select({ name: 1 })
        .lean()
    : [];
  const byKitchen = new Map(kitchens.map((k) => [String(k._id), k.name]));

  /* Only where it is asked for: the detail screen offers a rating per meal and
     needs to know which ones already carry one. A list does not. */
  const reviewed =
    opts.reviewed && orderIds.length
      ? new Set(
          (
            await Review.find({ orderId: { $in: orderIds } })
              .select({ orderId: 1 })
              .lean()
          ).map((r) => String(r.orderId)),
        )
      : null;

  return rows.map((b) => ({
    id: String(b._id),
    code: b.code,
    kitchenId: b.kitchenId,
    kitchenName: byKitchen.get(b.kitchenId) ?? '',
    cookName: b.cookName,
    customerName: b.customerName,
    categoryKey: b.categoryKey,
    categoryLabel: b.categoryLabel,
    month: b.month,
    rate: b.rate,
    minMeals: b.minMeals,
    maxMeals: b.maxMeals,
    totalAmount: b.totalAmount,
    count: (b.items ?? []).length,
    status: b.status,
    createdAt: b.createdAt,
    items: (b.items ?? []).map((item) => {
      const order = byOrder.get(item.orderId);
      return {
        orderId: item.orderId,
        date: item.date,
        slot: item.slot,
        name: item.name,
        amount: item.amount,
        /* An item whose order cannot be read is not one anybody is waiting
           for; it reads as cancelled rather than as a blank pill. */
        status: order?.status ?? 'cancelled',
        payment: order?.payment ?? 'refunded',
        ...(reviewed ? { reviewed: reviewed.has(item.orderId) } : {}),
      };
    }),
  }));
}

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

export async function mealRoutes(app: FastifyInstance) {
  /* ---------------- categories ---------------- */

  /**
   * What a meal costs, by category.
   *
   * Public and cached like `/config`: it is the same kind of thing — a short
   * list of platform constants every screen needs before it can draw a price.
   */
  app.get('/meal-categories', async (_request, reply) => {
    const categories = await mealCategoriesOf();

    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return {
      categories: categories.map((c) => ({
        key: c.key,
        label: c.label,
        rate: c.rate,
        order: c.order,
      })),
    };
  });

  /* ---------------- browsing ---------------- */

  /**
   * Every kitchen taking meal bookings.
   *
   * Authenticated, unlike the kitchen directory: this is a list of standing
   * offers with prices and minimums on it, and the screen it feeds books
   * against them. A suspended kitchen is simply absent — the same rule
   * `/kitchens` follows, for the same reason.
   */
  app.get('/meal-services', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const services = await MealService.find({ active: true }).lean();
    if (!services.length) return { services: [] };

    const [kitchens, categories] = await Promise.all([
      Kitchen.find({
        _id: { $in: services.map((s) => s.kitchenId).filter(isId) },
        suspended: false,
      }).lean(),
      mealCategoriesOf({ includeRetired: true }),
    ]);

    const byKitchen = new Map(kitchens.map((k) => [String(k._id), k]));
    const byCategory = new Map(categories.map((c) => [c.key, c]));

    const rows = services
      .filter((s) => byKitchen.has(s.kitchenId))
      .map((s) =>
        shapeOffer(s, byKitchen.get(s.kitchenId)!, byCategory.get(s.categoryKey) ?? null),
      )
      /* A service whose category was retired out from under it has no price to
         show and cannot be booked — `bookMeals` refuses it too. */
      .filter((row) => row.rate > 0)
      .sort((a, b) => b.rating - a.rating);

    return { services: rows };
  });

  /**
   * One kitchen's month: the offer, the calendar, and what this caller already
   * has booked against it.
   *
   * `booked` is the third of those and the reason this endpoint is
   * authenticated. Without it the picker cannot grey a day the customer has
   * already bought, and the only thing that would tell them is a refusal at
   * checkout naming a Tuesday they cannot see.
   */
  app.get('/meal-services/:kitchenId', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { kitchenId } = request.params as { kitchenId: string };
    if (!isId(kitchenId)) return fail(reply, ERR.NO_MEAL, 404);

    const query = z.object({ month: z.string().optional() }).parse(request.query ?? {});
    const month = monthFrom(query.month);

    const [service, kitchen] = await Promise.all([
      MealService.findOne({ kitchenId }).lean(),
      Kitchen.findById(kitchenId)
        .lean()
        .catch(() => null),
    ]);
    if (!service || !kitchen || kitchen.suspended) return fail(reply, ERR.NO_MEAL, 404);

    const category = await categoryFor(service.categoryKey);
    const plan = await resolvePlan(kitchenId, service.categoryKey, month);

    /* This caller's own meals from this kitchen in this month. String range
       rather than a regex: the day keys sort lexically, which is half the
       reason they are strings. */
    const booked = await Order.find({
      customerKey: caller.customerKey,
      kitchenId,
      kind: 'meal',
      status: { $ne: 'cancelled' },
      serveDate: { $gte: `${month}-01`, $lte: `${month}-32` },
    })
      .select({ serveDate: 1, slot: 1, status: 1 })
      .lean();

    return {
      service: shapeOffer(service, kitchen, category),
      month,
      days: plan?.days ?? [],
      booked: booked.map((o) => ({
        date: o.serveDate,
        slot: o.slot,
        orderId: String(o._id),
        status: o.status,
      })),
    };
  });

  /* ---------------- booking ---------------- */

  /**
   * Buy the meals somebody picked.
   *
   * `customerKey` comes from the token and never from the body — the delivery
   * details may, because those describe this booking rather than who is making
   * it. Everything else is `bookMeals`'s: this handler owns only the shape of
   * the request and of the refusal.
   */
  app.post('/meal-bookings', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = z
      .object({
        kitchenId: z.string().min(1),
        month: z.string().min(7),
        selections: z
          .array(z.object({ date: z.string().min(1), slot: z.string().min(1) }))
          .default([]),
        name: z.string().optional(),
        phone: z.string().optional(),
        address: z.record(z.unknown()).nullable().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const out = await bookMeals({
      customerKey: caller.customerKey,
      customer: {
        name: body.data.name ?? caller.name,
        phone: body.data.phone ?? caller.phone,
        address: body.data.address ?? null,
      },
      kitchenId: body.data.kitchenId,
      month: body.data.month,
      selections: body.data.selections,
    });
    if (!out.ok) return refuse(reply, out);

    reply.status(201);
    return out.result;
  });

  /**
   * The caller's bookings — theirs as a customer, or their kitchen's incoming.
   *
   * One endpoint with a flag rather than two, because the row is the same row
   * and both sides read the same live statuses off the same orders. Which one
   * the caller gets is decided by the token, not by the flag: asking for
   * `?kitchen=1` without a kitchen is refused rather than quietly answered with
   * the customer's list.
   */
  app.get('/meal-bookings', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const query = z.object({ kitchen: z.string().optional() }).parse(request.query ?? {});
    const asCook = query.kitchen === '1';
    if (asCook && !caller.kitchenId) return fail(reply, ERR.FORBIDDEN, 403);

    const rows = await MealBooking.find(
      asCook ? { kitchenId: caller.kitchenId } : { customerKey: caller.customerKey },
    )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return { bookings: await shapeBookings(rows) };
  });

  /**
   * One booking, with a `reviewed` flag against every meal on it.
   *
   * Ownership is in the query rather than checked after the fetch: a caller who
   * is neither the customer nor the kitchen gets no document at all, so there is
   * no branch in which a fetched-then-rejected booking could be returned by a
   * later edit that forgets the check.
   */
  app.get('/meal-bookings/:id', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    if (!isId(id)) return fail(reply, ERR.NO_MEAL, 404);

    const row = await MealBooking.findOne({
      _id: id,
      ...(caller.kitchenId
        ? { $or: [{ customerKey: caller.customerKey }, { kitchenId: caller.kitchenId }] }
        : { customerKey: caller.customerKey }),
    })
      .lean()
      .catch(() => null);
    if (!row) return fail(reply, ERR.NO_MEAL, 404);

    const [booking] = await shapeBookings([row], { reviewed: true });
    return { booking };
  });

  /* ---------------- the cook's service ---------------- */

  app.get('/meal-service/mine', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const [service, categories] = await Promise.all([
      MealService.findOne({ kitchenId: cook.kitchenId }).lean(),
      mealCategoriesOf(),
    ]);

    const category = service
      ? (categories.find((c) => c.key === service.categoryKey) ?? null)
      : null;

    return {
      service: service ? shapeService(service, category) : null,
      categories: categories.map((c) => ({
        key: c.key,
        label: c.label,
        rate: c.rate,
        order: c.order,
      })),
    };
  });

  /**
   * Set the service up, or change it.
   *
   * The body is read before the caller is checked, which is the one place in
   * this file that happens — the gate depends on what is being asked for.
   * Switching the service *on* is the obligation and waits for approval;
   * everything else here, including switching it off, is a cook tidying their
   * own shop and must always work.
   */
  app.post('/meal-service/mine', async (request, reply) => {
    const body = z
      .object({
        categoryKey: z.string().min(1),
        rate: z.coerce.number().nullable().optional(),
        minMeals: z.coerce.number(),
        maxMeals: z.coerce.number(),
        active: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const cook = await cookOf(request, reply, { trading: body.data.active === true });
    if (!cook) return;

    const out = await saveService({
      kitchenId: cook.kitchenId,
      cookName: cook.name,
      categoryKey: body.data.categoryKey,
      rate: body.data.rate ?? null,
      minMeals: body.data.minMeals,
      maxMeals: body.data.maxMeals,
      active: body.data.active === true,
    });
    if (!out.ok) return refuse(reply, out);

    return { service: out.result };
  });

  /* ---------------- the cook's calendar ---------------- */

  /**
   * The cook's month, and the platform's underneath it.
   *
   * Both are returned because the editor needs both: one to show what is live
   * now, the other to copy from when a cook decides to customise. The cook's
   * own plan is returned in draft as well as published — it is their working
   * copy, and only they can see it.
   */
  app.get('/meal-plans/mine', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const query = z.object({ month: z.string().optional() }).parse(request.query ?? {});
    const month = monthFrom(query.month);

    const service = await MealService.findOne({ kitchenId: cook.kitchenId }).lean();
    const categoryKey = service?.categoryKey ?? '';
    if (!categoryKey) return { cookPlan: null, systemPlan: null, month, categoryKey: null };

    const [cookPlan, systemPlan] = await Promise.all([
      MealPlan.findOne({ scope: 'cook', kitchenId: cook.kitchenId, categoryKey, month }).lean(),
      MealPlan.findOne({
        scope: 'system',
        kitchenId: '',
        categoryKey,
        month,
        status: 'published',
      }).lean(),
    ]);

    return {
      cookPlan: cookPlan
        ? { id: String(cookPlan._id), days: cookPlan.days ?? [], status: cookPlan.status }
        : null,
      systemPlan: systemPlan
        ? { id: String(systemPlan._id), days: systemPlan.days ?? [] }
        : null,
      month,
      categoryKey,
    };
  });

  /**
   * Save the cook's own calendar for a month.
   *
   * Not trading-gated. A calendar is what a kitchen *says* it will cook, not a
   * sale — nothing is owed until somebody books against it, and that path has
   * its own gate in the `active` switch above.
   */
  app.post('/meal-plans/mine', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const body = z
      .object({
        month: z.string().min(7),
        days: z
          .array(
            z.object({
              date: z.string().min(1),
              breakfast: z.string().optional(),
              lunch: z.string().optional(),
              dinner: z.string().optional(),
            }),
          )
          .default([]),
        publish: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const service = await MealService.findOne({ kitchenId: cook.kitchenId }).lean();
    if (!service) return fail(reply, ERR.NO_MEAL, 404);

    const out = await savePlan({
      scope: 'cook',
      kitchenId: cook.kitchenId,
      categoryKey: service.categoryKey,
      month: body.data.month,
      days: body.data.days,
      publish: body.data.publish === true,
      updatedBy: cook.kitchenId,
    });
    if (!out.ok) return refuse(reply, out);

    return { plan: out.result };
  });

  /** Go back to the platform's calendar. Registered before nothing — `/clear`
      is a longer static path than `/mine`, so neither can shadow the other. */
  app.post('/meal-plans/mine/clear', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const body = z.object({ month: z.string().min(7) }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const service = await MealService.findOne({ kitchenId: cook.kitchenId }).lean();
    if (!service) return fail(reply, ERR.NO_MEAL, 404);

    const out = await clearPlan({
      kitchenId: cook.kitchenId,
      categoryKey: service.categoryKey,
      month: body.data.month,
    });
    if (!out.ok) return refuse(reply, out);

    return out.result;
  });

  /* ---------------- the cook's dish library ---------------- */

  app.get('/meal-dishes', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const query = z.object({ type: z.string().optional() }).parse(request.query ?? {});

    const service = await MealService.findOne({ kitchenId: cook.kitchenId }).lean();
    const categoryKey = service?.categoryKey ?? '';
    if (!categoryKey) return { system: [], mine: [] };

    const where = {
      categoryKey,
      retired: false,
      ...(query.type ? { type: query.type } : {}),
    };

    const [system, mine] = await Promise.all([
      MealDish.find({ ...where, scope: 'system' }).sort({ name: 1 }).lean(),
      MealDish.find({ ...where, scope: 'cook', kitchenId: cook.kitchenId })
        .sort({ name: 1 })
        .lean(),
    ]);

    return { system: system.map(shapeDish), mine: mine.map(shapeDish) };
  });

  /** Adding to the catalogue is creating something customers will be sold. */
  app.post('/meal-dishes', async (request, reply) => {
    const cook = await cookOf(request, reply, { trading: true });
    if (!cook) return;

    const body = z
      .object({ name: z.string().min(1), type: z.string().min(1) })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const service = await MealService.findOne({ kitchenId: cook.kitchenId }).lean();
    if (!service) return fail(reply, ERR.NO_MEAL, 404);

    const out = await addDish({
      scope: 'cook',
      kitchenId: cook.kitchenId,
      categoryKey: service.categoryKey,
      name: body.data.name,
      type: body.data.type,
    });
    if (!out.ok) return refuse(reply, out);

    return { dish: out.result };
  });

  /** Taking one back out. No gate — this is a cook tidying their own list. */
  app.post('/meal-dishes/:id/retire', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const { id } = request.params as { id: string };
    if (!isId(id)) return fail(reply, ERR.NO_MEAL, 404);

    const out = await retireDish(id, { kitchenId: cook.kitchenId });
    if (!out.ok) return refuse(reply, out);

    return out.result;
  });

  /* ---------------- the cook's day ---------------- */

  /**
   * Today's meals to cook and deliver.
   *
   * The delivery board, and the only meal screen a cook opens every morning.
   * Cancelled orders are absent — a refunded Tuesday is not a plate to make —
   * and the rows come back in the order the day happens rather than
   * alphabetically, which is what `slot` would sort as.
   */
  app.get('/meal-orders', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const query = z.object({ date: z.string().optional() }).parse(request.query ?? {});
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date ?? '')) ? query.date! : todayKey();

    const rows = await Order.find({
      kitchenId: cook.kitchenId,
      kind: 'meal',
      serveDate: date,
      status: { $ne: 'cancelled' },
    })
      .sort({ createdAt: 1 })
      .lean();

    rows.sort((a, b) => slotOrder(a.slot ?? '') - slotOrder(b.slot ?? ''));

    return {
      date,
      orders: rows.map((row) => shapeOrder(row as unknown as OrderDoc & { _id: unknown })),
    };
  });
}
