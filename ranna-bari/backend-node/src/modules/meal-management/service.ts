import { todayKey } from '../../lib/format.js';

import {
  EXPENSE_CATEGORIES,
  actualCounts,
  expectedMeals,
  expenseTotals,
  isDay,
  isMonth,
  mealRate,
  monthDays,
  monthOf,
  monthStatement,
  perDayFromSchedule,
  portionCostDetail,
  previousMonth,
  priceMap,
  scheduleFor,
} from './calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from './errors.js';
import { estimateVsActual, forecastFor } from './forecast.js';
import {
  alternativesFor,
  buildPlan,
  budgetStatus,
  candidatesFor,
  defaultPreferences,
  historyDepth,
  recalcPlan,
  type Preferences,
} from './planner.js';
import {
  MmActivity,
  MmDailyMeal,
  MmExpense,
  MmMealAudit,
  MmMember,
  MmMess,
  MmMonth,
  MmNotice,
  MmPlan,
  MmProfile,
  MmRecipe,
  MmRecommendation,
} from './models.js';
import { ensureSeed } from './seed.js';

/**
 * Meal management, as operations.
 *
 * Every rule the module has lives here; the route file decides only who is
 * calling and what a refusal looks like on the wire. Two invariants are
 * enforced in this file and nowhere else, because everything funnels through
 * it:
 *
 *   A closed month cannot be written to. Meals and expenses both check, and
 *   both refuse with the same code, so the app can say one thing about it.
 *
 *   Actual meal counts come from `mm_daily_meals`. Schedules and plans are
 *   inputs to projections and are never counted, however convenient it would
 *   be on a dashboard that has both to hand.
 *
 * The caller is always the signed-in account. There is no path in this module
 * that takes a `customerKey` from a request body, so one member cannot read or
 * write another's meals — the general-user boundary the specification draws is
 * a property of the code shape rather than a check that could be forgotten.
 */

export type Caller = { customerKey: string; name?: string | null };

/* ------------------------------------------------------------------ *
 * the mess a caller belongs to
 * ------------------------------------------------------------------ */

export type MessContext = {
  messId: string;
  name: string;
  applicableCategories: string[];
  role: string;
};

/**
 * Find this caller's mess, creating their personal one the first time.
 *
 * The feature has to work for somebody who opens it alone, so an account's
 * first request into the module gets a mess of its own, a membership and a
 * profile carrying the specification's documented student default — breakfast
 * off, lunch and dinner on. Everything after that is ordinary multi-member
 * code paths operating on a mess that happens to have one member.
 */
export async function ensureMess(caller: Caller): Promise<MessContext> {
  await ensureSeed();

  const existing = await MmMember.findOne({ customerKey: caller.customerKey, active: true })
    .sort({ createdAt: 1 })
    .lean();

  if (existing) {
    const mess = await MmMess.findById(existing.messId).lean();
    if (mess) {
      return {
        messId: String(mess._id),
        name: mess.name as string,
        applicableCategories: (mess.applicableCategories as string[]) ?? [],
        role: existing.role as string,
      };
    }
  }

  const mess = await MmMess.create({
    ownerKey: caller.customerKey,
    name: 'My mess',
    personal: true,
    applicableCategories: EXPENSE_CATEGORIES.filter((c) => c.defaultApplicable).map((c) => c.key),
  });

  await MmMember.updateOne(
    { messId: String(mess._id), customerKey: caller.customerKey },
    {
      $setOnInsert: {
        messId: String(mess._id),
        customerKey: caller.customerKey,
        name: caller.name ?? '',
        role: 'owner',
        active: true,
      },
    },
    { upsert: true },
  );

  await MmProfile.updateOne(
    { messId: String(mess._id), customerKey: caller.customerKey },
    {
      $setOnInsert: {
        messId: String(mess._id),
        customerKey: caller.customerKey,
        breakfast: false,
        lunch: true,
        dinner: true,
      },
    },
    { upsert: true },
  );

  return {
    messId: String(mess._id),
    name: mess.name as string,
    applicableCategories: (mess.applicableCategories as string[]) ?? [],
    role: 'owner',
  };
}

/** Is this month frozen? Every write path asks before it writes. */
async function monthIsClosed(messId: string, month: string): Promise<boolean> {
  const row = await MmMonth.findOne({ messId, month }).select('closed').lean();
  return !!row?.closed;
}

const trace = (messId: string, customerKey: string, action: string, summary: string, meta: unknown = {}) =>
  MmActivity.create({ messId, customerKey, action, summary, meta }).catch(() => null);

/* ------------------------------------------------------------------ *
 * profile: schedule, preferences, target
 * ------------------------------------------------------------------ */

export type ProfileView = {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  maxDaily: number;
  targetRate: number | null;
  avoid: string[];
  likes: { food: string; level: string }[];
  proteins: { food: string; perWeek: number }[];
  breakfastPerWeek: number;
  avoidRepeat: boolean;
};

const shapeProfile = (p: Record<string, unknown> | null): ProfileView => ({
  breakfast: !!p?.breakfast,
  lunch: p ? !!p.lunch : true,
  dinner: p ? !!p.dinner : true,
  maxDaily: perDayFromSchedule({
    breakfast: !!p?.breakfast,
    lunch: p ? !!p.lunch : true,
    dinner: p ? !!p.dinner : true,
  }),
  targetRate: (p?.targetRate as number) ?? null,
  avoid: (p?.avoid as string[]) ?? [],
  likes: (p?.likes as { food: string; level: string }[]) ?? [],
  proteins: (p?.proteins as { food: string; perWeek: number }[]) ?? [],
  breakfastPerWeek: (p?.breakfastPerWeek as number) ?? 7,
  avoidRepeat: p?.avoidRepeat === undefined ? true : !!p.avoidRepeat,
});

export async function getProfile(ctx: MessContext, caller: Caller): Promise<ProfileView> {
  const p = await MmProfile.findOne({ messId: ctx.messId, customerKey: caller.customerKey }).lean();
  return shapeProfile(p as Record<string, unknown> | null);
}

export type ProfilePatch = Partial<{
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  targetRate: number | null;
  avoid: string[];
  likes: { food: string; level: string }[];
  proteins: { food: string; perWeek: number }[];
  breakfastPerWeek: number;
  avoidRepeat: boolean;
}>;

export async function saveProfile(
  ctx: MessContext,
  caller: Caller,
  patch: ProfilePatch,
): Promise<MmResult<ProfileView>> {
  if (patch.targetRate !== undefined && patch.targetRate !== null) {
    if (!Number.isFinite(patch.targetRate) || patch.targetRate <= 0) {
      return mmFail(MM_ERR.BAD_AMOUNT, { field: 'targetRate' });
    }
  }
  if (patch.breakfastPerWeek !== undefined) {
    if (!Number.isInteger(patch.breakfastPerWeek) || patch.breakfastPerWeek < 0 || patch.breakfastPerWeek > 7) {
      return mmFail(MM_ERR.BAD_REQUEST, { field: 'breakfastPerWeek' });
    }
  }

  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[k] = v;

  await MmProfile.updateOne(
    { messId: ctx.messId, customerKey: caller.customerKey },
    { $set: set, $setOnInsert: { messId: ctx.messId, customerKey: caller.customerKey } },
    { upsert: true },
  );

  await trace(ctx.messId, caller.customerKey, 'profile.save', 'Updated meal settings', set);
  return mmOk(await getProfile(ctx, caller));
}

/* ------------------------------------------------------------------ *
 * meals — the entries everything financial rests on
 * ------------------------------------------------------------------ */

export type MealRow = {
  date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  guest: number;
  total: number;
};

/**
 * A month of this caller's meals, every day present.
 *
 * Days with no row come back as zeros rather than gaps: a calendar has to draw
 * every square, and making the client invent the missing ones is how a missing
 * day becomes a silently different number on two screens.
 */
export async function listMeals(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<{ month: string; days: MealRow[]; counts: Awaited<ReturnType<typeof actualCounts>>; closed: boolean }>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });

  const [rows, counts, closed] = await Promise.all([
    MmDailyMeal.find({ messId: ctx.messId, customerKey: caller.customerKey, month }).lean(),
    actualCounts(ctx.messId, caller.customerKey, month),
    monthIsClosed(ctx.messId, month),
  ]);

  const byDate = new Map(rows.map((r) => [r.date as string, r]));
  const days: MealRow[] = monthDays(month).map((date) => {
    const r = byDate.get(date);
    return {
      date,
      breakfast: !!r?.breakfast,
      lunch: !!r?.lunch,
      dinner: !!r?.dinner,
      guest: (r?.guest as number) ?? 0,
      total: (r?.total as number) ?? 0,
    };
  });

  return mmOk({ month, days, counts, closed });
}

export type MealPatch = Partial<{ breakfast: boolean; lunch: boolean; dinner: boolean; guest: number }>;

/**
 * Record what this caller ate on a day.
 *
 * Refuses inside a closed month, and writes the before/after pair to the audit
 * trail on every change — the specification wants a corrected entry to leave
 * both values legible rather than replacing one with the other.
 */
export async function setMeal(
  ctx: MessContext,
  caller: Caller,
  date: string,
  patch: MealPatch,
): Promise<MmResult<MealRow>> {
  if (!isDay(date)) return mmFail(MM_ERR.BAD_DATE, { field: 'date' });
  if (patch.guest !== undefined && (!Number.isInteger(patch.guest) || patch.guest < 0 || patch.guest > 20)) {
    return mmFail(MM_ERR.BAD_AMOUNT, { field: 'guest' });
  }

  const month = monthOf(date);
  if (await monthIsClosed(ctx.messId, month)) return mmFail(MM_ERR.MONTH_CLOSED, { month });

  const existing = await MmDailyMeal.findOne({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    date,
  }).lean();

  const before = existing
    ? {
        breakfast: !!existing.breakfast,
        lunch: !!existing.lunch,
        dinner: !!existing.dinner,
        guest: (existing.guest as number) ?? 0,
      }
    : { breakfast: false, lunch: false, dinner: false, guest: 0 };

  const after = { ...before, ...stripUndefined(patch) };
  const total =
    (after.breakfast ? 1 : 0) + (after.lunch ? 1 : 0) + (after.dinner ? 1 : 0) + (after.guest ?? 0);

  await MmDailyMeal.updateOne(
    { messId: ctx.messId, customerKey: caller.customerKey, date },
    {
      $set: { ...after, total, month, updatedBy: caller.customerKey },
      $setOnInsert: {
        messId: ctx.messId,
        customerKey: caller.customerKey,
        date,
        createdBy: caller.customerKey,
      },
    },
    { upsert: true },
  );

  await MmMealAudit.create({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    date,
    action: 'set',
    before,
    after,
    by: caller.customerKey,
  });

  return mmOk({ date, ...after, total });
}

/**
 * Turn sittings on or off across a run of days.
 *
 * The specification's bulk case is somebody going home for a week, so the
 * range is inclusive at both ends and the write is one `bulkWrite` rather than
 * a loop of round trips. Every day still gets its own audit row — a bulk
 * action that left no trace would be the one worth tracing.
 */
export async function bulkMeals(
  ctx: MessContext,
  caller: Caller,
  args: { from: string; to: string; slots: string[]; value: boolean },
): Promise<MmResult<{ changed: number; from: string; to: string }>> {
  const { from, to, slots, value } = args;
  if (!isDay(from) || !isDay(to)) return mmFail(MM_ERR.BAD_DATE);
  if (from > to) return mmFail(MM_ERR.BAD_DATE, { field: 'range' });
  if (!slots.length || slots.some((s) => !['breakfast', 'lunch', 'dinner'].includes(s))) {
    return mmFail(MM_ERR.BAD_REQUEST, { field: 'slots' });
  }

  /* A range may straddle a month boundary; refuse if any part of it is frozen. */
  const months = new Set<string>();
  const days: string[] = [];
  for (const d of monthDays(monthOf(from)).concat(monthOf(to) === monthOf(from) ? [] : monthDays(monthOf(to)))) {
    if (d >= from && d <= to) {
      days.push(d);
      months.add(monthOf(d));
    }
  }
  for (const m of months) {
    if (await monthIsClosed(ctx.messId, m)) return mmFail(MM_ERR.MONTH_CLOSED, { month: m });
  }

  const existing = await MmDailyMeal.find({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    date: { $gte: from, $lte: to },
  }).lean();
  const byDate = new Map(existing.map((r) => [r.date as string, r]));

  const writes = [];
  const audits = [];

  for (const date of days) {
    const r = byDate.get(date);
    const before = {
      breakfast: !!r?.breakfast,
      lunch: !!r?.lunch,
      dinner: !!r?.dinner,
      guest: (r?.guest as number) ?? 0,
    };
    const after = { ...before };
    for (const s of slots) (after as Record<string, unknown>)[s] = value;

    if (
      before.breakfast === after.breakfast &&
      before.lunch === after.lunch &&
      before.dinner === after.dinner
    ) {
      continue;
    }

    const total =
      (after.breakfast ? 1 : 0) + (after.lunch ? 1 : 0) + (after.dinner ? 1 : 0) + after.guest;

    writes.push({
      updateOne: {
        filter: { messId: ctx.messId, customerKey: caller.customerKey, date },
        update: {
          $set: { ...after, total, month: monthOf(date), updatedBy: caller.customerKey },
          $setOnInsert: {
            messId: ctx.messId,
            customerKey: caller.customerKey,
            date,
            createdBy: caller.customerKey,
          },
        },
        upsert: true,
      },
    });

    audits.push({
      messId: ctx.messId,
      customerKey: caller.customerKey,
      date,
      action: 'bulk',
      before,
      after,
      by: caller.customerKey,
    });
  }

  if (writes.length) {
    await MmDailyMeal.bulkWrite(writes);
    await MmMealAudit.insertMany(audits);
    await trace(
      ctx.messId,
      caller.customerKey,
      'meals.bulk',
      `${value ? 'Turned on' : 'Turned off'} ${slots.join(', ')} from ${from} to ${to}`,
      { changed: writes.length },
    );
  }

  return mmOk({ changed: writes.length, from, to });
}

const stripUndefined = <T extends Record<string, unknown>>(o: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
};

/* ------------------------------------------------------------------ *
 * expenses
 * ------------------------------------------------------------------ */

export async function listExpenses(
  ctx: MessContext,
  month: string,
): Promise<MmResult<{ month: string; expenses: unknown[]; totals: Awaited<ReturnType<typeof expenseTotals>>; closed: boolean }>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });

  const [rows, totals, closed] = await Promise.all([
    MmExpense.find({ messId: ctx.messId, month }).sort({ date: -1, createdAt: -1 }).lean(),
    expenseTotals(ctx.messId, month, ctx.applicableCategories),
    monthIsClosed(ctx.messId, month),
  ]);

  return mmOk({
    month,
    closed,
    totals,
    expenses: rows.map((r) => ({
      id: String(r._id),
      date: r.date,
      amount: r.amount,
      category: r.category,
      vendor: r.vendor ?? '',
      method: r.method ?? 'cash',
      note: r.note ?? '',
      hasReceipt: !!r.receipt,
      createdBy: r.createdBy ?? '',
      createdAt: r.createdAt,
    })),
  });
}

export async function addExpense(
  ctx: MessContext,
  caller: Caller,
  args: { date: string; amount: number; category: string; vendor?: string; method?: string; note?: string; receipt?: string },
): Promise<MmResult<{ id: string }>> {
  if (!isDay(args.date)) return mmFail(MM_ERR.BAD_DATE, { field: 'date' });
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    return mmFail(MM_ERR.BAD_AMOUNT, { field: 'amount' });
  }
  if (!EXPENSE_CATEGORIES.some((c) => c.key === args.category)) {
    return mmFail(MM_ERR.BAD_REQUEST, { field: 'category' });
  }

  const month = monthOf(args.date);
  if (await monthIsClosed(ctx.messId, month)) return mmFail(MM_ERR.MONTH_CLOSED, { month });

  const row = await MmExpense.create({
    messId: ctx.messId,
    date: args.date,
    month,
    amount: Math.round(args.amount),
    category: args.category,
    vendor: args.vendor ?? '',
    method: args.method ?? 'cash',
    note: args.note ?? '',
    receipt: args.receipt ?? '',
    createdBy: caller.customerKey,
  });

  await trace(ctx.messId, caller.customerKey, 'expense.add', `Added ৳${Math.round(args.amount)} ${args.category}`, {
    id: String(row._id),
  });

  return mmOk({ id: String(row._id) });
}

export async function removeExpense(
  ctx: MessContext,
  caller: Caller,
  id: string,
): Promise<MmResult<{ id: string }>> {
  const row = await MmExpense.findOne({ _id: id, messId: ctx.messId }).lean().catch(() => null);
  if (!row) return mmFail(MM_ERR.NO_EXPENSE);
  if (await monthIsClosed(ctx.messId, row.month as string)) {
    return mmFail(MM_ERR.MONTH_CLOSED, { month: row.month });
  }

  await MmExpense.deleteOne({ _id: id, messId: ctx.messId });
  await trace(ctx.messId, caller.customerKey, 'expense.remove', `Removed ৳${row.amount} ${row.category}`, { id });
  return mmOk({ id });
}

/** Which categories count toward this mess's rate. The owner's own budget setting. */
export async function saveCategories(
  ctx: MessContext,
  caller: Caller,
  categories: string[],
): Promise<MmResult<{ applicableCategories: string[] }>> {
  const valid = categories.filter((c) => EXPENSE_CATEGORIES.some((e) => e.key === c));
  await MmMess.updateOne({ _id: ctx.messId }, { $set: { applicableCategories: valid } });
  await trace(ctx.messId, caller.customerKey, 'mess.categories', 'Changed which costs count', { valid });
  return mmOk({ applicableCategories: valid });
}

/* ------------------------------------------------------------------ *
 * the month
 * ------------------------------------------------------------------ */

/**
 * A month's figures.
 *
 * A closed month is served from its snapshot and an open one is recomputed —
 * the two paths return the same shape so the screen cannot tell them apart
 * except by the `closed` flag it is meant to show.
 */
export async function monthlySummary(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });

  const snapshot = await MmMonth.findOne({ messId: ctx.messId, month }).lean();

  if (snapshot?.closed) {
    const mine = (snapshot.members as unknown as Record<string, unknown>[]).find(
      (m) => m.customerKey === caller.customerKey,
    );
    return mmOk({
      month,
      closed: true,
      closedAt: snapshot.closedAt,
      rate: snapshot.rate,
      totalMeals: snapshot.totalMeals,
      applicableCost: snapshot.applicableCost,
      totalCost: snapshot.totalCost,
      categories: snapshot.categories,
      mine: mine ?? null,
      members: snapshot.members,
      comparison: await compareToPrevious(ctx, caller, month, (snapshot.rate as number) ?? 0),
    });
  }

  const statement = await monthStatement(ctx.messId, month, ctx.applicableCategories);
  const mine = statement.members.find((m) => m.customerKey === caller.customerKey) ?? null;

  return mmOk({
    month,
    closed: false,
    rate: statement.rate,
    totalMeals: statement.totalMeals,
    applicableCost: statement.applicableCost,
    totalCost: statement.totalCost,
    categories: statement.categories,
    mine,
    members: statement.members,
    comparison: await compareToPrevious(ctx, caller, month, statement.rate),
  });
}

/** Last month's rate and meals beside this month's, when there was a last month. */
async function compareToPrevious(
  ctx: MessContext,
  caller: Caller,
  month: string,
  currentRate: number,
): Promise<Record<string, unknown> | null> {
  const prev = previousMonth(month);
  const snapshot = await MmMonth.findOne({ messId: ctx.messId, month: prev }).lean();

  let rate: number;
  let meals: number;

  if (snapshot?.closed) {
    rate = (snapshot.rate as number) ?? 0;
    const mine = (snapshot.members as unknown as Record<string, unknown>[]).find(
      (m) => m.customerKey === caller.customerKey,
    );
    meals = (mine?.meals as number) ?? 0;
  } else {
    const [counts, expenses] = await Promise.all([
      actualCounts(ctx.messId, caller.customerKey, prev),
      expenseTotals(ctx.messId, prev, ctx.applicableCategories),
    ]);
    if (!counts.total && !expenses.applicable) return null;
    const statement = await monthStatement(ctx.messId, prev, ctx.applicableCategories);
    rate = statement.rate;
    meals = counts.total;
  }

  if (!rate && !meals) return null;

  return {
    month: prev,
    rate,
    meals,
    rateChange: Math.round((currentRate - rate) * 100) / 100,
  };
}

/**
 * Freeze a month.
 *
 * The snapshot is computed once, from the same deterministic statement the
 * open month was showing, and stored whole. Nothing recomputes it afterwards —
 * that is the entire point, and it is why the figures inside are copied rather
 * than referenced.
 */
export async function closeMonth(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });
  if (await monthIsClosed(ctx.messId, month)) return mmFail(MM_ERR.ALREADY_CLOSED, { month });

  const statement = await monthStatement(ctx.messId, month, ctx.applicableCategories);
  if (!statement.totalMeals) return mmFail(MM_ERR.NOTHING_TO_CLOSE, { month });

  await MmMonth.updateOne(
    { messId: ctx.messId, month },
    {
      $set: {
        closed: true,
        closedAt: new Date(),
        closedBy: caller.customerKey,
        applicableCost: statement.applicableCost,
        totalCost: statement.totalCost,
        totalMeals: statement.totalMeals,
        rate: statement.rate,
        members: statement.members,
        categories: statement.categories,
      },
      $setOnInsert: { messId: ctx.messId, month },
    },
    { upsert: true },
  );

  await MmNotice.create({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    kind: 'month-closed',
    title: `${month} is settled`,
    body: `Final rate ৳${statement.rate} across ${statement.totalMeals} meals.`,
  });

  await trace(ctx.messId, caller.customerKey, 'month.close', `Closed ${month} at ৳${statement.rate}`, {
    month,
  });

  return mmOk({ ...statement, closed: true });
}

/* ------------------------------------------------------------------ *
 * the dashboard
 * ------------------------------------------------------------------ */

/**
 * Everything the landing screen shows, in one request.
 *
 * Assembled here rather than by the client calling six endpoints: the figures
 * have to agree with each other, and six requests can interleave with a write
 * and disagree. Estimated and actual are both present and separately labelled
 * — that pairing is the screen's whole job.
 */
export async function dashboard(
  ctx: MessContext,
  caller: Caller,
  month?: string,
): Promise<MmResult<Record<string, unknown>>> {
  const today = todayKey();
  const target = month && isMonth(month) ? month : monthOf(today);

  const [profile, todayRow, counts, statement, plan, closed, unread] = await Promise.all([
    getProfile(ctx, caller),
    MmDailyMeal.findOne({ messId: ctx.messId, customerKey: caller.customerKey, date: today }).lean(),
    actualCounts(ctx.messId, caller.customerKey, target),
    monthStatement(ctx.messId, target, ctx.applicableCategories),
    MmPlan.findOne({ messId: ctx.messId, customerKey: caller.customerKey, month: target }).lean(),
    monthIsClosed(ctx.messId, target),
    MmNotice.countDocuments({ customerKey: caller.customerKey, read: false }),
  ]);

  const mine = statement.members.find((m) => m.customerKey === caller.customerKey) ?? null;

  /* What this person's own meals cost at the mess rate — actual, from entries. */
  const actualCost = mine?.share ?? 0;

  return mmOk({
    today,
    month: target,
    closed,
    mess: { id: ctx.messId, name: ctx.name, role: ctx.role },
    unread,

    todayMeals: {
      date: today,
      breakfast: !!todayRow?.breakfast,
      lunch: !!todayRow?.lunch,
      dinner: !!todayRow?.dinner,
      guest: (todayRow?.guest as number) ?? 0,
      total: (todayRow?.total as number) ?? 0,
    },

    /* Actual — from entries, the only true count. */
    actual: {
      breakfast: counts.breakfast,
      lunch: counts.lunch,
      dinner: counts.dinner,
      guest: counts.guest,
      meals: counts.total,
      rate: statement.rate,
      cost: actualCost,
      applicableCost: statement.applicableCost,
      messMeals: statement.totalMeals,
    },

    /* Estimated — from the plan, frozen at generation. Never mixed with the above. */
    estimated: plan
      ? {
          meals: plan.expectedMeals,
          cost: plan.projectedCost,
          rate: plan.projectedRate,
          status: plan.status,
          confidence: plan.confidence,
        }
      : null,

    schedule: {
      breakfast: profile.breakfast,
      lunch: profile.lunch,
      dinner: profile.dinner,
      maxDaily: profile.maxDaily,
    },

    target: {
      rate: profile.targetRate,
      status: profile.targetRate ? budgetStatus(statement.rate || 0, profile.targetRate) : null,
      difference:
        profile.targetRate && statement.rate
          ? Math.round((statement.rate - profile.targetRate) * 100) / 100
          : null,
    },

    plan: plan
      ? {
          month: plan.month,
          items: (plan.items as unknown[]).length,
          projectedRate: plan.projectedRate,
          status: plan.status,
          explanation: plan.explanation,
        }
      : null,
  });
}

/* ------------------------------------------------------------------ *
 * the planner
 * ------------------------------------------------------------------ */

const prefsOf = (p: ProfileView): Preferences => ({
  ...defaultPreferences(),
  avoid: p.avoid,
  likes: p.likes,
  proteins: p.proteins,
  breakfastPerWeek: p.breakfastPerWeek,
  avoidRepeat: p.avoidRepeat,
});

export async function getPlan(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<Record<string, unknown> | null>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });
  const plan = await MmPlan.findOne({ messId: ctx.messId, customerKey: caller.customerKey, month }).lean();
  if (!plan) return mmOk(null);
  return mmOk(shapePlan(plan));
}

const shapePlan = (p: Record<string, unknown>): Record<string, unknown> => ({
  id: String(p._id),
  month: p.month,
  targetRate: p.targetRate,
  expectedMeals: p.expectedMeals,
  targetBudget: p.targetBudget,
  items: p.items,
  projectedCost: p.projectedCost,
  projectedRate: p.projectedRate,
  status: p.status,
  confidence: p.confidence,
  explanation: p.explanation,
  updatedAt: p.updatedAt,
});

/**
 * Generate a plan for a month.
 *
 * Regenerating from today rather than the first of the month when the month is
 * already running: a plan that budgets for days already eaten is worse than no
 * plan, because it looks authoritative.
 */
export async function generatePlan(
  ctx: MessContext,
  caller: Caller,
  args: { month: string; targetRate?: number },
): Promise<MmResult<Record<string, unknown>>> {
  const { month } = args;
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE, { field: 'month' });

  const profile = await getProfile(ctx, caller);
  const targetRate = args.targetRate ?? profile.targetRate;
  if (!targetRate || targetRate <= 0) return mmFail(MM_ERR.NO_TARGET);

  const schedule = { breakfast: profile.breakfast, lunch: profile.lunch, dinner: profile.dinner };
  if (!perDayFromSchedule(schedule)) return mmFail(MM_ERR.BAD_REQUEST, { field: 'schedule' });

  const prices = await priceMap();
  const today = todayKey();
  const fromDay = monthOf(today) === month ? today : undefined;

  const built = await buildPlan({
    month,
    schedule,
    prefs: prefsOf(profile),
    targetRate,
    prices,
    fromDay,
    historyMonths: await historyDepth(ctx.messId, caller.customerKey, month),
  });

  if (!built.items.length) return mmFail(MM_ERR.NO_CANDIDATES);

  await MmPlan.updateOne(
    { messId: ctx.messId, customerKey: caller.customerKey, month },
    {
      $set: {
        targetRate,
        expectedMeals: built.expectedMeals,
        targetBudget: built.targetBudget,
        items: built.items,
        projectedCost: built.projectedCost,
        projectedRate: built.projectedRate,
        status: built.status,
        confidence: built.confidence,
        explanation: built.explanation,
      },
      $setOnInsert: { messId: ctx.messId, customerKey: caller.customerKey, month },
    },
    { upsert: true },
  );

  /* The record a learned layer would later train on: what was suggested, and
     (once the person acts) whether they took it. */
  await MmRecommendation.create({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    month,
    kind: 'plan',
    payload: {
      targetRate,
      projectedRate: built.projectedRate,
      status: built.status,
      meals: built.expectedMeals,
    },
  });

  if (built.status !== 'ok') {
    await MmNotice.create({
      messId: ctx.messId,
      customerKey: caller.customerKey,
      kind: built.status === 'over' ? 'target-over' : 'target-risk',
      title: `Projected rate ৳${built.projectedRate}`,
      body: `Your target is ৳${targetRate}.`,
    });
  }

  await trace(ctx.messId, caller.customerKey, 'plan.generate', `Planned ${month} at ৳${built.projectedRate}`, {
    month,
  });

  const saved = await MmPlan.findOne({ messId: ctx.messId, customerKey: caller.customerKey, month }).lean();
  return mmOk(shapePlan(saved as Record<string, unknown>));
}

/** Cheaper stand-ins for one planned meal. */
export async function planAlternatives(
  ctx: MessContext,
  caller: Caller,
  args: { month: string; index: number },
): Promise<MmResult<{ current: unknown; alternatives: unknown[] }>> {
  const plan = await MmPlan.findOne({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    month: args.month,
  }).lean();
  if (!plan) return mmFail(MM_ERR.NO_PLAN);

  const items = plan.items as { date: string; slot: string; recipeKey: string; name: string; estCost: number }[];
  const item = items[args.index];
  if (!item) return mmFail(MM_ERR.NO_ITEM, { index: args.index });

  const profile = await getProfile(ctx, caller);
  const prices = await priceMap();
  const alternatives = await alternativesFor(item, prices, prefsOf(profile));

  return mmOk({ current: item, alternatives });
}

/**
 * Swap one planned meal, and re-derive the projection.
 *
 * The other items keep the cost they were estimated at. Only the replaced one
 * is re-costed, which is what makes the "estimated ৳65, now ৳48" comparison on
 * the screen mean anything.
 */
export async function replacePlanItem(
  ctx: MessContext,
  caller: Caller,
  args: { month: string; index: number; recipeKey: string },
): Promise<MmResult<Record<string, unknown>>> {
  const plan = await MmPlan.findOne({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    month: args.month,
  }).lean();
  if (!plan) return mmFail(MM_ERR.NO_PLAN);

  const items = (plan.items as { date: string; slot: string; recipeKey: string; name: string; estCost: number; replaced?: boolean }[]).slice();
  const item = items[args.index];
  if (!item) return mmFail(MM_ERR.NO_ITEM, { index: args.index });

  const recipe = await MmRecipe.findOne({ key: args.recipeKey, active: true }).lean();
  if (!recipe) return mmFail(MM_ERR.NO_RECIPE, { recipeKey: args.recipeKey });

  const prices = await priceMap();
  const detail = portionCostDetail(
    {
      ingredients: (recipe.ingredients ?? []) as { foodKey: string; qty: number; unit: string }[],
      sundries: (recipe.sundries as number) ?? 0,
    },
    prices,
  );

  const was = item.estCost;
  items[args.index] = {
    ...item,
    recipeKey: recipe.key as string,
    name: recipe.name as string,
    estCost: detail.cost,
    replaced: true,
  };

  const totals = recalcPlan(items, plan.targetRate as number);

  await MmPlan.updateOne(
    { _id: plan._id },
    {
      $set: {
        items,
        ...totals,
        explanation:
          totals.status === 'over'
            ? `Swapping to ${recipe.name} saved ৳${Math.max(0, was - detail.cost)}, but the plan still averages ৳${totals.projectedRate} against a ৳${plan.targetRate} target.`
            : `Swapping to ${recipe.name} brings the plan to ৳${totals.projectedRate} a meal, inside your ৳${plan.targetRate} target.`,
      },
    },
  );

  /* Feedback: the suggestion was taken. */
  await MmRecommendation.create({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    month: args.month,
    kind: 'swap',
    payload: { from: item.recipeKey, to: recipe.key, was, now: detail.cost },
    accepted: true,
    actedAt: new Date(),
  });

  const saved = await MmPlan.findOne({ _id: plan._id }).lean();
  return mmOk(shapePlan(saved as Record<string, unknown>));
}

/** Record that a suggestion was declined — the other half of the training pair. */
export async function rejectSuggestion(
  ctx: MessContext,
  caller: Caller,
  args: { month: string; from: string; to: string },
): Promise<MmResult<{ logged: true }>> {
  await MmRecommendation.create({
    messId: ctx.messId,
    customerKey: caller.customerKey,
    month: args.month,
    kind: 'swap',
    payload: { from: args.from, to: args.to },
    accepted: false,
    actedAt: new Date(),
  });
  return mmOk({ logged: true });
}

/* ------------------------------------------------------------------ *
 * recommendations, forecast, reference data
 * ------------------------------------------------------------------ */

/**
 * What the module has to say right now.
 *
 * Everything here is derived at read time from figures the person can check —
 * the month's own rate against their target, the plan's costliest meals, what
 * attendance has been doing. Nothing is generated text.
 */
export async function recommendations(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  const [profile, statement, plan, counts] = await Promise.all([
    getProfile(ctx, caller),
    monthStatement(ctx.messId, month, ctx.applicableCategories),
    MmPlan.findOne({ messId: ctx.messId, customerKey: caller.customerKey, month }).lean(),
    actualCounts(ctx.messId, caller.customerKey, month),
  ]);

  const cards: Record<string, unknown>[] = [];

  if (!profile.targetRate) {
    cards.push({
      kind: 'set-target',
      tone: 'info',
      title: 'Set a target meal rate',
      body: 'Tell the planner what you want to pay per meal and it can build a month around it.',
    });
  }

  if (profile.targetRate && statement.rate) {
    const status = budgetStatus(statement.rate, profile.targetRate);
    const gap = Math.round((statement.rate - profile.targetRate) * 100) / 100;
    cards.push({
      kind: 'rate-status',
      tone: status === 'over' ? 'bad' : status === 'risk' ? 'warn' : 'good',
      title:
        status === 'over'
          ? `You are ৳${Math.abs(gap)} a meal over target`
          : status === 'risk'
            ? 'You are close to your target'
            : `You are ৳${Math.abs(gap)} a meal under target`,
      body: `This month is running at ৳${statement.rate} a meal against your ৳${profile.targetRate} target, across ${counts.total} meals.`,
    });
  }

  /* The costliest planned meals are where a swap actually recovers money. */
  if (plan) {
    const items = (plan.items as { name: string; estCost: number; date: string; slot: string }[]) ?? [];
    const dearest = items
      .map((it, index) => ({ ...it, index }))
      .sort((a, b) => b.estCost - a.estCost)
      .slice(0, 3);

    if (plan.status !== 'ok' && dearest.length) {
      cards.push({
        kind: 'swap',
        tone: 'warn',
        title: 'Swap the costliest meals first',
        body: `${dearest.map((d) => `${d.name} (৳${d.estCost})`).join(', ')} are the dearest meals in your plan.`,
        items: dearest,
      });
    }
  }

  if (counts.total === 0) {
    cards.push({
      kind: 'log-meals',
      tone: 'info',
      title: 'Log your meals to get a real rate',
      body: 'Your meal rate is worked out from the meals you actually record — nothing else counts toward it.',
    });
  }

  return mmOk({ month, cards, explanation: plan?.explanation ?? '' });
}

export async function forecast(ctx: MessContext, caller: Caller): Promise<MmResult<Record<string, unknown>>> {
  const schedule = await scheduleFor(ctx.messId, caller.customerKey);
  const out = await forecastFor(ctx.messId, todayKey(), schedule);
  return mmOk(out as unknown as Record<string, unknown>);
}

/** The costed dish book, for the planner screens. */
export async function listRecipes(slot?: string): Promise<MmResult<{ recipes: unknown[] }>> {
  await ensureSeed();
  const prices = await priceMap();
  const query: Record<string, unknown> = { active: true };
  if (slot) query.slot = slot === 'dinner' ? 'lunch' : slot;

  const recipes = await MmRecipe.find(query).lean();
  return mmOk({
    recipes: recipes.map((r) => {
      const detail = portionCostDetail(
        {
          ingredients: (r.ingredients ?? []) as { foodKey: string; qty: number; unit: string }[],
          sundries: (r.sundries as number) ?? 0,
        },
        prices,
      );
      return {
        key: r.key,
        name: r.name,
        slot: r.slot,
        protein: r.protein,
        tags: r.tags,
        cost: detail.cost,
        lines: detail.lines,
        available: detail.available,
      };
    }),
  });
}

/** The price list, read-only to a general user. */
export async function listFoods(): Promise<MmResult<{ foods: unknown[] }>> {
  await ensureSeed();
  const prices = await priceMap();
  return mmOk({
    foods: Object.entries(prices).map(([key, f]) => ({
      key,
      name: f.name,
      unit: f.unit,
      price: f.price,
      available: f.available,
    })),
  });
}

/* ------------------------------------------------------------------ *
 * notices
 * ------------------------------------------------------------------ */

export async function listNotices(caller: Caller): Promise<MmResult<{ notices: unknown[]; unread: number }>> {
  const rows = await MmNotice.find({ customerKey: caller.customerKey }).sort({ at: -1 }).limit(50).lean();
  return mmOk({
    unread: rows.filter((r) => !r.read).length,
    notices: rows.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      title: r.title,
      body: r.body,
      read: r.read,
      at: r.at,
    })),
  });
}

export async function readNotices(caller: Caller): Promise<MmResult<{ read: number }>> {
  const out = await MmNotice.updateMany(
    { customerKey: caller.customerKey, read: false },
    { $set: { read: true } },
  );
  return mmOk({ read: out.modifiedCount ?? 0 });
}

/* ------------------------------------------------------------------ *
 * insights — estimated against actual
 * ------------------------------------------------------------------ */

/**
 * How well the last plan predicted the month it planned.
 *
 * The feedback loop the specification describes, made visible: the estimate is
 * shown beside the outcome and neither is adjusted to match the other.
 */
export async function insights(
  ctx: MessContext,
  caller: Caller,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  const [plan, counts, statement, recs] = await Promise.all([
    MmPlan.findOne({ messId: ctx.messId, customerKey: caller.customerKey, month }).lean(),
    actualCounts(ctx.messId, caller.customerKey, month),
    monthStatement(ctx.messId, month, ctx.applicableCategories),
    MmRecommendation.find({ messId: ctx.messId, customerKey: caller.customerKey })
      .sort({ at: -1 })
      .limit(50)
      .lean(),
  ]);

  const mine = statement.members.find((m) => m.customerKey === caller.customerKey);

  const comparison = plan
    ? estimateVsActual({
        estimatedCost: (plan.projectedCost as number) ?? 0,
        estimatedMeals: (plan.expectedMeals as number) ?? 0,
        actualMeals: counts.total,
        actualCost: mine?.share ?? 0,
      })
    : null;

  const swaps = recs.filter((r) => r.kind === 'swap');

  return mmOk({
    month,
    comparison,
    estimated: plan
      ? { meals: plan.expectedMeals, cost: plan.projectedCost, rate: plan.projectedRate }
      : null,
    actual: { meals: counts.total, cost: mine?.share ?? 0, rate: statement.rate },
    feedback: {
      suggestions: recs.length,
      accepted: swaps.filter((s) => s.accepted === true).length,
      rejected: swaps.filter((s) => s.accepted === false).length,
    },
  });
}

/** Every month this mess has data for, newest first — the month picker's source. */
export async function listMonths(ctx: MessContext): Promise<MmResult<{ months: unknown[] }>> {
  const [mealMonths, expenseMonths, closed] = await Promise.all([
    MmDailyMeal.distinct('month', { messId: ctx.messId }),
    MmExpense.distinct('month', { messId: ctx.messId }),
    MmMonth.find({ messId: ctx.messId }).select('month closed').lean(),
  ]);

  const closedSet = new Set(closed.filter((c) => c.closed).map((c) => c.month as string));
  const all = new Set<string>([...mealMonths, ...expenseMonths, monthOf(todayKey())]);

  return mmOk({
    months: [...all]
      .sort((a, b) => (a < b ? 1 : -1))
      .map((month) => ({ month, closed: closedSet.has(month) })),
  });
}

export { EXPENSE_CATEGORIES, expectedMeals, mealRate, candidatesFor };
