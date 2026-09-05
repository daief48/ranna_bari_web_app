import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { ERR, errText, type Fail } from '../../../lib/domain.js';
import {
  advanceOrder,
  cancelMeal,
  cancelOrder,
  closeMeal,
  confirmOrder,
  confirmReceived,
  confirmedCount,
  interestCount,
  publishMeal,
  remaining,
  toggleInterest,
} from '../../../logic/meals.js';
import { Kitchen, Meal, MealInterest, Order } from '../../../models/index.js';
import { publish } from '../../../realtime/hub.js';
import { kitchenMayTrade } from '../../../logic/sync.js';
import { leaveReview } from '../../../logic/reviews.js';

/**
 * Pre-booked meals, over HTTP.
 *
 * Every rule lives in `logic/meals.ts`; this file decides three things it
 * cannot: who is calling, whether they may, and what a refusal looks like on
 * the wire. The transitions take an *optional* owner — `kitchenId`,
 * `customerKey` — because an operator drives the same functions from the
 * panel with nobody to check against. On a phone that argument is never
 * optional, so it is filled from the token here and never from the body.
 *
 * The two `/orders` routes are in this file rather than a rail of their own
 * because the module that owns the meal lifecycle owns the order lifecycle
 * too: on the device they were one import, since a meal order and a store
 * order walk the same steps and only one place may own those steps.
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
 * Everything else stays 400 on purpose: a refused transition — sold out, past
 * the deadline, already ordered — is a well-formed request the domain said no
 * to, and the app branches on the code. Inventing a status per refusal would
 * give it a second thing to branch on that says less.
 */
const STATUS: Record<string, number> = {
  [ERR.NO_MEAL]: 404,
  [ERR.NO_ORDER]: 404,
  [ERR.NO_KITCHEN]: 404,
  [ERR.FORBIDDEN]: 403,
};

/** Hand a logic refusal back whole — `detail` carries the shortfall on a low balance. */
const refuse = (reply: Replyish, out: Fail) =>
  fail(reply, out.error, STATUS[out.error] ?? 400, out.detail);

/**
 * One code for a body that never reached the logic module.
 *
 * `ERR` has no "malformed request", so the refusal names the kind of thing
 * that was wrong instead: a missing title and a negative price are different
 * repairs, and the app rings one field.
 */
/*
 * Which refusal a malformed body deserves, and which field caused it.
 *
 * This used to answer `amount-invalid` for everything that was not `title`
 * or `reason`. So when the app sent `address` as a string instead of an
 * object, a customer confirming a meal was told "That amount is not valid" —
 * about a request whose body has no amount in it at all. Every meal confirm
 * failed that way, and the message pointed the search at the wallet.
 *
 * The failing field now travels in `detail` whichever code comes back, so
 * the log and the client both say which one it was.
 */
const AMOUNT_FIELDS = new Set(['price', 'amount', 'capacity', 'take']);

function badBody(reply: Replyish, error: z.ZodError) {
  const field = String(error.issues[0]?.path[0] ?? '');
  const code =
    field === 'title' || field === 'reason'
      ? ERR.NAME_REQUIRED
      : AMOUNT_FIELDS.has(field)
        ? ERR.BAD_AMOUNT
        : ERR.BAD_REQUEST;
  return fail(reply, code, 400, { field });
}

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
       module answers a meal owned by another kitchen with the same code, so
       the app has one branch rather than two. */
    fail(reply, ERR.FORBIDDEN, 403);
    return null;
  }

  /* Publishing a meal is a promise to cook for whoever books a plate, so it
     waits for approval. Closing and cancelling one do not — a kitchen must
     always be able to stop, or the plates it already sold have nobody to
     answer for them. */
  if (opts.trading && !(await kitchenMayTrade(caller.kitchenId))) {
    fail(reply, ERR.KITCHEN_UNAPPROVED, 403);
    return null;
  }

  return caller as Cook;
}

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

/** The meal fields the app reads. Named here because a rename is a break there. */
type MealRow = {
  _id: unknown;
  code: string;
  kitchenId: string;
  cookName: string;
  title: string;
  description: string;
  image: string;
  price: number;
  capacity?: number | null;
  serveDate: string;
  slot: string;
  deadline: Date;
  handover: string;
  handoverNote: string;
  area: string;
  lat: number;
  lng: number;
  deliveryRadiusKm: number;
  status: string;
  cancelReason?: string | null;
};

function shapeMeal(
  meal: MealRow,
  counts: { confirmed: number; interest: number; interested: boolean; left: number | null },
) {
  return {
    id: String(meal._id),
    code: meal.code,
    kitchenId: meal.kitchenId,
    cookName: meal.cookName,
    title: meal.title,
    description: meal.description,
    image: meal.image,
    price: meal.price,
    capacity: meal.capacity,
    serveDate: meal.serveDate,
    slot: meal.slot,
    deadline: meal.deadline,
    handover: meal.handover,
    handoverNote: meal.handoverNote,
    area: meal.area,
    lat: meal.lat,
    lng: meal.lng,
    deliveryRadiusKm: meal.deliveryRadiusKm,
    status: meal.status,
    cancelReason: meal.cancelReason ?? null,
    /* `null` is uncapped, not zero — the app greys the card on `0` and would
       grey every unlimited meal if this collapsed the two. */
    remaining: counts.left,
    confirmed: counts.confirmed,
    interestCount: counts.interest,
    interested: counts.interested,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const idParam = z.object({ id: z.string().min(1) });

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

export async function mealRoutes(app: FastifyInstance) {
  /* ---------------- browse ---------------- */

  /**
   * The board.
   *
   * Identified even to read, unlike `/config` and `/kitchens`: every row
   * carries `interested`, which means nothing without a person, and
   * `handoverNote` is a doorstep a stranger has no business reading.
   */
  app.get('/meals', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const query = z
      .object({
        day: z.string().regex(DAY).optional(),
        kitchenId: z.string().optional(),
        /* The only "near me" this server can answer. Distance needs the
           caller's coordinates, which the app has and this request does not;
           the zone is the same filter the kitchen directory already uses. */
        area: z.string().optional(),
        take: z.coerce.number().min(1).max(100).default(50),
      })
      .safeParse(request.query ?? {});
    if (!query.success) return badBody(reply, query.error);

    const own = !!query.data.kitchenId && query.data.kitchenId === caller.kitchenId;

    const where: Record<string, unknown> = {
      ...(query.data.kitchenId ? { kitchenId: query.data.kitchenId } : {}),
      ...(query.data.day ? { serveDate: query.data.day } : {}),
      ...(query.data.area ? { area: query.data.area } : {}),
      /* A cook asking for their own kitchen gets the closed and cancelled ones
         too — those rows are what their board is about. Everyone else sees a
         meal only while it can still be ordered, because a published meal past
         its deadline is a card that refuses every tap. */
      ...(own ? {} : { status: 'published', deadline: { $gt: new Date() } }),
    };

    const meals = await Meal.find(where)
      .sort({ serveDate: 1, deadline: 1 })
      .limit(query.data.take)
      .lean();

    const ids = meals.map((meal) => String(meal._id));

    /* Grouped, not per row: `remaining()` and `interestCount()` are one count
       query each, and fifty cards on the busiest screen in the app would be a
       hundred round trips. The `$ne: 'cancelled'` match is the logic module's
       own definition of a confirmed order, restated as a filter. */
    const [confirmed, interest, mine] = await Promise.all([
      Order.aggregate<{ _id: string; n: number }>([
        { $match: { mealId: { $in: ids }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$mealId', n: { $sum: 1 } } },
      ]),
      MealInterest.aggregate<{ _id: string; n: number }>([
        { $match: { mealId: { $in: ids } } },
        { $group: { _id: '$mealId', n: { $sum: 1 } } },
      ]),
      MealInterest.find({ mealId: { $in: ids }, customerKey: caller.customerKey })
        .select({ mealId: 1 })
        .lean(),
    ]);

    const confirmedBy = new Map(confirmed.map((row) => [row._id, row.n]));
    const interestBy = new Map(interest.map((row) => [row._id, row.n]));
    const interestedIn = new Set(mine.map((row) => row.mealId));

    return {
      meals: meals.map((meal) => {
        const id = String(meal._id);
        const taken = confirmedBy.get(id) ?? 0;
        return shapeMeal(meal, {
          confirmed: taken,
          interest: interestBy.get(id) ?? 0,
          interested: interestedIn.has(id),
          // The same rule as `remaining()`, applied to a batch.
          left: meal.capacity == null ? null : Math.max(0, meal.capacity - taken),
        });
      }),
    };
  });

  /**
   * One meal.
   *
   * A cancelled meal is returned rather than hidden: a customer holding an
   * order against it needs to be told what happened to their evening, and a
   * 404 says only that the link is broken.
   */
  app.get('/meals/:id', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_MEAL, 404);

    // A malformed id is a miss, not a crash — the same reading the logic
    // module takes of it.
    const meal = await Meal.findById(params.data.id)
      .lean()
      .catch(() => null);
    if (!meal) return fail(reply, ERR.NO_MEAL, 404);

    const mealId = String(meal._id);

    const [left, confirmed, interest, interested, ordered] = await Promise.all([
      remaining(meal),
      confirmedCount(mealId),
      interestCount(mealId),
      MealInterest.exists({ mealId, customerKey: caller.customerKey }),
      Order.exists({ mealId, customerKey: caller.customerKey, status: { $ne: 'cancelled' } }),
    ]);

    return {
      meal: shapeMeal(meal, { confirmed, interest, interested: !!interested, left }),
      /* So the app can hide a Confirm button that would only ever answer
         `meal-already-ordered`. One order per customer per meal is the
         logic module's rule; this is the client's view of it. */
      ordered: !!ordered,
      yours: meal.kitchenId === caller.kitchenId,
    };
  });

  /* ---------------- the cook's side ---------------- */

  /** Publish one service for one day. */
  app.post('/meals', async (request, reply) => {
    const cook = await cookOf(request, reply, { trading: true });
    if (!cook) return;

    const body = z
      .object({
        title: z.string(),
        description: z.string().optional(),
        image: z.string().optional(),
        /* Shape only. Whether a price is positive, a slot is real and a
           deadline is still ahead are rules, and the logic module owns them —
           restating them here is a second place to forget when they move. */
        price: z.number(),
        capacity: z.number().nullable().optional(),
        serveDate: z.string(),
        slot: z.string(),
        deadline: z.string().optional(),
        handover: z.enum(['delivery', 'pickup']).optional(),
        handoverNote: z.string().optional(),
        area: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        deliveryRadiusKm: z.number().optional(),
        notifyNearby: z.boolean().default(true),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    /* The token says which kitchen; the document says where it is. The nearby
       announcement is filed against `area`, so a publish that inherits nothing
       broadcasts into a zone nobody lives in. */
    const kitchen = await Kitchen.findById(cook.kitchenId)
      .select({ name: 1, area: 1, lat: 1, lng: 1, deliveryRadiusKm: 1 })
      .lean()
      .catch(() => null);
    if (!kitchen) return fail(reply, ERR.NO_KITCHEN, 404);

    const out = await publishMeal(
      {
        kitchenId: cook.kitchenId,
        cookName: cook.kitchenName ?? kitchen.name,
        title: body.data.title,
        description: body.data.description,
        image: body.data.image,
        price: body.data.price,
        capacity: body.data.capacity ?? null,
        serveDate: body.data.serveDate,
        slot: body.data.slot,
        deadline: body.data.deadline,
        handover: body.data.handover,
        handoverNote: body.data.handoverNote,
        area: body.data.area ?? kitchen.area,
        lat: body.data.lat ?? kitchen.lat,
        lng: body.data.lng ?? kitchen.lng,
        deliveryRadiusKm: body.data.deliveryRadiusKm ?? kitchen.deliveryRadiusKm,
      },
      { notifyNearby: body.data.notifyNearby },
    );
    if (!out.ok) return refuse(reply, out);

    return reply.status(201).send(out.result);
  });

  /** Stop taking orders. The ones already placed are untouched. */
  app.post('/meals/:id/close', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_MEAL, 404);

    const out = await closeMeal({ mealId: params.data.id, kitchenId: cook.kitchenId });
    if (!out.ok) return refuse(reply, out);
    return out.result;
  });

  /**
   * Call the service off and refund everyone.
   *
   * The reason is required rather than defaulted here: it is what the customer
   * reads when their dinner disappears and their money comes back, and "Meal
   * cancelled by the kitchen" is the fallback for an operator with no screen
   * to type in, not for a cook who has one.
   */
  app.post('/meals/:id/cancel', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_MEAL, 404);

    const body = z.object({ reason: z.string() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const reason = body.data.reason.trim();
    if (!reason) return fail(reply, ERR.NAME_REQUIRED);

    const out = await cancelMeal({ mealId: params.data.id, reason, kitchenId: cook.kitchenId });
    if (!out.ok) return refuse(reply, out);

    /* `failed` is not an error: the sweep refunds one order at a time so that
       one broken row cannot strand the other thirty-nine, and the ids that
       would not refund come back for somebody to chase. */
    return out.result;
  });

  /* ---------------- the customer's side ---------------- */

  /** Interest, on and off. Costs nothing, commits nobody. */
  app.post('/meals/:id/interest', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_MEAL, 404);

    const out = await toggleInterest({
      mealId: params.data.id,
      customerKey: caller.customerKey,
    });
    if (!out.ok) return refuse(reply, out);
    return out.result;
  });

  /**
   * Confirm — the tap that moves money.
   *
   * `customerKey` comes from the token and can never come from the body: it
   * names the wallet that is about to be debited and the person who will own
   * the order, and taking it from a request would let anyone buy a meal with
   * a stranger's balance.
   *
   * Name, phone and address may be sent because they are the delivery
   * details for *this* order, which is not always what the account holds.
   */
  app.post('/meals/:id/confirm', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_MEAL, 404);

    const body = z
      .object({
        name: z.string().optional(),
        phone: z.string().optional(),
        address: z.record(z.unknown()).nullable().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const out = await confirmOrder({
      mealId: params.data.id,
      customer: {
        key: caller.customerKey,
        name: body.data.name ?? caller.name,
        phone: body.data.phone ?? caller.phone,
        address: body.data.address ?? null,
      },
    });
    /* A low balance carries `{ short, balance }`, and `refuse` passes it
       through: the top-up sheet needs the shortfall, not just a refusal. */
    if (!out.ok) return refuse(reply, out);

    return reply.status(201).send(out.result);
  });

  /* ---------------- the order rail ---------------- */

  /** The cook pushes one order one step. The last step is not theirs to take. */
  /**
   * Tell both sides an order moved, after it has actually moved.
   *
   * The customer's tracker used to be a photograph: the cook pressed "Start
   * cooking" and the doorstep learned about it on the next cold start, which
   * for somebody watching a rail is never. A notification row was already
   * written for them, but a row is a badge — it does not repaint the screen
   * they are staring at.
   *
   * Called after the transaction, not inside it: a socket send cannot be
   * rolled back, and announcing a step that then failed to commit is worse
   * than announcing it a moment late. Deliberately thin — the event says
   * which order and what it now is, and each side re-reads with the call it
   * already has.
   */
  const announceOrder = async (orderId: string) => {
    const order = await Order.findById(orderId, { customerKey: 1, kitchenId: 1, status: 1 })
      .lean()
      .catch(() => null);
    if (!order) return;

    publish(
      { customerKey: order.customerKey, kitchenId: order.kitchenId },
      { type: 'order', orderId: String(order._id), status: order.status },
    );
  };

  app.post('/orders/:id/advance', async (request, reply) => {
    const cook = await cookOf(request, reply);
    if (!cook) return;

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_ORDER, 404);

    const out = await advanceOrder({ orderId: params.data.id, kitchenId: cook.kitchenId });
    if (!out.ok) return refuse(reply, out);

    await announceOrder(params.data.id);
    return out.result;
  });

  /**
   * The customer says it arrived, and the cook gets paid.
   *
   * Deliberately not reachable by a cook: marking an order delivered is a
   * claim about a van, and this is the doorstep. Passing `customerKey` is
   * what keeps the two apart — without it the logic module would release
   * escrow for whoever asked.
   */
  app.post('/orders/:id/received', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_ORDER, 404);

    const out = await confirmReceived({
      orderId: params.data.id,
      customerKey: caller.customerKey,
    });
    if (!out.ok) return refuse(reply, out);

    await announceOrder(params.data.id);
    return out.result;
  });

  /**
   * Rate the kitchen an order came from.
   *
   * Scoped to the order rather than posted at a kitchen: the order is what
   * proves the customer ate the food, and it is what makes "once" meaningful.
   */
  app.post('/orders/:id/review', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_ORDER, 404);

    const body = z
      .object({ rating: z.coerce.number().min(1).max(5), text: z.string().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await leaveReview({
      orderId: params.data.id,
      customerKey: caller.customerKey,
      rating: body.data.rating,
      text: body.data.text,
    });
    if (!out.ok) return refuse(reply, out);
    return out.result;
  });

  /** Either side calls it off, up until the food is on its way. */
  app.post('/orders/:id/cancel', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const params = idParam.safeParse(request.params);
    if (!params.success) return fail(reply, ERR.NO_ORDER, 404);

    const body = z.object({ reason: z.string() }).safeParse(request.body ?? {});
    if (!body.success) return badBody(reply, body.error);

    const reason = body.data.reason.trim();
    if (!reason) return fail(reply, ERR.NAME_REQUIRED);

    /* `cancelOrder` takes no owner — it refunds whatever id it is handed,
       which is right for an operator resolving a case and wrong for a phone.
       Whose order this is gets settled here, before any money moves, and
       `by` is read off the same lookup so the notification reaches the other
       side rather than the side that pressed the button. */
    const order = await Order.findById(params.data.id)
      .select({ customerKey: 1, kitchenId: 1 })
      .lean()
      .catch(() => null);
    if (!order) return fail(reply, ERR.NO_ORDER, 404);

    const by =
      order.customerKey === caller.customerKey
        ? ('customer' as const)
        : caller.kitchenId && order.kitchenId === caller.kitchenId
          ? ('cook' as const)
          : null;
    if (!by) return fail(reply, ERR.FORBIDDEN, 403);

    const out = await cancelOrder({ orderId: params.data.id, by, reason });
    if (!out.ok) return refuse(reply, out);

    /* A cancellation is the one step the other side most needs off a screen
       they are already watching. */
    await announceOrder(params.data.id);
    return out.result;
  });
}
