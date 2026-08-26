/**
 * The web build fetches these three files over HTTP at runtime (`js/app.js`
 * DB map). Bundling them instead keeps the same shape and the same records,
 * so every screen reads exactly the data the HTML pages did.
 *
 * On top of that sits one record the bundle cannot hold: the kitchen of the
 * cook signed in on this device. It lives in KitchenContext because it has to
 * be writable, and the hooks below merge it in so Browse, Map and the kitchen
 * page see one list and never learn the difference. A dish a cook adds in the
 * cook panel is on the customer side the moment they switch modes.
 */
import { useMemo } from 'react';

import chefs from './chefs.json';
import menus from './menus.json';
import reviews from './reviews.json';
import { useKitchen } from '../store/KitchenContext';

export { chefs, menus, reviews };

/* ---------------- static lookups, over the bundled data only ---------------- */

export const getChef = (id) => chefs.find((c) => String(c.id) === String(id));

export const getMenu = (chefId) =>
  menus.find((m) => String(m.chefId) === String(chefId))?.items ?? [];

export const getReviews = (chefId) =>
  reviews.filter((r) => String(r.chefId) === String(chefId));

/** Areas present in the bundled data, for the browse-screen picker. */
export const AREAS = ['all', ...Array.from(new Set(chefs.map((c) => c.area)))];

/** Aggregate score for the testimonials header chip. */
export const reviewSummary = () => {
  const total = reviews.reduce((s, r) => s + r.rating, 0);
  return {
    average: reviews.length ? total / reviews.length : 0,
    count: reviews.length,
  };
};

/* ---------------- live lookups, bundled data + the local kitchen ---------------- */

/**
 * Strip the cook-only fields off a kitchen record so what reaches a customer
 * surface is shaped exactly like a row of chefs.json — nothing downstream
 * should have to branch on where a chef came from.
 */
const asChef = (kitchen) => {
  const { dishes, nextDishSeq, createdAt, ownerName, ...chef } = kitchen;
  return chef;
};

/**
 * Every kitchen a customer can see, the local one first.
 *
 * It leads the list because on this device it is the only kitchen whose menu
 * is real — everything behind it is seed data.
 */
export function useChefs() {
  const { kitchen } = useKitchen();
  return useMemo(
    () => (kitchen ? [asChef(kitchen), ...chefs] : chefs),
    [kitchen],
  );
}

/** One kitchen by id, local or bundled. */
export function useChef(id) {
  const { kitchen } = useKitchen();
  return useMemo(() => {
    if (kitchen && String(kitchen.id) === String(id)) return asChef(kitchen);
    return getChef(id);
  }, [kitchen, id]);
}

/**
 * A kitchen's menu. The local kitchen only ever shows dishes it has marked
 * available — "sold out for today" has to mean something on the customer
 * side or the toggle is decoration.
 */
export function useMenu(chefId) {
  const { kitchen } = useKitchen();
  return useMemo(() => {
    if (kitchen && String(kitchen.id) === String(chefId)) {
      return kitchen.dishes.filter((d) => d.available);
    }
    return getMenu(chefId);
  }, [kitchen, chefId]);
}

/** Every menu, in the `{ chefId, items }` shape the cart's pairing logic wants. */
export function useMenus() {
  const { kitchen } = useKitchen();
  return useMemo(() => {
    if (!kitchen) return menus;
    return [
      { chefId: kitchen.id, items: kitchen.dishes.filter((d) => d.available) },
      ...menus,
    ];
  }, [kitchen]);
}

/** Areas for the browse picker, including wherever the local cook is. */
export function useAreas() {
  const list = useChefs();
  return useMemo(
    () => ['all', ...Array.from(new Set(list.map((c) => c.area)))],
    [list],
  );
}
