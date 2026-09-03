/**
 * The platform's shared set of emoji and icons.
 *
 * Three things carry a little picture — dish categories, kitchen specialties
 * and a cook's own shelves — and each one asked for it the same way: a text
 * box you typed an emoji into. That works exactly once, for whoever set it up.
 * Nobody else knows which emoji the platform already uses, so a new category
 * gets 🍛 while the one beside it has 🍚, and the set drifts into a scatter of
 * near-identical pictures nobody chose deliberately.
 *
 * So the pictures become a library. A field offers what is already in it, and
 * anything genuinely new is added once and then available everywhere.
 *
 * Two kinds live here on purpose:
 *
 *   emoji   a character. Costs nothing, renders everywhere, and is what the
 *           app already stores in these fields.
 *   image   a URL. What you reach for when the platform wants its own artwork
 *           rather than whatever the reader's phone draws for 🔥.
 *
 * Both are stored in the same `value` field because every consumer treats it
 * as an opaque string it renders — `kind` is how a *renderer* decides between
 * text and an <img>, not a second vocabulary.
 */
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { isDuplicateKey } from '../config/db.js';
import { Icon, Specialty, TaxonomyCategory } from '../models/index.js';

export type IconRow = {
  id: string;
  value: string;
  label: string;
  kind: 'emoji' | 'image';
  order: number;
  retired: boolean;
  /** Where it is currently used, so retiring one is an informed decision. */
  uses?: number;
};

type Row = {
  _id: unknown;
  value: string;
  label: string;
  kind: string;
  order: number;
  retired: boolean;
};

const shape = (row: Row): IconRow => ({
  id: String(row._id),
  value: row.value,
  label: row.label,
  kind: row.kind === 'image' ? 'image' : 'emoji',
  order: row.order,
  retired: row.retired,
});

/** A URL is an image; anything else is a character. */
const kindOf = (value: string): 'emoji' | 'image' =>
  /^https?:\/\//i.test(value.trim()) ? 'image' : 'emoji';

/**
 * The starting library.
 *
 * Food first, because that is what nearly every category is about, then the
 * times of day a meal belongs to, then the handful that describe how something
 * is sold rather than what it is. Labels are what the search box matches, so
 * they are the words somebody would actually type: "fire", not "flame emoji".
 */
const SEED: [value: string, label: string][] = [
  ['🍛', 'curry biryani rice'],
  ['🍚', 'rice plain'],
  ['🍲', 'stew curry pot'],
  ['🥘', 'pan dish shallow'],
  ['🍜', 'noodles soup ramen'],
  ['🍢', 'grill kebab skewer'],
  ['🍖', 'meat'],
  ['🍗', 'chicken'],
  ['🐟', 'fish seafood'],
  ['🦐', 'prawn shrimp'],
  ['🥗', 'salad vegetarian healthy'],
  ['🥬', 'greens vegetable bhorta'],
  ['🌶', 'spicy chilli hot street'],
  ['🥟', 'dumpling snacks samosa'],
  ['🍞', 'bread bakery'],
  ['🧁', 'cupcake bakes'],
  ['🎂', 'cake'],
  ['🍮', 'pudding dessert sweet'],
  ['🥮', 'pitha mooncake dessert'],
  ['🍯', 'honey sweet'],
  ['🫙', 'jar achar pickle'],
  ['🥤', 'drink juice'],
  ['☕', 'tea coffee'],
  ['🌅', 'morning breakfast sunrise'],
  ['🌙', 'evening night iftar moon'],
  ['🔥', 'fire heritage flame'],
  ['💼', 'office lunch work'],
  ['🎁', 'gift box'],
  ['💰', 'budget cheap money'],
  ['💚', 'healthy diabetic green'],
  ['🥑', 'keto wellness avocado'],
  ['🍱', 'bento fusion box'],
  ['🧼', 'clean hygiene'],
  ['⭐', 'star featured'],
];

/** Fill in anything missing. Additive, so a library somebody curated survives. */
export async function ensureIcons(): Promise<void> {
  const existing = await Icon.find().select({ value: 1, order: 1 }).lean();
  const known = new Set(existing.map((row) => row.value));

  /* Whatever the rest of the platform is already using, so the library never
     offers less than what is on screen. */
  const [taxonomy, specialties] = await Promise.all([
    TaxonomyCategory.find().select({ emoji: 1, label: 1 }).lean(),
    Specialty.find().select({ emoji: 1, label: 1 }).lean(),
  ]);

  const inUse: [string, string][] = [...taxonomy, ...specialties]
    .filter((row) => row.emoji && !known.has(row.emoji))
    .map((row) => [row.emoji as string, String(row.label ?? '').toLowerCase()]);

  /* Deduplicated against the seed *and* against itself — the same emoji is
     often on two categories. */
  const seen = new Set(known);
  const missing: [string, string][] = [];
  for (const [value, label] of [...SEED, ...inUse]) {
    if (seen.has(value)) continue;
    seen.add(value);
    missing.push([value, label]);
  }
  if (!missing.length) return;

  let next = existing.reduce((max, row) => Math.max(max, row.order ?? 0), -1) + 1;

  await Icon.insertMany(
    missing.map(([value, label]) => ({
      value,
      label,
      kind: kindOf(value),
      order: next++,
      retired: false,
    })),
    {},
  );
}

/** The library, in the order it is offered. */
export async function iconsOf(opts: { includeRetired?: boolean } = {}): Promise<IconRow[]> {
  await ensureIcons();

  const rows = await Icon.find(opts.includeRetired ? {} : { retired: false })
    .sort({ order: 1 })
    .lean();

  return rows.map(shape);
}

/** How many categories and specialties currently draw each one. */
export async function iconUsage(): Promise<Map<string, number>> {
  const [taxonomy, specialties] = await Promise.all([
    TaxonomyCategory.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$emoji', n: { $sum: 1 } } },
    ]),
    Specialty.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$emoji', n: { $sum: 1 } } },
    ]),
  ]);

  const uses = new Map<string, number>();
  for (const row of [...taxonomy, ...specialties]) {
    if (!row._id) continue;
    uses.set(row._id, (uses.get(row._id) ?? 0) + row.n);
  }
  return uses;
}

export async function addIcon(args: { value: string; label?: string }): Promise<Result<IconRow>> {
  const value = String(args.value ?? '').trim();
  if (!value) return fail(ERR.NAME_REQUIRED);

  const last = await Icon.findOne().sort({ order: -1 }).lean();

  try {
    const created = await Icon.create({
      value,
      label: String(args.label ?? '').trim().toLowerCase(),
      kind: kindOf(value),
      order: (last?.order ?? -1) + 1,
      retired: false,
    });
    return ok(shape(created.toObject() as Row));
  } catch (error) {
    /* Already in the library. Adding a duplicate would give the picker two
       identical tiles and no way to tell them apart. */
    if (isDuplicateKey(error)) return fail(ERR.DUPLICATE);
    throw error;
  }
}

/**
 * The label only.
 *
 * The value is not editable: things that already point at this picture store
 * the character itself, so changing it here would rename nothing and simply
 * make the library disagree with what is on screen. A wrong picture is
 * retired and a right one added.
 */
export async function updateIcon(args: { id: string; label: string }): Promise<Result<IconRow>> {
  const row = await Icon.findByIdAndUpdate(
    args.id,
    { label: String(args.label ?? '').trim().toLowerCase() },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!row) return fail(ERR.NO_PRODUCT);

  return ok(shape(row as Row));
}

/** Stop offering it, or offer it again. Never a delete — see `updateIcon`. */
export async function retireIcon(args: { id: string; retired: boolean }): Promise<Result<IconRow>> {
  const row = await Icon.findByIdAndUpdate(args.id, { retired: args.retired }, { new: true })
    .lean()
    .catch(() => null);
  if (!row) return fail(ERR.NO_PRODUCT);

  return ok(shape(row as Row));
}
