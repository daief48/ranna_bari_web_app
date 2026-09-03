/**
 * What a kitchen cooks best.
 *
 * This was a `const SPECIALTIES = [...]` in the app — twice, in fact, once in
 * `KitchenContext` and once in `auth.js`, which is how a list like this
 * eventually disagrees with itself. Six strings, unreachable from the console,
 * so adding a seventh meant shipping a build.
 *
 * The rules are the ones `taxonomy.ts` argues for, and for the same reason:
 * a kitchen stores this as a string on its own row.
 *
 *   `key` is not editable   It is written on every kitchen that chose it.
 *                           Rename it and those kitchens fall out of their own
 *                           category, silently, with nothing to catch it.
 *
 *   nothing is deleted      Only retired. The row stays, the kitchens keep
 *                           meaning what they said, and the option stops being
 *                           offered to anybody new.
 *
 * `label` and `emoji` are free to change: they are what a person reads, and no
 * stored row depends on them.
 */
import type { ClientSession } from 'mongoose';

import { Specialty } from '../models/index.js';
import { isDuplicateKey } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';

export type SpecialtyRow = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  order: number;
  retired: boolean;
  /** How many kitchens currently claim it — the panel shows this before retiring. */
  kitchens?: number;
};

type Row = {
  _id: unknown;
  key: string;
  label: string;
  emoji: string;
  order: number;
  retired: boolean;
};

const shape = (row: Row): SpecialtyRow => ({
  id: String(row._id),
  key: row.key,
  label: row.label,
  emoji: row.emoji,
  order: row.order,
  retired: row.retired,
});

/**
 * The label is the key.
 *
 * Unlike a dish tag, a kitchen's specialty is stored as the *label* — "Coastal
 * Seafood", not "coastal-seafood" — because that is what the app has always
 * written and what every existing kitchen row carries. Slugging it here would
 * orphan all of them, so the key is the trimmed label and the rule about
 * never editing it does the rest.
 */
const keyOf = (label: string) => String(label).trim();

/**
 * The list, which is longer than the app ever offered.
 *
 * The picker had six. The kitchens in the database claim twenty distinct
 * specialties between them — "Old Dhaka Kacchi", "Chittagong Mezban",
 * "Sylheti Home Style" and so on — so eighteen of twenty kitchens were
 * describing themselves with something no new cook could pick. The six were
 * not a vocabulary, they were whatever fitted in a dropdown.
 *
 * Both sets are seeded. Some are near-neighbours — "Desserts & Pitha" beside
 * "Pitha & Desserts", "Biryani & Rice" beside "Biryani & Polao" — and they
 * are deliberately *not* merged here: a kitchen is standing on each of those
 * strings, and deciding two of them mean the same thing is an editorial call
 * for an operator to make in the panel, where retiring one is a button.
 */
const SEED: [label: string, emoji: string][] = [
  ['Traditional Heritage', '🔥'],
  ['Old Dhaka Kacchi', '🍛'],
  ['Biryani & Rice', '🍚'],
  ['Biryani & Polao', '🍛'],
  ['Chittagong Mezban', '🥘'],
  ['Sylheti Home Style', '🍲'],
  ['Coastal Seafood', '🐟'],
  ['Deshi Fish Curry', '🐠'],
  ['Grill & Kebab', '🍢'],
  ['Comfort Stews', '🍲'],
  ['Bhorta & Vegetarian', '🥬'],
  ['Vegetarian & Bhorta', '🥗'],
  ['Street & Snacks', '🌶'],
  ['Clean Street Food', '🧼'],
  ['Breakfast & Tiffin', '🌅'],
  ['Office Lunch Boxes', '💼'],
  ['Iftar & Ramadan Specials', '🌙'],
  ['Desserts & Pitha', '🥮'],
  ['Pitha & Desserts', '🍮'],
  ['Bakes & Continental', '🍞'],
  ['Fusion Rice Bowls', '🍱'],
  ['Thai & Pan-Asian', '🍜'],
  ['Wellness & Keto', '🥑'],
  ['Diabetic-Friendly', '💚'],
];

/**
 * Make sure every seeded specialty exists.
 *
 * Additive rather than only-when-empty: the list grew after the collection
 * had already been created, and "seed once" would have meant the new entries
 * never arriving on any database that had run before. Existing rows are left
 * exactly as they are — an operator may have renamed or retired one, and this
 * must not undo that.
 */
export async function ensureSpecialties(session?: ClientSession): Promise<void> {
  const existing = await Specialty.find()
    .select({ key: 1, order: 1 })
    .session(session ?? null)
    .lean();

  const known = new Set(existing.map((row) => row.key));
  const missing = SEED.filter(([label]) => !known.has(keyOf(label)));
  if (!missing.length) return;

  /* Appended after whatever is already there, so a list somebody has ordered
     by hand keeps its order. */
  let next = existing.reduce((max, row) => Math.max(max, row.order ?? 0), -1) + 1;

  await Specialty.insertMany(
    missing.map(([label, emoji]) => ({
      key: keyOf(label),
      label,
      emoji,
      order: next++,
      retired: false,
    })),
    session ? { session } : {},
  );
}

/** In the order they are offered. Retired ones are for the panel only. */
export async function specialtiesOf(
  opts: { includeRetired?: boolean } = {},
): Promise<SpecialtyRow[]> {
  await ensureSpecialties();

  const rows = await Specialty.find(opts.includeRetired ? {} : { retired: false })
    .sort({ order: 1 })
    .lean();

  return rows.map(shape);
}

/**
 * One more.
 *
 * Appended rather than inserted: order is an operator's decision and `move`
 * is where it is made. A new one arriving in the middle of somebody's
 * carefully arranged list would be a surprise.
 */
export async function addSpecialty(args: {
  label: string;
  emoji?: string;
}): Promise<Result<SpecialtyRow>> {
  const label = String(args.label ?? '').trim();
  if (!label) return fail(ERR.NAME_REQUIRED);

  const last = await Specialty.findOne().sort({ order: -1 }).lean();

  try {
    const created = await Specialty.create({
      key: keyOf(label),
      label,
      emoji: String(args.emoji ?? '').trim(),
      order: (last?.order ?? -1) + 1,
      retired: false,
    });
    return ok(shape(created.toObject() as Row));
  } catch (error) {
    /* The unique key caught a second one by the same name. Retired or not,
       it exists, and the way back is to restore it rather than add a twin. */
    if (isDuplicateKey(error)) return fail(ERR.DUPLICATE);
    throw error;
  }
}

/** The label and the emoji. Never the key — see the module comment. */
export async function updateSpecialty(args: {
  id: string;
  label?: string;
  emoji?: string;
}): Promise<Result<SpecialtyRow>> {
  const patch: Record<string, unknown> = {};

  if (args.label != null) {
    const label = String(args.label).trim();
    if (!label) return fail(ERR.NAME_REQUIRED);
    patch.label = label;
  }
  if (args.emoji != null) patch.emoji = String(args.emoji).trim();

  if (!Object.keys(patch).length) return fail(ERR.NAME_REQUIRED);

  const row = await Specialty.findByIdAndUpdate(args.id, patch, { new: true })
    .lean()
    .catch(() => null);
  if (!row) return fail(ERR.NO_PRODUCT);

  return ok(shape(row as Row));
}

/**
 * Stop offering it, or offer it again.
 *
 * Never a delete. Kitchens carry this string, and removing the row would
 * leave them claiming a specialty the platform no longer admits exists.
 */
export async function retireSpecialty(args: {
  id: string;
  retired: boolean;
}): Promise<Result<SpecialtyRow>> {
  const row = await Specialty.findByIdAndUpdate(args.id, { retired: args.retired }, { new: true })
    .lean()
    .catch(() => null);
  if (!row) return fail(ERR.NO_PRODUCT);

  return ok(shape(row as Row));
}

/** Up or down one place, by swapping order with the neighbour. */
export async function moveSpecialty(args: {
  id: string;
  direction: 'up' | 'down';
}): Promise<Result<SpecialtyRow>> {
  const row = await Specialty.findById(args.id)
    .lean()
    .catch(() => null);
  if (!row) return fail(ERR.NO_PRODUCT);

  const neighbour = await Specialty.findOne(
    args.direction === 'up' ? { order: { $lt: row.order } } : { order: { $gt: row.order } },
  )
    .sort(args.direction === 'up' ? { order: -1 } : { order: 1 })
    .lean();

  /* Already at the end. Not an error — the button was simply pressed at the
     edge of the list, which is a thing people do. */
  if (!neighbour) return ok(shape(row as Row));

  await Promise.all([
    Specialty.updateOne({ _id: row._id }, { order: neighbour.order }),
    Specialty.updateOne({ _id: neighbour._id }, { order: row.order }),
  ]);

  return ok({ ...shape(row as Row), order: neighbour.order });
}
