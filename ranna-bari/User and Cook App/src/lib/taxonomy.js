/**
 * The platform's category vocabulary, as data.
 *
 * It used to be a `const CHIPS = [...]` in the browse screen, which meant
 * the list of things this app believes food can be lived in a React
 * component -- unreachable from a food request, from search, or from anyone
 * who wanted to add one. It is a collection now, seeded once from the tag
 * vocabulary the seed data actually uses, and every surface reads it.
 *
 * Per-cook shop categories are a different thing and stay separate: those
 * are one cook's shelves, arranged how they like. These are the words the
 * whole platform shares.
 */
import { bump, done, fail, ERR } from './ledger';

/**
 * The seed.
 *
 * `key` is the tag as it appears on a dish or a kitchen, so filtering stays
 * a straight match against the data; `label` is what a person reads. Meal
 * times first, then kinds of food, then the ones you pick when nothing in
 * particular is wanted -- the order a hungry person narrows in.
 *
 * Dietary tags are deliberately absent: they are constraints rather than
 * categories, and they live in the filter sheet where they combine with one
 * of these instead of replacing it.
 */
const SEED = [
  ['breakfast', 'Morning', '🌅'],
  ['lunch', 'Lunch', '🍚'],
  ['dinner', 'Evening', '🌙'],
  ['biryani', 'Biryani', '🍛'],
  ['heritage', 'Heritage', '🔥'],
  ['comfort', 'Comfort', '🍲'],
  ['street', 'Street food', '🌶'],
  ['seafood', 'Seafood', '🐟'],
  ['grill', 'Grill', '🍢'],
  ['snacks', 'Snacks', '🥟'],
  ['sweet', 'Sweet', '🍮'],
  ['bakery', 'Bakery', '🍞'],
  ['healthy', 'Healthy', '🥗'],
  ['spicy', 'Spicy', '🌶'],
  ['meat', 'Meat', '🍖'],
  ['sylheti', 'Sylheti', '🍛'],
  ['asian', 'Asian', '🍜'],
  ['fusion', 'Fusion', '🍤'],
  ['office', 'Office lunch', '💼'],
  ['iftar', 'Iftar', '🌙'],
  ['budget', 'Budget', '💰'],
  /* Not a tag on any dish -- the things a cook makes to order rather than
     lists, which is exactly what a food request is usually for. */
  ['cake', 'Cake', '🎂'],
  ['pitha', 'Pitha', '🥮'],
  ['achar', 'Achar', '🫙'],
  ['gift', 'Gift boxes', '🎁'],
];

/** Categories in the order they are shown. */
export const taxonomyOf = (state) =>
  (state.taxonomy ?? []).slice().sort((a, b) => a.order - b.order);

export const categoryByKey = (state, key) =>
  (state.taxonomy ?? []).find((c) => c.key === key) ?? null;

export const categoryById = (state, id) =>
  (state.taxonomy ?? []).find((c) => c.id === id) ?? null;

/** Fill an empty taxonomy. Idempotent: an existing one is left alone. */
export function seedTaxonomy(state) {
  if (state.taxonomy?.length) return state;

  let next = state;
  const rows = [];
  SEED.forEach(([key, label, emoji], i) => {
    const [seq, id] = bump(next, 'tax');
    next = { ...next, seq };
    rows.push({ id, key, label, emoji, order: i });
  });
  return { ...next, taxonomy: rows };
}

/** Add one. Used by nothing in the UI yet, and by a future admin screen. */
export function addCategory(state, { key, label, emoji, now }) {
  const clean = String(label ?? '').trim();
  if (!clean) return fail(state, ERR.NAME_REQUIRED);

  const slug = String(key ?? clean).trim().toLowerCase().replace(/\s+/g, '-');
  if (categoryByKey(state, slug)) return fail(state, ERR.CATEGORY_IN_USE);

  const [seq, id] = bump(state, 'tax');
  const row = {
    id,
    key: slug,
    label: clean,
    emoji: emoji ?? '',
    order: taxonomyOf(state).length,
    createdAt: now,
  };
  return done({ ...state, seq, taxonomy: [...state.taxonomy, row] }, row);
}
