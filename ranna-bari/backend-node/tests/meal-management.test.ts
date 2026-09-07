import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import {
  MmDailyMeal,
  MmExpense,
  MmMealAudit,
  MmMonth,
  MmPlan,
} from '../src/modules/meal-management/models.js';
import { mealRate, monthDays, expectedMeals, portionCost } from '../src/modules/meal-management/calc.js';
import { budgetStatus, recalcPlan } from '../src/modules/meal-management/planner.js';
import { resetSeedFlag } from '../src/modules/meal-management/seed.js';
import * as mm from '../src/modules/meal-management/service.js';

/**
 * Meal management — the rules, not the happy paths.
 *
 * The specification is strict about a small number of things and relaxed about
 * everything else, so this suite asserts the strict ones: that a meal rate is
 * arithmetic over real entries, that a schedule never counts as a meal, that
 * estimated and actual stay apart, that a closed month is genuinely frozen,
 * and that one account cannot see another's food. Those are the properties
 * that make the feature trustworthy; the screens can change freely underneath
 * them.
 */

const ALICE = { customerKey: '+8801711111111', name: 'Alice' };
const BOB = { customerKey: '+8801722222222', name: 'Bob' };

const MONTH = '2026-09';
const day = (n: number) => `${MONTH}-${String(n).padStart(2, '0')}`;

beforeAll(async () => {
  await startTestDb();
}, 180_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  /* The catalogue is seeded lazily and remembers that it did; a cleared
     database has to forget with it. */
  resetSeedFlag();
});

/* ------------------------------------------------------------------ *
 * the arithmetic
 * ------------------------------------------------------------------ */

describe('meal rate', () => {
  it('divides applicable cost by meals, exactly as the specification states', () => {
    /* The document's own worked example: ৳18,000 over 300 meals is ৳60. */
    expect(mealRate(18_000, 300)).toBe(60);
  });

  it('keeps the fractional part a rate actually has', () => {
    /* The specification's own warning text reads "৳62.40". Rounding to whole
       taka here would move every share that multiplies it. */
    expect(mealRate(3_120, 50)).toBe(62.4);
  });

  it('is zero when nothing was eaten, rather than dividing by zero', () => {
    expect(mealRate(5_000, 0)).toBe(0);
  });

  it('counts the days of a month, February included', () => {
    expect(monthDays('2026-09')).toHaveLength(30);
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2028-02')).toHaveLength(29);
  });
});

describe('portion costing', () => {
  it('sums ingredients at their current unit prices', () => {
    const prices = {
      chicken: { price: 300, unit: 'kg', available: true, name: 'Chicken' },
      oil: { price: 200, unit: 'kg', available: true, name: 'Oil' },
      onion: { price: 100, unit: 'kg', available: true, name: 'Onion' },
      potato: { price: 40, unit: 'kg', available: true, name: 'Potato' },
    };

    /* The document's costing table: 120g chicken, 10g oil, 30g onion, 50g
       potato and ৳2 of spice comes to about ৳45. */
    const cost = portionCost(
      {
        ingredients: [
          { foodKey: 'chicken', qty: 0.12, unit: 'kg' },
          { foodKey: 'oil', qty: 0.01, unit: 'kg' },
          { foodKey: 'onion', qty: 0.03, unit: 'kg' },
          { foodKey: 'potato', qty: 0.05, unit: 'kg' },
        ],
        sundries: 2,
      },
      prices,
    );

    expect(cost).toBe(45);
  });
});

/* ------------------------------------------------------------------ *
 * expected is not actual
 * ------------------------------------------------------------------ */

describe('expected against actual', () => {
  it('derives expected meals from the schedule alone', () => {
    /* Lunch and dinner across September: 30 × 2. */
    expect(expectedMeals({ breakfast: false, lunch: true, dinner: true }, MONTH)).toBe(60);
  });

  it('bills the meals that were eaten, not the meals that were expected', async () => {
    const ctx = await mm.ensureMess(ALICE);

    /* A schedule that expects 60, and 54 meals actually taken. */
    await mm.saveProfile(ctx, ALICE, { breakfast: false, lunch: true, dinner: true });
    for (let d = 1; d <= 27; d += 1) {
      await mm.setMeal(ctx, ALICE, day(d), { lunch: true, dinner: true });
    }

    await mm.addExpense(ctx, ALICE, { date: day(3), amount: 3_240, category: 'bazar' });

    const out = await mm.monthlySummary(ctx, ALICE, MONTH);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const summary = out.result as Record<string, unknown>;
    expect(summary.totalMeals).toBe(54);
    /* ৳3,240 over 54 meals is ৳60 — and would have been ৳54 had the schedule's
       60 been used instead. */
    expect(summary.rate).toBe(60);
  });
});

/* ------------------------------------------------------------------ *
 * entries and their history
 * ------------------------------------------------------------------ */

describe('meal entries', () => {
  it('totals a day from its sittings and its guests', async () => {
    const ctx = await mm.ensureMess(ALICE);
    const out = await mm.setMeal(ctx, ALICE, day(1), {
      breakfast: true,
      lunch: true,
      dinner: true,
      guest: 2,
    });

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.total).toBe(5);
  });

  it('keeps both sides of a correction', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true, dinner: true });
    await mm.setMeal(ctx, ALICE, day(1), { dinner: false });

    const audits = await MmMealAudit.find({ date: day(1) }).sort({ at: 1 }).lean();
    expect(audits).toHaveLength(2);
    /* The correction remembers that dinner had been on. */
    expect(audits[1].before).toMatchObject({ dinner: true });
    expect(audits[1].after).toMatchObject({ dinner: false });
  });

  it('turns a run of days off in one action, and traces every one', async () => {
    const ctx = await mm.ensureMess(ALICE);
    for (let d = 1; d <= 10; d += 1) {
      await mm.setMeal(ctx, ALICE, day(d), { lunch: true, dinner: true });
    }

    /* Away from the 4th to the 7th. */
    const out = await mm.bulkMeals(ctx, ALICE, {
      from: day(4),
      to: day(7),
      slots: ['lunch', 'dinner'],
      value: false,
    });

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.changed).toBe(4);

    const counts = await MmDailyMeal.find({ customerKey: ALICE.customerKey, month: MONTH }).lean();
    const total = counts.reduce((sum, r) => sum + (r.total as number), 0);
    expect(total).toBe(12);

    const bulkAudits = await MmMealAudit.find({ action: 'bulk' }).lean();
    expect(bulkAudits).toHaveLength(4);
  });

  it('refuses a date that is not one', async () => {
    const ctx = await mm.ensureMess(ALICE);
    const out = await mm.setMeal(ctx, ALICE, '2026-13-40', { lunch: true });
    expect(out.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * which costs count
 * ------------------------------------------------------------------ */

describe('applicable cost', () => {
  it('leaves rent out of the rate by default, and lets the mess put it in', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true, dinner: true });

    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 100, category: 'bazar' });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 900, category: 'rent' });

    const before = await mm.monthlySummary(ctx, ALICE, MONTH);
    if (!before.ok) throw new Error('expected a summary');
    /* ৳100 of bazar over 2 meals — the rent is not part of a meal. */
    expect((before.result as Record<string, unknown>).rate).toBe(50);

    await mm.saveCategories(ctx, ALICE, ['bazar', 'rent']);
    const after = await mm.monthlySummary(await mm.ensureMess(ALICE), ALICE, MONTH);
    if (!after.ok) throw new Error('expected a summary');
    expect((after.result as Record<string, unknown>).rate).toBe(500);
  });
});

/* ------------------------------------------------------------------ *
 * the closed month
 * ------------------------------------------------------------------ */

describe('month close', () => {
  it('freezes entries and expenses, and keeps its figures afterwards', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true, dinner: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 120, category: 'bazar' });

    const closed = await mm.closeMonth(ctx, ALICE, MONTH);
    expect(closed.ok).toBe(true);

    const snapshot = await MmMonth.findOne({ month: MONTH }).lean();
    expect(snapshot?.closed).toBe(true);
    expect(snapshot?.rate).toBe(60);

    /* Nothing may be added to it afterwards. */
    const meal = await mm.setMeal(ctx, ALICE, day(2), { lunch: true });
    expect(meal.ok).toBe(false);
    if (!meal.ok) expect(meal.error).toBe('mm-month-closed');

    const expense = await mm.addExpense(ctx, ALICE, { date: day(2), amount: 50, category: 'bazar' });
    expect(expense.ok).toBe(false);

    const bulk = await mm.bulkMeals(ctx, ALICE, {
      from: day(2),
      to: day(3),
      slots: ['lunch'],
      value: true,
    });
    expect(bulk.ok).toBe(false);

    /* And the snapshot still reads what it read when it was taken. */
    const summary = await mm.monthlySummary(ctx, ALICE, MONTH);
    if (!summary.ok) throw new Error('expected a summary');
    expect((summary.result as Record<string, unknown>).rate).toBe(60);
    expect((summary.result as Record<string, unknown>).closed).toBe(true);
  });

  it('will not close a month with nothing in it, or close one twice', async () => {
    const ctx = await mm.ensureMess(ALICE);

    const empty = await mm.closeMonth(ctx, ALICE, MONTH);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe('mm-month-empty');

    await mm.setMeal(ctx, ALICE, day(1), { lunch: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 60, category: 'bazar' });
    expect((await mm.closeMonth(ctx, ALICE, MONTH)).ok).toBe(true);

    const again = await mm.closeMonth(ctx, ALICE, MONTH);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('mm-month-already-closed');
  });

  it('does not let a later expense move a settled month', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true, dinner: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 120, category: 'bazar' });
    await mm.closeMonth(ctx, ALICE, MONTH);

    /* Something written straight past the service layer, as a repair script
       might: the snapshot must still not move. */
    await MmExpense.create({
      messId: ctx.messId,
      date: day(2),
      month: MONTH,
      amount: 5_000,
      category: 'bazar',
    });

    const summary = await mm.monthlySummary(ctx, ALICE, MONTH);
    if (!summary.ok) throw new Error('expected a summary');
    expect((summary.result as Record<string, unknown>).rate).toBe(60);
  });
});

/* ------------------------------------------------------------------ *
 * one account, one set of books
 * ------------------------------------------------------------------ */

describe('isolation', () => {
  it('gives each account its own mess and never mixes their meals', async () => {
    const alice = await mm.ensureMess(ALICE);
    const bob = await mm.ensureMess(BOB);
    expect(alice.messId).not.toBe(bob.messId);

    await mm.setMeal(alice, ALICE, day(1), { lunch: true, dinner: true });
    await mm.setMeal(bob, BOB, day(1), { lunch: true });

    const hers = await mm.listMeals(alice, ALICE, MONTH);
    const his = await mm.listMeals(bob, BOB, MONTH);
    if (!hers.ok || !his.ok) throw new Error('expected both months');

    expect(hers.result.counts.total).toBe(2);
    expect(his.result.counts.total).toBe(1);
  });

  it('returns the same mess on a second visit rather than making another', async () => {
    const first = await mm.ensureMess(ALICE);
    const second = await mm.ensureMess(ALICE);
    expect(first.messId).toBe(second.messId);
  });
});

/* ------------------------------------------------------------------ *
 * the smart layer, and its limits
 * ------------------------------------------------------------------ */

describe('smart planner', () => {
  it('needs a target before it will plan', async () => {
    const ctx = await mm.ensureMess(ALICE);
    const out = await mm.generatePlan(ctx, ALICE, { month: '2026-12' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-target-missing');
  });

  it('plans a month against a target and reports where it landed', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, {
      breakfast: false,
      lunch: true,
      dinner: true,
      targetRate: 60,
    });

    const out = await mm.generatePlan(ctx, ALICE, { month: '2026-12', targetRate: 60 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const plan = out.result as Record<string, unknown>;
    /* December, lunch and dinner: 62 meals. */
    expect(plan.expectedMeals).toBe(62);
    expect(plan.targetBudget).toBe(62 * 60);
    expect((plan.items as unknown[]).length).toBe(62);
    expect(plan.projectedRate).toBeGreaterThan(0);
    expect(['ok', 'risk', 'over']).toContain(plan.status);
    expect(String(plan.explanation).length).toBeGreaterThan(0);
  });

  it('keeps a dish the person avoids out of the plan entirely', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, {
      lunch: true,
      dinner: true,
      targetRate: 80,
      avoid: ['beef', 'chicken'],
    });

    const out = await mm.generatePlan(ctx, ALICE, { month: '2026-12' });
    if (!out.ok) throw new Error('expected a plan');

    const items = (out.result as Record<string, unknown>).items as { recipeKey: string }[];
    expect(items.some((i) => i.recipeKey === 'rice-beef')).toBe(false);
    expect(items.some((i) => i.recipeKey === 'rice-chicken')).toBe(false);
  });

  it('does not repeat a dish on consecutive days when asked not to', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: false, targetRate: 70, avoidRepeat: true });

    const out = await mm.generatePlan(ctx, ALICE, { month: '2026-12' });
    if (!out.ok) throw new Error('expected a plan');

    const items = (out.result as Record<string, unknown>).items as { recipeKey: string }[];
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i].recipeKey).not.toBe(items[i - 1].recipeKey);
    }
  });

  it('recomputes the projection when a meal is swapped, and leaves the rest estimated as they were', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: true, targetRate: 60 });
    await mm.generatePlan(ctx, ALICE, { month: '2026-12' });

    const before = await MmPlan.findOne({ customerKey: ALICE.customerKey, month: '2026-12' }).lean();
    const others = (before!.items as { estCost: number }[]).slice(1).map((i) => i.estCost);

    const out = await mm.replacePlanItem(ctx, ALICE, {
      month: '2026-12',
      index: 0,
      recipeKey: 'rice-dal-veg',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const plan = out.result as Record<string, unknown>;
    const items = plan.items as { recipeKey: string; estCost: number; replaced?: boolean }[];

    expect(items[0].recipeKey).toBe('rice-dal-veg');
    expect(items[0].replaced).toBe(true);
    /* Every other estimate is untouched — the frozen figure is the whole point
       of showing "was ৳65, now ৳48". */
    expect(items.slice(1).map((i) => i.estCost)).toEqual(others);

    const recomputed = items.reduce((sum, i) => sum + i.estCost, 0);
    expect(plan.projectedCost).toBe(recomputed);
  });

  it('refuses to swap in a dish that does not exist', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, targetRate: 60 });
    await mm.generatePlan(ctx, ALICE, { month: '2026-12' });

    const out = await mm.replacePlanItem(ctx, ALICE, {
      month: '2026-12',
      index: 0,
      recipeKey: 'not-a-dish',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-recipe-missing');
  });

  it('offers only cheaper alternatives, because the point is to recover budget', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: true, targetRate: 90 });
    await mm.generatePlan(ctx, ALICE, { month: '2026-12' });

    const out = await mm.planAlternatives(ctx, ALICE, { month: '2026-12', index: 0 });
    if (!out.ok) throw new Error('expected alternatives');

    const current = out.result.current as { estCost: number };
    for (const alt of out.result.alternatives as { cost: number }[]) {
      expect(alt.cost).toBeLessThan(current.estCost);
    }
  });
});

describe('budget status', () => {
  it('calls a projection over the target over, and one just under it a risk', () => {
    expect(budgetStatus(62.4, 60)).toBe('over');
    expect(budgetStatus(59.5, 60)).toBe('risk');
    expect(budgetStatus(50, 60)).toBe('ok');
  });

  it('recalculates a plan from its items', () => {
    const items = [
      { date: '2026-12-01', slot: 'lunch', recipeKey: 'a', name: 'A', estCost: 50 },
      { date: '2026-12-01', slot: 'dinner', recipeKey: 'b', name: 'B', estCost: 70 },
    ];
    const out = recalcPlan(items, 60);
    expect(out.projectedCost).toBe(120);
    expect(out.projectedRate).toBe(60);
    expect(out.status).toBe('risk');
  });
});

/* ------------------------------------------------------------------ *
 * the line the smart layer may not cross
 * ------------------------------------------------------------------ */

describe('the accounting boundary', () => {
  it('leaves the actual rate untouched however the plan projects', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: true, targetRate: 60 });

    /* Two real meals and ৳200 of real cost: the rate is ৳100, whatever any
       plan believes about the future. */
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true, dinner: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 200, category: 'bazar' });

    const beforePlan = await mm.monthlySummary(ctx, ALICE, MONTH);
    if (!beforePlan.ok) throw new Error('expected a summary');
    expect((beforePlan.result as Record<string, unknown>).rate).toBe(100);

    await mm.generatePlan(ctx, ALICE, { month: MONTH, targetRate: 40 });

    const afterPlan = await mm.monthlySummary(ctx, ALICE, MONTH);
    if (!afterPlan.ok) throw new Error('expected a summary');
    expect((afterPlan.result as Record<string, unknown>).rate).toBe(100);
    expect((afterPlan.result as Record<string, unknown>).totalMeals).toBe(2);
  });

  it('keeps estimated and actual apart on the dashboard', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: true, targetRate: 60 });
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 90, category: 'bazar' });
    await mm.generatePlan(ctx, ALICE, { month: MONTH, targetRate: 60 });

    const out = await mm.dashboard(ctx, ALICE, MONTH);
    if (!out.ok) throw new Error('expected a dashboard');

    const view = out.result as Record<string, Record<string, unknown>>;
    expect(view.actual.meals).toBe(1);
    expect(view.actual.rate).toBe(90);
    /* The estimate is present, separately labelled, and is not the actual. */
    expect(view.estimated).not.toBeNull();
    expect(view.estimated.rate).not.toBe(view.actual.rate);
  });
});

/* ------------------------------------------------------------------ *
 * what the module says about itself
 * ------------------------------------------------------------------ */

describe('recommendations', () => {
  it('asks for a target when there is none', async () => {
    const ctx = await mm.ensureMess(ALICE);
    const out = await mm.recommendations(ctx, ALICE, MONTH);
    if (!out.ok) throw new Error('expected recommendations');

    const cards = (out.result as Record<string, unknown>).cards as { kind: string }[];
    expect(cards.some((c) => c.kind === 'set-target')).toBe(true);
  });

  it('says plainly when the month is running over target', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, targetRate: 40 });
    await mm.setMeal(ctx, ALICE, day(1), { lunch: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 90, category: 'bazar' });

    const out = await mm.recommendations(ctx, ALICE, MONTH);
    if (!out.ok) throw new Error('expected recommendations');

    const cards = (out.result as Record<string, unknown>).cards as { kind: string; tone: string }[];
    const status = cards.find((c) => c.kind === 'rate-status');
    expect(status?.tone).toBe('bad');
  });
});

describe('insights', () => {
  it('reports the gap between what was planned and what happened, changing neither', async () => {
    const ctx = await mm.ensureMess(ALICE);
    await mm.saveProfile(ctx, ALICE, { lunch: true, dinner: true, targetRate: 60 });
    await mm.generatePlan(ctx, ALICE, { month: MONTH, targetRate: 60 });

    await mm.setMeal(ctx, ALICE, day(1), { lunch: true });
    await mm.addExpense(ctx, ALICE, { date: day(1), amount: 70, category: 'bazar' });

    const out = await mm.insights(ctx, ALICE, MONTH);
    if (!out.ok) throw new Error('expected insights');

    const view = out.result as Record<string, Record<string, unknown>>;
    expect(view.actual.meals).toBe(1);
    expect(view.estimated).not.toBeNull();
    expect(view.comparison).not.toBeNull();
    /* The comparison reports a difference; it does not resolve one into the other. */
    expect(view.comparison.mealGap).toBe(1 - (view.estimated.meals as number));
  });
});
