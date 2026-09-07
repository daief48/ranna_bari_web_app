import {
  actualCounts,
  monthDays,
  portionCost,
  previousMonth,
  type PriceMap,
  type ScheduleLike,
} from './calc.js';
import { mainSlots } from './seed.js';
import { MmRecipe } from './models.js';

/**
 * The smart layer: cost engine → optimiser → recommendation.
 *
 * This is where the specification's "AI" lives, and it is deliberately
 * arithmetic rather than a model. The document asks for a real-time price
 * database, historical data and an optimisation engine now, with a learned
 * layer added once there is enough data to learn from — so what runs here is
 * a scoring function and a budget-aware greedy walk, and every recommendation
 * it makes is reproducible and explainable. `mm_recommendations` accumulates
 * the accepted/rejected record that a model would later train on.
 *
 * Nothing in this file may be read as an accounting figure. It projects and
 * suggests; `calc.ts` is the only thing that counts.
 */

export type Preferences = {
  avoid: string[];
  likes: { food: string; level: string }[];
  proteins: { food: string; perWeek: number }[];
  breakfastPerWeek: number;
  avoidRepeat: boolean;
};

export const defaultPreferences = (): Preferences => ({
  avoid: [],
  likes: [],
  proteins: [],
  breakfastPerWeek: 7,
  avoidRepeat: true,
});

export type Candidate = {
  key: string;
  name: string;
  slot: string;
  protein: string;
  tags: string[];
  cost: number;
  available: boolean;
  /** 0..1 — how much this person wants this dish. */
  preference: number;
};

export type PlanItem = {
  date: string;
  slot: string;
  recipeKey: string;
  name: string;
  estCost: number;
  replaced?: boolean;
};

export type PlanResult = {
  items: PlanItem[];
  expectedMeals: number;
  targetBudget: number;
  projectedCost: number;
  projectedRate: number;
  status: 'ok' | 'risk' | 'over';
  confidence: number;
  explanation: string;
};

/* ------------------------------------------------------------------ *
 * scoring
 * ------------------------------------------------------------------ */

const LEVEL_SCORE: Record<string, number> = { high: 1, medium: 0.6, low: 0.2 };

/**
 * How much this person wants this dish, 0..1.
 *
 * An explicit preference on the dish or its protein wins; everything else sits
 * at a neutral 0.5 so an unrated dish is neither promoted nor buried. Scoring
 * unrated food at zero would collapse a new user's plan onto the two or three
 * things they had happened to rate.
 */
function preferenceScore(recipe: { key: string; protein: string; tags: string[] }, prefs: Preferences): number {
  const direct = prefs.likes.find((l) => l.food === recipe.key || l.food === recipe.protein);
  if (direct) return LEVEL_SCORE[direct.level] ?? 0.5;
  return 0.5;
}

/** Dishes this person will not eat, by dish key or by protein. */
const isAvoided = (recipe: { key: string; protein: string }, prefs: Preferences): boolean =>
  prefs.avoid.includes(recipe.key) || prefs.avoid.includes(recipe.protein);

/**
 * Candidate dishes for a sitting, costed at today's prices.
 *
 * Lunch and dinner share one book — the recipes are stored under `lunch` and
 * both main sittings draw from it.
 */
export async function candidatesFor(
  slot: string,
  prices: PriceMap,
  prefs: Preferences,
): Promise<Candidate[]> {
  const query = mainSlots.has(slot) ? { slot: 'lunch', active: true } : { slot, active: true };
  const recipes = await MmRecipe.find(query).lean();

  return recipes
    .map((r) => {
      const recipe = {
        key: r.key as string,
        protein: (r.protein as string) ?? 'veg',
        tags: (r.tags as string[]) ?? [],
      };
      const ingredients = (r.ingredients ?? []) as { foodKey: string; qty: number; unit: string }[];
      const available = ingredients.every((i) => prices[i.foodKey]?.available !== false);

      return {
        key: recipe.key,
        name: r.name as string,
        slot,
        protein: recipe.protein,
        tags: recipe.tags,
        cost: portionCost({ ingredients, sundries: (r.sundries as number) ?? 0 }, prices),
        available,
        preference: preferenceScore(recipe, prefs),
      };
    })
    .filter((c) => !isAvoided({ key: c.key, protein: c.protein }, prefs));
}

/* ------------------------------------------------------------------ *
 * the walk
 * ------------------------------------------------------------------ */

/** ISO-ish week bucket, good enough to enforce "three days a week". */
const weekOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) / 86400000 + 4) / 7);
};

/**
 * Which days get a breakfast, when the person wants fewer than all of them.
 *
 * Spread rather than front-loaded: wanting two breakfasts a week means one
 * around Monday and one around Thursday, not both on the first two days and
 * then five without.
 */
function breakfastDays(days: string[], perWeek: number): Set<string> {
  if (perWeek >= 7) return new Set(days);
  if (perWeek <= 0) return new Set();

  const byWeek = new Map<number, string[]>();
  for (const d of days) {
    const w = weekOf(d);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(d);
  }

  const picked = new Set<string>();
  for (const week of byWeek.values()) {
    const step = week.length / perWeek;
    for (let i = 0; i < perWeek; i += 1) {
      const day = week[Math.min(week.length - 1, Math.round(i * step))];
      if (day) picked.add(day);
    }
  }
  return picked;
}

/**
 * Choose a dish for one sitting.
 *
 * The budget is enforced *forward*: whatever is left divided by however many
 * meals are still unplanned gives the average this meal has to respect. Early
 * meals therefore have room to be what the person actually likes, and the walk
 * tightens only if it has been spending. Among dishes inside that allowance the
 * best-liked wins, ties going to the cheaper; if nothing fits, the cheapest
 * available dish is taken and the overspend is carried into the next meal's
 * allowance rather than hidden.
 */
function pick(
  candidates: Candidate[],
  allowance: number,
  lastKey: string | null,
  proteinUsed: Map<string, number>,
  quotas: Map<string, number>,
  avoidRepeat: boolean,
): Candidate | null {
  if (!candidates.length) return null;

  const usable = candidates.filter((c) => {
    if (!c.available) return false;
    if (avoidRepeat && lastKey && c.key === lastKey) return false;
    const quota = quotas.get(c.protein);
    if (quota !== undefined && (proteinUsed.get(c.protein) ?? 0) >= quota) return false;
    return true;
  });

  /* Every option ruled out — relax the softest rule (repetition) before the
     hard ones, so a one-dish week is still a plan rather than a gap. */
  const pool = usable.length ? usable : candidates.filter((c) => c.available);
  if (!pool.length) return null;

  const affordable = pool.filter((c) => c.cost <= allowance);
  const field = affordable.length ? affordable : pool;

  return field.slice().sort((a, b) => {
    if (b.preference !== a.preference) return b.preference - a.preference;
    return a.cost - b.cost;
  })[0];
}

/**
 * Build a month's plan.
 *
 * `fromDay` lets a mid-month regeneration leave the days already lived alone —
 * a plan made on the 14th plans the 14th onward and says so in its own meal
 * count, rather than quietly budgeting for a fortnight that has gone.
 */
export async function buildPlan(args: {
  month: string;
  schedule: ScheduleLike;
  prefs: Preferences;
  targetRate: number;
  prices: PriceMap;
  fromDay?: string;
  historyMonths?: number;
}): Promise<PlanResult> {
  const { month, schedule, prefs, targetRate, prices, fromDay } = args;

  const days = monthDays(month).filter((d) => (fromDay ? d >= fromDay : true));
  const bDays = schedule.breakfast ? breakfastDays(days, prefs.breakfastPerWeek) : new Set<string>();

  const [breakfastPool, mainPool] = await Promise.all([
    schedule.breakfast ? candidatesFor('breakfast', prices, prefs) : Promise.resolve([]),
    schedule.lunch || schedule.dinner ? candidatesFor('lunch', prices, prefs) : Promise.resolve([]),
  ]);

  /* How many meals this plan covers — the figure the budget is built on. It is
     what the plan contains, which is not the same as what the schedule implies
     once a breakfast preference has thinned it. */
  let expectedMeals = 0;
  for (const d of days) {
    if (schedule.breakfast && bDays.has(d)) expectedMeals += 1;
    if (schedule.lunch) expectedMeals += 1;
    if (schedule.dinner) expectedMeals += 1;
  }

  const targetBudget = Math.round(expectedMeals * targetRate);

  const quotas = new Map<string, number>();
  for (const p of prefs.proteins) if (p.perWeek > 0) quotas.set(p.food, p.perWeek);

  const items: PlanItem[] = [];
  const proteinByWeek = new Map<number, Map<string, number>>();
  let spent = 0;
  let lastMain: string | null = null;
  let lastBreakfast: string | null = null;

  for (const date of days) {
    const week = weekOf(date);
    if (!proteinByWeek.has(week)) proteinByWeek.set(week, new Map());
    const used = proteinByWeek.get(week)!;

    const sittings: string[] = [];
    if (schedule.breakfast && bDays.has(date)) sittings.push('breakfast');
    if (schedule.lunch) sittings.push('lunch');
    if (schedule.dinner) sittings.push('dinner');

    for (const slot of sittings) {
      const remainingMeals = expectedMeals - items.length;
      const allowance = remainingMeals > 0 ? (targetBudget - spent) / remainingMeals : targetRate;

      const pool = slot === 'breakfast' ? breakfastPool : mainPool;
      const last = slot === 'breakfast' ? lastBreakfast : lastMain;
      const chosen = pick(pool, allowance, last, used, quotas, prefs.avoidRepeat);
      if (!chosen) continue;

      items.push({
        date,
        slot,
        recipeKey: chosen.key,
        name: chosen.name,
        estCost: chosen.cost,
      });

      spent += chosen.cost;
      used.set(chosen.protein, (used.get(chosen.protein) ?? 0) + 1);
      if (slot === 'breakfast') lastBreakfast = chosen.key;
      else lastMain = chosen.key;
    }
  }

  const projectedCost = spent;
  const projectedRate = items.length ? Math.round((projectedCost / items.length) * 100) / 100 : 0;
  const status = budgetStatus(projectedRate, targetRate);

  return {
    items,
    expectedMeals: items.length,
    targetBudget: Math.round(items.length * targetRate),
    projectedCost,
    projectedRate,
    status,
    confidence: confidenceOf({
      items,
      pricedFully: breakfastPool.concat(mainPool).every((c) => c.available),
      onTarget: status !== 'over',
      historyMonths: args.historyMonths ?? 0,
    }),
    explanation: explain({ items, projectedRate, targetRate, status, prefs }),
  };
}

/* ------------------------------------------------------------------ *
 * verdicts
 * ------------------------------------------------------------------ */

/**
 * Where a projection sits against a target.
 *
 * The amber band is the last 3% below the line: a plan landing at ৳59.50
 * against a ৳60 target is true but fragile, and one bad market week takes it
 * over. Saying so before the month starts is the point of the feature.
 */
export function budgetStatus(projectedRate: number, targetRate: number): 'ok' | 'risk' | 'over' {
  if (!targetRate) return 'ok';
  if (projectedRate > targetRate) return 'over';
  if (projectedRate >= targetRate * 0.97) return 'risk';
  return 'ok';
}

/**
 * How much the plan deserves to be believed, 0..1.
 *
 * Every term is something the module actually knows: whether the ingredients
 * were all in stock and priced, whether the walk landed inside the target, and
 * how many months of this person's real entries there are to have learned
 * anything from. A new account gets a visibly lower number, which is honest.
 */
function confidenceOf(args: {
  items: PlanItem[];
  pricedFully: boolean;
  onTarget: boolean;
  historyMonths: number;
}): number {
  if (!args.items.length) return 0;
  let score = 0.5;
  if (args.pricedFully) score += 0.2;
  if (args.onTarget) score += 0.15;
  score += 0.15 * Math.min(1, args.historyMonths / 3);
  return Math.round(Math.min(1, score) * 100) / 100;
}

/**
 * The plan, in a sentence or three.
 *
 * Assembled from what the walk did rather than generated, so it cannot claim
 * anything the numbers do not support — and so it costs nothing to produce.
 */
function explain(args: {
  items: PlanItem[];
  projectedRate: number;
  targetRate: number;
  status: 'ok' | 'risk' | 'over';
  prefs: Preferences;
}): string {
  const { items, projectedRate, targetRate, status } = args;
  if (!items.length) return 'There was nothing to plan — check your meal schedule.';

  const gap = Math.round(Math.abs(projectedRate - targetRate) * 100) / 100;
  const head =
    status === 'over'
      ? `This plan averages ৳${projectedRate} a meal, ৳${gap} above your ৳${targetRate} target.`
      : status === 'risk'
        ? `This plan averages ৳${projectedRate} a meal — inside your ৳${targetRate} target, but only just.`
        : `This plan averages ৳${projectedRate} a meal, ৳${gap} under your ৳${targetRate} target.`;

  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
  const spread = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const variety = `${counts.size} different ${counts.size === 1 ? 'dish' : 'dishes'} across ${items.length} meals, most often ${spread[0][0]}.`;

  const tail =
    status === 'over'
      ? ' Swap a few of the costlier meals for the cheaper alternatives to bring the average down.'
      : '';

  return `${head} ${variety}${tail}`;
}

/* ------------------------------------------------------------------ *
 * adjustment
 * ------------------------------------------------------------------ */

/**
 * Cheaper dishes that could stand in for this one.
 *
 * Only ever cheaper, and never the dish itself: the swap exists to recover
 * budget, so an equally priced alternative would be noise on a screen the
 * person opened because they were over.
 */
export async function alternativesFor(
  item: { slot: string; recipeKey: string; estCost: number },
  prices: PriceMap,
  prefs: Preferences,
  limit = 4,
): Promise<Candidate[]> {
  const pool = await candidatesFor(item.slot, prices, prefs);
  return pool
    .filter((c) => c.key !== item.recipeKey && c.available && c.cost < item.estCost)
    .sort((a, b) => {
      if (b.preference !== a.preference) return b.preference - a.preference;
      return a.cost - b.cost;
    })
    .slice(0, limit);
}

/**
 * Re-derive a plan's projection from its items.
 *
 * Called after every swap. The stored per-item estimate is left exactly as it
 * was — only the dish that changed gets a new one — so the plan's history of
 * what it thought each meal would cost survives the edit.
 */
export function recalcPlan(
  items: PlanItem[],
  targetRate: number,
): Pick<PlanResult, 'projectedCost' | 'projectedRate' | 'status' | 'targetBudget' | 'expectedMeals'> {
  const projectedCost = items.reduce((sum, i) => sum + i.estCost, 0);
  const projectedRate = items.length ? Math.round((projectedCost / items.length) * 100) / 100 : 0;
  return {
    expectedMeals: items.length,
    targetBudget: Math.round(items.length * targetRate),
    projectedCost,
    projectedRate,
    status: budgetStatus(projectedRate, targetRate),
  };
}

/** How many recent months this person has real entries in — a confidence input. */
export async function historyDepth(
  messId: string,
  customerKey: string,
  month: string,
): Promise<number> {
  let depth = 0;
  let m = month;
  for (let i = 0; i < 3; i += 1) {
    m = previousMonth(m);
    const counts = await actualCounts(messId, customerKey, m);
    if (counts.total > 0) depth += 1;
  }
  return depth;
}
