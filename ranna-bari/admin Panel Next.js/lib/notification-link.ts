/**
 * Where a notification points.
 *
 * A notification is always *about* something — an order, a meal, a request, a
 * kitchen, a person — and the row carries the id. Without one place to turn
 * that into a URL, every surface that lists notifications invents its own
 * mapping and they drift: the header opens the order while the board opens
 * the notification record, and an operator learns not to trust either.
 *
 * Ordered most specific first. An order notification usually carries a
 * kitchenId as well, and the order is the thing the message is about; the
 * kitchen is only where it happened.
 */
export type NotificationTarget = {
  id?: string | null;
  orderId?: string | null;
  mealId?: string | null;
  requestId?: string | null;
  kitchenId?: string | null;
  customerKey?: string | null;
};

export function notificationHref(note: NotificationTarget): string {
  if (note.orderId) return `/orders/${note.orderId}`;
  if (note.mealId) return `/meals/${note.mealId}`;
  if (note.requestId) return `/requests/${note.requestId}`;
  if (note.kitchenId) return `/kitchens/${note.kitchenId}`;
  /* A phone number in a path segment: `+` is a space to a URL parser, and a
     customer key is the one id here that is not hex. */
  if (note.customerKey) return `/customers/${encodeURIComponent(note.customerKey)}`;
  /* A broadcast is about nothing but itself, and its own record is where the
     send and open counts live — which is exactly what an operator wants from
     a message addressed to everybody. */
  return note.id ? `/notifications/${note.id}` : '/notifications';
}

/** What the destination is, for a tooltip or a caption. */
export function notificationTargetLabel(note: NotificationTarget): string {
  if (note.orderId) return 'order';
  if (note.mealId) return 'meal';
  if (note.requestId) return 'request';
  if (note.kitchenId) return 'kitchen';
  if (note.customerKey) return 'customer';
  return 'notification';
}
