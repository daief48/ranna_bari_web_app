import { Types, type ClientSession } from 'mongoose';

import {
  MealBooking,
  MealCategory,
  MealDish,
  MealPlan,
  MealService,
  Order,
} from '../models/index.js';
import { isDuplicateKey, tx } from '../config/db.js';
import { ERR, SLOTS, fail, ok, type Fail, type Result } from '../lib/domain.js';
import { taka, todayKey } from '../lib/format.js';
import { balanceFor, post } from './ledger.js';
import { freeCode, historyStep } from './orders.js';
import { notify } from './wallet.js';

/**
 * Monthly meal plans — the rules behind the calendar, the service and the
 * booking.
 *
 * The old board sold one plate at a time: a cook published a meal, customers
 * confirmed against it, and the meal document was the thing everybody looked
 * at. This sells a month. A cook offers a *service* (a category, a rate and how
 * many meals somebody must take), the platform or the cook publishes a
 * *calendar* of dish names, and a customer picks the days they want off it.
 *
 * What a purchase becomes is the important part: **one Order per meal**, on the
 * escrow rail that already exists. A booking is their parent and their receipt,
 * never their authority — status, payment, delivery and ratings are read from
 * the orders every time. That is what makes per-meal release, per-meal
 * cancellation and per-meal rating fall out with no new machinery, and it is
 * why nothing in this file releases money: the customer closes an order, an
 * operator releases it, exactly as on every other rail.
 */

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

export type MealCategoryRow = {
  id: string;
  key: string;
  label: string;
  rate: number;
  order: number;
  retired: boolean;
};

export type PlanDay = {
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};

export type ResolvedPlan = {
  id: string;
  scope: 'system' | 'cook';
  categoryKey: string;
  month: string;
  status: string;
  days: PlanDay[];
};

export type ServiceRow = {
  id: string;
  kitchenId: string;
  categoryKey: string;
  categoryLabel: string;
  /** The cook's own price, or null when they take the category's. */
  rate: number | null;
  /** What a meal actually costs — `rate ?? category.rate`. */
  effectiveRate: number;
  minMeals: number;
  maxMeals: number;
  active: boolean;
  cookName: string;
};

export type DishRow = {
  id: string;
  scope: string;
  kitchenId: string;
  categoryKey: string;
  name: string;
  type: string;
  retired: boolean;
};

const shapeCategory = (row: {
  _id: unknown;
  key: string;
  label: string;
  rate: number;
  order: number;
  retired: boolean;
}): MealCategoryRow => ({
  id: String(row._id),
  key: row.key,
  label: row.label,
  rate: Math.round(row.rate ?? 0),
  order: row.order ?? 0,
  retired: !!row.retired,
});

const shapeDays = (days: { date: string; breakfast?: string; lunch?: string; dinner?: string }[]) =>
  days.map((d) => ({
    date: d.date,
    breakfast: d.breakfast ?? '',
    lunch: d.lunch ?? '',
    dinner: d.dinner ?? '',
  }));

const shapePlan = (row: {
  _id: unknown;
  scope: string;
  categoryKey: string;
  month: string;
  status: string;
  days: { date: string; breakfast?: string; lunch?: string; dinner?: string }[];
}): ResolvedPlan => ({
  id: String(row._id),
  scope: row.scope === 'cook' ? 'cook' : 'system',
  categoryKey: row.categoryKey,
  month: row.month,
  status: row.status,
  days: shapeDays(row.days ?? []),
});

export const shapeDish = (row: {
  _id: unknown;
  scope: string;
  kitchenId: string;
  categoryKey: string;
  name: string;
  type: string;
  retired: boolean;
}): DishRow => ({
  id: String(row._id),
  scope: row.scope,
  kitchenId: row.kitchenId ?? '',
  categoryKey: row.categoryKey,
  name: row.name,
  type: row.type,
  retired: !!row.retired,
});

export const shapeService = (
  row: {
    _id: unknown;
    kitchenId: string;
    categoryKey: string;
    rate?: number | null;
    minMeals: number;
    maxMeals: number;
    active: boolean;
    cookName?: string;
  },
  category: { label: string; rate: number } | null,
): ServiceRow => ({
  id: String(row._id),
  kitchenId: row.kitchenId,
  categoryKey: row.categoryKey,
  categoryLabel: category?.label ?? '',
  rate: row.rate ?? null,
  effectiveRate: effectiveRate(row, category),
  minMeals: row.minMeals,
  maxMeals: row.maxMeals,
  active: !!row.active,
  cookName: row.cookName ?? '',
});

/* ------------------------------------------------------------------ *
 * small rules
 * ------------------------------------------------------------------ */

const SLOT_KEYS = new Set<string>(SLOTS.map((s) => s.key));

/** Where a slot sits in the day, for anything that has to sort by it. */
export const slotOrder = (slot: string) => {
  const at = SLOTS.findIndex((s) => s.key === slot);
  return at < 0 ? SLOTS.length : at;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Every Dhaka calendar day in a month, as the strings everything else uses.
 *
 * An empty array is how a malformed month refuses — the callers all need the
 * list anyway, so asking "is this a month" and "which days does it have" twice
 * would be two chances to disagree.
 *
 * Built in UTC on purpose. These are calendar labels, not instants: `Date.UTC`
 * gives the arithmetic (how many days has February) without a local timezone
 * shifting the first or last day of the month by one.
 */
export function monthDays(month: string): string[] {
  if (!MONTH.test(String(month ?? ''))) return [];
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();

  const out: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    out.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

/** The month a Dhaka day string belongs to. */
export const monthOf = (day: string = todayKey()) => String(day).slice(0, 7);

/**
 * What one meal costs.
 *
 * `rate` on a service is the cook undercutting (or beating) the category's
 * default, and null means "whatever the category says". Zero is not a rate —
 * it is free food, and a service that priced itself at nothing would hold no
 * escrow and pay nobody, so it falls back like null does.
 */
export function effectiveRate(
  service: { rate?: number | null } | null | undefined,
  category: { rate: number } | null | undefined,
): number {
  const own = service?.rate;
  if (own != null && Number.isFinite(own) && own > 0) return Math.round(own);
  return Math.round(category?.rate ?? 0);
}

/** The dish published for one date and slot, or '' when there is none. */
export function dishOn(days: PlanDay[], date: string, slot: string): string {
  const day = days.find((d) => d.date === date);
  if (!day) return '';
  if (slot === 'breakfast') return String(day.breakfast ?? '').trim();
  if (slot === 'lunch') return String(day.lunch ?? '').trim();
  if (slot === 'dinner') return String(day.dinner ?? '').trim();
  return '';
}

/* ------------------------------------------------------------------ *
 * categories
 * ------------------------------------------------------------------ */

/**
 * The three the platform starts with, and what a meal costs on each.
 *
 * Configuration rather than sample data: a deployment with no categories has
 * no meal system at all — no service can name one, no calendar can be filed
 * under one — so this is the equivalent of the taxonomy seed, not of the demo
 * kitchens. Operators may add more, rename these and change the rates; nothing
 * here overwrites them afterwards.
 */
const CATEGORY_SEED: [key: string, label: string, rate: number][] = [
  ['business', 'Business Meal', 250],
  ['student', 'Student Meal', 80],
  ['regular', 'Regular Meal', 60],
];

/**
 * Fill in whatever the seed names and this deployment does not have.
 *
 * Per key rather than only-when-empty, and `$setOnInsert` rather than `$set`,
 * for the two reasons `seedTaxonomy` gives: a database that already has
 * categories gains any added to the seed since it booted, and a category an
 * operator has since renamed or re-priced is never dragged back to its seeded
 * wording by a redeploy.
 *
 * Called from the read below rather than from boot, the way `ensureSpecialties`
 * is — the seed then arrives on the first request that needs it, in the
 * serverless deployment as well as the long-lived one, and a boot that never
 * happens cannot leave the list empty.
 */
export async function seedMealCategories(
  session?: ClientSession,
): Promise<{ created: number }> {
  const rows = CATEGORY_SEED.map(([key, label, rate], order) => ({
    key,
    label,
    rate,
    order,
    retired: false,
  }));

  const existing = await MealCategory.find()
    .select({ key: 1 })
    .session(session ?? null)
    .lean();

  const known = new Set(existing.map((row) => row.key));
  const missing = rows.filter((row) => !known.has(row.key));
  if (!missing.length) return { created: 0 };

  const out = await MealCategory.bulkWrite(
    missing.map((row) => ({
      updateOne: {
        filter: { key: row.key },
        update: { $setOnInsert: row },
        upsert: true,
      },
    })),
    session ? { session } : {},
  );

  return { created: out.upsertedCount };
}

/** The categories a customer may be offered. Retired ones are the panel's. */
export async function mealCategoriesOf(
  opts: { includeRetired?: boolean } = {},
  session?: ClientSession,
): Promise<MealCategoryRow[]> {
  await seedMealCategories(session);

  const rows = await MealCategory.find(opts.includeRetired ? {} : { retired: false })
    .sort({ order: 1 })
    .session(session ?? null)
    .lean();

  return rows.map(shapeCategory);
}

export async function categoryFor(
  key: string,
  session?: ClientSession,
): Promise<MealCategoryRow | null> {
  const row = await MealCategory.findOne({ key: String(key ?? '') })
    .session(session ?? null)
    .lean();

  return row ? shapeCategory(row) : null;
}

/** A label typed by an operator becomes a tag, the way the taxonomy's does. */
const slugify = (value: string) => String(value).trim().toLowerCase().replace(/\s+/g, '-');

/**
 * Add a category the platform will sell meals under.
 *
 * `key` may be left out and derived from the label, because that is what an
 * operator typing "Diet Meal" into a form means — but once it exists it is
 * never edited again. It is the tag a service, every calendar and every past
 * booking stores, so changing it would orphan all of them at once with nothing
 * to catch it, exactly as `logic/taxonomy.ts` says of its own.
 *
 * A key already taken is refused rather than reused, retired or not: two rows
 * sharing one would split a category's calendars in half. The refusal carries
 * the standing row's id so the panel can offer to restore it instead.
 */
export async function addMealCategory(
  input: { key?: string; label: string; rate: number },
  session?: ClientSession,
): Promise<Result<MealCategoryRow>> {
  const label = String(input.label ?? '').trim();
  if (!label) return fail(ERR.NAME_REQUIRED);

  const key = slugify(input.key ?? label);
  if (!key) return fail(ERR.NAME_REQUIRED);

  const rate = Math.round(Number(input.rate));
  if (!Number.isFinite(rate) || rate <= 0) return fail(ERR.BAD_AMOUNT, { field: 'rate' });

  /*
   * Two ways of being the same category, and both are refused.
   *
   * The key is the join, so a second row carrying it would split a category's
   * calendars in half — that check was always here. The *label* is what an
   * operator reads, and a duplicate one is its own problem: "Business Meal"
   * slugifies to `business-meal`, which is a free key next to an existing
   * `business`, so the panel ended up offering two rows a person cannot tell
   * apart and a cook picking blindly between them. Compared case-insensitively
   * because "business meal" and "Business Meal" are the same word to everyone
   * except a string comparison.
   */
  const clash = await MealCategory.findOne({
    $or: [{ key }, { label: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
  })
    .session(session ?? null)
    .lean();
  if (clash) {
    return fail(ERR.CATEGORY_IN_USE, {
      id: String(clash._id),
      key: clash.key,
      retired: !!clash.retired,
      /* Which of the two it was, so the panel can say "that name is taken"
         rather than a sentence about keys nobody typed. */
      on: clash.key === key ? 'key' : 'label',
    });
  }

  /* Past the end of the list rather than at `count` — a retired category keeps
     its row and its number, so counting would hand out one two rows share. */
  const last = await MealCategory.findOne()
    .sort({ order: -1 })
    .session(session ?? null)
    .lean();

  try {
    const [created] = await MealCategory.create(
      [{ key, label, rate, order: (last?.order ?? -1) + 1, retired: false }],
      session ? { session } : undefined,
    );
    return ok(shapeCategory(created));
  } catch (error) {
    // Two operators adding the same word at once. The unique index picked one.
    if (isDuplicateKey(error)) return fail(ERR.CATEGORY_IN_USE);
    throw error;
  }
}

/**
 * Rename one, re-price it, or move it along the list.
 *
 * There is no path to `key` from here for the reason above. A new rate applies
 * to what is sold *next*: bookings snapshot the rate they charged, so nothing
 * already paid for is re-priced by this.
 */
export async function updateMealCategory(
  id: string,
  patch: { label?: string; rate?: number; order?: number },
  session?: ClientSession,
): Promise<Result<MealCategoryRow>> {
  const set: Record<string, unknown> = {};

  if (patch.label != null) {
    const label = String(patch.label).trim();
    if (!label) return fail(ERR.NAME_REQUIRED);
    set.label = label;
  }
  if (patch.rate != null) {
    const rate = Math.round(Number(patch.rate));
    if (!Number.isFinite(rate) || rate <= 0) return fail(ERR.BAD_AMOUNT, { field: 'rate' });
    set.rate = rate;
  }
  if (patch.order != null) {
    const order = Math.trunc(Number(patch.order));
    if (!Number.isFinite(order)) return fail(ERR.BAD_REQUEST, { field: 'order' });
    set.order = order;
  }

  /* A patch that changes nothing reads the row back rather than sending an
     empty `$set`, which the driver refuses outright. */
  if (!Object.keys(set).length) {
    const row = await MealCategory.findById(id)
      .session(session ?? null)
      .lean()
      .catch(() => null);
    return row ? ok(shapeCategory(row)) : fail(ERR.NO_CATEGORY);
  }

  const updated = await MealCategory.findByIdAndUpdate(id, { $set: set }, { new: true })
    .session(session ?? null)
    .lean()
    .catch(() => null);
  if (!updated) return fail(ERR.NO_CATEGORY);

  return ok(shapeCategory(updated));
}

/**
 * Take a category out of circulation, or put it back.
 *
 * Retired, never deleted: services, calendars and bookings all store the key,
 * and they keep meaning what they meant. What retirement stops is the *next*
 * thing — a new service naming it, and a booking against one that already
 * does, both of which refuse against `retired`.
 */
export async function retireMealCategory(
  id: string,
  retired = true,
  session?: ClientSession,
): Promise<Result<MealCategoryRow>> {
  const updated = await MealCategory.findByIdAndUpdate(id, { $set: { retired } }, { new: true })
    .session(session ?? null)
    .lean()
    .catch(() => null);
  if (!updated) return fail(ERR.NO_CATEGORY);

  return ok(shapeCategory(updated));
}

/* ------------------------------------------------------------------ *
 * services
 * ------------------------------------------------------------------ */

export async function serviceFor(
  kitchenId: string,
  session?: ClientSession,
): Promise<ServiceRow | null> {
  const row = await MealService.findOne({ kitchenId })
    .session(session ?? null)
    .lean();
  if (!row) return null;

  const category = await categoryFor(row.categoryKey, session);
  return shapeService(row, category);
}

/** A month's worth of meals is the most anybody can book on one service. */
const MEAL_CEILING = 31 * SLOTS.length;

/**
 * Create or edit one kitchen's meal service.
 *
 * The category is not a free string: it has to be one somebody is still
 * offering, because it decides the default rate and it is the key a calendar
 * is filed under. Retired categories are refused here rather than at booking,
 * where the customer would be the one told.
 */
export async function saveService(args: {
  kitchenId: string;
  categoryKey: string;
  rate?: number | null;
  minMeals: number;
  maxMeals: number;
  active?: boolean;
  cookName?: string;
}): Promise<Result<ServiceRow>> {
  const kitchenId = String(args.kitchenId ?? '').trim();
  if (!kitchenId) return fail(ERR.NO_KITCHEN);

  const category = await categoryFor(args.categoryKey);
  if (!category || category.retired) return fail(ERR.NO_CATEGORY, { categoryKey: args.categoryKey });

  const min = Math.round(Number(args.minMeals));
  const max = Math.round(Number(args.maxMeals));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > MEAL_CEILING) {
    return fail(ERR.MEAL_COUNT, { min, max, ceiling: MEAL_CEILING });
  }

  /* Null is "use the category's rate"; a number has to be a real price. Zero
     would be free food that still books escrow of nothing and pays nobody. */
  let rate: number | null = null;
  if (args.rate != null) {
    rate = Math.round(Number(args.rate));
    if (!Number.isFinite(rate) || rate <= 0) return fail(ERR.BAD_AMOUNT, { field: 'rate' });
  }

  const set: Record<string, unknown> = {
    categoryKey: category.key,
    rate,
    minMeals: min,
    maxMeals: max,
    active: args.active === true,
  };
  /* Only when there is one — a blank name from a caller that did not send it
     must not wipe the one a list is already drawing. */
  const cookName = String(args.cookName ?? '').trim();
  if (cookName) set.cookName = cookName;

  const saved = await MealService.findOneAndUpdate(
    { kitchenId },
    { $set: set, $setOnInsert: { kitchenId } },
    { new: true, upsert: true },
  ).lean();

  return ok(shapeService(saved, category));
}

/* ------------------------------------------------------------------ *
 * calendars
 * ------------------------------------------------------------------ */

/**
 * The calendar a booking is priced and named from.
 *
 * A cook's published plan wins over the platform's, and the platform's is what
 * every kitchen falls back to — copy-on-write, so a cook customising a month
 * gets a document of their own and the system plan they started from is never
 * touched. A draft is not a calendar: only a published plan can be booked
 * against, on either scope.
 */
export async function resolvePlan(
  kitchenId: string,
  categoryKey: string,
  month: string,
  session?: ClientSession,
): Promise<ResolvedPlan | null> {
  const own = kitchenId
    ? await MealPlan.findOne({
        scope: 'cook',
        kitchenId,
        categoryKey,
        month,
        status: 'published',
      })
        .session(session ?? null)
        .lean()
    : null;

  if (own) return shapePlan(own);

  const system = await MealPlan.findOne({
    scope: 'system',
    kitchenId: '',
    categoryKey,
    month,
    status: 'published',
  })
    .session(session ?? null)
    .lean();

  return system ? shapePlan(system) : null;
}

/**
 * Write one calendar.
 *
 * `scope` is an argument rather than two functions because the rules are the
 * same either way and the difference — whose document it is — is one field.
 * The panel drives the system scope with `kitchenId: ''`; a cook drives their
 * own with their kitchen's id, which is what keeps the two from ever writing
 * each other's row.
 *
 * Publishing is a flag rather than a state machine: `publish: true` makes it
 * live, and saving without it leaves the status alone. Silently unpublishing a
 * calendar somebody is booking against because a cook fixed one Thursday would
 * be the worst thing this function could do.
 */
export async function savePlan(
  args: {
    scope: 'system' | 'cook';
    categoryKey: string;
    month: string;
    kitchenId?: string;
    days: { date: string; breakfast?: string; lunch?: string; dinner?: string }[];
    publish?: boolean;
    updatedBy?: string;
  },
  /* Optional, and only the admin realm passes it: every panel write files an
     audit row, and the row and the change it describes have to land together. */
  session?: ClientSession,
): Promise<Result<ResolvedPlan>> {
  const month = String(args.month ?? '');
  const valid = new Set(monthDays(month));
  if (!valid.size) return fail(ERR.BAD_REQUEST, { field: 'month' });

  const scope = args.scope === 'cook' ? 'cook' : 'system';
  const kitchenId = scope === 'cook' ? String(args.kitchenId ?? '').trim() : '';
  if (scope === 'cook' && !kitchenId) return fail(ERR.NO_KITCHEN);

  const category = await categoryFor(args.categoryKey, session);
  if (!category) return fail(ERR.NO_CATEGORY, { categoryKey: args.categoryKey });

  /* Keyed by date so a payload naming the same day twice cannot store it
     twice — the last one typed is the one meant. */
  const byDate = new Map<string, PlanDay>();
  for (const day of Array.isArray(args.days) ? args.days : []) {
    const date = String(day?.date ?? '');
    if (!valid.has(date)) continue;
    byDate.set(date, {
      date,
      breakfast: String(day?.breakfast ?? '').trim(),
      lunch: String(day?.lunch ?? '').trim(),
      dinner: String(day?.dinner ?? '').trim(),
    });
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const set: Record<string, unknown> = { days, updatedBy: String(args.updatedBy ?? '') };
  if (args.publish === true) set.status = 'published';

  const saved = await MealPlan.findOneAndUpdate(
    { scope, categoryKey: category.key, month, kitchenId },
    {
      $set: set,
      $setOnInsert: {
        scope,
        categoryKey: category.key,
        month,
        kitchenId,
        // A plan that was not asked to go live starts as a draft.
        ...(args.publish === true ? {} : { status: 'draft' }),
      },
    },
    { new: true, upsert: true },
  )
    .session(session ?? null)
    .lean();

  return ok(shapePlan(saved));
}

/**
 * Drop a cook's override, so the system calendar is live again for them.
 *
 * Deleted rather than retired, and the one place in this file that removes
 * anything: the override *is* the customisation, and a retired-but-present
 * plan would be a second thing `resolvePlan` has to know about for no gain.
 * Nothing points at it — bookings snapshot the dish names they sold.
 */
export async function clearPlan(args: {
  kitchenId: string;
  categoryKey: string;
  month: string;
}): Promise<Result<{ cleared: boolean }>> {
  const kitchenId = String(args.kitchenId ?? '').trim();
  if (!kitchenId) return fail(ERR.NO_KITCHEN);
  if (!monthDays(String(args.month ?? '')).length) return fail(ERR.BAD_REQUEST, { field: 'month' });

  const out = await MealPlan.deleteOne({
    scope: 'cook',
    kitchenId,
    categoryKey: args.categoryKey,
    month: args.month,
  });

  return ok({ cleared: (out.deletedCount ?? 0) > 0 });
}

/* ------------------------------------------------------------------ *
 * dishes
 * ------------------------------------------------------------------ */

export async function addDish(
  args: {
    scope?: 'system' | 'cook';
    kitchenId?: string;
    categoryKey: string;
    name: string;
    type: string;
  },
  session?: ClientSession,
): Promise<Result<DishRow>> {
  const name = String(args.name ?? '').trim();
  if (!name) return fail(ERR.NAME_REQUIRED);

  const type = String(args.type ?? '');
  if (!SLOT_KEYS.has(type)) return fail(ERR.BAD_REQUEST, { field: 'type' });

  const category = await categoryFor(args.categoryKey, session);
  if (!category || category.retired) return fail(ERR.NO_CATEGORY, { categoryKey: args.categoryKey });

  const scope = args.scope === 'system' ? 'system' : 'cook';
  const kitchenId = scope === 'cook' ? String(args.kitchenId ?? '').trim() : '';
  if (scope === 'cook' && !kitchenId) return fail(ERR.NO_KITCHEN);

  // The array form: a multi-document create in a session needs it, and one
  // document written both ways is one code path fewer to keep in step.
  const [created] = await MealDish.create(
    [
      {
        scope,
        kitchenId,
        categoryKey: category.key,
        name,
        type,
      },
    ],
    session ? { session } : undefined,
  );

  return ok(shapeDish(created));
}

/**
 * Take a dish name out of the picker.
 *
 * Retired rather than deleted for the reason every vocabulary in this codebase
 * is: the calendars that already carry the name keep meaning what they meant.
 * `kitchenId` is in the filter rather than checked afterwards, so a cook cannot
 * retire a rival's suggestion by knowing its id.
 */
export async function retireDish(
  id: string,
  owner: { kitchenId?: string } = {},
  session?: ClientSession,
): Promise<Result<{ id: string; name: string; scope: string }>> {
  const updated = await MealDish.findOneAndUpdate(
    {
      _id: id,
      ...(owner.kitchenId ? { scope: 'cook', kitchenId: owner.kitchenId } : {}),
    },
    { $set: { retired: true } },
    { new: true },
  )
    .session(session ?? null)
    .lean()
    .catch(() => null);

  if (!updated) return fail(ERR.NO_MEAL);
  /* The name and scope ride back for the audit summary an operator reads
     later — "retired a dish" with an id in it says nothing. */
  return ok({ id: String(updated._id), name: updated.name, scope: updated.scope });
}

/* ------------------------------------------------------------------ *
 * booking
 * ------------------------------------------------------------------ */

/**
 * A refusal raised after the first write, which has to take the writes with it.
 *
 * `withTransaction` commits whatever the callback *returns* — including a
 * `Fail` — so a check that runs after money has moved cannot refuse by
 * returning. It throws this instead: the transaction aborts, nothing is
 * committed, and the caller unwraps it back into an ordinary refusal.
 */
class Rollback extends Error {
  constructor(readonly out: Fail) {
    super('meal-booking-rolled-back');
  }
}

export type BookingCustomer = {
  name?: string;
  phone?: string;
  address?: Record<string, unknown> | null;
};

/**
 * Buy a month's meals: one order per meal, one hold per order, one booking.
 *
 * Order of checks is the old confirm path's, widened to a basket: service,
 * calendar, duplicates, how many, then the wallet. Everything that can refuse
 * runs before the ledger is touched and inside the same transaction as the
 * writes, so there is no path that debits a wallet and then discovers Thursday
 * has no dinner published.
 *
 * ## Why one order each
 *
 * A month bought as a single order would have one status, one payment and one
 * rating for thirty meals — a cook could not be paid for the fourteen they had
 * already served, a customer could not cancel next Tuesday, and a bad Thursday
 * would be a dispute about the whole month. Each meal is its own order on the
 * existing escrow rail, and this function's only job is to make all of them
 * land together or none of them.
 *
 * ## The double-spend guard
 *
 * The wallet is checked before the holds are posted, from inside the
 * transaction — but two bookings racing each read a balance that does not yet
 * know about the other. The old board turned that race into a write conflict by
 * touching the meal row; there is no such row here, so the check is made again
 * *after* posting: if the customer's folded balance has gone negative, somebody
 * else spent the same money first and the whole thing is rolled back.
 */
export async function bookMeals(args: {
  customerKey: string;
  customer?: BookingCustomer;
  kitchenId: string;
  month: string;
  selections: { date: string; slot: string }[];
}): Promise<Result<{
  bookingId: string;
  code: string;
  total: number;
  count: number;
  orderIds: string[];
}>> {
  const customerKey = String(args.customerKey ?? '').trim();
  if (!customerKey) return fail(ERR.NAME_REQUIRED);

  const kitchenId = String(args.kitchenId ?? '').trim();
  if (!kitchenId) return fail(ERR.NO_KITCHEN);

  const month = String(args.month ?? '');
  const days = new Set(monthDays(month));
  if (!days.size) return fail(ERR.BAD_REQUEST, { field: 'month' });

  /*
   * The shape of the basket, before anything is drawn or read.
   *
   * These are the checks that need no database — a slot that is not a slot, a
   * day outside the month, yesterday, the same meal picked twice — and running
   * them first means a malformed payload never draws a code or opens a
   * transaction. Everything that depends on stored state is inside the
   * transaction below, where it belongs.
   */
  const selections = (Array.isArray(args.selections) ? args.selections : []).map((s) => ({
    date: String(s?.date ?? ''),
    slot: String(s?.slot ?? ''),
  }));

  const today = todayKey();
  const picked = new Set<string>();
  for (const one of selections) {
    if (!SLOT_KEYS.has(one.slot)) return fail(ERR.BAD_REQUEST, { field: 'slot', slot: one.slot });
    if (!days.has(one.date)) return fail(ERR.BAD_REQUEST, { field: 'date', date: one.date });
    // Dhaka calendar days, compared as strings — the whole reason they are strings.
    if (one.date < today) return fail(ERR.BAD_REQUEST, { field: 'date', date: one.date });

    const key = `${one.date}:${one.slot}`;
    if (picked.has(key)) return fail(ERR.ALREADY_ORDERED, { date: one.date, slot: one.slot });
    picked.add(key);
  }

  /*
   * Codes first, outside the transaction.
   *
   * A duplicate key *inside* a transaction aborts the whole thing, and a
   * one-in-a-billion clash on a six-character code is no reason to fail a
   * purchase. The drawn codes are also checked against each other — this draws
   * a handful at once, and two of them colliding is the same accident.
   */
  const drawn = new Set<string>();
  const codes: string[] = [];
  for (let i = 0; i < selections.length; i += 1) {
    const code = await freeCode(
      async (c) => drawn.has(c) || !!(await Order.exists({ code: c })),
    );
    drawn.add(code);
    codes.push(code);
  }
  const bookingCode = await freeCode(
    async (c) => !!(await MealBooking.exists({ code: c })),
    'MB',
  );

  try {
    return await tx(async (session) => {
      const service = await MealService.findOne({ kitchenId }).session(session).lean();
      if (!service) return fail(ERR.NO_MEAL);
      if (!service.active) return fail(ERR.SERVICE_INACTIVE);

      const category = await MealCategory.findOne({ key: service.categoryKey })
        .session(session)
        .lean();
      if (!category || category.retired) {
        return fail(ERR.NO_CATEGORY, { categoryKey: service.categoryKey });
      }

      const plan = await resolvePlan(kitchenId, service.categoryKey, month, session);
      if (!plan) return fail(ERR.PLAN_MISSING, { month });

      /* Every meal has to be a meal somebody published. The name is copied
         onto the order, so a calendar edited next week does not rewrite what
         was sold today. */
      const names: string[] = [];
      for (const one of selections) {
        const name = dishOn(plan.days, one.date, one.slot);
        if (!name) return fail(ERR.NO_MEAL, { date: one.date, slot: one.slot });
        names.push(name);
      }

      if (selections.length) {
        const clash = await Order.findOne({
          customerKey,
          kitchenId,
          kind: 'meal',
          status: { $ne: 'cancelled' },
          $or: selections.map((one) => ({ serveDate: one.date, slot: one.slot })),
        })
          .select({ serveDate: 1, slot: 1 })
          .session(session)
          .lean();

        if (clash) return fail(ERR.ALREADY_ORDERED, { date: clash.serveDate, slot: clash.slot });
      }

      const count = selections.length;
      const min = Math.max(1, Math.round(service.minMeals ?? 1));
      const max = Math.max(min, Math.round(service.maxMeals ?? min));
      if (count < min || count > max) return fail(ERR.MEAL_COUNT, { min, max, count });

      const rate = effectiveRate(service, category);
      if (!Number.isFinite(rate) || rate <= 0) return fail(ERR.BAD_AMOUNT, { field: 'rate' });
      const total = rate * count;

      const balance = await balanceFor('customer', customerKey, session);
      if (balance < total) return fail(ERR.LOW_BALANCE, { short: total - balance, balance });

      /* Past every refusal. From here the whole basket lands or none of it
         does. The booking's id is drawn first so each order can name its
         parent without a second pass over the rows. */
      const bookingId = new Types.ObjectId();
      const customer = args.customer ?? {};

      const created = await Order.create(
        selections.map((one, i) => ({
          code: codes[i],
          kind: 'meal',
          bookingId: String(bookingId),
          kitchenId,
          cookName: service.cookName ?? '',
          title: names[i],
          customerKey,
          customerName: customer.name ?? '',
          phone: customer.phone ?? '',
          address: customer.address ?? null,
          handover: 'delivery',
          serveDate: one.date,
          slot: one.slot,
          price: rate,
          amount: rate,
          status: 'confirmed',
          payment: 'held',
          history: [historyStep('confirmed')],
        })),
        // `ordered: true` is required for a multi-document create in a session.
        { session, ordered: true },
      );

      const orderIds = created.map((row) => String(row._id));

      await MealBooking.create(
        [
          {
            _id: bookingId,
            code: bookingCode,
            customerKey,
            customerName: customer.name ?? '',
            phone: customer.phone ?? '',
            address: customer.address ?? null,
            kitchenId,
            cookName: service.cookName ?? '',
            categoryKey: category.key,
            categoryLabel: category.label,
            month,
            // Snapshots. A cook re-pricing tomorrow does not re-price this.
            rate,
            minMeals: min,
            maxMeals: max,
            items: selections.map((one, i) => ({
              orderId: orderIds[i],
              date: one.date,
              slot: one.slot,
              name: names[i],
              amount: rate,
            })),
            totalAmount: total,
            status: 'active',
          },
        ],
        { session },
      );

      /* `fromRef` is not decoration: `balanceFor('customer', key)` folds on
         it, so a hold posted without it debits nobody and the wallet that just
         paid still reads full. One entry per order, keyed per order, because
         release and refund are per order too. */
      for (let i = 0; i < orderIds.length; i += 1) {
        const held = await post(session, {
          kind: 'hold',
          amount: rate,
          from: 'customer',
          to: 'held',
          fromRef: customerKey,
          orderId: orderIds[i],
          note: `Meal advance for ${names[i]}`,
          idemKey: `hold:${orderIds[i]}`,
        });
        if (!held.posted) throw new Rollback(fail(ERR.ALREADY_SETTLED));
      }

      const after = await balanceFor('customer', customerKey, session);
      if (after < 0) {
        throw new Rollback(fail(ERR.LOW_BALANCE, { short: -after, balance: after + total }));
      }

      await notify(session, {
        audience: 'cook',
        kind: 'meal-booked',
        key: `cook:meal-booked:${String(bookingId)}`,
        title: 'New meal booking',
        /* Expanded here rather than left as placeholders: a booking is not one
           of the tap targets the app's read-time filler knows how to resolve,
           and the numbers are a snapshot anyway. The ref below is what the tap
           opens. */
        body: `${customer.name?.trim() || 'A customer'} booked ${count} ${
          count === 1 ? 'meal' : 'meals'
        } for ${taka(total)}.`,
        kitchenId,
        bookingId: String(bookingId),
      });

      await notify(session, {
        audience: 'customer',
        kind: 'meal-booking-confirmed',
        key: `customer:meal-booked:${String(bookingId)}`,
        title: 'Meals booked',
        body: `${taka(total)} is held for ${count} ${
          count === 1 ? 'meal' : 'meals'
        }. Confirm each one when it arrives.`,
        customerKey,
        bookingId: String(bookingId),
      });

      return ok({
        bookingId: String(bookingId),
        code: bookingCode,
        total,
        count,
        orderIds,
      });
    });
  } catch (error) {
    if (error instanceof Rollback) return error.out;
    throw error;
  }
}

/**
 * Fold a booking's status out of its orders.
 *
 * The booking holds no status of its own while anything is still running —
 * asking it whether a meal was delivered would be reading a copy nothing keeps
 * up to date. This only writes the *end*: once every item is completed or
 * cancelled the booking is closed, and it is 'cancelled' only when every single
 * meal was, because a month with one refunded Tuesday still happened.
 *
 * Called from the rail's own transitions with their session, so the booking
 * closes in the same transaction as the order that closed it.
 */
export async function syncBookingStatus(
  session: ClientSession,
  bookingId: string,
): Promise<void> {
  const booking = await MealBooking.findById(bookingId)
    .session(session)
    .lean()
    .catch(() => null);
  if (!booking || booking.status !== 'active') return;

  const ids = (booking.items ?? []).map((item) => item.orderId).filter(Boolean);
  if (!ids.length) return;

  const orders = await Order.find({ _id: { $in: ids } })
    .select({ status: 1 })
    .session(session)
    .lean();

  // An item whose order cannot be read is not one this can call finished.
  if (orders.length !== ids.length) return;

  const statuses = orders.map((row) => row.status);
  const closed = statuses.every((s) => s === 'completed' || s === 'cancelled');
  if (!closed) return;

  const status = statuses.every((s) => s === 'cancelled') ? 'cancelled' : 'completed';

  await MealBooking.updateOne(
    { _id: String(booking._id), status: 'active' },
    { $set: { status } },
    { session },
  );
}
