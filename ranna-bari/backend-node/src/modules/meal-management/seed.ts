import { MmCategory, MmMealType } from './models.js';

/**
 * What a new mess starts with.
 *
 * Seeded per mess rather than globally, because both lists are things §4.1
 * hands to the mess to configure — the defaults are a sensible first draft of
 * a house rule, not a catalogue the module owns. A mess that renames "Bazar"
 * or turns off breakfast is editing its own rows, and no other mess notices.
 *
 * Seeding runs once, when the mess is created. It is written to be safe to run
 * again anyway (`upsert` on the natural key), because the alternative is a
 * mess created by a request that half-failed being permanently missing its
 * lunch.
 */

/**
 * The three sittings, with the cutoffs that make a cutoff useful.
 *
 * Breakfast's is the interesting one: 21:00 with a day offset of −1, so
 * tomorrow's breakfast locks at nine tonight. A breakfast cutoff on the
 * morning itself would be theatre — the cook has already bought the eggs.
 *
 * Lunch and dinner lock the same morning, early enough that the bazar can
 * still be sized against the count and late enough that somebody who wakes up
 * ill can still turn their meal off.
 */
export const DEFAULT_MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', order: 1, cutoff: '21:00', cutoffDayOffset: -1 },
  { key: 'lunch', label: 'Lunch', order: 2, cutoff: '09:00', cutoffDayOffset: 0 },
  { key: 'dinner', label: 'Dinner', order: 3, cutoff: '17:00', cutoffDayOffset: 0 },
] as const;

/**
 * §4.4's eleven categories, each with the two decisions that matter.
 *
 * `foodCost` decides whether the money reaches the meal rate, and it is the
 * field §4.6 warns about by name: rent, electricity, water and wifi are false
 * here, so they allocate rather than inflate the rate. `defaultAllocation`
 * decides how they split when nobody says.
 *
 * Cook and maid salary are food costs on purpose. They are the labour half of
 * getting a meal onto a plate, and a mess that splits them equally is charging
 * the member who eats twice a month the same as the one who eats twice a day.
 * A mess that disagrees changes one toggle.
 */
export const DEFAULT_CATEGORIES = [
  { key: 'bazar', label: 'Grocery / Bazar', foodCost: true, defaultAllocation: 'meal', order: 1 },
  { key: 'gas', label: 'Gas', foodCost: true, defaultAllocation: 'meal', order: 2 },
  { key: 'cook', label: 'Cook Salary', foodCost: true, defaultAllocation: 'meal', order: 3 },
  { key: 'electricity', label: 'Electricity', foodCost: false, defaultAllocation: 'equal', order: 4 },
  { key: 'water', label: 'Water', foodCost: false, defaultAllocation: 'equal', order: 5 },
  { key: 'wifi', label: 'WiFi', foodCost: false, defaultAllocation: 'equal', order: 6 },
  { key: 'rent', label: 'House Rent', foodCost: false, defaultAllocation: 'equal', order: 7 },
  { key: 'maid', label: 'Maid Salary', foodCost: false, defaultAllocation: 'equal', order: 8 },
  { key: 'maintenance', label: 'Maintenance', foodCost: false, defaultAllocation: 'equal', order: 9 },
  { key: 'service', label: 'Service Charge', foodCost: false, defaultAllocation: 'equal', order: 10 },
  { key: 'other', label: 'Other Expense', foodCost: false, defaultAllocation: 'equal', order: 11 },
] as const;

/** Give a freshly created mess its meal types and expense categories. */
export async function seedMess(messId: string): Promise<void> {
  await Promise.all([
    MmMealType.bulkWrite(
      DEFAULT_MEAL_TYPES.map((type) => ({
        updateOne: {
          filter: { messId, key: type.key },
          update: { $setOnInsert: { messId, ...type, defaultValue: 1, countsInRate: true, active: true } },
          upsert: true,
        },
      })),
    ),
    MmCategory.bulkWrite(
      DEFAULT_CATEGORIES.map((category) => ({
        updateOne: {
          filter: { messId, key: category.key },
          update: { $setOnInsert: { messId, ...category, system: true, active: true } },
          upsert: true,
        },
      })),
    ),
  ]);
}

/* ------------------------------------------------------------------ *
 * join codes
 * ------------------------------------------------------------------ */

/**
 * The alphabet a join code is drawn from.
 *
 * No O/0, no I/1/L. §4.1 expects somebody to read this code off a screen and
 * type it into a phone, and those are exactly the pairs that turn a working
 * invitation into "the code doesn't work".
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Codes are typed by people, so they are compared case- and space-insensitively. */
export const normaliseCode = (input: string): string =>
  String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
