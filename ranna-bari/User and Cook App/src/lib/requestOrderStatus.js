/**
 * Where a PAID food request has got to, read off its order.
 *
 * A request's own status stops at `ordered` the moment the customer pays --
 * after that the truth lives on the order (cooking, on the bike, delivered,
 * completed, cancelled), because from payment on it is an ordinary wallet
 * order on the same rail as every other. The list and the detail screen used
 * to print a static "paid and on its way" over all of that, which was a lie
 * the moment the cook rejected it or the customer cancelled and was refunded.
 *
 * This returns English keys, not translated strings, so the caller passes
 * them through t() and the vocabulary stays in one place. `stage` follows
 * `stageOf` in orderRails so a wallet order's confirmed/preparing/ready/
 * delivering collapse onto the same four words the cook sees.
 *
 * A request that is `cancelled` but carries an `orderId` is the backend's
 * "paid order was cancelled" state -- the refund has already happened -- and
 * reads as cancelled-and-refunded even when the order row has not loaded yet.
 */
import { stageOf } from './orderRails';

export function liveOrderFor(request, orders) {
  if (!request?.orderId) return null;
  return (orders ?? []).find((o) => String(o.id) === String(request.orderId)) ?? null;
}

/**
 * @returns {{ stage: string, label: string, tone: 'sage'|'saffron'|'muted' } | null}
 *   null when the request has no order (nothing to report yet).
 */
export function requestOrderStage(request, order) {
  if (!request?.orderId) return null;

  if (order?.status === 'cancelled' || order?.status === 'rejected') {
    return { stage: 'cancelled', label: 'Cancelled — refunded to your wallet', tone: 'muted' };
  }
  if (!order) {
    if (request.status === 'cancelled') {
      return { stage: 'cancelled', label: 'Cancelled — refunded to your wallet', tone: 'muted' };
    }
    /* Paid, order row not here yet. Say the one thing that is certainly true. */
    return { stage: 'paid', label: 'Paid — waiting for the cook', tone: 'saffron' };
  }

  switch (stageOf(order.status)) {
    case 'completed':
      return { stage: 'completed', label: 'Completed', tone: 'sage' };
    case 'delivered':
      return { stage: 'delivered', label: 'Delivered — confirm you got it', tone: 'saffron' };
    case 'on_the_way':
      return { stage: 'on_the_way', label: 'On the way', tone: 'sage' };
    case 'cooking':
      return { stage: 'cooking', label: 'Cooking', tone: 'sage' };
    default:
      return { stage: 'paid', label: 'Paid — waiting for the cook', tone: 'saffron' };
  }
}

/**
 * How long the customer has left to pay an AGREED request, if the server says
 * when it was agreed. Returns null when it does not (the caller then shows a
 * plain "Pay to confirm"). `windowHours` defaults to the backend's
 * `requestPayWindowHours` if exposed in config, else is simply unknown.
 *
 * @returns {{ hours: number, minutes: number, over: boolean } | null}
 */
export function payTimeLeft(request, offer, windowHours, now = Date.now()) {
  const raw = request?.payBy ?? request?.payByAt ?? null;
  let deadline = raw ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(deadline)) {
    const at = request?.agreedAt ?? offer?.agreedAt ?? null;
    const start = at ? new Date(at).getTime() : NaN;
    const hrs = Number(windowHours);
    if (!Number.isFinite(start) || !Number.isFinite(hrs) || hrs <= 0) return null;
    deadline = start + hrs * 3600 * 1000;
  }
  const left = deadline - now;
  if (left <= 0) return { hours: 0, minutes: 0, over: true };
  return { hours: Math.floor(left / 3600000), minutes: Math.floor((left % 3600000) / 60000), over: false };
}
