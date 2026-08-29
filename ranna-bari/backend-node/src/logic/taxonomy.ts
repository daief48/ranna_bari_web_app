import type { ClientSession } from 'mongoose';

import { TaxonomyCategory } from '../models/index.js';
import { isDuplicateKey, tx } from '../config/db.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';

/**
 * The platform's shared category vocabulary.
 *
 * Ported from the app's `src/lib/taxonomy.js`, which says why it is data at
 * all: the list of things this platform believes food can be used to live in
 * a `const CHIPS = [...]` inside the browse screen, which put it out of reach
 * of search, of a food request, and of anybody who wanted to add one.
 *
 * A cook's own shelves are a different thing and stay separate
 * (`StoreCategory`) — those are one kitchen, arranged how its cook likes.
 * These are the words the whole platform shares.
 *
 * One rule runs through everything below: **`key` is not editable.** It is
 * the tag written on every dish and kitchen, so filtering is a straight
 * string match against rows nobody rewrites afterwards. Change a key and
 * every dish carrying the old one falls out of its own category — silently,
 * with nothing to catch it. Deleting does the same damage, which is why the
 * only way out of the list is `retireCategory`: the row stays, the tag stays
 * meaningful, and the category stops being offered.
 */

export type Category = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  order: number;
  retired: boolean;
};

type Row = {
  _id: unknown;
  key: string;
  label: string;
  emoji: string;
  order: number;
  retired: boolean;
};

const shape = (row: Row): Category => ({
  id: String(row._id),
  key: row.key,
  label: row.label,
  emoji: row.emoji,
  order: row.order,
  retired: row.retired,
});

/** The app's slug rule, unchanged — a label typed by a person becomes a tag. */
const slugify = (value: string) =>
  String(value).trim().toLowerCase().replace(/\s+/g, '-');

/* ------------------------------------------------------------------ *
 * the seed
 * ------------------------------------------------------------------ */

/**
 * `key` is the tag as it appears on a dish or a kitchen, so filtering stays a
 * straight match against the data; `label` is what a person reads. Meal times
 * first, then kinds of food, then the ones picked when nothing in particular
 * is wanted — the order a hungry person narrows in.
 *
 * Dietary tags are deliberately absent: they are constraints rather than
 * categories, and they live in the filter sheet, where they combine with one
 * of these instead of replacing it.
 */
const SEED: [key: string, label: string, emoji: string][] = [
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
  /* On no dish anywhere — the things a cook makes to order rather than lists,
     which is what a food request is usually for. */
  ['cake', 'Cake', '🎂'],
  ['pitha', 'Pitha', '🥮'],
  ['achar', 'Achar', '🫙'],
  ['gift', 'Gift boxes', '🎁'],
];

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/** Categories in the order they are shown. Retired ones are for the panel. */
export async function taxonomyOf(
  opts: { includeRetired?: boolean } = {},
  session?: ClientSession,
): Promise<Category[]> {
  const rows = await TaxonomyCategory.find(opts.includeRetired ? {} : { retired: false })
    .sort({ order: 1 })
    .session(session ?? null)
    .lean();

  return rows.map(shape);
}

/** The lookup every filter makes: a dish's tag back to its category. */
export async function categoryByKey(
  key: string,
  session?: ClientSession,
): Promise<Category | null> {
  const row = await TaxonomyCategory.findOne({ key: slugify(key) })
    .session(session ?? null)
    .lean();

  return row ? shape(row) : null;
}

export async function categoryById(
  id: string,
  session?: ClientSession,
): Promise<Category | null> {
  const row = await TaxonomyCategory.findById(id)
    .session(session ?? null)
    .lean()
    .catch(() => null);

  return row ? shape(row) : null;
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

/**
 * Fill in whatever the seed says and this deployment does not have.
 *
 * The app checked the whole list — "an existing taxonomy is left alone" — but
 * a device only ever seeds once, from empty. Here the check is per key, so a
 * deployment that already has categories gains any that were added to the
 * seed since it booted, and a run that died halfway finishes on the next one.
 *
 * `$setOnInsert` is what keeps it idempotent in the way that matters: a
 * category an operator has since renamed or reordered is not dragged back to
 * its seeded wording by a redeploy.
 */
export async function seedTaxonomy(): Promise<Result<{ created: number }>> {
  const out = await TaxonomyCategory.bulkWrite(
    SEED.map(([key, label, emoji], index) => ({
      updateOne: {
        filter: { key },
        update: { $setOnInsert: { key, label, emoji, order: index, retired: false } },
        upsert: true,
      },
    })),
  );

  return ok({ created: out.upsertedCount });
}

/**
 * Add one.
 *
 * A key already taken is refused rather than quietly reused, retired or not.
 * Two rows cannot share one — the unique index sees to that — but the real
 * reason is that they would split one tag's dishes across two categories,
 * each showing half the food. Reviving the retired one is
 * `retireCategory(id, false)`, and the refusal carries its id so the panel
 * can offer exactly that.
 */
export async function addCategory(input: {
  key?: string;
  label: string;
  emoji?: string;
}): Promise<Result<Category>> {
  const label = String(input.label ?? '').trim();
  if (!label) return fail(ERR.NAME_REQUIRED);

  const key = slugify(input.key ?? label);
  if (!key) return fail(ERR.NAME_REQUIRED);

  const clash = await TaxonomyCategory.findOne({ key }).lean();
  if (clash) {
    return fail(ERR.CATEGORY_IN_USE, { id: String(clash._id), retired: clash.retired });
  }

  // Past the end of the list rather than at `count`, so retirements — which
  // leave their row and its number in place — cannot hand out a duplicate.
  const last = await TaxonomyCategory.findOne().sort({ order: -1 }).lean();

  try {
    const created = await TaxonomyCategory.create({
      key,
      label,
      emoji: input.emoji ?? '',
      order: (last?.order ?? -1) + 1,
    });
    return ok(shape(created));
  } catch (error) {
    // Two admins adding the same word at once. The index picked a winner.
    if (isDuplicateKey(error)) return fail(ERR.CATEGORY_IN_USE);
    throw error;
  }
}

/**
 * Rename one, or change its emoji.
 *
 * `key` is absent from the patch on purpose and there is no path to it from
 * anywhere else in this module: it is the tag on every dish, and editing it
 * orphans all of them at once.
 */
export async function updateCategory(
  id: string,
  patch: { label?: string; emoji?: string },
): Promise<Result<Category>> {
  const set: { label?: string; emoji?: string } = {};

  if (patch.label != null) {
    const label = String(patch.label).trim();
    if (!label) return fail(ERR.NAME_REQUIRED);
    set.label = label;
  }
  if (patch.emoji != null) set.emoji = String(patch.emoji);

  const updated = await TaxonomyCategory.findByIdAndUpdate(id, set, { new: true }).catch(
    () => null,
  );
  /* The ERR map has no category-missing code, and the app refuses one the
     same way (`storeLogic.updateCategory`). A new string here would be a
     refusal two other codebases have never heard of. */
  if (!updated) return fail(ERR.NO_PRODUCT);

  return ok(shape(updated));
}

/**
 * Take a category out of circulation, or put it back.
 *
 * The row survives, because the dishes tagged with its key do. Retiring stops
 * it being offered for anything new; the tag it already stamped on a hundred
 * dishes keeps meaning what it meant.
 */
export async function retireCategory(id: string, retired = true): Promise<Result<Category>> {
  const updated = await TaxonomyCategory.findByIdAndUpdate(id, { retired }, { new: true }).catch(
    () => null,
  );
  if (!updated) return fail(ERR.NO_PRODUCT);

  return ok(shape(updated));
}

/**
 * Move one category `delta` places along the list.
 *
 * The list is renumbered 0..n-1 rather than the two rows swapped, which is
 * what stops `order` drifting into ties and holes over a run of moves — the
 * app does the same in `storeLogic.moveCategory`. Retired rows keep their
 * place in that numbering: the panel is where they are restored, so they are
 * in the list it drives, and stepping over them would move a row two places
 * for a one-place click.
 *
 * Many writes to reach one consistent list, so they commit together or not at
 * all — a reorder that stopped halfway is a menu in no order at all.
 */
export async function moveCategory(id: string, delta: number): Promise<Result<Category[]>> {
  const step = Math.trunc(Number(delta));
  if (!Number.isFinite(step) || step === 0) return fail(ERR.WRONG_STATE);

  return tx(async (session) => {
    const rows = await TaxonomyCategory.find().sort({ order: 1 }).session(session).lean();

    const from = rows.findIndex((row) => String(row._id) === id);
    if (from < 0) return fail(ERR.NO_PRODUCT);

    const to = from + step;
    if (to < 0 || to >= rows.length) return fail(ERR.WRONG_STATE);

    const moved = rows.slice();
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);

    const changed = moved
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.row.order !== entry.index);

    if (changed.length) {
      await TaxonomyCategory.bulkWrite(
        changed.map((entry) => ({
          updateOne: {
            filter: { _id: entry.row._id },
            update: { $set: { order: entry.index } },
          },
        })),
        { session },
      );
    }

    return ok(moved.map((row, index) => ({ ...shape(row), order: index })));
  });
}
