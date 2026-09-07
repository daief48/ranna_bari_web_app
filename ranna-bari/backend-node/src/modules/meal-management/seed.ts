import { MmFoodItem, MmFoodPrice, MmRecipe } from './models.js';

/**
 * The module's reference data — the food catalogue and the dish book.
 *
 * These are configuration, not content: without a price list and a few costed
 * recipes the planner has nothing to optimise over, so the feature cannot
 * function until they exist. They are written only into this module's own
 * `mm_` collections and only with `$setOnInsert`, which means a price an
 * operator later corrects is never walked back by a redeploy.
 *
 * Seeding is lazy — the first request into the module triggers it — so a
 * deployment that nobody opens writes nothing at all, and boot stays untouched.
 *
 * The figures come from the requirement document's own tables. They are
 * starting prices for a Bangladeshi mess, meant to be edited, not fixtures
 * pretending to be real data.
 */

type FoodSeed = { key: string; name: string; unit: string; price: number };

const FOODS: FoodSeed[] = [
  /* From the specification's food-price table. */
  { key: 'rice', name: 'Rice', unit: 'kg', price: 75 },
  { key: 'chicken', name: 'Chicken', unit: 'kg', price: 300 },
  { key: 'fish', name: 'Fish', unit: 'kg', price: 280 },
  { key: 'egg', name: 'Egg', unit: 'piece', price: 13 },
  { key: 'dal', name: 'Dal', unit: 'kg', price: 140 },
  { key: 'potato', name: 'Potato', unit: 'kg', price: 35 },
  { key: 'vegetable', name: 'Vegetable', unit: 'kg', price: 50 },

  /* What the costed recipes below additionally need. */
  { key: 'beef', name: 'Beef', unit: 'kg', price: 780 },
  { key: 'oil', name: 'Cooking oil', unit: 'kg', price: 200 },
  { key: 'onion', name: 'Onion', unit: 'kg', price: 100 },
  { key: 'atta', name: 'Atta / flour', unit: 'kg', price: 55 },
  { key: 'milk', name: 'Milk', unit: 'litre', price: 90 },
  { key: 'sugar', name: 'Sugar', unit: 'kg', price: 130 },
];

type RecipeSeed = {
  key: string;
  name: string;
  slot: string;
  protein: string;
  ingredients: { foodKey: string; qty: number; unit: string }[];
  sundries: number;
  tags: string[];
};

/**
 * Dishes as whole plates, rice included, because that is the unit a meal rate
 * is expressed in — "lunch cost ৳65", not "the curry cost ৳45". Quantities are
 * in each food's own unit: 0.12 kg of chicken, 1 egg.
 */
const RECIPES: RecipeSeed[] = [
  /* breakfast */
  {
    key: 'ruti-dal',
    name: 'Ruti + Dal',
    slot: 'breakfast',
    protein: 'dal',
    ingredients: [
      { foodKey: 'atta', qty: 0.12, unit: 'kg' },
      { foodKey: 'dal', qty: 0.04, unit: 'kg' },
      { foodKey: 'oil', qty: 0.005, unit: 'kg' },
    ],
    sundries: 2,
    tags: ['light', 'cheap'],
  },
  {
    key: 'khichuri',
    name: 'Khichuri',
    slot: 'breakfast',
    protein: 'dal',
    ingredients: [
      { foodKey: 'rice', qty: 0.1, unit: 'kg' },
      { foodKey: 'dal', qty: 0.05, unit: 'kg' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
      { foodKey: 'onion', qty: 0.02, unit: 'kg' },
    ],
    sundries: 3,
    tags: ['comfort'],
  },
  {
    key: 'paratha-egg',
    name: 'Paratha + Egg',
    slot: 'breakfast',
    protein: 'egg',
    ingredients: [
      { foodKey: 'atta', qty: 0.1, unit: 'kg' },
      { foodKey: 'egg', qty: 1, unit: 'piece' },
      { foodKey: 'oil', qty: 0.015, unit: 'kg' },
    ],
    sundries: 2,
    tags: ['filling'],
  },
  {
    key: 'bread-milk',
    name: 'Bread + Milk',
    slot: 'breakfast',
    protein: 'veg',
    ingredients: [
      { foodKey: 'atta', qty: 0.08, unit: 'kg' },
      { foodKey: 'milk', qty: 0.2, unit: 'litre' },
      { foodKey: 'sugar', qty: 0.01, unit: 'kg' },
    ],
    sundries: 1,
    tags: ['light', 'quick'],
  },

  /* lunch and dinner — the same plates serve both sittings */
  {
    key: 'rice-chicken',
    name: 'Rice + Chicken curry',
    slot: 'lunch',
    protein: 'chicken',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'chicken', qty: 0.12, unit: 'kg' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
      { foodKey: 'onion', qty: 0.03, unit: 'kg' },
      { foodKey: 'potato', qty: 0.05, unit: 'kg' },
    ],
    sundries: 3,
    tags: ['protein'],
  },
  {
    key: 'rice-fish',
    name: 'Rice + Fish curry',
    slot: 'lunch',
    protein: 'fish',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'fish', qty: 0.12, unit: 'kg' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
      { foodKey: 'onion', qty: 0.03, unit: 'kg' },
      { foodKey: 'potato', qty: 0.04, unit: 'kg' },
    ],
    sundries: 3,
    tags: ['protein'],
  },
  {
    key: 'rice-egg',
    name: 'Rice + Egg curry',
    slot: 'lunch',
    protein: 'egg',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'egg', qty: 2, unit: 'piece' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
      { foodKey: 'onion', qty: 0.02, unit: 'kg' },
      { foodKey: 'potato', qty: 0.05, unit: 'kg' },
    ],
    sundries: 2,
    tags: ['cheap', 'protein'],
  },
  {
    key: 'rice-beef',
    name: 'Rice + Beef curry',
    slot: 'lunch',
    protein: 'beef',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'beef', qty: 0.1, unit: 'kg' },
      { foodKey: 'oil', qty: 0.012, unit: 'kg' },
      { foodKey: 'onion', qty: 0.03, unit: 'kg' },
    ],
    sundries: 4,
    tags: ['protein', 'rich'],
  },
  {
    key: 'rice-dal-veg',
    name: 'Rice + Dal + Vegetable',
    slot: 'lunch',
    protein: 'dal',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'dal', qty: 0.05, unit: 'kg' },
      { foodKey: 'vegetable', qty: 0.12, unit: 'kg' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
    ],
    sundries: 2,
    tags: ['cheap', 'veg'],
  },
  {
    key: 'rice-veg',
    name: 'Rice + Mixed vegetable',
    slot: 'lunch',
    protein: 'veg',
    ingredients: [
      { foodKey: 'rice', qty: 0.15, unit: 'kg' },
      { foodKey: 'vegetable', qty: 0.15, unit: 'kg' },
      { foodKey: 'potato', qty: 0.05, unit: 'kg' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
    ],
    sundries: 2,
    tags: ['cheap', 'veg'],
  },
  {
    key: 'khichuri-egg',
    name: 'Khichuri + Egg',
    slot: 'dinner',
    protein: 'egg',
    ingredients: [
      { foodKey: 'rice', qty: 0.12, unit: 'kg' },
      { foodKey: 'dal', qty: 0.05, unit: 'kg' },
      { foodKey: 'egg', qty: 1, unit: 'piece' },
      { foodKey: 'oil', qty: 0.01, unit: 'kg' },
    ],
    sundries: 3,
    tags: ['comfort', 'cheap'],
  },
];

/**
 * Dishes offered at lunch are offered at dinner too.
 *
 * Stored once with `slot: 'lunch'`; the planner asks for a slot and gets the
 * lunch book for either main sitting. Duplicating eleven rows to say so would
 * mean two rows to correct every time a recipe changes.
 */
export const mainSlots = new Set(['lunch', 'dinner']);

let seeded = false;

/**
 * Put the reference data in place, once per process.
 *
 * `$setOnInsert` throughout: an existing row is left exactly as it is, so a
 * corrected price survives. The in-process flag keeps the common case to zero
 * queries; the writes themselves are idempotent regardless, so two workers
 * racing on a cold database is harmless.
 */
export async function ensureSeed(): Promise<void> {
  if (seeded) return;

  const existing = await MmFoodItem.estimatedDocumentCount();

  if (existing === 0) {
    await MmFoodItem.bulkWrite(
      FOODS.map((f) => ({
        updateOne: {
          filter: { key: f.key },
          update: { $setOnInsert: { ...f, available: true, note: '' } },
          upsert: true,
        },
      })),
    );

    /* The opening price is a price-history row like any other, so the history
       never starts empty and a chart has somewhere to begin. */
    const today = new Date().toISOString().slice(0, 10);
    await MmFoodPrice.bulkWrite(
      FOODS.map((f) => ({
        updateOne: {
          filter: { foodKey: f.key, effectiveDate: today },
          update: { $setOnInsert: { foodKey: f.key, price: f.price, effectiveDate: today, source: 'seed' } },
          upsert: true,
        },
      })),
    );
  }

  const recipeCount = await MmRecipe.estimatedDocumentCount();
  if (recipeCount === 0) {
    await MmRecipe.bulkWrite(
      RECIPES.map((r) => ({
        updateOne: {
          filter: { key: r.key },
          update: { $setOnInsert: { ...r, active: true } },
          upsert: true,
        },
      })) as never,
    );
  }

  seeded = true;
}

/** Test hook — lets a suite seed a fresh in-memory database more than once. */
export const resetSeedFlag = (): void => {
  seeded = false;
};
