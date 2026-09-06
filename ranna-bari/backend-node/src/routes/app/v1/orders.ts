import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { ERR, errText, type Fail } from '../../../lib/domain.js';
import { advanceOrder, cancelOrder, confirmReceived } from '../../../logic/orders.js';
import { Order } from '../../../models/index.js';
import { publish } from '../../../realtime/hub.js';
import { kitchenMayTrade } from '../../../logic/sync.js';
import { leaveReview } from '../../../logic/reviews.js';

/**
 * The order rail, over HTTP — shared by every kind of order.
 *
 * Every rule lives in `logic/orders.ts`; this file decides three things it
 * cannot: who is calling, whether they may, and what a refusal looks like on
 * the wire. The transitions take an *optional* owner — `kitchenId`,
 * `customerKey` — because an operator drives the same functions from the
 * panel with nobody to check against. On a phone that argument is never
 * optional, so it is filled from the token here and never from the body.
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
 * Everything else stays 400 on purpose: a refused transition is a well-formed
 * request the domain said no to, and the app branches on the code. Inventing
 * a status per refusal would give it a second thing to branch on that says
 * less.
 */
const STATUS: Record<string, number> = {
  [ERR.NO_ORDER]: 404,
  [ERR.NO_KITCHEN]: 404,
  [ERR.FORBIDDEN]: 403,
};

/** Hand a logic refusal back whole — `detail` carries whatever the code needs. */
const refuse = (reply: Replyish, out: Fail) =>
  fail(reply, out.error, STATUS[out.error] ?? 400, out.detail);

/*
 * Which refusal a malformed body deserves, and which field caused it.
 *
 * `ERR` has no "malformed request", so the refusal names the kind of thing
 * that was wrong instead: a missing reason and a negative amount are
 * different repairs, and the app rings one field. The failing field travels
 * in `detail` whichever code comes back.
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
       module answers an order owned by another kitchen with the same code, so
       the app has one branch rather than two. */
    fail(reply, ERR.FORBIDDEN, 403);
    return null;
  }

  /* Creating an obligation waits for approval; winding one down does not — a
     kitchen must always be able to advance and cancel what it already sold. */
  if (opts.trading && !(await kitchenMayTrade(caller.kitchenId))) {
    fail(reply, ERR.KITCHEN_UNAPPROVED, 403);
    return null;
  }

  return caller as Cook;
}

const idParam = z.object({ id: z.string().min(1) });

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

export async function orderRoutes(app: FastifyInstance) {
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

  /** The cook pushes one order one step. The last step is not theirs to take. */
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
   * The customer says it arrived.
   *
   * Deliberately not reachable by a cook: marking an order delivered is a
   * claim about a van, and this is the doorstep. Passing `customerKey` is
   * what keeps the two apart — without it the logic module would close the
   * order for whoever asked.
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
