import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { bearerFrom, identify, type AppIdentity } from '../../../auth/app-auth.js';
import { ERR, errText } from '../../../lib/domain.js';
import { todayKey } from '../../../lib/format.js';
import {
  acceptPrice,
  cancelRequest,
  counterOffer,
  createRequest,
  declineRequest,
  offerForCook,
  offerSummary,
  offersForRequest,
  payForRequest,
  rejectOffer,
  requestById,
  requestsForCook,
  requestsForCustomer,
  selectOffer,
  submitOffer,
  turnOf,
  withdrawOffer,
  type Actor,
  type OfferView,
} from '../../../logic/requests.js';
import { Kitchen, Offer } from '../../../models/index.js';

/**
 * Food requests, bidding and negotiation, as the Expo app calls them.
 *
 * The module note in `logic/requests.ts` names three rules. Two of them are
 * enforced there and cannot be undone from here — `by` comes from the token,
 * and every price is appended. The third one, **a cook never sees a
 * competitor's price**, is the one an HTTP layer can throw away by accident,
 * because it is the only rule about what a *response* contains.
 *
 * So `GET /requests/:id` does not have one body with a filter over it. It has
 * two bodies behind two different queries: the customer's, which reads every
 * offer on the request, and the cook's, which reads `{ requestId, kitchenId }`
 * and a `countDocuments`. A count is not a price and cannot be turned back
 * into one — no spread, no average, no rank — which is why the cook branch
 * hands back a number and nothing else about anybody else's bid.
 */

/* ------------------------------------------------------------------ *
 * plumbing
 * ------------------------------------------------------------------ */

const fail = (
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  code: string,
  status = 400,
) => reply.status(status).send({ error: code, message: errText(code) });

/**
 * The HTTP status for a refusal the logic layer already named.
 *
 * The code is what the app branches on; the status is what its transport
 * layer branches on, and those are different questions. A 409 tells the app
 * to re-read the request and show the state it actually found — somebody
 * moved — where a 400 means the body it sent was wrong and re-reading will
 * not help.
 */
const STATUS: Record<string, number> = {
  [ERR.NO_REQUEST]: 404,
  [ERR.NO_OFFER]: 404,
  [ERR.NO_ORDER]: 404,
  [ERR.NO_KITCHEN]: 404,
  [ERR.NOT_ELIGIBLE]: 403,
  [ERR.REQUEST_CLOSED]: 409,
  [ERR.OFFER_CLOSED]: 409,
  [ERR.NOT_YOUR_TURN]: 409,
  [ERR.ALREADY_SETTLED]: 409,
  [ERR.DUPLICATE]: 409,
};

const refuse = (
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  code: string,
) => fail(reply, code, STATUS[code] ?? 400);

const callerOf = (request: FastifyRequest) =>
  identify(bearerFrom(request.headers.authorization));

/**
 * The hats one caller can wear, strongest claim first.
 *
 * A cook is also somebody's customer, and the account carries both — the same
 * token that bids on a broadcast may have filed a request of its own last
 * week. The customer hat comes first because owning a request is the stronger
 * claim: reading it as its cook would show its own author less than they are
 * entitled to. Both clauses are ownership scoped, so trying one and then the
 * other cannot widen what is reachable — only which of two subsets answers.
 */
function hatsOf(caller: AppIdentity): Actor[] {
  const customer: Actor = { side: 'customer', customerKey: caller.customerKey };
  return caller.kitchenId
    ? [customer, { side: 'cook', kitchenId: caller.kitchenId }]
    : [customer];
}

/**
 * Which side of a negotiation this caller is on for one offer.
 *
 * Decided by a scoped existence check rather than by the account's role: a
 * cook haggling over a request they filed themselves is the customer in that
 * conversation, and `counterOffer` would refuse them as a cook whose kitchen
 * does not own the offer. It is never taken from the body — that claim is the
 * whole of the exploit the logic layer's `by` rule exists to stop.
 */
async function partyFor(caller: AppIdentity, offerId: string): Promise<Actor> {
  if (caller.kitchenId) {
    const own = await Offer.exists({ _id: offerId, kitchenId: caller.kitchenId })
      // A malformed id is a miss, not a crash.
      .catch(() => null);
    if (own) return { side: 'cook', kitchenId: caller.kitchenId };
  }
  return { side: 'customer', customerKey: caller.customerKey };
}

/**
 * Whose move it is, alongside the offer it belongs to.
 *
 * Derived by the logic layer from the history, so the app does not have to
 * hold a second copy of the rule and disagree with the server about who is
 * allowed to press the button.
 */
const withTurn = (offer: OfferView) => ({ ...offer, turn: turnOf(offer) });

/* ------------------------------------------------------------------ *
 * who a broadcast reaches
 * ------------------------------------------------------------------ */

type Point = { lat: number; lng: number };

/** Great-circle kilometres. The app's `distanceKm`, which has no server twin yet. */
function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The kitchens a broadcast is addressed to, frozen at this moment.
 *
 * The same rule browse uses — open, and willing to come this far — so a
 * request cannot reach a cook whose food the customer could never have been
 * shown. `isOpen` is asked only of a request wanted today: it says whether a
 * kitchen is taking orders *now*, which is no answer at all about Friday's
 * cake, and applying it anyway would empty the broadcast for anyone planning
 * ahead in the evening.
 *
 * The caller's own kitchen is dropped. A cook bidding against themselves is
 * the one thing the "whose turn is it" rule has no answer for, and the app
 * already skips it when it simulates offers.
 */
async function broadcastTo(
  draft: { lat?: number; lng?: number; area?: string; wantedDate?: string },
  ownKitchenId: string | null,
): Promise<string[]> {
  const sameDay = !draft.wantedDate || draft.wantedDate <= todayKey();

  const kitchens = await Kitchen.find(
    { suspended: false, ...(sameDay ? { isOpen: true } : {}) },
    { lat: 1, lng: 1, deliveryRadiusKm: 1, area: 1 },
  ).lean();

  const origin =
    typeof draft.lat === 'number' && typeof draft.lng === 'number'
      ? { lat: draft.lat, lng: draft.lng }
      : null;

  return kitchens
    .filter((kitchen) => String(kitchen._id) !== ownKitchenId)
    .filter((kitchen) => {
      if (origin && kitchen.lat && kitchen.lng) {
        const away = distanceKm(origin, { lat: kitchen.lat, lng: kitchen.lng });
        return away <= (kitchen.deliveryRadiusKm ?? 3);
      }
      /* No coordinates on one side or the other — a kitchen seeded from
         `chefs.json` may have none. The area is the coarser answer the app
         already falls back to rather than dropping the kitchen entirely. */
      return !draft.area || !kitchen.area || kitchen.area === draft.area;
    })
    .map((kitchen) => String(kitchen._id));
}

/* ------------------------------------------------------------------ *
 * input
 * ------------------------------------------------------------------ */

/**
 * The draft, in the app's vocabulary.
 *
 * `details`, `wantedDate` and `categoryId` are what a phone in somebody's
 * pocket sends; the logic layer renames them onto the columns. Accepting the
 * column names too costs one line each and saves a migration nobody can time.
 */
const draftSchema = z.object({
  title: z.string().min(1),
  details: z.string().optional(),
  description: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  /** 'all' for a broadcast, otherwise the one kitchen being asked. */
  target: z.string().min(1).optional(),
  wantedDate: z.string().optional(),
  wantedFor: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(),
  area: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

/** A refused body still deserves the right word for what was wrong with it. */
const draftError = (issues: { path: (string | number)[] }[]) =>
  issues.some((issue) => issue.path[0] === 'budget' || issue.path[0] === 'quantity')
    ? ERR.BAD_AMOUNT
    : ERR.NAME_REQUIRED;

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

export async function requestRoutes(app: FastifyInstance) {
  /**
   * The board.
   *
   * Two lists behind one path, because the app has two screens and one token.
   * A cook defaults to their kitchen's board — that is the screen they open —
   * and `?as=customer` asks for the requests they filed themselves. A caller
   * with no kitchen has only the one answer and cannot ask for the other.
   */
  app.get('/requests', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const query = z
      .object({
        as: z.enum(['customer', 'cook']).optional(),
        status: z.string().optional(),
        take: z.coerce.number().min(1).max(100).optional(),
      })
      .safeParse(request.query ?? {});
    if (!query.success) return fail(reply, ERR.NAME_REQUIRED);

    const side = query.data.as ?? (caller.kitchenId ? 'cook' : 'customer');
    if (side === 'cook' && !caller.kitchenId) return refuse(reply, ERR.NOT_ELIGIBLE);

    const opts = { status: query.data.status, take: query.data.take };
    const requests =
      side === 'cook' && caller.kitchenId
        ? await requestsForCook(caller.kitchenId, opts)
        : await requestsForCustomer(caller.customerKey, opts);

    return { as: side, requests };
  });

  /**
   * One request — and this is the endpoint the whole module is careful about.
   *
   * The two branches are two different queries, not one query and a filter.
   * A customer reads every offer, the spread across them, and each price. A
   * cook reads the single row matching their own `kitchenId` plus a count of
   * how many other kitchens are on the request, and there is no field in that
   * body from which another cook's number can be recovered: not a low, not a
   * high, not an average, not a position in a list. Nothing is fetched and
   * then dropped, so nothing can survive a later edit that forgets why the
   * dropping was there.
   *
   * Which branch runs is decided by ownership, resolved through scoped
   * queries — never by a parameter the caller chose.
   */
  app.get('/requests/:id', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };

    for (const actor of hatsOf(caller)) {
      const view = await requestById(actor, id);
      if (!view) continue;

      if (actor.side === 'cook') {
        const [offer, competingOffers] = await Promise.all([
          offerForCook(id, actor.kitchenId),
          /* The count of rivals, because a cook deciding whether to bid
             deserves to know they are one of five. The prices are not, and a
             count cannot be inverted into one. */
          Offer.countDocuments({ requestId: id, kitchenId: { $ne: actor.kitchenId } }),
        ]);

        return {
          as: 'cook',
          request: view,
          offer: offer ? withTurn(offer) : null,
          competingOffers,
        };
      }

      const offers = await offersForRequest(id, actor.customerKey);
      if (!offers.ok) return refuse(reply, offers.error);

      const summary = await offerSummary(actor, id);
      if (!summary.ok) return refuse(reply, summary.error);

      return {
        as: 'customer',
        request: view,
        offers: offers.result.map(withTurn),
        summary: summary.result,
      };
    }

    /* Not "you may not read this" but "there is no such request" — an id
       somebody guessed teaches them nothing either way. */
    return refuse(reply, ERR.NO_REQUEST);
  });

  /**
   * File a request, broadcast or targeted.
   *
   * The eligible set is computed here and frozen onto the row, because this
   * is the layer that knows where every kitchen is. A targeted request is
   * checked against a real, unsuspended kitchen first: the logic layer would
   * accept any string as a target and leave the customer waiting on a cook
   * that does not exist.
   */
  app.post('/requests', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const body = (request.body ?? {}) as { request?: unknown };
    const parsed = draftSchema.safeParse(body.request ?? body);
    if (!parsed.success) return fail(reply, draftError(parsed.error.issues));

    const target = parsed.data.target ?? 'all';

    let eligible: string[] = [];
    if (target === 'all') {
      eligible = await broadcastTo(parsed.data, caller.kitchenId);
    } else {
      const kitchen = await Kitchen.exists({ _id: target, suspended: false }).catch(
        () => null,
      );
      if (!kitchen) return refuse(reply, ERR.NO_KITCHEN);
    }

    // The customer is whoever holds the token, never whatever the body says.
    const out = await createRequest(caller.customerKey, {
      request: { ...parsed.data, target },
      eligible,
    });
    if (!out.ok) return refuse(reply, out.error);

    return reply.status(201).send({ request: out.result });
  });

  app.post('/requests/:id/cancel', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const out = await cancelRequest(caller.customerKey, id);
    if (!out.ok) return refuse(reply, out.error);
    return out.result;
  });

  /**
   * A cook bids.
   *
   * A body with no price is a cook saying they are interested without naming
   * a number yet, which is a state the negotiation already has. Sending one
   * again is a changed price rather than a second bid — the logic layer keeps
   * it to one offer per kitchen per request.
   */
  app.post('/requests/:id/offers', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);
    if (!caller.kitchenId) return refuse(reply, ERR.NOT_ELIGIBLE);

    const { id } = request.params as { id: string };
    const body = z
      .object({
        price: z.coerce.number().positive().nullish(),
        note: z.string().optional(),
        prepTime: z.string().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await submitOffer(
      {
        kitchenId: caller.kitchenId,
        // The kitchen's name, not the account holder's — it is what the
        // customer sees on the comparison screen.
        name: caller.kitchenName ?? caller.name,
      },
      {
        requestId: id,
        price: body.data.price ?? null,
        note: body.data.note ?? null,
        prepTime: body.data.prepTime ?? null,
      },
    );
    if (!out.ok) return refuse(reply, out.error);

    return { offer: withTurn(out.result) };
  });

  /** A cook passes, so the request leaves their board rather than rotting on it. */
  app.post('/requests/:id/decline', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);
    if (!caller.kitchenId) return refuse(reply, ERR.NOT_ELIGIBLE);

    const { id } = request.params as { id: string };
    const out = await declineRequest(caller.kitchenId, id);
    if (!out.ok) return refuse(reply, out.error);

    return { offer: out.result };
  });

  /** A cook pulls out. Their own offer only — the id alone is not enough. */
  app.post('/offers/:id/withdraw', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);
    if (!caller.kitchenId) return refuse(reply, ERR.NOT_ELIGIBLE);

    const { id } = request.params as { id: string };
    const out = await withdrawOffer(caller.kitchenId, id);
    if (!out.ok) return refuse(reply, out.error);
    return out.result;
  });

  /** The customer picks one. Every other live offer closes with it. */
  app.post('/requests/:id/select', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const body = z.object({ offerId: z.string().min(1) }).safeParse(request.body ?? {});
    // Nothing to select is the same dead end as selecting something gone.
    if (!body.success) return refuse(reply, ERR.NO_OFFER);

    const out = await selectOffer(caller.customerKey, {
      requestId: id,
      offerId: body.data.offerId,
    });
    if (!out.ok) return refuse(reply, out.error);

    return { offer: withTurn(out.result) };
  });

  /**
   * Name a different number.
   *
   * Either side may be calling, and which one is settled by who owns the
   * offer rather than by the body. `amount` is the only thing taken from the
   * request; the identity behind it is the token's.
   */
  app.post('/offers/:id/counter', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const body = z
      .object({ amount: z.coerce.number().positive() })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.BAD_AMOUNT);

    const out = await counterOffer(await partyFor(caller, id), {
      offerId: id,
      amount: body.data.amount,
    });
    if (!out.ok) return refuse(reply, out.error);

    return { offer: withTurn(out.result) };
  });

  /**
   * Take the number on the table.
   *
   * No amount in the body on purpose: the price being accepted is the last
   * one in the history, and a caller with an opinion about it is a caller
   * agreeing to something the other side never said.
   */
  app.post('/offers/:id/accept', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const out = await acceptPrice(await partyFor(caller, id), id);
    if (!out.ok) return refuse(reply, out.error);

    return { offer: withTurn(out.result) };
  });

  /**
   * The customer walks away from one negotiation, keeping the request.
   *
   * Customer-side only — a cook leaving a negotiation is `withdraw`, and the
   * two do very different things to the offers that were closed out when this
   * one was selected.
   */
  app.post('/offers/:id/reject', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await rejectOffer(caller.customerKey, {
      offerId: id,
      reason: body.data.reason,
    });
    if (!out.ok) return refuse(reply, out.error);

    return { request: out.result };
  });

  /**
   * Pay the agreed price and cut the order.
   *
   * The amount is not in the body and never will be — it is the offer's
   * `agreedPrice`, the one number both sides signed off on. The delivery
   * details default to the account's own, because the name and phone that
   * matter are the verified ones; a body may override them for an order going
   * somewhere else.
   */
  app.post('/requests/:id/pay', async (request, reply) => {
    const caller = await callerOf(request);
    if (!caller) return fail(reply, 'unauthenticated', 401);

    const { id } = request.params as { id: string };
    const body = z
      .object({
        customer: z
          .object({
            name: z.string().optional(),
            phone: z.string().optional(),
            address: z.unknown().optional(),
          })
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return fail(reply, ERR.NAME_REQUIRED);

    const out = await payForRequest(caller.customerKey, {
      requestId: id,
      customer: {
        name: body.data.customer?.name ?? caller.name,
        phone: body.data.customer?.phone ?? caller.phone,
        address: body.data.customer?.address ?? null,
      },
    });
    if (!out.ok) return refuse(reply, out.error);

    return reply.status(201).send({ order: out.result });
  });
}
