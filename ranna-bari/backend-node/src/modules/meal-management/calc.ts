import { MmDailyMeal, MmExpense, MmFoodItem, MmMember, MmProfile } from './models.js';

/**
 * The cost engine.
 *
 * Everything financial the module says comes from this file, and this file
 * contains no cleverness at all — it counts rows and divides. That division of
 * labour is the specification's central rule: the smart layer may suggest what
 * to eat, but what a month *cost* is arithmetic over entries that a person
 * actually made, and no recommendation, projection or forecast is allowed to
 * stand in for one.
 *
 * Two distinctions are load-bearing here and are kept apart everywhere they
 * appear:
 *
 *   expected vs actual — expected comes from a schedule and belongs to the
 *   planner; actual comes from `mm_daily_meals` and belongs to the books.
 *
 *   estimated vs actual — an estimate is what a plan predicted at generation
 *   time and is frozen; actual is what the month turned out to be. Neither
 *   overwrites the other.
 */

export const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type Slot = (typeof SLOTS)[number];

/** Every expense category the module knows, and whether it counts by default. */
export const EXPENSE_CATEGORIES = [
  { key: 'bazar', label: 'Food / Bazar', defaultApplicable: true },
  { key: 'gas', label: 'Gas / Kitchen', defaultApplicable: true },
  { key: 'utility', label: 'Utility', defaultApplicable: true },
  { key: 'rent', label: 'Rent', defaultApplicable: false },
  { key: 'other', label: 'Other', defaultApplicable: true },
] as const;

/* ------------------------------------------------------------------ *
 * calendar
 * ------------------------------------------------------------------ */

/** 'YYYY-MM' → true when it is a month and not something that merely looks like one. */
export const isMonth = (m: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** 'YYYY-MM-DD' → same question for a day. */
export const isDay = (d: string): boolean => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d);

/** The month a day belongs to, by string surgery — no Date, no timezone. */
export const monthOf = (date: string): string => date.slice(0, 7);

/**
 * Every day in a month, as 'YYYY-MM-DD'.
 *
 * `new Date(y, m, 0)` gives the last day of month `m`, which is how February
 * and leap years take care of themselves. The Date here is arithmetic on a
 * calendar, never an instant, so it never leaves this function.
 */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d += 1) out.push(`${month}-${String(d).padStart(2, '0')}`);
  return out;
}

/** The month before this one. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * actual meals — the only count that is ever true
 * ------------------------------------------------------------------ */

export type MealCounts = {
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  total: number;
  days: number;
};

const emptyCounts = (): MealCounts => ({
  breakfast: 0,
  lunch: 0,
  dinner: 0,
  guest: 0,
  total: 0,
  days: 0,
});

/**
 * One member's actual meals in a month.
 *
 * A single aggregate rather than a row-by-row fold, so a month is one round
 * trip whatever it holds.
 */
export async function actualCounts(
  messId: string,
  customerKey: string,
  month: string,
): Promise<MealCounts> {
  const [row] = await MmDailyMeal.aggregate<{
    breakfast: number;
    lunch: number;
    dinner: number;
    guest: number;
    total: number;
    days: number;
  }>([
    { $match: { messId, customerKey, month } },
    {
      $group: {
        _id: null,
        breakfast: { $sum: { $cond: ['$breakfast', 1, 0] } },
        lunch: { $sum: { $cond: ['$lunch', 1, 0] } },
        dinner: { $sum: { $cond: ['$dinner', 1, 0] } },
        guest: { $sum: '$guest' },
        total: { $sum: '$total' },
        days: { $sum: 1 },
      },
    },
  ]);

  return row ? { ...emptyCounts(), ...row } : emptyCounts();
}

/**
 * Actual meals for every member of a mess, keyed by `customerKey`.
 *
 * The mess-wide total is what the rate divides by, so it has to come from the
 * same query the per-member figures do — two queries could disagree the moment
 * somebody edits between them.
 */
export async function actualCountsByMember(
  messId: string,
  month: string,
): Promise<Record<string, MealCounts>> {
  const rows = await MmDailyMeal.aggregate<{
    _id: string;
    breakfast: number;
    lunch: number;
    dinner: number;
    guest: number;
    total: number;
    days: number;
  }>([
    { $match: { messId, month } },
    {
      $group: {
        _id: '$customerKey',
        breakfast: { $sum: { $cond: ['$breakfast', 1, 0] } },
        lunch: { $sum: { $cond: ['$lunch', 1, 0] } },
        dinner: { $sum: { $cond: ['$dinner', 1, 0] } },
        guest: { $sum: '$guest' },
        total: { $sum: '$total' },
        days: { $sum: 1 },
      },
    },
  ]);

  const out: Record<string, MealCounts> = {};
  for (const r of rows) {
    const { _id, ...counts } = r;
    out[_id] = { ...emptyCounts(), ...counts };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * expected meals — a planner input, never a count
 * ------------------------------------------------------------------ */

export type ScheduleLike = { breakfast: boolean; lunch: boolean; dinner: boolean };

/** Sittings a schedule takes per day. */
export const perDayFromSchedule = (s: ScheduleLike): number =>
  (s.breakfast ? 1 : 0) + (s.lunch ? 1 : 0) + (s.dinner ? 1 : 0);

/**
 * How many meals a schedule *implies* for a month.
 *
 * This feeds the planner's budget arithmetic and nothing else. It is not a
 * meal count and must never be substituted for one — the specification is
 * explicit that a month billing 54 actual meals bills 54, whatever the
 * schedule expected.
 */
export function expectedMeals(schedule: ScheduleLike, month: string, fromDay?: string): number {
  const days = monthDays(month).filter((d) => (fromDay ? d >= fromDay : true));
  return days.length * perDayFromSchedule(schedule);
}

/* ------------------------------------------------------------------ *
 * expenses
 * ------------------------------------------------------------------ */

export type ExpenseTotals = {
  total: number;
  applicable: number;
  byCategory: { category: string; amount: number; applicable: boolean }[];
};

/**
 * What a month cost, split by category and by whether the category counts.
 *
 * `applicableCategories` comes from the mess, because which costs belong in a
 * meal rate is a decision about that mess and not a fact about accounting.
 */
export async function expenseTotals(
  messId: string,
  month: string,
  applicableCategories: string[],
): Promise<ExpenseTotals> {
  const rows = await MmExpense.aggregate<{ _id: string; amount: number }>([
    { $match: { messId, month } },
    { $group: { _id: '$category', amount: { $sum: '$amount' } } },
  ]);

  const applies = new Set(applicableCategories);
  let total = 0;
  let applicable = 0;
  const byCategory: ExpenseTotals['byCategory'] = [];

  for (const { key } of EXPENSE_CATEGORIES) {
    const found = rows.find((r) => r._id === key);
    const amount = found ? found.amount : 0;
    const counts = applies.has(key);
    total += amount;
    if (counts) applicable += amount;
    byCategory.push({ category: key, amount, applicable: counts });
  }

  /* A category that predates a settings change still shows up. */
  for (const r of rows) {
    if (EXPENSE_CATEGORIES.some((c) => c.key === r._id)) continue;
    const counts = applies.has(r._id);
    total += r.amount;
    if (counts) applicable += r.amount;
    byCategory.push({ category: r._id, amount: r.amount, applicable: counts });
  }

  return { total, applicable, byCategory };
}

/* ------------------------------------------------------------------ *
 * the rate
 * ------------------------------------------------------------------ */

/**
 * Meal rate = applicable monthly cost ÷ total monthly meals.
 *
 * Kept to two decimals rather than whole taka because a rate is a ratio, not a
 * payment — the specification's own warning reads "৳62.40". Rounding it to ৳62
 * here would quietly move every share that multiplies it.
 *
 * No meals means no rate. Zero is returned rather than a division by zero or a
 * null the callers would each have to remember to handle, and a month with no
 * meals has no rate in the ordinary sense of the word.
 */
export function mealRate(applicableCost: number, totalMeals: number): number {
  if (!totalMeals || totalMeals <= 0) return 0;
  return Math.round((applicableCost / totalMeals) * 100) / 100;
}

/** What one member owes: their meals at the mess rate, to the nearest taka. */
export const mealShare = (meals: number, rate: number): number => Math.round(meals * rate);

/* ------------------------------------------------------------------ *
 * portion costing
 * ------------------------------------------------------------------ */

export type PriceMap = Record<string, { price: number; unit: string; available: boolean; name: string }>;

/** Current prices, keyed by food. One query; callers pass it around. */
export async function priceMap(): Promise<PriceMap> {
  const foods = await MmFoodItem.find({}).lean();
  const out: PriceMap = {};
  for (const f of foods) {
    out[f.key as string] = {
      price: f.price as number,
      unit: f.unit as string,
      available: f.available as boolean,
      name: f.name as string,
    };
  }
  return out;
}

export type RecipeLike = {
  ingredients: { foodKey: string; qty: number; unit: string }[];
  sundries?: number;
};

/**
 * What one portion of a dish costs at today's prices.
 *
 * Ingredient quantities are held in the food's own unit — 0.12 of a kg of
 * chicken, 2 eggs — so the cost is a sum of `qty × price` and the unit is
 * documentation rather than arithmetic. An ingredient whose food is missing
 * from the catalogue contributes nothing and is reported by
 * `portionCostDetail`, so a recipe silently costing too little is visible
 * instead of merely wrong.
 */
export function portionCost(recipe: RecipeLike, prices: PriceMap): number {
  let cost = recipe.sundries ?? 0;
  for (const ing of recipe.ingredients ?? []) {
    const food = prices[ing.foodKey];
    if (!food) continue;
    cost += food.price * ing.qty;
  }
  return Math.round(cost);
}

export type PortionDetail = {
  cost: number;
  lines: { foodKey: string; name: string; qty: number; unit: string; cost: number }[];
  missing: string[];
  available: boolean;
};

/** `portionCost` with its working shown — what the costing screen renders. */
export function portionCostDetail(recipe: RecipeLike, prices: PriceMap): PortionDetail {
  const lines: PortionDetail['lines'] = [];
  const missing: string[] = [];
  let cost = recipe.sundries ?? 0;
  let available = true;

  for (const ing of recipe.ingredients ?? []) {
    const food = prices[ing.foodKey];
    if (!food) {
      missing.push(ing.foodKey);
      continue;
    }
    if (!food.available) available = false;
    const line = Math.round(food.price * ing.qty);
    cost += food.price * ing.qty;
    lines.push({ foodKey: ing.foodKey, name: food.name, qty: ing.qty, unit: ing.unit, cost: line });
  }

  return { cost: Math.round(cost), lines, missing, available };
}

/* ------------------------------------------------------------------ *
 * the statement
 * ------------------------------------------------------------------ */

export type MemberStatement = {
  customerKey: string;
  name: string;
  meals: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  share: number;
};

export type MonthStatement = {
  month: string;
  totalCost: number;
  applicableCost: number;
  totalMeals: number;
  rate: number;
  members: MemberStatement[];
  categories: ExpenseTotals['byCategory'];
};

/**
 * A month, computed from scratch.
 *
 * This runs for an open month every time it is asked for — it is three
 * aggregates and a division, and a figure that recomputes cannot drift from
 * the rows it came from. A *closed* month does not come through here at all:
 * it is read from the snapshot written when it closed.
 */
export async function monthStatement(
  messId: string,
  month: string,
  applicableCategories: string[],
): Promise<MonthStatement> {
  const [counts, expenses, members] = await Promise.all([
    actualCountsByMember(messId, month),
    expenseTotals(messId, month, applicableCategories),
    MmMember.find({ messId }).lean(),
  ]);

  const totalMeals = Object.values(counts).reduce((sum, c) => sum + c.total, 0);
  const rate = mealRate(expenses.applicable, totalMeals);

  const statements: MemberStatement[] = members.map((m) => {
    const c = counts[m.customerKey as string] ?? emptyCounts();
    return {
      customerKey: m.customerKey as string,
      name: (m.name as string) || '',
      meals: c.total,
      breakfast: c.breakfast,
      lunch: c.lunch,
      dinner: c.dinner,
      guest: c.guest,
      share: mealShare(c.total, rate),
    };
  });

  /* Somebody with meals but no membership row still has to appear, or the
     shares stop adding up to the cost. */
  for (const [key, c] of Object.entries(counts)) {
    if (statements.some((s) => s.customerKey === key)) continue;
    statements.push({
      customerKey: key,
      name: '',
      meals: c.total,
      breakfast: c.breakfast,
      lunch: c.lunch,
      dinner: c.dinner,
      guest: c.guest,
      share: mealShare(c.total, rate),
    });
  }

  return {
    month,
    totalCost: expenses.total,
    applicableCost: expenses.applicable,
    totalMeals,
    rate,
    members: statements.sort((a, b) => b.meals - a.meals),
    categories: expenses.byCategory,
  };
}

/** The schedule row a member is planned against, with the documented default. */
export async function scheduleFor(messId: string, customerKey: string): Promise<ScheduleLike> {
  const p = await MmProfile.findOne({ messId, customerKey }).lean();
  if (!p) return { breakfast: false, lunch: true, dinner: true };
  return { breakfast: !!p.breakfast, lunch: !!p.lunch, dinner: !!p.dinner };
}
