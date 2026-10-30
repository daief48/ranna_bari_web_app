import { useEffect } from 'react';

import { useCommerce } from '../../store/CommerceContext';

/**
 * The food request a paid request order came from.
 *
 * The order carries the customer's `note` and the lines they asked for, but
 * the description, portions and wanted-by date live on the request. The
 * request is looked up by `order.requestId`, falling back to the request that
 * names this order (`request.orderId`) for an order row that predates the
 * field. When it is not in the list yet (the board is capped at fifty and
 * arrives a moment after the app does) it is fetched once - the same
 * `ensureRequest` the request screen uses - and the card repaints when it
 * lands. A non-request order does nothing and returns null.
 *
 * @param {object|null|undefined} order
 * @returns {object|null}
 */
export function useRequestOf(order) {
  const { requests, ensureRequest } = useCommerce();
  const isRequest = order?.kind === 'request';
  const orderId = order?.id != null ? String(order.id) : null;
  const requestId = order?.requestId != null ? String(order.requestId) : null;

  const found = !isRequest
    ? null
    : (requests ?? []).find(
        (r) =>
          (requestId && String(r.id) === requestId) ||
          (orderId && r.orderId != null && String(r.orderId) === orderId),
      ) ?? null;

  useEffect(() => {
    if (isRequest && !found && requestId) ensureRequest?.(requestId);
  }, [isRequest, found, requestId, ensureRequest]);

  return found;
}
