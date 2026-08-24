/**
 * The web build fetches these three files over HTTP at runtime (`js/app.js`
 * DB map). Bundling them instead keeps the same shape and the same records,
 * so every screen reads exactly the data the HTML pages did.
 */
import chefs from './chefs.json';
import menus from './menus.json';
import reviews from './reviews.json';

export { chefs, menus, reviews };

export const getChef = (id) => chefs.find((c) => String(c.id) === String(id));

export const getMenu = (chefId) =>
  menus.find((m) => String(m.chefId) === String(chefId))?.items ?? [];

export const getReviews = (chefId) =>
  reviews.filter((r) => String(r.chefId) === String(chefId));

/** Areas present in the data, for the browse-screen picker. */
export const AREAS = ['all', ...Array.from(new Set(chefs.map((c) => c.area)))];

/** Aggregate score for the testimonials header chip. */
export const reviewSummary = () => {
  const total = reviews.reduce((s, r) => s + r.rating, 0);
  return {
    average: reviews.length ? total / reviews.length : 0,
    count: reviews.length,
  };
};
