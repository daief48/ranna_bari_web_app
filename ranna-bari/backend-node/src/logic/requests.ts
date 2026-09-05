import type { ClientSession, FilterQuery, UpdateQuery } from 'mongoose';

import { Kitchen, Notification, Offer, Order, Request } from '../models/index.js';
import { isDuplicateKey, tx } from '../config/db.js';
import {
  ERR,
  OFFER_STATUS,
  REQUEST_STATUS,
  fail,
  isLiveOffer,
  ok,
  type Result,
} from '../lib/domain.js';
import { addDays, dayKey, makeCode, taka } from '../lib/format.js';
import { balanceFor, post } from './ledger.js';
import { getSettings } from './settings.js';

/**
 * Food requests, cook bidding and price negotiation.
 *
 * A customer describes something nobody has listed — a two-pound chocolate
 * cake for Friday — and either asks one cook or puts it out to every cook who
 * could reach them. Cooks answer with their own price. The customer picks
 * one, haggles if they want to, and only then does any money move, through
 * the same wallet and the same escrow everything else uses.
 *
 * Ported from the Expo app's `src/lib/requestLogic.js`. Three rules shape the
 * whole module, and each one changes shape on a server:
 *
 * **A cook never sees a competitor's price.** On a device that was a UI
 * guarantee — the screens simply did not render it. Here it is an
 * authorisation one, and it is spelled as a *query predicate* rather than a
 * check a caller can forget: `offerForCook` filters on `kitchenId` inside the
 * query, `offersForRequest` resolves the request by the asking customer's own
 * key before it will read a single offer, and `offerSummary` hands a cook the
 * count of rivals with the spread nulled out. There is no path through this
 * file that returns one kitchen's price to another.
 *
 * **Nothing is overwritten.** Every price either side names is `$push`ed onto
 * the offer's history with who said it and when — never a `$set` of the whole
 * array, which would let one append silently swallow another. The standing
 * price is the last entry; `agreedPrice` is a copy taken at the moment both
 * sides stop. A negotiation can always be read back in full.
 *
 * **You cannot accept your own offer.** Whose turn it is falls out of the
 * history rather than being tracked separately, so it cannot disagree with
 * it: the last person to name a number is waiting on the other one. `by` is
 * taken from the caller's identity and never from an argument — on a device a
 * screen could only speak for itself, but a request body will happily claim
 * to be the other side, and that claim is the whole of the exploit.
 *
 * Every transition below touches at least two collections, so every one of
 * them runs inside `tx()` with the session threaded through each query.
 */

/* ------------------------------------------------------------------ *
 * statuses
 * ------------------------------------------------------------------ */

/* The status vocabularies live in `lib/domain.ts`, which the panel and the
   app both branch on. A second copy here would be a second answer to "what
   is a live offer" and one of them would eventually be wrong. */
export { REQUEST_STATUS, OFFER_STATUS, isLiveOffer } from '../lib/domain.js';

/** An offer the customer and cook are still going back and forth on. */
export const isNegotiable = (status: string | null | undefined): boolean =>
  status === OFFER_STATUS.SELECTED || status === OFFER_STATUS.NEGOTIATING;

/**
 * The five live statuses as a query clause.
 *
 * The same set `isLiveOffer` folds. It exists separately because a filter
 * applied in JavaScript after the read is a filter that ships every closed
 * offer across the wire first — and, on the cook-facing paths, one a caller
 * could forget.
 */
const LIVE_OFFER: string[] = [
  OFFER_STATUS.INTERESTED,
  OFFER_STATUS.PRICED,
  OFFER_STATUS.SELECTED,
  OFFER_STATUS.NEGOTIATING,
  OFFER_STATUS.AGREED,
];

/* ------------------------------------------------------------------ *
 * who is asking
 * ------------------------------------------------------------------ */

/** The two sides of a negotiation. The app's `by`. */
export type Party = 'customer' | 'cook';

/**
 * Who is calling, as the thing a query can be built from.
 *
 * A discriminated object rather than a pair of loose strings: a customer key
 * and a kitchen id are both strings, and the day somebody passes one where
 * the other belongs is the day a cook reads a rival's price.
 */
export type Actor =
  | { side: 'customer'; customerKey: string }
  | { side: 'cook'; kitchenId: string };

/** One entry in a negotiation. Append-only — see the module note. */
export type PriceMove = { by: Party; amount: number; at: string; accepted?: boolean };

/**
 * The requests this actor is allowed to see at all.
 *
 * A customer's own; for a cook, the ones addressed to them plus the
 * broadcasts they were listed on when it went out. `eligible` is frozen at
 * creation, so a kitchen cannot become able to read a request that was never
 * sent to it.
 */
function requestScope(actor: Actor): FilterQuery<Record<string, unknown>> {
  return actor.side === 'customer'
    ? { customerKey: actor.customerKey }
    : { $or: [{ target: actor.kitchenId }, { target: 'all', eligible: actor.kitchenId }] };
}

/* ------------------------------------------------------------------ *
 * refusing from inside a transaction
 * ------------------------------------------------------------------ */

/**
 * A refusal raised where a `return` would be wrong.
 *
 * Half of these transitions decide to refuse *after* they have written
 * something — a request is claimed, then the guard that says somebody else
 * claimed it first comes back empty. Returning a `fail` there would commit
 * the writes that already happened, so a refusal has to unwind the way an
 * error does. It is converted back into a `Result` at the boundary and never
 * escapes this module.
 */
class Refusal extends Error {
  constructor(
    readonly code: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'Refusal';
  }
}

function refuse(code: string, detail?: Record<string, unknown>): never {
  throw new Refusal(code, detail);
}

/** Run one transition atomically, turning a refusal back into `{ ok: false }`. */
async function transition<T>(fn: (session: ClientSession) => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await tx(fn));
  } catch (error) {
    if (error instanceof Refusal) return fail(error.code, error.detail);
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

type RequestRow = {
  _id: unknown;
  code: string;
  customerKey: string;
  title: string;
  items?: { name: string; qty: number }[];
  description: string;
  quantity: number;
  budget: number | null;
  target: string;
  eligible: string[];
  wantedFor: string | null;
  category: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  selectedOfferId: string | null;
  orderId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type OfferRow = {
  _id: unknown;
  requestId: string;
  kitchenId: string;
  cookName: string;
  status: string;
  price: number | null;
  agreedPrice: number | null;
  note: string;
  prepTime: string;
  history: PriceMove[] | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type KitchenRow = {
  _id: unknown;
  avatar?: string;
  rating?: number;
  reviewCount?: number;
  area?: string;
  lat?: number;
  lng?: number;
};

/**
 * A request, as the app reads one.
 *
 * The schema landed with three of these columns under other names —
 * `description`, `category`, `wantedFor`. The app writes and reads `details`,
 * `categoryId` and `wantedDate`, and a phone in somebody's pocket cannot be
 * redeployed as quickly as this file can, so the two vocabularies meet here,
 * exactly once, instead of at every screen.
 *
 * No contact details: a request carries none, because the name, phone and
 * address that matter are the ones true at *payment*, and those come off the
 * account at the moment the order is cut.
 */
function shapeRequest(row: RequestRow) {
  return {
    id: String(row._id),
    code: row.code,
    customerKey: row.customerKey,
    title: row.title,
    /* The lines behind the headline. Empty for a request written before the
       app could list them, which is why `title` remains the one field a
       reader can always count on. */
    items: row.items ?? [],
    details: row.description ?? '',
    quantity: row.quantity,
    budget: row.budget ?? null,
    target: row.target,
    eligible: row.eligible ?? [],
    wantedDate: row.wantedFor ?? null,
    categoryId: row.category ?? null,
    area: row.area ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    status: row.status,
    selectedOfferId: row.selectedOfferId ?? null,
    orderId: row.orderId ?? null,
    createdAt: row.createdAt ?? null,
    /* The app stamped `closedAt` when a request ended. The row is timestamped,
       so that moment is already `updatedAt` — a second field would be a second
       answer to the same question, and they drift. */
    updatedAt: row.updatedAt ?? null,
  };
}

/**
 * One offer, with its kitchen's public face filled in.
 *
 * The app copies the cook's avatar, rating, area and coordinates onto every
 * offer because AsyncStorage cannot join. Here they are the kitchen's own
 * columns and a copy would be stale the day a cook changes their photo, so
 * the join happens on read and the app still gets the fields it reads.
 */
function shapeOffer(row: OfferRow, kitchen?: KitchenRow) {
  const history = (row.history ?? []) as PriceMove[];
  return {
    id: String(row._id),
    requestId: row.requestId,
    kitchenId: row.kitchenId,
    cookName: row.cookName ?? '',
    status: row.status,
    price: row.price ?? null,
    agreedPrice: row.agreedPrice ?? null,
    note: row.note ?? '',
    prepTime: row.prepTime ?? '',
    history,
    cookAvatar: kitchen?.avatar ?? '',
    rating: kitchen?.rating ?? 0,
    reviewCount: kitchen?.reviewCount ?? 0,
    area: kitchen?.area ?? '',
    lat: kitchen?.lat ?? null,
    lng: kitchen?.lng ?? null,
    createdAt: row.createdAt ?? null,
  };
}

export type RequestView = ReturnType<typeof shapeRequest>;
export type OfferView = ReturnType<typeof shapeOffer>;

/** The kitchens behind a set of offers, by id. A miss is a blank avatar. */
async function kitchensFor(
  ids: string[],
  session?: ClientSession,
): Promise<Map<string, KitchenRow>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();

  const rows = await Kitchen.find({ _id: { $in: unique } })
    .session(session ?? null)
    .lean()
    .catch(() => []);

  return new Map(rows.map((row) => [String(row._id), row as unknown as KitchenRow]));
}

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */

type NotifyArgs = {
  audience: Party;
  kind: string;
  key: string;
  title: string;
  body: string;
  customerKey?: string | null;
  kitchenId?: string | null;
  requestId?: string | null;
  offerId?: string | null;
  orderId?: string | null;
};

const notificationDoc = (args: NotifyArgs) => ({
  key: args.key,
  audience: args.audience,
  kind: args.kind,
  title: args.title,
  /* The sentence keeps its `{title}` and `{amount}` placeholders. The app
     fills them from whatever the notification points at, at read time, so a
     line written when a price was agreed still reads correctly a week later
     after the request was renamed. Baking the values in here would freeze a
     copy of them instead. */
  body: args.body,
  customerKey: args.customerKey ?? null,
  kitchenId: args.kitchenId ?? null,
  requestId: args.requestId ?? null,
  offerId: args.offerId ?? null,
  orderId: args.orderId ?? null,
});

/**
 * File one notification, unless the same one is already sitting unread.
 *
 * The app's dedupe, kept: a customer who has not opened the last "new offer"
 * line does not need a second one. The keys are the app's too — several of
 * them carry a count (`…:${priced.length}`, `…:${history.length}`) precisely
 * so that each new arrival refreshes the line exactly once.
 */
async function notify(session: ClientSession, args: NotifyArgs): Promise<void> {
  const existing = await Notification.findOne({ key: args.key, read: false })
    .session(session)
    .lean();
  if (existing) return;

  await Notification.create([notificationDoc(args)], { session });
}

/**
 * File the same event for several kitchens at once.
 *
 * The recipient is part of every key. On one device "the cook" was one
 * person and `cook:offer-not-selected:<request>` was unique; here it would
 * dedupe the second kitchen's line against the first kitchen's and four cooks
 * would be left wondering. No unread check either: these fan-outs happen once
 * per request by construction, so it is one insert rather than 2N round trips.
 */
async function notifyEach(session: ClientSession, rows: NotifyArgs[]): Promise<void> {
  if (!rows.length) return;
  /* `ordered: true` is required, not stylistic: Mongoose refuses a multi-
     document `create()` inside a session without it, because an unordered
     batch can be split across the transaction boundary. Omitting it throws
     only once a broadcast reaches two or more cooks — which is every real
     broadcast, and no test with a single recipient. */
  await Notification.create(rows.map(notificationDoc), { session, ordered: true });
}

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

/** One request, or null — never one this actor was not on. */
export async function requestById(
  actor: Actor,
  requestId: string,
): Promise<RequestView | null> {
  const row = await Request.findOne({ _id: requestId, ...requestScope(actor) })
    .lean()
    // A malformed id is a miss, not a crash.
    .catch(() => null);
  return row ? shapeRequest(row as unknown as RequestRow) : null;
}

export async function requestsForCustomer(
  customerKey: string,
  opts: { status?: string; take?: number } = {},
): Promise<RequestView[]> {
  const rows = await Request.find({
    customerKey,
    ...(opts.status ? { status: opts.status } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(opts.take ?? 50)
    .lean();

  return rows.map((row) => shapeRequest(row as unknown as RequestRow));
}

/**
 * Requests a cook should be looking at.
 *
 * A broadcast reaches them if they were listed as eligible when it was made;
 * a direct request reaches only its addressee. Requests they have already
 * answered stay on the list, because the answer may still be negotiating.
 */
export async function requestsForCook(
  kitchenId: string,
  opts: { status?: string; take?: number } = {},
): Promise<RequestView[]> {
  const rows = await Request.find({
    ...requestScope({ side: 'cook', kitchenId }),
    ...(opts.status ? { status: opts.status } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(opts.take ?? 50)
    .lean();

  return rows.map((row) => shapeRequest(row as unknown as RequestRow));
}

/**
 * Every offer on a request. Customer-side only, and that is enforced here.
 *
 * The customer's key is not a parameter this function checks — it is the
 * clause that finds the request in the first place. A request that is not
 * theirs does not exist as far as this path is concerned, so there is no
 * ordering of the code in which the offers are read and the ownership is
 * checked afterwards.
 */
export async function offersForRequest(
  requestId: string,
  customerKey: string,
): Promise<Result<OfferView[]>> {
  const request = await Request.findOne({ _id: requestId, customerKey })
    .lean()
    .catch(() => null);
  if (!request) return fail(ERR.NO_REQUEST);

  const rows = await Offer.find({ requestId }).sort({ createdAt: 1 }).lean();
  const kitchens = await kitchensFor(rows.map((row) => row.kitchenId));

  return ok(
    rows.map((row) =>
      shapeOffer(row as unknown as OfferRow, kitchens.get(row.kitchenId)),
    ),
  );
}

/** One kitchen's own offer, which is all a cook is ever shown. */
export async function offerForCook(
  requestId: string,
  kitchenId: string,
): Promise<OfferView | null> {
  const row = await Offer.findOne({ requestId, kitchenId })
    .lean()
    .catch(() => null);
  if (!row) return null;

  const kitchens = await kitchensFor([row.kitchenId]);
  return shapeOffer(row as unknown as OfferRow, kitchens.get(row.kitchenId));
}

export type OfferSummary = {
  interested: number;
  priced: number;
  low: number | null;
  high: number | null;
};

/**
 * How many cooks have answered, and the spread of what they asked.
 *
 * The spread is the customer's — it is the whole of the comparison screen.
 * A cook gets the counts and two nulls: knowing you are one of five is worth
 * having and changes nothing about anyone else's price, which is exactly the
 * line this module draws.
 */
export async function offerSummary(
  actor: Actor,
  requestId: string,
): Promise<Result<OfferSummary>> {
  const request = await Request.findOne({ _id: requestId, ...requestScope(actor) })
    .lean()
    .catch(() => null);
  if (!request) return fail(ERR.NO_REQUEST);

  const rows = await Offer.find({ requestId, status: { $in: LIVE_OFFER } }, { price: 1 }).lean();
  const amounts = rows
    .map((row) => row.price)
    .filter((price): price is number => price != null);

  return ok({
    interested: rows.length,
    priced: amounts.length,
    low: actor.side === 'cook' || !amounts.length ? null : Math.min(...amounts),
    high: actor.side === 'cook' || !amounts.length ? null : Math.max(...amounts),
  });
}

/** The number currently on the table, and who put it there. */
export function standing(
  offer: { history?: PriceMove[] | null } | null | undefined,
): PriceMove | null {
  const history = offer?.history ?? [];
  const last = history.length ? history[history.length - 1] : null;
  return last ? { by: last.by, amount: last.amount, at: last.at, accepted: last.accepted } : null;
}

/**
 * Whose move it is. Nobody's, once it is agreed.
 *
 * Derived, never stored: a `turn` column would be a second record of
 * something the history already says, and the two would disagree the first
 * time a write half-landed. Before anybody has named a number the move is the
 * cook's — a request with no price on it is waiting on a bid.
 */
export function turnOf(
  offer: { status?: string | null; history?: PriceMove[] | null } | null | undefined,
): Party | null {
  if (!offer || offer.status === OFFER_STATUS.AGREED) return null;
  const last = standing(offer);
  if (!last) return 'cook';
  return last.by === 'cook' ? 'customer' : 'cook';
}

/* ------------------------------------------------------------------ *
 * the request
 * ------------------------------------------------------------------ */

export type RequestDraft = {
  title?: string;
  /** What was asked for, line by line.  is derived from it. */
  items?: { name?: string; qty?: number | string }[] | null;
  /** The app's name for it; the column is `description`. */
  details?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  budget?: number | string | null;
  /** 'all' for a broadcast, otherwise a kitchenId. */
  target?: string | null;
  /** The app's name for it; the column is `wantedFor`. */
  wantedDate?: string | null;
  wantedFor?: string | null;
  /** The app's name for it; the column is `category`. */
  categoryId?: string | null;
  category?: string | null;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/** The request row, by id, inside the transaction. Somebody else's is a miss. */
async function ownRequest(
  session: ClientSession,
  requestId: string,
  customerKey: string,
) {
  const row = await Request.findOne({ _id: requestId, customerKey })
    .session(session)
    .catch(() => null);
  /* Not "you may not touch this" but "there is no such request" — an id
     somebody guessed teaches them nothing either way. */
  if (!row) refuse(ERR.NO_REQUEST);
  return row;
}

/**
 * Put a request out.
 *
 * `eligible` is decided by the caller, which is the only place that knows
 * where everyone is; it is frozen onto the request so the set of cooks who
 * were asked cannot quietly change afterwards — which is also what makes
 * `requestScope` a safe authorisation clause a week later.
 *
 * The customer is whoever holds the token, never whatever the body says.
 */
export async function createRequest(
  customerKey: string,
  args: { request: RequestDraft; eligible?: string[] },
): Promise<Result<RequestView>> {
  const draft = args.request ?? ({} as RequestDraft);

  /*
   * Items first, then the headline.
   *
   * A request may arrive either way: the app's newer screen sends a list, and
   * anything older sends one title line. Both are valid, so the list is
   * cleaned up and `title` is composed from it when there is one — which
   * keeps every reader of `title` (offers, the order it becomes, both
   * inboxes, the operator console) working on a single string, unchanged.
   */
  const items = (draft.items ?? [])
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      qty: Math.max(1, Math.round(Number(item?.qty) || 1)),
    }))
    .filter((item) => item.name);

  const headline = items.length
    ? items.map((item) => (item.qty > 1 ? item.qty + ' × ' + item.name : item.name)).join(', ')
    : String(draft.title ?? '').trim();

  const title = headline;
  if (!title) return fail(ERR.NAME_REQUIRED);

  const quantity = Math.max(1, Math.round(Number(draft.quantity) || 1));
  const budget = draft.budget ? Math.round(Number(draft.budget)) : null;
  if (budget != null && (!Number.isFinite(budget) || budget <= 0)) {
    return fail(ERR.BAD_AMOUNT);
  }

  const target = String(draft.target ?? 'all');
  const eligible =
    target === 'all' ? (args.eligible ?? []).map((id) => String(id)) : [target];

  return transition(async (session) => {
    let created;
    try {
      [created] = await Request.create(
        [
          {
            code: makeCode(),
            customerKey,
            title,
            items,
            description: String(draft.details ?? draft.description ?? '').trim(),
            quantity,
            budget,
            target,
            eligible,
            wantedFor: draft.wantedDate ?? draft.wantedFor ?? null,
            category: draft.categoryId ?? draft.category ?? null,
            area: draft.area ?? null,
            lat: draft.lat ?? null,
            lng: draft.lng ?? null,
            status: REQUEST_STATUS.OPEN,
            selectedOfferId: null,
            orderId: null,
          },
        ],
        { session },
      );
    } catch (error) {
      // Two codes collided. Rare enough to hand back rather than retry inside
      // a transaction that is already doomed.
      if (isDuplicateKey(error)) refuse(ERR.DUPLICATE);
      throw error;
    }

    const requestId = String(created._id);

    await notifyEach(
      session,
      eligible.map((kitchenId) => ({
        audience: 'cook' as const,
        kind: 'request-new',
        key: `cook:request-new:${requestId}:${kitchenId}`,
        title: 'New food request',
        body: `A customer is looking for ${created.title}. Name your price.`,
        kitchenId,
        requestId,
      })),
    );

    return shapeRequest(created.toObject() as unknown as RequestRow);
  });
}

/** Withdraw a request. Only before money has moved. */
export async function cancelRequest(
  customerKey: string,
  requestId: string,
): Promise<Result<{ requestId: string }>> {
  return transition(async (session) => {
    const request = await ownRequest(session, requestId, customerKey);
    if (request.status === REQUEST_STATUS.ORDERED) refuse(ERR.ALREADY_SETTLED);
    if (request.status === REQUEST_STATUS.CANCELLED) refuse(ERR.ALREADY_SETTLED);

    /* Read the cooks who were still in it before closing them out — after the
       update there is nothing left matching to tell. */
    const answering = await Offer.find(
      { requestId, status: { $in: LIVE_OFFER } },
      { kitchenId: 1 },
    )
      .session(session)
      .lean();

    await Request.updateOne(
      { _id: requestId },
      { status: REQUEST_STATUS.CANCELLED },
      { session },
    );

    // Every offer closes with it. None of them held money, so nothing to refund.
    await Offer.updateMany(
      { requestId, status: { $in: LIVE_OFFER } },
      { status: OFFER_STATUS.NOT_SELECTED },
      { session },
    );

    /* Only the cooks who actually answered. Telling forty kitchens that a
       request they ignored has gone away is noise. */
    await notifyEach(
      session,
      answering.map((offer) => ({
        audience: 'cook' as const,
        kind: 'request-cancelled',
        key: `cook:request-cancelled:${requestId}:${offer.kitchenId}`,
        title: 'Request withdrawn',
        body: `The customer withdrew the request for ${request.title}.`,
        kitchenId: offer.kitchenId,
        requestId,
      })),
    );

    return { requestId };
  });
}

/* ------------------------------------------------------------------ *
 * offers
 * ------------------------------------------------------------------ */

/**
 * A cook answers.
 *
 * One offer per cook per request, updated rather than duplicated — a cook who
 * changes their mind about the price has not made a second bid, and the
 * unique index on (requestId, kitchenId) means they cannot make one by
 * racing themselves. The change is appended to the history like any other, so
 * the customer can see that it moved.
 */
export async function submitOffer(
  cook: { kitchenId: string; name?: string },
  args: {
    requestId: string;
    price?: number | string | null;
    note?: string | null;
    prepTime?: string | null;
  },
): Promise<Result<OfferView>> {
  return transition(async (session) => {
    const request = await Request.findById(args.requestId)
      .session(session)
      .catch(() => null);
    if (!request) refuse(ERR.NO_REQUEST);
    if (request.status !== REQUEST_STATUS.OPEN) refuse(ERR.REQUEST_CLOSED);
    if (!(request.eligible ?? []).some((id) => String(id) === String(cook.kitchenId))) {
      refuse(ERR.NOT_ELIGIBLE);
    }

    const amount =
      args.price == null || args.price === '' ? null : Math.round(Number(args.price));
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) refuse(ERR.BAD_AMOUNT);

    const entry: PriceMove | null =
      amount == null ? null : { by: 'cook', amount, at: new Date().toISOString() };

    const existing = await Offer.findOne({
      requestId: args.requestId,
      kitchenId: cook.kitchenId,
    })
      .session(session)
      .lean();

    let offer: OfferRow;

    if (existing) {
      if (existing.status === OFFER_STATUS.NOT_SELECTED) refuse(ERR.OFFER_CLOSED);
      if (existing.status === OFFER_STATUS.AGREED) refuse(ERR.ALREADY_SETTLED);

      const set: Record<string, unknown> = {};
      if (amount != null) {
        set.price = amount;
        set.status = OFFER_STATUS.PRICED;
      }
      if (args.note != null) set.note = args.note;
      if (args.prepTime != null) set.prepTime = args.prepTime;
      if (cook.name) set.cookName = cook.name;

      const update: UpdateQuery<Record<string, unknown>> = {};
      if (Object.keys(set).length) update.$set = set;
      // Appended, never rewritten: a `$set` of the array would drop whatever
      // landed between the read above and this write.
      if (entry) update.$push = { history: entry };

      const updated = Object.keys(update).length
        ? await Offer.findOneAndUpdate({ _id: existing._id }, update, {
            new: true,
            session,
          })
        : null;

      offer = (updated ?? existing) as unknown as OfferRow;
    } else {
      try {
        const [row] = await Offer.create(
          [
            {
              requestId: args.requestId,
              kitchenId: cook.kitchenId,
              cookName: cook.name ?? '',
              price: amount,
              note: args.note ?? '',
              prepTime: args.prepTime ?? '',
              status: amount == null ? OFFER_STATUS.INTERESTED : OFFER_STATUS.PRICED,
              history: entry ? [entry] : [],
              agreedPrice: null,
            },
          ],
          { session },
        );
        offer = row.toObject() as unknown as OfferRow;
      } catch (error) {
        /* The cook's other device got there first. One offer per kitchen per
           request is the rule that gives "whose turn is it" an answer at all. */
        if (isDuplicateKey(error)) refuse(ERR.DUPLICATE);
        throw error;
      }
    }

    await tellCustomer(session, {
      requestId: args.requestId,
      target: request.target,
      offer,
    });

    const kitchens = await kitchensFor([offer.kitchenId], session);
    return shapeOffer(offer, kitchens.get(offer.kitchenId));
  });
}

/**
 * Tell the customer a cook has answered.
 *
 * A broadcast that seven kitchens reply to should not produce seven
 * notifications. Past the second offer they collapse into one line carrying
 * the count and the cheapest so far, keyed by that count so each new arrival
 * refreshes it exactly once. A request sent to one cook keeps the personal
 * version, because there is nothing to summarise.
 */
async function tellCustomer(
  session: ClientSession,
  args: { requestId: string; target: string; offer: OfferRow },
): Promise<void> {
  const request = await Request.findById(args.requestId).session(session).lean();
  if (!request) return;

  const priced = await Offer.countDocuments({
    requestId: args.requestId,
    status: { $in: LIVE_OFFER },
    price: { $ne: null },
  }).session(session);

  const offerId = String(args.offer._id);

  if (args.target === 'all' && priced >= 2) {
    await notify(session, {
      audience: 'customer',
      kind: 'offers-summary',
      key: `customer:offers-summary:${args.requestId}:${priced}`,
      title: '{n} cooks have offered',
      body: 'The lowest so far is ৳{low} for {title}.',
      customerKey: request.customerKey,
      requestId: args.requestId,
      offerId,
    });
    return;
  }

  const history = (args.offer.history ?? []) as PriceMove[];
  await notify(session, {
    audience: 'customer',
    kind: args.offer.price == null ? 'offer-interested' : 'offer-priced',
    key: `customer:offer:${offerId}:${history.length}`,
    title: args.offer.price == null ? 'A cook is interested' : 'New offer',
    body:
      args.offer.price == null
        ? '{cook} is interested in {title}.'
        : '{cook} offered ৳{amount} for {title}.',
    customerKey: request.customerKey,
    requestId: args.requestId,
    offerId,
  });
}

/**
 * A cook says no up front.
 *
 * Recorded rather than ignored, so the request leaves their board and the
 * customer can see somebody looked and passed — which is more informative
 * than silence when only one cook was asked.
 */
export async function declineRequest(
  kitchenId: string,
  requestId: string,
): Promise<Result<OfferView>> {
  return transition(async (session) => {
    const request = await Request.findById(requestId)
      .session(session)
      .catch(() => null);
    if (!request) refuse(ERR.NO_REQUEST);
    if (!(request.eligible ?? []).some((id) => String(id) === String(kitchenId))) {
      refuse(ERR.NOT_ELIGIBLE);
    }

    const existing = await Offer.findOne({ requestId, kitchenId }).session(session).lean();
    if (existing?.status === OFFER_STATUS.AGREED) refuse(ERR.ALREADY_SETTLED);
    if (existing && !isLiveOffer(existing.status)) refuse(ERR.OFFER_CLOSED);

    let offer: OfferRow;
    if (existing) {
      const updated = await Offer.findOneAndUpdate(
        { _id: existing._id },
        { status: OFFER_STATUS.DECLINED },
        { new: true, session },
      );
      offer = (updated ?? existing) as unknown as OfferRow;
    } else {
      const [row] = await Offer.create(
        [
          {
            requestId,
            kitchenId,
            cookName: '',
            price: null,
            note: '',
            prepTime: '',
            status: OFFER_STATUS.DECLINED,
            history: [],
            agreedPrice: null,
          },
        ],
        { session },
      );
      offer = row.toObject() as unknown as OfferRow;
    }

    /* Worth telling the customer only when they asked one cook. On a broadcast
       it is noise — what matters there is who said yes. */
    if (request.target !== 'all') {
      await notify(session, {
        audience: 'customer',
        kind: 'offer-declined',
        key: `customer:offer-declined:${requestId}`,
        title: 'The cook passed',
        body: 'They cannot take {title}. Try asking every cook instead.',
        customerKey: request.customerKey,
        requestId,
      });

      // That was the only cook who could answer, so the request is done.
      await Request.updateOne(
        { _id: requestId, status: REQUEST_STATUS.OPEN },
        { status: REQUEST_STATUS.CANCELLED },
        { session },
      );
    }

    const kitchens = await kitchensFor([offer.kitchenId], session);
    return shapeOffer(offer, kitchens.get(offer.kitchenId));
  });
}

/**
 * The customer walks away from one negotiation without abandoning the request.
 *
 * Withdrawing the whole thing would throw away every other offer too, which is
 * a heavy price for one cook holding out over ৳200. This puts the request back
 * on the table with the offers that were closed out restored to what they were.
 */
export async function rejectOffer(
  customerKey: string,
  args: { offerId: string; reason?: string },
): Promise<Result<RequestView>> {
  return transition(async (session) => {
    const offer = await Offer.findById(args.offerId)
      .session(session)
      .catch(() => null);
    if (!offer) refuse(ERR.NO_OFFER);

    // The offer is reachable only through a request this customer owns.
    await ownRequest(session, offer.requestId, customerKey);

    if (offer.status === OFFER_STATUS.AGREED) refuse(ERR.ALREADY_SETTLED);
    if (!isNegotiable(offer.status)) refuse(ERR.OFFER_CLOSED);

    /* The app writes `reason` onto the offer and no screen has ever read it
       back. What the cook needs is the sentence below; a column that exists to
       be ignored is worse than no column. */
    await Offer.updateOne(
      { _id: args.offerId },
      { status: OFFER_STATUS.REJECTED },
      { session },
    );

    /* The losers come back exactly as they were — interested if they never
       named a number, priced if they did. Two updates rather than one because
       the status they return to depends on the row. */
    await Offer.updateMany(
      { requestId: offer.requestId, status: OFFER_STATUS.NOT_SELECTED, price: null },
      { status: OFFER_STATUS.INTERESTED },
      { session },
    );
    await Offer.updateMany(
      {
        requestId: offer.requestId,
        status: OFFER_STATUS.NOT_SELECTED,
        price: { $ne: null },
      },
      { status: OFFER_STATUS.PRICED },
      { session },
    );

    const request = await Request.findOneAndUpdate(
      { _id: offer.requestId },
      { status: REQUEST_STATUS.OPEN, selectedOfferId: null },
      { new: true, session },
    );

    await notify(session, {
      audience: 'cook',
      kind: 'offer-rejected',
      key: `cook:offer-rejected:${args.offerId}`,
      title: 'Offer turned down',
      body: `The customer did not take your price for ${request?.title ?? "their request"}.`,
      kitchenId: offer.kitchenId,
      requestId: offer.requestId,
      offerId: args.offerId,
    });

    if (!request) refuse(ERR.NO_REQUEST);
    return shapeRequest(request.toObject() as unknown as RequestRow);
  });
}

/**
 * Close out requests whose day has been and gone.
 *
 * Nothing financial happens: money only moves at payment, and an expired
 * request never got that far. It stops a board filling with things nobody can
 * act on any more.
 *
 * `expired` is deliberately not `cancelled` — nobody withdrew it, time ran
 * out, and the two read very differently to the cook who bid on it.
 *
 * The app expired anything wanted for before today. Here the grace period is
 * `requestExpiryDays`, because a wanted-for date that passed an hour ago can
 * still be paid for; at zero this is the app's rule exactly.
 */
export async function expireRequests(): Promise<Result<{ expired: number }>> {
  const settings = await getSettings();
  const grace = Math.max(0, Math.round(settings.requestExpiryDays));
  // Local Dhaka days, both sides — `wantedFor` is a calendar day, not an instant.
  const cutoff = dayKey(addDays(-grace));

  return transition(async (session) => {
    const stale = await Request.find(
      {
        wantedFor: { $ne: null, $lt: cutoff },
        status: {
          $in: [REQUEST_STATUS.OPEN, REQUEST_STATUS.SELECTED, REQUEST_STATUS.AGREED],
        },
      },
      { _id: 1 },
    )
      .session(session)
      .lean();

    if (!stale.length) return { expired: 0 };

    const ids = stale.map((row) => String(row._id));

    await Request.updateMany(
      { _id: { $in: ids } },
      { status: REQUEST_STATUS.EXPIRED },
      { session },
    );
    await Offer.updateMany(
      { requestId: { $in: ids }, status: { $in: LIVE_OFFER } },
      { status: OFFER_STATUS.EXPIRED },
      { session },
    );

    return { expired: ids.length };
  });
}

/** A cook pulls out. Their own offer only — the id alone is not enough. */
export async function withdrawOffer(
  kitchenId: string,
  offerId: string,
): Promise<Result<{ offerId: string; requestId: string }>> {
  return transition(async (session) => {
    const offer = await Offer.findOne({ _id: offerId, kitchenId })
      .session(session)
      .catch(() => null);
    if (!offer) refuse(ERR.NO_OFFER);
    if (offer.status === OFFER_STATUS.AGREED) refuse(ERR.ALREADY_SETTLED);

    await Offer.updateOne({ _id: offerId }, { status: OFFER_STATUS.WITHDRAWN }, { session });

    const request = await Request.findById(offer.requestId).session(session);

    /* If they were the chosen one, the request goes back on the table rather
       than stranding the customer with a dead negotiation. */
    if (request?.selectedOfferId === offerId) {
      await Request.updateOne(
        { _id: request._id },
        { status: REQUEST_STATUS.OPEN, selectedOfferId: null },
        { session },
      );
    }

    if (request) {
      await notify(session, {
        audience: 'customer',
        kind: 'offer-withdrawn',
        key: `customer:offer-withdrawn:${offerId}`,
        title: 'Offer withdrawn',
        body: `${offer.cookName || "A cook"} pulled out of ${request.title}.`,
        customerKey: request.customerKey,
        requestId: offer.requestId,
        offerId,
      });
    }

    return { offerId, requestId: offer.requestId };
  });
}

/**
 * The customer picks one.
 *
 * Everything else closes in the same transition, which is what stops a
 * customer negotiating with two cooks at once and ending up committed to
 * both. The losers are told; being left wondering is worse than being told no.
 */
export async function selectOffer(
  customerKey: string,
  args: { requestId: string; offerId: string },
): Promise<Result<OfferView>> {
  return transition(async (session) => {
    const request = await ownRequest(session, args.requestId, customerKey);
    if (request.status === REQUEST_STATUS.ORDERED) refuse(ERR.ALREADY_SETTLED);
    if (request.status === REQUEST_STATUS.CANCELLED) refuse(ERR.REQUEST_CLOSED);

    const offer = await Offer.findOne({ _id: args.offerId, requestId: args.requestId })
      .session(session)
      .catch(() => null);
    if (!offer) refuse(ERR.NO_OFFER);
    if (!isLiveOffer(offer.status)) refuse(ERR.OFFER_CLOSED);
    if (offer.price == null) refuse(ERR.NO_PRICE_YET);

    // Read the losers first; the update below is what stops them matching.
    const losers = await Offer.find(
      {
        requestId: args.requestId,
        _id: { $ne: args.offerId },
        status: { $in: LIVE_OFFER },
      },
      { kitchenId: 1 },
    )
      .session(session)
      .lean();

    await Request.updateOne(
      { _id: args.requestId },
      { status: REQUEST_STATUS.SELECTED, selectedOfferId: args.offerId },
      { session },
    );

    const chosen = await Offer.findOneAndUpdate(
      { _id: args.offerId },
      { status: OFFER_STATUS.SELECTED },
      { new: true, session },
    );

    await Offer.updateMany(
      {
        requestId: args.requestId,
        _id: { $ne: args.offerId },
        status: { $in: LIVE_OFFER },
      },
      { status: OFFER_STATUS.NOT_SELECTED },
      { session },
    );

    await notify(session, {
      audience: 'cook',
      kind: 'offer-selected',
      key: `cook:offer-selected:${args.offerId}`,
      title: 'You were chosen',
      body: `The customer picked your offer for ${request.title}.`,
      kitchenId: offer.kitchenId,
      requestId: args.requestId,
      offerId: args.offerId,
    });

    await notifyEach(
      session,
      losers.map((loser) => ({
        audience: 'cook' as const,
        kind: 'offer-not-selected',
        key: `cook:offer-not-selected:${args.requestId}:${loser.kitchenId}`,
        title: 'Offer not selected',
        body: `The customer went with another cook for ${request.title}.`,
        kitchenId: loser.kitchenId,
        requestId: args.requestId,
      })),
    );

    const row = (chosen ?? offer) as unknown as OfferRow;
    const kitchens = await kitchensFor([row.kitchenId], session);
    return shapeOffer(row, kitchens.get(row.kitchenId));
  });
}

/* ------------------------------------------------------------------ *
 * negotiation
 * ------------------------------------------------------------------ */

/**
 * The offer this actor may haggle over, resolved by ownership.
 *
 * A cook reaches their own offer and nothing else; a customer reaches it only
 * through a request that is theirs. Both clauses are in the query, so neither
 * caller below has a version of this check to get wrong.
 */
async function negotiatingOffer(session: ClientSession, actor: Actor, offerId: string) {
  const offer =
    actor.side === 'cook'
      ? await Offer.findOne({ _id: offerId, kitchenId: actor.kitchenId })
          .session(session)
          .catch(() => null)
      : await Offer.findById(offerId)
          .session(session)
          .catch(() => null);
  if (!offer) refuse(ERR.NO_OFFER);

  const request =
    actor.side === 'customer'
      ? await ownRequest(session, offer.requestId, actor.customerKey)
      : await Request.findById(offer.requestId).session(session);
  if (!request) refuse(ERR.NO_REQUEST);

  if (offer.status === OFFER_STATUS.AGREED) refuse(ERR.ALREADY_SETTLED);
  if (!isNegotiable(offer.status)) refuse(ERR.OFFER_CLOSED);

  return { offer, request, history: (offer.history ?? []) as PriceMove[] };
}

/**
 * Name a different number.
 *
 * Only the side whose turn it is may move, which is the whole of the
 * concurrency control this needs. On a device that held because the second
 * caller read a history that already contained the first; here the history's
 * length goes into the update's filter, so a counter that was decided against
 * a stale read matches nothing and is refused rather than landing on top.
 *
 * `by` is the actor's own side. It is never an argument, because an argument
 * is a thing a request body can lie about — and the lie is precisely "I am
 * the other one, so it is my turn".
 */
export async function counterOffer(
  actor: Actor,
  args: { offerId: string; amount: number | string },
): Promise<Result<OfferView>> {
  return transition(async (session) => {
    const { offer, request, history } = await negotiatingOffer(session, actor, args.offerId);
    if (turnOf({ status: offer.status, history }) !== actor.side) refuse(ERR.NOT_YOUR_TURN);

    const value = Math.round(Number(args.amount));
    if (!Number.isFinite(value) || value <= 0) refuse(ERR.BAD_AMOUNT);

    const entry: PriceMove = { by: actor.side, amount: value, at: new Date().toISOString() };

    const updated = await Offer.findOneAndUpdate(
      {
        _id: args.offerId,
        status: { $in: [OFFER_STATUS.SELECTED, OFFER_STATUS.NEGOTIATING] },
        [`history.${history.length}`]: { $exists: false },
      },
      {
        $set: { price: value, status: OFFER_STATUS.NEGOTIATING },
        $push: { history: entry },
      },
      { new: true, session },
    );
    // Somebody moved between the read and the write, so it is their number on
    // the table now and this one was answering a question that has changed.
    if (!updated) refuse(ERR.NOT_YOUR_TURN);

    const audience: Party = actor.side === 'cook' ? 'customer' : 'cook';
    await notify(session, {
      audience,
      kind: 'counter-offer',
      key: `${audience}:counter-offer:${args.offerId}:${history.length + 1}`,
      title: 'Counter offer',
      body: '৳{amount} for {title}. Accept it or name another price.',
      customerKey: audience === 'customer' ? request.customerKey : null,
      kitchenId: audience === 'cook' ? offer.kitchenId : null,
      requestId: offer.requestId,
      offerId: args.offerId,
    });

    const row = updated as unknown as OfferRow;
    const kitchens = await kitchensFor([row.kitchenId], session);
    return shapeOffer(row, kitchens.get(row.kitchenId));
  });
}

/**
 * Take the number on the table.
 *
 * Refused when it is your own — accepting what you just proposed is not
 * agreement, it is a way to close a negotiation the other side never
 * answered. That is why `by` comes from the token and not the body.
 *
 * `agreedPrice` is a copy of the last entry, taken here and nowhere else. The
 * history stays the record; this is the number payment is allowed to read.
 */
export async function acceptPrice(
  actor: Actor,
  offerId: string,
): Promise<Result<OfferView>> {
  return transition(async (session) => {
    const { offer, request, history } = await negotiatingOffer(session, actor, offerId);

    const last = standing({ history });
    if (!last) refuse(ERR.NO_PRICE_YET);
    if (last.by === actor.side) refuse(ERR.NOT_YOUR_TURN);

    const entry: PriceMove = {
      by: actor.side,
      amount: last.amount,
      at: new Date().toISOString(),
      accepted: true,
    };

    const updated = await Offer.findOneAndUpdate(
      {
        _id: offerId,
        status: { $in: [OFFER_STATUS.SELECTED, OFFER_STATUS.NEGOTIATING] },
        [`history.${history.length}`]: { $exists: false },
      },
      {
        $set: { status: OFFER_STATUS.AGREED, agreedPrice: last.amount },
        $push: { history: entry },
      },
      { new: true, session },
    );
    // A counter landed first. Agreeing now would agree to a number nobody has
    // seen on this screen.
    if (!updated) refuse(ERR.NOT_YOUR_TURN);

    await Request.updateOne(
      { _id: offer.requestId },
      { status: REQUEST_STATUS.AGREED },
      { session },
    );

    await notify(session, {
      audience: 'customer',
      kind: 'price-agreed',
      key: `customer:price-agreed:${offerId}`,
      title: 'Price agreed',
      body: '৳{amount} agreed with {cook}. Pay to confirm the order.',
      customerKey: request.customerKey,
      requestId: offer.requestId,
      offerId,
    });

    await notify(session, {
      audience: 'cook',
      kind: 'price-agreed',
      key: `cook:price-agreed:${offerId}`,
      title: 'Price agreed',
      body: '৳{amount} agreed for {title}. Waiting for payment.',
      kitchenId: offer.kitchenId,
      requestId: offer.requestId,
      offerId,
    });

    const row = updated as unknown as OfferRow;
    const kitchens = await kitchensFor([row.kitchenId], session);
    return shapeOffer(row, kitchens.get(row.kitchenId));
  });
}

/* ------------------------------------------------------------------ *
 * payment
 * ------------------------------------------------------------------ */

export type OrderView = {
  id: string;
  code: string;
  kind: string;
  requestId: string;
  offerId: string;
  kitchenId: string;
  cookName: string;
  title: string;
  amount: number;
  status: string;
  payment: string;
};

/**
 * Pay the agreed price, and turn the request into a real order.
 *
 * The amount comes from the offer's `agreedPrice`, never from the caller: the
 * one number that matters is the one both sides signed off on, and a screen is
 * not allowed an opinion about it.
 *
 * The request is claimed with a conditional update rather than the status read
 * a moment earlier — two taps that both saw `agreed` cannot both cut an order,
 * because only one of them can move the row out of `agreed`. The escrow hold
 * carries `hold:<orderId>` so a retry that gets this far still pays once.
 */
export async function payForRequest(
  customerKey: string,
  args: {
    requestId: string;
    customer?: { name?: string; phone?: string; address?: unknown };
  },
): Promise<Result<OrderView>> {
  return transition(async (session) => {
    const request = await ownRequest(session, args.requestId, customerKey);
    if (request.status === REQUEST_STATUS.ORDERED) refuse(ERR.ALREADY_SETTLED);
    if (request.status !== REQUEST_STATUS.AGREED) refuse(ERR.NOT_AGREED);
    if (!request.selectedOfferId) refuse(ERR.NO_OFFER);

    const offer = await Offer.findOne({
      _id: request.selectedOfferId,
      requestId: args.requestId,
    })
      .session(session)
      .catch(() => null);
    if (!offer) refuse(ERR.NO_OFFER);
    if (offer.status !== OFFER_STATUS.AGREED || offer.agreedPrice == null) {
      refuse(ERR.NOT_AGREED);
    }

    const amount = offer.agreedPrice;
    const balance = await balanceFor('customer', customerKey, session);
    if (balance < amount) {
      refuse(ERR.LOW_BALANCE, { short: amount - balance, balance });
    }

    const kitchens = await kitchensFor([offer.kitchenId], session);
    const kitchen = kitchens.get(offer.kitchenId);
    const quantity = request.quantity ?? 1;

    let order;
    try {
      [order] = await Order.create(
        [
          {
            code: makeCode(),
            kind: 'request',
            requestId: args.requestId,
            offerId: String(offer._id),
            kitchenId: offer.kitchenId,
            cookName: offer.cookName,
            title: request.title,
            image: kitchen?.avatar ?? '',

            customerKey,
            customerName: args.customer?.name ?? '',
            phone: args.customer?.phone ?? '',
            address: args.customer?.address ?? null,

            handover: 'delivery',
            /* One line for the whole job. The cook named this price knowing
               how many were wanted, so dividing it into a unit price would
               either invent paisa or disagree with what both sides agreed. */
            lines: [
              {
                name: quantity > 1 ? `${request.title} × ${quantity}` : request.title,
                qty: 1,
                price: amount,
              },
            ],

            subtotal: amount,
            deliveryFee: 0,
            platformFee: 0,
            price: amount,
            amount,

            status: 'confirmed',
            payment: 'held',
            history: [{ status: 'confirmed', at: new Date().toISOString() }],
          },
        ],
        { session },
      );
    } catch (error) {
      if (isDuplicateKey(error)) refuse(ERR.DUPLICATE);
      throw error;
    }

    const orderId = String(order._id);

    const claimed = await Request.updateOne(
      { _id: args.requestId, status: REQUEST_STATUS.AGREED },
      { status: REQUEST_STATUS.ORDERED, orderId },
      { session },
    );
    // Another payment moved it out of `agreed` first. Theirs is the order.
    if (claimed.matchedCount !== 1) refuse(ERR.ALREADY_SETTLED);

    const held = await post(session, {
      kind: 'hold',
      amount,
      from: 'customer',
      fromRef: customerKey,
      to: 'held',
      orderId,
      note: `Held for ${request.title}`,
      idemKey: `hold:${orderId}`,
    });
    if (!held.posted) refuse(ERR.ALREADY_SETTLED);

    await notify(session, {
      audience: 'cook',
      kind: 'request-paid',
      key: `cook:request-paid:${orderId}`,
      title: 'Order confirmed',
      body: `The customer paid ${taka(amount)} for ${request.title}. Start when you are ready.`,
      kitchenId: offer.kitchenId,
      requestId: args.requestId,
      orderId,
    });

    await notify(session, {
      audience: 'customer',
      kind: 'order-placed',
      key: `customer:order-placed:${orderId}`,
      title: 'Order confirmed',
      body: '৳{amount} is held until you confirm the food arrived.',
      customerKey,
      requestId: args.requestId,
      orderId,
    });

    return {
      id: orderId,
      code: order.code,
      kind: 'request',
      requestId: args.requestId,
      offerId: String(offer._id),
      kitchenId: offer.kitchenId,
      cookName: offer.cookName,
      title: request.title,
      amount,
      status: 'confirmed',
      payment: 'held',
    };
  });
}
