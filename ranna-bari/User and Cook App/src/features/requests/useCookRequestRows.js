import { useMemo } from 'react';

import { useKitchen } from '../../store/KitchenContext';
import { useCommerce } from '../../store/CommerceContext';
import { useSession } from '../../store/SessionContext';
import { useOrders } from '../../store/OrdersContext';
import { REQUEST_STATUS, OFFER_STATUS, turnOf } from '../../lib/requestLogic';
import { isRequestOrder, stageOf } from '../../lib/orderRails';

/**
 * How a cook's food requests are grouped — the one copy of the rules.
 *
 * The requests board, the Orders tab and every badge (Profile row, Dashboard
 * tile) read this, so "how many need me" can never disagree between screens.
 *
 *  - open:  nobody has answered for this kitchen yet and the request is still
 *           taking bids ("Waiting for your price").
 *  - mine:  answered and still going somewhere ("Your offers").
 *  - agreed: price settled by both sides, the customer has not paid yet
 *           ("Waiting for payment"). No order exists, so there is nothing to
 *           cook -- the row only links to the request thread.
 *  - done:  the cook declined or withdrew, the customer chose someone else or
 *           walked away, or the request was cancelled ("Closed").
 *
 * Once the customer pays, the request becomes an order (kind 'request') and
 * leaves these groups for `orders`: the paid request orders, which the Orders
 * sub-tab works with the same lanes as the Menu board.
 *
 * `counts.needsYou` is what is the cook's move: every unanswered request plus
 * every offer whose last word came from the customer plus every paid request
 * order still waiting to be started. Every badge reads this one number.
 *
 * Nothing here ever reads another cook's offer — the context hands a cook
 * only their own, and the rows carry only that.
 */

/* Offer states that put a row in "Closed". `declined` is the cook's own
   "not for me" — it used to sit under "Your offers" wearing a pill. */
const CLOSED_OFFER = ['not-selected', 'withdrawn', 'declined', 'rejected', 'expired'];

/** The kitchen, as the offer call wants it. */
export const cookOf = (kitchen) => ({
  kitchenId: kitchen.id,
  name: kitchen.name,
  avatar: kitchen.avatar,
  rating: kitchen.rating,
  reviewCount: kitchen.reviewCount,
  area: kitchen.area,
  lat: kitchen.lat,
  lng: kitchen.lng,
});

const EMPTY = Object.freeze({
  open: [],
  mine: [],
  agreed: [],
  done: [],
  orders: [],
  counts: { open: 0, mine: 0, agreed: 0, done: 0, paidNew: 0, offersNeedYou: 0, needsYou: 0 },
});

/**
 * @param {Record<string, {kind: 'offer'|'decline'|'withdraw', price?: number|null}>} [overrides]
 *   Optimistic marks keyed by request id — the row is filed where the write
 *   will put it, until the server's answer replaces the mark.
 */
export function useCookRequestRows(overrides) {
  const { kitchen } = useKitchen();
  const shop = useCommerce();
  const { identity } = useSession();
  const { ordersForKitchen } = useOrders();
  const kitchenId = kitchen?.id ?? identity?.kitchenId ?? null;
  const { requests, offers } = shop;

  /* The paid request orders of this kitchen -- memoised on the list so the
     counts below do not recompute on every render. */
  const orders = useMemo(
    () => (kitchenId ? ordersForKitchen(kitchenId).filter(isRequestOrder) : []),
    [ordersForKitchen, kitchenId],
  );

  const rows = useMemo(() => {
    if (!kitchenId) return { ...EMPTY, orders };

    const mineOffers = new Map(offers.map((o) => [String(o.requestId), o]));
    /* The server already scopes GET /requests to this kitchen (a direct
       request or a broadcast it was eligible for), bounded to 50. */
    const all = requests
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);

    const open = [];
    const mine = [];
    const agreed = [];
    const done = [];
    for (const request of all) {
      let offer = mineOffers.get(String(request.id)) ?? null;
      const mark = overrides?.[request.id];
      if (mark?.kind === 'offer') {
        offer = {
          ...(offer ?? { id: `pending:${request.id}`, history: [] }),
          status: mark.price != null ? 'priced' : 'interested',
          price: mark.price ?? offer?.price ?? null,
          history:
            mark.price != null
              ? [...(offer?.history ?? []), { by: 'cook', amount: mark.price }]
              : (offer?.history ?? []),
        };
      } else if (mark?.kind === 'decline') {
        offer = { ...(offer ?? { id: `pending:${request.id}`, history: [] }), status: 'declined' };
      } else if (mark?.kind === 'withdraw' && offer) {
        offer = { ...offer, status: 'withdrawn' };
      }

      const row = { request, offer };
      if (
        request.status === REQUEST_STATUS.CANCELLED ||
        request.status === REQUEST_STATUS.EXPIRED ||
        (offer && CLOSED_OFFER.includes(offer.status))
      ) {
        done.push(row);
      } else if (request.status === REQUEST_STATUS.ORDERED || request.orderId) {
        /* Paid: it is an order now and lives in `orders`, not here. */
      } else if (offer?.status === OFFER_STATUS.AGREED) {
        agreed.push(row);
      } else if (offer) {
        mine.push(row);
      } else if (request.status === REQUEST_STATUS.OPEN) {
        open.push(row);
      }
    }

    const waitingOnCook = mine.filter((r) => turnOf(r.offer) === 'cook').length;
    /* Paid and not started: stage 'placed' is `confirmed` on the wallet rail. */
    const paidNew = orders.filter((o) => stageOf(o.status) === 'placed').length;
    const offersNeedYou = open.length + waitingOnCook;
    return {
      open,
      mine,
      agreed,
      done,
      orders,
      counts: {
        open: open.length,
        mine: mine.length,
        agreed: agreed.length,
        done: done.length,
        paidNew,
        offersNeedYou,
        needsYou: offersNeedYou + paidNew,
      },
    };
  }, [requests, offers, kitchenId, overrides, orders]);

  return {
    ...rows,
    /* The first answer has landed (or settled as a refusal). */
    ready: shop.ordersReady,
    /* The last read of the board was refused — "none" would be a lie. */
    failed: !!shop.requestsFailed,
    retry: shop.refresh,
  };
}
