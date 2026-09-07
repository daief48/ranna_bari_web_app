import { call } from '../../lib/server';

/**
 * The monthly meal system — the app's wire layer.
 *
 * Two parties on one set of endpoints. A cook sets up a service, writes a
 * calendar and cooks the day; a customer reads a cook's calendar, picks meals
 * off it and pays for the month up front. Both are here because they are two
 * halves of one contract, and splitting them would mean two files that have to
 * agree about the same eight shapes.
 *
 * Not to be confused with `features/meal-management`, which is the personal
 * mess tracker: different specification, different collections, no overlap.
 * This one is the marketplace — money moves through escrow and a kitchen is on
 * the other end.
 *
 * `call()` is the shared client and stays as it is: it already carries the
 * bearer header, the bodyless-POST rule Fastify insists on, and the
 * `{ ok, result } | { ok: false, error }` verdict every screen branches on.
 */

const qs = (params) => {
  const out = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return out ? `?${out}` : '';
};

/* ------------------------------------------------------------------ *
 * shared — what the platform sells
 * ------------------------------------------------------------------ */

/** The categories and their default rates. Public: a price list. */
export const fetchMealCategories = (token) => call('/meal-categories', { token });

/* ------------------------------------------------------------------ *
 * the cook's side
 * ------------------------------------------------------------------ */

/** This kitchen's service, plus the categories it could be switched to. */
export const fetchMyService = (token) => call('/meal-service/mine', { token });

/**
 * Create or change the service.
 *
 * `rate: null` is not zero — it means "charge whatever the category says",
 * which is a different promise from naming the same number by hand, because it
 * follows the platform when the platform moves.
 */
export const saveMyService = (token, { categoryKey, rate, minMeals, maxMeals, active }) =>
  call('/meal-service/mine', {
    method: 'POST',
    token,
    body: { categoryKey, rate: rate ?? null, minMeals, maxMeals, active },
  });

/**
 * The cook's month and the platform's underneath it.
 *
 * Both, always: the editor shows what is live and needs the system plan to
 * copy from the moment a cook decides to change one Tuesday.
 */
export const fetchMyPlan = (token, month) =>
  call(`/meal-plans/mine${qs({ month })}`, { token });

export const saveMyPlan = (token, { month, days, publish }) =>
  call('/meal-plans/mine', {
    method: 'POST',
    token,
    body: { month, days, publish: publish === true },
  });

/** Drop the override, so the platform's calendar is live again for this month. */
export const clearMyPlan = (token, month) =>
  call('/meal-plans/mine/clear', { method: 'POST', token, body: { month } });

/** The dish library: the platform's suggestions, and this cook's own. */
export const fetchMyDishes = (token, type) => call(`/meal-dishes${qs({ type })}`, { token });

export const addMyDish = (token, { name, type }) =>
  call('/meal-dishes', { method: 'POST', token, body: { name, type } });

export const retireMyDish = (token, id) =>
  call(`/meal-dishes/${id}/retire`, { method: 'POST', token });

/** Today's meals to cook, in the order the day happens. */
export const fetchMealOrders = (token, date) => call(`/meal-orders${qs({ date })}`, { token });

/* ------------------------------------------------------------------ *
 * the customer's side
 * ------------------------------------------------------------------ */

/** Cooks currently offering a month of meals. */
export const fetchMealServices = (token, categoryKey) =>
  call(`/meal-services${qs({ categoryKey })}`, { token });

/** One cook's calendar for a month, priced, with their min/max. */
export const fetchMealService = (token, kitchenId, month) =>
  call(`/meal-services/${kitchenId}${qs({ month })}`, { token });

/**
 * Buy a month.
 *
 * `selections` is `[{ date, slot }]` and nothing else — the price is the
 * server's to decide, from the service and the category as they are at this
 * moment. A client that sent a total would be a client that could be wrong
 * about it.
 */
export const bookMeals = (token, { kitchenId, month, selections, address }) =>
  call('/meal-bookings', {
    method: 'POST',
    token,
    body: { kitchenId, month, selections, address },
  });

export const fetchMyBookings = (token) => call('/meal-bookings', { token });

export const fetchMyBooking = (token, id) => call(`/meal-bookings/${id}`, { token });
