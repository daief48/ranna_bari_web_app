/**
 * Food requests, cook bidding and price negotiation.
 *
 * A customer describes something nobody has listed -- a two-pound chocolate
 * cake for Friday -- and either asks one cook or puts it out to every cook
 * who could reach them. Cooks answer with their own price. The customer picks
 * one, haggles if they want to, and only then does any money move, through
 * the same wallet and the same escrow everything else uses.
 *
 * Three rules shape the whole module.
 *
 * **A cook never sees a competitor's price.** There is no function here that
 * returns another cook's offer to a cook, and the one that reads offers for
 * a kitchen returns exactly that kitchen's own. On a device this is a UI
 * guarantee; on a server it would need to be an authorisation one, and this
 * is the shape that check should take.
 *
 * **Nothing is overwritten.** Every price either side names is appended to
 * the offer's history with who said it and when. The standing price is the
 * last entry, and the agreed price is a copy taken at the moment both sides
 * stop. A negotiation can always be read back in full.
 *
 * **You cannot accept your own offer.** Whose turn it is falls out of the
 * history rather than being tracked separately, so it cannot disagree with
 * it: the last person to name a number is waiting on the other one.
 */
import {
  ERR,
  balances,
  bump,
  done,
  fail,
  makeCode,
  notify,
  post,
} from './ledger';

/* ------------------------------------------------------------------ *
 * statuses
 * ------------------------------------------------------------------ */

/** Where a request is up to. */
export const REQUEST_STATUS = {
  OPEN: 'open',
  SELECTED: 'selected',
  AGREED: 'agreed',
  ORDERED: 'ordered',
  CANCELLED: 'cancelled',
  /* The day it was wanted for has passed and nobody paid. Kept apart from
     cancelled: nobody withdrew it, time simply ran out. */
  EXPIRED: 'expired',
};

/**
 * Where one cook's offer is up to.
 *
 * `interested` and `priced` are separate because showing willingness and
 * naming a number are two different commitments, and a customer watching a
 * broadcast fill up wants to see the first before the second arrives.
 */
export const OFFER_STATUS = {
  INTERESTED: 'interested',
  PRICED: 'priced',
  /* Chosen, but nobody has moved the price since. Distinct from negotiating
     because "they picked me" and "we are still arguing" are different things
     to see on a dashboard. */
  SELECTED: 'selected',
  NEGOTIATING: 'negotiating',
  AGREED: 'agreed',
  NOT_SELECTED: 'not-selected',
  /* The cook said no up front. */
  DECLINED: 'declined',
  /* The customer walked away mid-negotiation. */
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
};

export const isLiveOffer = (offer) =>
  [
    OFFER_STATUS.INTERESTED,
    OFFER_STATUS.PRICED,
    OFFER_STATUS.SELECTED,
    OFFER_STATUS.NEGOTIATING,
    OFFER_STATUS.AGREED,
  ].includes(offer.status);

/** An offer the customer and cook are still going back and forth on. */
export const isNegotiable = (offer) =>
  [OFFER_STATUS.SELECTED, OFFER_STATUS.NEGOTIATING].includes(offer?.status);

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

export const requestById = (state, id) =>
  state.requests.find((r) => r.id === id) ?? null;

export const requestsForCustomer = (state, customerKey) =>
  state.requests.filter((r) => r.customerKey === customerKey);

/** Every offer on a request. Customer-side only -- see the module note. */
export const offersForRequest = (state, requestId) =>
  state.offers.filter((o) => o.requestId === requestId);

/** One kitchen's own offer, which is all a cook is ever shown. */
export const offerForCook = (state, requestId, kitchenId) =>
  state.offers.find(
    (o) => o.requestId === requestId && String(o.kitchenId) === String(kitchenId),
  ) ?? null;

/**
 * Requests a cook should be looking at.
 *
 * A broadcast reaches them if they were listed as eligible when it was made;
 * a direct request reaches only its addressee. Requests they have already
 * answered stay on the list, because the answer may still be negotiating.
 */
export const requestsForCook = (state, kitchenId) =>
  state.requests.filter(
    (r) =>
      String(r.target) === String(kitchenId) ||
      (r.target === 'all' && (r.eligible ?? []).some((k) => String(k) === String(kitchenId))),
  );

/** How many cooks have answered, and the spread of what they asked. */
export function offerSummary(state, requestId) {
  const offers = offersForRequest(state, requestId).filter(isLiveOffer);
  const priced = offers.filter((o) => o.price != null);
  const amounts = priced.map((o) => o.price);
  return {
    interested: offers.length,
    priced: priced.length,
    low: amounts.length ? Math.min(...amounts) : null,
    high: amounts.length ? Math.max(...amounts) : null,
  };
}

/** The number currently on the table, and who put it there. */
export function standing(offer) {
  const last = offer?.history?.[offer.history.length - 1];
  return last ? { amount: last.amount, by: last.by, at: last.at } : null;
}

/** Whose move it is. Nobody's, once it is agreed. */
export function turnOf(offer) {
  if (!offer || offer.status === OFFER_STATUS.AGREED) return null;
  const last = standing(offer);
  if (!last) return 'cook';
  return last.by === 'cook' ? 'customer' : 'cook';
}

/* ------------------------------------------------------------------ *
 * the request
 * ------------------------------------------------------------------ */

/**
 * Put a request out.
 *
 * `eligible` is decided by the caller, which is the only place that knows
 * where everyone is; it is frozen onto the request so that the set of cooks
 * who were asked cannot quietly change afterwards.
 */
export function createRequest(state, { request, eligible, now, rand }) {
  const title = String(request?.title ?? '').trim();
  if (!title) return fail(state, ERR.NAME_REQUIRED);

  const quantity = Math.max(1, Math.round(Number(request.quantity) || 1));
  const budget = request.budget ? Math.round(Number(request.budget)) : null;
  if (budget != null && (!Number.isFinite(budget) || budget <= 0)) {
    return fail(state, ERR.BAD_AMOUNT);
  }

  const [seq, id] = bump(state, 'req');
  const record = {
    ...request,
    id,
    code: makeCode(rand),
    title,
    quantity,
    budget,
    eligible: request.target === 'all' ? eligible.map((k) => String(k)) : [String(request.target)],
    status: REQUEST_STATUS.OPEN,
    selectedOfferId: null,
    orderId: null,
    createdAt: now,
  };

  let next = { ...state, seq, requests: [record, ...state.requests] };

  next = notify(next, {
    audience: 'cook',
    kind: 'request-new',
    key: `cook:request-new:${id}`,
    title: 'New food request',
    body: '{customer} is looking for {title}. Name your price.',
    requestId: id,
    now,
  });

  return done(next, record);
}

/** Withdraw a request. Only before money has moved. */
export function cancelRequest(state, { requestId, now }) {
  const request = requestById(state, requestId);
  if (!request) return fail(state, ERR.NO_REQUEST);
  if (request.status === REQUEST_STATUS.ORDERED) return fail(state, ERR.ALREADY_SETTLED);
  if (request.status === REQUEST_STATUS.CANCELLED) return fail(state, ERR.ALREADY_SETTLED);

  let next = {
    ...state,
    requests: state.requests.map((r) =>
      r.id === requestId ? { ...r, status: REQUEST_STATUS.CANCELLED, closedAt: now } : r,
    ),
    // Every offer closes with it. None of them held money, so nothing to refund.
    offers: state.offers.map((o) =>
      o.requestId === requestId && isLiveOffer(o)
        ? { ...o, status: OFFER_STATUS.NOT_SELECTED }
        : o,
    ),
  };

  next = notify(next, {
    audience: 'cook',
    kind: 'request-cancelled',
    key: `cook:request-cancelled:${requestId}`,
    title: 'Request withdrawn',
    body: '{customer} withdrew the request for {title}.',
    requestId,
    now,
  });

  return done(next, null);
}

/* ------------------------------------------------------------------ *
 * offers
 * ------------------------------------------------------------------ */

/**
 * A cook answers.
 *
 * One offer per cook per request, updated rather than duplicated -- a cook
 * who changes their mind about the price has not made a second bid. The
 * change is appended to the history like any other, so the customer can see
 * that it moved.
 */
export function submitOffer(state, { requestId, cook, price, note, prepTime, now }) {
  const request = requestById(state, requestId);
  if (!request) return fail(state, ERR.NO_REQUEST);
  if (request.status !== REQUEST_STATUS.OPEN) return fail(state, ERR.REQUEST_CLOSED);
  if (!(request.eligible ?? []).some((k) => String(k) === String(cook.kitchenId))) {
    return fail(state, ERR.NOT_ELIGIBLE);
  }

  const amount = price == null || price === '' ? null : Math.round(Number(price));
  if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
    return fail(state, ERR.BAD_AMOUNT);
  }

  const existing = offerForCook(state, requestId, cook.kitchenId);
  const entry = amount == null ? null : { by: 'cook', amount, at: now };

  if (existing) {
    if (existing.status === OFFER_STATUS.NOT_SELECTED) return fail(state, ERR.OFFER_CLOSED);
    if (existing.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);

    const updated = {
      ...existing,
      price: amount ?? existing.price,
      note: note ?? existing.note,
      prepTime: prepTime ?? existing.prepTime,
      status: amount == null ? existing.status : OFFER_STATUS.PRICED,
      history: entry ? [...existing.history, entry] : existing.history,
    };
    let next = {
      ...state,
      offers: state.offers.map((o) => (o.id === existing.id ? updated : o)),
    };
    next = tellCustomer(next, { request, offer: updated, now });
    return done(next, updated);
  }

  const [seq, id] = bump(state, 'off');
  const offer = {
    id,
    requestId,
    kitchenId: cook.kitchenId,
    cookName: cook.name,
    cookAvatar: cook.avatar ?? '',
    rating: cook.rating ?? 0,
    reviewCount: cook.reviewCount ?? 0,
    area: cook.area ?? '',
    lat: cook.lat ?? null,
    lng: cook.lng ?? null,
    price: amount,
    note: note ?? '',
    prepTime: prepTime ?? '',
    status: amount == null ? OFFER_STATUS.INTERESTED : OFFER_STATUS.PRICED,
    history: entry ? [entry] : [],
    agreedPrice: null,
    createdAt: now,
  };

  let next = { ...state, seq, offers: [...state.offers, offer] };
  next = tellCustomer(next, { request, offer, now });
  return done(next, offer);
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
function tellCustomer(state, { request, offer, now }) {
  const priced = offersForRequest(state, request.id)
    .filter(isLiveOffer)
    .filter((o) => o.price != null);

  if (request.target === 'all' && priced.length >= 2) {
    return notify(state, {
      audience: 'customer',
      kind: 'offers-summary',
      key: `customer:offers-summary:${request.id}:${priced.length}`,
      title: '{n} cooks have offered',
      body: 'The lowest so far is ৳{low} for {title}.',
      requestId: request.id,
      offerId: offer.id,
      now,
    });
  }

  return notify(state, {
    audience: 'customer',
    kind: offer.price == null ? 'offer-interested' : 'offer-priced',
    key: `customer:offer:${offer.id}:${offer.history.length}`,
    title: offer.price == null ? 'A cook is interested' : 'New offer',
    body:
      offer.price == null
        ? '{cook} is interested in {title}.'
        : '{cook} offered ৳{amount} for {title}.',
    requestId: request.id,
    offerId: offer.id,
    now,
  });
}

/**
 * A cook says no up front.
 *
 * Recorded rather than ignored, so the request leaves their board and the
 * customer can see somebody looked and passed -- which is more informative
 * than silence when only one cook was asked.
 */
export function declineRequest(state, { requestId, kitchenId, now }) {
  const request = requestById(state, requestId);
  if (!request) return fail(state, ERR.NO_REQUEST);
  if (!(request.eligible ?? []).some((k) => String(k) === String(kitchenId))) {
    return fail(state, ERR.NOT_ELIGIBLE);
  }

  const existing = offerForCook(state, requestId, kitchenId);
  if (existing?.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);
  if (existing && !isLiveOffer(existing)) return fail(state, ERR.OFFER_CLOSED);

  let next;
  if (existing) {
    next = {
      ...state,
      offers: state.offers.map((o) =>
        o.id === existing.id ? { ...o, status: OFFER_STATUS.DECLINED } : o,
      ),
    };
  } else {
    const [seq, id] = bump(state, 'off');
    next = {
      ...state,
      seq,
      offers: [
        ...state.offers,
        {
          id,
          requestId,
          kitchenId,
          cookName: '',
          cookAvatar: '',
          rating: 0,
          reviewCount: 0,
          area: '',
          lat: null,
          lng: null,
          price: null,
          note: '',
          prepTime: '',
          status: OFFER_STATUS.DECLINED,
          history: [],
          agreedPrice: null,
          createdAt: now,
        },
      ],
    };
  }

  /* Worth telling the customer only when they asked one cook. On a broadcast
     it is noise -- what matters there is who said yes. */
  if (request.target !== 'all') {
    next = notify(next, {
      audience: 'customer',
      kind: 'offer-declined',
      key: `customer:offer-declined:${requestId}`,
      title: 'The cook passed',
      body: 'They cannot take {title}. Try asking every cook instead.',
      requestId,
      now,
    });

    /* That was the only cook who could answer, so the request is done. */
    if (request.status === REQUEST_STATUS.OPEN) {
      next = {
        ...next,
        requests: next.requests.map((r) =>
          r.id === requestId ? { ...r, status: REQUEST_STATUS.CANCELLED, closedAt: now } : r,
        ),
      };
    }
  }

  return done(next, null);
}

/**
 * The customer walks away from one negotiation without abandoning the
 * request.
 *
 * Withdrawing the whole thing would throw away every other offer too, which
 * is a heavy price for one cook holding out over ৳200. This puts the request
 * back on the table with the offers that were closed out restored.
 */
export function rejectOffer(state, { offerId, reason, now }) {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (offer.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);
  if (!isNegotiable(offer)) return fail(state, ERR.OFFER_CLOSED);

  let next = {
    ...state,
    offers: state.offers.map((o) =>
      o.id === offerId ? { ...o, status: OFFER_STATUS.REJECTED, cancelReason: reason } : o,
    ),
  };

  next = {
    ...next,
    offers: next.offers.map((o) =>
      o.requestId === offer.requestId && o.status === OFFER_STATUS.NOT_SELECTED
        ? { ...o, status: o.price == null ? OFFER_STATUS.INTERESTED : OFFER_STATUS.PRICED }
        : o,
    ),
    requests: next.requests.map((r) =>
      r.id === offer.requestId
        ? { ...r, status: REQUEST_STATUS.OPEN, selectedOfferId: null }
        : r,
    ),
  };

  next = notify(next, {
    audience: 'cook',
    kind: 'offer-rejected',
    key: `cook:offer-rejected:${offerId}`,
    title: 'Offer turned down',
    body: '{customer} did not take your price for {title}.',
    requestId: offer.requestId,
    offerId,
    now,
  });

  return done(next, requestById(next, offer.requestId));
}

/**
 * Close out requests whose day has been and gone.
 *
 * Nothing financial happens: money only moves at payment, and an expired
 * request never got that far. It stops a board filling with things nobody
 * can act on any more.
 */
export function expireRequests(state, { today, now }) {
  const stale = state.requests.filter(
    (r) =>
      r.wantedDate &&
      r.wantedDate < today &&
      [REQUEST_STATUS.OPEN, REQUEST_STATUS.SELECTED, REQUEST_STATUS.AGREED].includes(r.status),
  );
  if (!stale.length) return done(state, 0);

  const ids = new Set(stale.map((r) => r.id));
  return done(
    {
      ...state,
      requests: state.requests.map((r) =>
        ids.has(r.id) ? { ...r, status: REQUEST_STATUS.EXPIRED, closedAt: now } : r,
      ),
      offers: state.offers.map((o) =>
        ids.has(o.requestId) && isLiveOffer(o) ? { ...o, status: OFFER_STATUS.EXPIRED } : o,
      ),
    },
    stale.length,
  );
}

/** A cook pulls out before being chosen. */
export function withdrawOffer(state, { offerId, now }) {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (offer.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);

  const request = requestById(state, offer.requestId);
  let next = {
    ...state,
    offers: state.offers.map((o) =>
      o.id === offerId ? { ...o, status: OFFER_STATUS.WITHDRAWN } : o,
    ),
  };

  /* If they were the chosen one, the request goes back on the table rather
     than stranding the customer with a dead negotiation. */
  if (request?.selectedOfferId === offerId) {
    next = {
      ...next,
      requests: next.requests.map((r) =>
        r.id === request.id
          ? { ...r, status: REQUEST_STATUS.OPEN, selectedOfferId: null }
          : r,
      ),
    };
  }

  next = notify(next, {
    audience: 'customer',
    kind: 'offer-withdrawn',
    key: `customer:offer-withdrawn:${offerId}`,
    title: 'Offer withdrawn',
    body: '{cook} pulled out of {title}.',
    requestId: offer.requestId,
    offerId,
    now,
  });

  return done(next, null);
}

/**
 * The customer picks one.
 *
 * Everything else closes in the same transition, which is what stops a
 * customer negotiating with two cooks at once and ending up committed to
 * both. The losers are told; being left wondering is worse than being told
 * no.
 */
export function selectOffer(state, { requestId, offerId, now }) {
  const request = requestById(state, requestId);
  if (!request) return fail(state, ERR.NO_REQUEST);
  if (request.status === REQUEST_STATUS.ORDERED) return fail(state, ERR.ALREADY_SETTLED);
  if (request.status === REQUEST_STATUS.CANCELLED) return fail(state, ERR.REQUEST_CLOSED);

  const offer = state.offers.find((o) => o.id === offerId && o.requestId === requestId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (!isLiveOffer(offer)) return fail(state, ERR.OFFER_CLOSED);
  if (offer.price == null) return fail(state, ERR.NO_PRICE_YET);

  let next = {
    ...state,
    requests: state.requests.map((r) =>
      r.id === requestId
        ? { ...r, status: REQUEST_STATUS.SELECTED, selectedOfferId: offerId }
        : r,
    ),
    offers: state.offers.map((o) => {
      if (o.requestId !== requestId) return o;
      if (o.id === offerId) {
        return { ...o, status: OFFER_STATUS.SELECTED, selectedAt: now };
      }
      return isLiveOffer(o) ? { ...o, status: OFFER_STATUS.NOT_SELECTED } : o;
    }),
  };

  next = notify(next, {
    audience: 'cook',
    kind: 'offer-selected',
    key: `cook:offer-selected:${offerId}`,
    title: 'You were chosen',
    body: '{customer} picked your offer for {title}.',
    requestId,
    offerId,
    now,
  });

  const losers = offersForRequest(state, requestId).filter(
    (o) => o.id !== offerId && isLiveOffer(o),
  );
  if (losers.length) {
    next = notify(next, {
      audience: 'cook',
      kind: 'offer-not-selected',
      key: `cook:offer-not-selected:${requestId}`,
      title: 'Offer not selected',
      body: '{customer} went with another cook for {title}.',
      requestId,
      now,
    });
  }

  return done(next, offer);
}

/* ------------------------------------------------------------------ *
 * negotiation
 * ------------------------------------------------------------------ */

/**
 * Name a different number.
 *
 * Only the side whose turn it is may move, which is the whole of the
 * concurrency control this needs: two counter-offers cannot cross, because
 * the second one is validated against a history that already contains the
 * first.
 */
export function counterOffer(state, { offerId, by, amount, now }) {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (offer.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);
  if (!isNegotiable(offer)) return fail(state, ERR.OFFER_CLOSED);
  if (turnOf(offer) !== by) return fail(state, ERR.NOT_YOUR_TURN);

  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return fail(state, ERR.BAD_AMOUNT);

  const updated = {
    ...offer,
    price: value,
    status: OFFER_STATUS.NEGOTIATING,
    history: [...offer.history, { by, amount: value, at: now }],
  };

  let next = {
    ...state,
    offers: state.offers.map((o) => (o.id === offerId ? updated : o)),
  };

  next = notify(next, {
    audience: by === 'cook' ? 'customer' : 'cook',
    kind: 'counter-offer',
    key: `${by === 'cook' ? 'customer' : 'cook'}:counter-offer:${offerId}:${updated.history.length}`,
    title: 'Counter offer',
    body: '৳{amount} for {title}. Accept it or name another price.',
    requestId: offer.requestId,
    offerId,
    now,
  });

  return done(next, updated);
}

/**
 * Take the number on the table.
 *
 * Refused when it is your own -- accepting what you just proposed is not
 * agreement, it is a way to close a negotiation the other side never
 * answered.
 */
export function acceptPrice(state, { offerId, by, now }) {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (offer.status === OFFER_STATUS.AGREED) return fail(state, ERR.ALREADY_SETTLED);
  if (!isNegotiable(offer)) return fail(state, ERR.OFFER_CLOSED);

  const last = standing(offer);
  if (!last) return fail(state, ERR.NO_PRICE_YET);
  if (last.by === by) return fail(state, ERR.NOT_YOUR_TURN);

  const updated = {
    ...offer,
    status: OFFER_STATUS.AGREED,
    agreedPrice: last.amount,
    history: [...offer.history, { by, amount: last.amount, at: now, accepted: true }],
  };

  let next = {
    ...state,
    offers: state.offers.map((o) => (o.id === offerId ? updated : o)),
    requests: state.requests.map((r) =>
      r.id === offer.requestId ? { ...r, status: REQUEST_STATUS.AGREED } : r,
    ),
  };

  next = notify(next, {
    audience: 'customer',
    kind: 'price-agreed',
    key: `customer:price-agreed:${offerId}`,
    title: 'Price agreed',
    body: '৳{amount} agreed with {cook}. Pay to confirm the order.',
    requestId: offer.requestId,
    offerId,
    now,
  });

  next = notify(next, {
    audience: 'cook',
    kind: 'price-agreed',
    key: `cook:price-agreed:${offerId}`,
    title: 'Price agreed',
    body: '৳{amount} agreed for {title}. Waiting for payment.',
    requestId: offer.requestId,
    offerId,
    now,
  });

  return done(next, updated);
}

/* ------------------------------------------------------------------ *
 * payment
 * ------------------------------------------------------------------ */

/**
 * Pay the agreed price, and turn the request into a real order.
 *
 * The amount comes from the offer's `agreedPrice`, never from the caller:
 * the one number that matters is the one both sides signed off on, and a
 * screen is not allowed an opinion about it.
 */
export function payForRequest(state, { requestId, customer, now, rand }) {
  const request = requestById(state, requestId);
  if (!request) return fail(state, ERR.NO_REQUEST);
  if (request.status === REQUEST_STATUS.ORDERED) return fail(state, ERR.ALREADY_SETTLED);
  if (request.status !== REQUEST_STATUS.AGREED) return fail(state, ERR.NOT_AGREED);

  const offer = state.offers.find((o) => o.id === request.selectedOfferId);
  if (!offer) return fail(state, ERR.NO_OFFER);
  if (offer.status !== OFFER_STATUS.AGREED || offer.agreedPrice == null) {
    return fail(state, ERR.NOT_AGREED);
  }

  const amount = offer.agreedPrice;
  const balance = balances(state.ledger).customer;
  if (balance < amount) {
    return fail(state, ERR.LOW_BALANCE, { short: amount - balance, balance });
  }

  const [seq, id] = bump(state, 'order');
  const order = {
    id,
    kind: 'request',
    code: makeCode(rand),
    requestId,
    offerId: offer.id,
    kitchenId: offer.kitchenId,
    cookName: offer.cookName,
    title: request.title,
    image: request.image ?? offer.cookAvatar,
    handover: 'delivery',
    customerKey: request.customerKey,
    customerName: request.customerName,
    phone: request.phone,
    address: request.address,
    quantity: request.quantity,
    price: amount,
    amount,
    status: 'confirmed',
    payment: 'held',
    history: [{ status: 'confirmed', at: now }],
    createdAt: now,
  };

  let next = { ...state, seq, orders: [order, ...state.orders] };

  next = {
    ...next,
    requests: next.requests.map((r) =>
      r.id === requestId ? { ...r, status: REQUEST_STATUS.ORDERED, orderId: id } : r,
    ),
  };

  next = post(next, {
    kind: 'hold',
    amount,
    from: 'customer',
    to: 'held',
    orderId: id,
    note: 'Held for {title}',
    now,
  });

  next = notify(next, {
    audience: 'cook',
    kind: 'request-paid',
    key: `cook:request-paid:${id}`,
    title: 'Order confirmed',
    body: '{customer} paid ৳{amount} for {title}. Start when you are ready.',
    requestId,
    orderId: id,
    now,
  });

  next = notify(next, {
    audience: 'customer',
    kind: 'order-placed',
    key: `customer:order-placed:${id}`,
    title: 'Order confirmed',
    body: '৳{amount} is held until you confirm the food arrived.',
    requestId,
    orderId: id,
    now,
  });

  return done(next, order);
}
