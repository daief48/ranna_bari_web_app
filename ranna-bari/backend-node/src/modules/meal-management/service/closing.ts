import {
  buildStatement,
  isMonth,
  monthRange,
  previousMonth,
  round2,
  type Statement,
} from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import {
  MmAdjustment,
  MmAllocation,
  MmBazar,
  MmDeposit,
  MmExpense,
  MmMealEntry,
  MmMealRequest,
  MmSession,
} from '../models.js';

import {
  allowed,
  audit,
  deny,
  idOf,
  membersForMonth,
  notifyEveryone,
  rateTypesOf,
  todayIn,
  type MessContext,
} from './context.js';
import { pendingCounts } from './money.js';

/**
 * The monthly accounting session. §4.8.
 *
 * A month has two lives. While it is open, every figure is computed from the
 * records as they stand — ask twice, get two answers, because somebody ate in
 * between. Once it is closed, the figures are a snapshot on the session row
 * and are never recomputed again.
 *
 * That is the whole point of closing, and it is why `statementFor` branches on
 * the session's status rather than always recomputing: a settled month that
 * silently re-derives itself would change a year later when somebody edits a
 * category label, and §12 requires that a closed month keeps saying what it
 * said.
 *
 * §4.8's other rule — *historical data must never be silently deleted* — is
 * why there is no reopen. A mistake found after settlement becomes an
 * adjustment, which is visible as its own line rather than as a snapshot that
 * quietly disagrees with the report somebody already screenshotted.
 */

/* ------------------------------------------------------------------ *
 * gathering a month
 * ------------------------------------------------------------------ */

/**
 * Every record a month's arithmetic needs, in one pass.
 *
 * Loaded together rather than by the piece so that the statement, the report,
 * the PDF and the close all see the same month — the alternative is four
 * callers each fetching three quarters of it slightly differently.
 */
async function gather(ctx: MessContext, month: string) {
  const { from, to } = monthRange(month, ctx.settings?.monthStartDay ?? 1);

  const [entries, expenses, bazars, deposits, adjustments] = await Promise.all([
    MmMealEntry.find({ messId: ctx.messId, month }).lean(),
    MmExpense.find({ messId: ctx.messId, month }).lean(),
    MmBazar.find({ messId: ctx.messId, month }).lean(),
    MmDeposit.find({ messId: ctx.messId, month }).lean(),
    MmAdjustment.find({ messId: ctx.messId, month }).lean(),
  ]);

  /* Only approved expenses get their allocations counted — an unapproved
     expense has rows in `mm_expense_allocations` because it was written with
     a split, and those rows must not reach a bill. */
  const approvedIds = expenses.filter((e) => e.status === 'approved').map((e) => idOf(e._id));

  const allocations = approvedIds.length
    ? await MmAllocation.find({ messId: ctx.messId, expenseId: { $in: approvedIds } }).lean()
    : [];

  /* §9's mid-month joiner and leaver: anybody with a record in the month is
     billed for it, whether or not they are active today. */
  const touched = new Set<string>([
    ...entries.map((e) => e.memberId),
    ...deposits.map((d) => d.memberId),
    ...allocations.map((a) => a.memberId),
    ...adjustments.map((a) => a.memberId),
  ]);

  const members = await membersForMonth(ctx.messId, [...touched]);

  return { from, to, entries, expenses, bazars, deposits, adjustments, allocations, members };
}

/** What the previous month left each member holding. §4.8's carry-forward. */
async function carriedFrom(ctx: MessContext, month: string): Promise<Record<string, number>> {
  if (ctx.settings?.carryForwardBalances === false) return {};

  const prior = await MmSession.findOne({
    messId: ctx.messId,
    month: previousMonth(month),
    status: { $in: ['closed', 'archived'] },
  }).lean();

  if (!prior) return {};

  const out: Record<string, number> = {};
  for (const row of prior.members ?? []) {
    /* A snapshot row with no member id is not something that should exist,
       but the embedded schema does not require one and a crash here would
       take the whole month's summary down with it. */
    if (row.memberId && row.carriedOut) out[row.memberId] = round2(row.carriedOut);
  }
  return out;
}

/** Run the engine over a live month. */
async function computeStatement(ctx: MessContext, month: string): Promise<Statement> {
  const data = await gather(ctx, month);
  const carriedIn = await carriedFrom(ctx, month);

  return buildStatement({
    month,
    members: data.members.map((m) => ({ memberId: m.memberId, name: m.name })),
    entries: data.entries.map((e) => ({
      memberId: e.memberId,
      date: e.date,
      values: e.values as Record<string, number>,
      guests: e.guests as Record<string, number>,
    })),
    expenses: data.expenses.map((e) => ({
      amount: e.amount,
      categoryKey: e.categoryKey,
      categoryLabel: e.categoryLabel,
      foodCost: e.foodCost,
      status: e.status,
      allocationMode: e.allocationMode,
      payerId: e.payerId,
    })),
    bazars: data.bazars.map((b) => ({ total: b.total, status: b.status, payerId: b.payerId })),
    allocations: data.allocations.map((a) => ({
      expenseId: a.expenseId,
      memberId: a.memberId,
      share: a.share,
    })),
    deposits: data.deposits.map((d) => ({
      memberId: d.memberId,
      amount: d.amount,
      status: d.status,
    })),
    adjustments: data.adjustments.map((a) => ({ memberId: a.memberId, amount: a.amount })),
    carriedIn,
    rateTypes: rateTypesOf(ctx),
    settings: {
      allExpensesInMealRate: ctx.settings?.allExpensesInMealRate,
      rounding: ctx.settings?.rounding,
      roundingDigits: ctx.settings?.roundingDigits,
    },
  });
}

/** Read a closed month back off its snapshot, in the live shape. */
function statementFromSession(session: Record<string, unknown>): Statement {
  const members = (session.members ?? []) as Record<string, number | string | object>[];

  return {
    month: session.month as string,
    foodCost: session.foodCost as number,
    otherCost: session.otherCost as number,
    totalCost: session.totalCost as number,
    totalMeals: session.totalMeals as number,
    mealRate: session.mealRate as number,
    totalDeposits: session.totalDeposits as number,
    totalCharged: round2(
      members.reduce((sum, m) => sum + (Number(m.totalCharge) || 0), 0),
    ),
    residual: session.residual as number,
    categories: ((session.categories ?? []) as { key: string; label: string; amount: number; foodCost: boolean }[]),
    members: members.map((m) => ({
      memberId: String(m.memberId),
      name: String(m.name),
      meals: Number(m.meals) || 0,
      byType: (m.byType ?? {}) as Record<string, number>,
      guestMeals: Number(m.guestMeals) || 0,
      foodCost: Number(m.foodCost) || 0,
      otherCost: Number(m.otherCost) || 0,
      totalCharge: Number(m.totalCharge) || 0,
      deposits: Number(m.deposits) || 0,
      adjustments: Number(m.adjustments) || 0,
      carriedIn: Number(m.carriedIn) || 0,
      balance: Number(m.balance) || 0,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * reading a month
 * ------------------------------------------------------------------ */

/**
 * The month, whether it is still moving or frozen. §4.6's whole output.
 *
 * A member who may not see the mess's books gets their own row and the shared
 * figures — the rate, the total cost — because §13 requires that every amount
 * shown to a member be traceable, and a bill with the rate hidden is not.
 */
export async function monthlySummary(
  ctx: MessContext,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE);

  const session = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  const closed = session?.status === 'closed' || session?.status === 'archived';

  const statement = closed
    ? statementFromSession(session as never)
    : await computeStatement(ctx, month);

  const wide = allowed(ctx, 'view_all_reports');
  const mine = statement.members.find((m) => m.memberId === ctx.memberId) ?? null;

  return mmOk({
    month,
    closed,
    status: session?.status ?? 'open',
    closedAt: session?.closedAt ?? null,
    foodCost: statement.foodCost,
    otherCost: statement.otherCost,
    totalCost: statement.totalCost,
    totalMeals: statement.totalMeals,
    mealRate: statement.mealRate,
    totalDeposits: statement.totalDeposits,
    residual: statement.residual,
    categories: wide ? statement.categories : [],
    members: wide ? statement.members : mine ? [mine] : [],
    mine,
    /* §4.6 asks the system to *show* the formula, not merely apply it. */
    formula: 'Meal rate = total approved food expense ÷ total weighted meals',
  });
}

/** Every month the mess has records for, newest first. */
export async function listMonths(ctx: MessContext) {
  const [sessions, months] = await Promise.all([
    MmSession.find({ messId: ctx.messId }).sort({ month: -1 }).lean(),
    MmMealEntry.distinct('month', { messId: ctx.messId }),
  ]);

  const known = new Map(sessions.map((s) => [s.month, s]));
  const all = [...new Set([...known.keys(), ...months, todayIn(ctx).slice(0, 7)])].sort().reverse();

  return mmOk({
    months: all.map((month) => {
      const session = known.get(month);
      return {
        month,
        status: session?.status ?? 'open',
        closed: session?.status === 'closed' || session?.status === 'archived',
        closedAt: session?.closedAt ?? null,
        mealRate: session?.mealRate ?? null,
        totalCost: session?.totalCost ?? null,
        totalMeals: session?.totalMeals ?? null,
      };
    }),
  });
}

/* ------------------------------------------------------------------ *
 * closing
 * ------------------------------------------------------------------ */

/**
 * What stands between this month and settlement. §4.8, steps 4 to 6.
 *
 * Returned as a checklist rather than as a refusal, because the person about
 * to close a month wants to see what they are about to freeze, not to be told
 * no. Only the empty-month case actually blocks.
 */
export async function closingReview(ctx: MessContext, month: string) {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE);

  const refused = deny(ctx, 'close_month');
  if (refused) return refused;

  const session = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  if (session?.status === 'closed' || session?.status === 'archived') {
    return mmFail(MM_ERR.ALREADY_CLOSED);
  }

  const [pending, corrections, statement] = await Promise.all([
    pendingCounts(ctx, month),
    MmMealRequest.countDocuments({ messId: ctx.messId, month, status: 'pending' }),
    computeStatement(ctx, month),
  ]);

  const negatives = statement.members.filter((m) => m.balance < 0);
  const advances = statement.members.filter((m) => m.balance > 0);

  return mmOk({
    month,
    statement,
    blockers: {
      /* The only hard stop: §4.8 has nothing to snapshot in an empty month. */
      empty: statement.totalMeals === 0 && statement.totalCost === 0,
    },
    warnings: {
      pendingBazar: pending.bazar,
      pendingExpenses: pending.expenses,
      pendingDeposits: pending.deposits,
      pendingCorrections: corrections,
      /* §9's rounding residue, surfaced before it is frozen. */
      residual: statement.residual,
    },
    settlement: {
      due: negatives.map((m) => ({ memberId: m.memberId, name: m.name, amount: round2(-m.balance) })),
      refund: advances.map((m) => ({ memberId: m.memberId, name: m.name, amount: m.balance })),
    },
  });
}

/**
 * Freeze the month. §4.8, steps 7 to 14.
 *
 * Writes the snapshot and nothing else — the meal entries, expenses and
 * deposits all stay exactly where they are, and every write path in the
 * module refuses to touch them from here on because `requireOpenMonth` starts
 * returning a refusal.
 *
 * `carriedOut` is what each member walks into next month with. §4.8 asks for
 * eligible balances to be carried forward, and the mess can turn it off — a
 * mess that settles in cash every month wants the slate clean.
 */
export async function closeMonth(
  ctx: MessContext,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE);

  const refused = deny(ctx, 'close_month');
  if (refused) return refused;

  const existing = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  if (existing?.status === 'closed' || existing?.status === 'archived') {
    return mmFail(MM_ERR.ALREADY_CLOSED);
  }

  const statement = await computeStatement(ctx, month);
  if (statement.totalMeals === 0 && statement.totalCost === 0) {
    return mmFail(MM_ERR.NOTHING_TO_CLOSE);
  }

  const carryForward = ctx.settings?.carryForwardBalances !== false;

  const members = statement.members.map((row) => ({
    memberId: row.memberId,
    name: row.name,
    meals: row.meals,
    byType: row.byType,
    guestMeals: row.guestMeals,
    foodCost: row.foodCost,
    otherCost: row.otherCost,
    totalCharge: row.totalCharge,
    deposits: row.deposits,
    adjustments: row.adjustments,
    balance: row.balance,
    carriedIn: row.carriedIn,
    carriedOut: carryForward ? row.balance : 0,
  }));

  await MmSession.findOneAndUpdate(
    { messId: ctx.messId, month },
    {
      $set: {
        status: 'closed',
        closedAt: new Date(),
        closedBy: ctx.caller.customerKey,
        foodCost: statement.foodCost,
        otherCost: statement.otherCost,
        totalCost: statement.totalCost,
        totalMeals: statement.totalMeals,
        mealRate: statement.mealRate,
        totalDeposits: statement.totalDeposits,
        residual: statement.residual,
        members,
        categories: statement.categories,
      },
      $setOnInsert: { messId: ctx.messId, month, openedAt: new Date() },
    },
    { upsert: true },
  );

  audit(ctx, 'month.close', {
    entity: 'session',
    entityId: month,
    summary: `Closed ${month} at a meal rate of ৳${statement.mealRate}`,
    after: {
      mealRate: statement.mealRate,
      totalMeals: statement.totalMeals,
      totalCost: statement.totalCost,
    },
  });

  await notifyEveryone(ctx, {
    kind: 'month-closed',
    title: `${month} is settled`,
    body: `The meal rate was ৳${statement.mealRate}. Your final balance is ready.`,
    link: `/meal-management/reports/settlement?month=${month}`,
  });

  return mmOk({ month, closed: true, statement });
}

/**
 * Open a month explicitly.
 *
 * Rarely needed — a month opens itself the first time anything is recorded in
 * it — but §8's status flow starts at Draft → Open, and a mess that wants to
 * mark the period started before anybody eats can.
 */
export async function openMonth(ctx: MessContext, month: string) {
  if (!isMonth(month)) return mmFail(MM_ERR.BAD_DATE);

  const refused = deny(ctx, 'close_month');
  if (refused) return refused;

  const existing = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  if (existing?.status === 'closed' || existing?.status === 'archived') {
    return mmFail(MM_ERR.ALREADY_CLOSED);
  }

  await MmSession.findOneAndUpdate(
    { messId: ctx.messId, month },
    { $setOnInsert: { messId: ctx.messId, month, status: 'open', openedAt: new Date() } },
    { upsert: true },
  );

  audit(ctx, 'month.open', { entity: 'session', entityId: month, summary: `Opened ${month}` });
  return mmOk({ month, status: 'open' });
}

/** Move a settled month out of the way. §5's archive, at month granularity. */
export async function archiveMonth(ctx: MessContext, month: string) {
  const refused = deny(ctx, 'close_month');
  if (refused) return refused;

  const session = await MmSession.findOne({ messId: ctx.messId, month }).lean();
  if (!session) return mmFail(MM_ERR.NO_SESSION);
  if (session.status !== 'closed') return mmFail(MM_ERR.NOT_CLOSED);

  await MmSession.updateOne({ _id: session._id }, { $set: { status: 'archived' } });
  audit(ctx, 'month.archive', { entity: 'session', entityId: month, summary: `Archived ${month}` });

  return mmOk({ month, status: 'archived' });
}

/* ------------------------------------------------------------------ *
 * post-close corrections
 * ------------------------------------------------------------------ */

/**
 * Correct a settled month without unsettling it. §4.8's adjustment entry.
 *
 * The snapshot is not touched. The adjustment is its own row, it shows in the
 * member's statement as its own line with its own reason, and it flows into
 * the *next* month's carry-forward — which is how a mistake gets fixed in
 * money without the closed month's figures changing under somebody who has
 * already seen them.
 */
export async function postAdjustment(
  ctx: MessContext,
  input: { month: string; memberId: string; amount: number; reason: string },
): Promise<MmResult<{ id: string }>> {
  const refused = deny(ctx, 'post_adjustment');
  if (refused) return refused;

  if (!isMonth(input.month)) return mmFail(MM_ERR.BAD_DATE);
  if (!Number.isFinite(input.amount) || input.amount === 0) return mmFail(MM_ERR.BAD_AMOUNT);
  if (!input.reason?.trim()) return mmFail(MM_ERR.BAD_REQUEST, { field: 'reason' });

  const row = await MmAdjustment.create({
    messId: ctx.messId,
    month: input.month,
    memberId: input.memberId,
    amount: round2(input.amount),
    reason: input.reason.trim(),
    createdBy: ctx.caller.customerKey,
  });

  audit(ctx, 'adjustment.post', {
    entity: 'adjustment',
    entityId: idOf(row._id),
    summary: `Adjusted ${input.month} by ৳${round2(input.amount)}: ${input.reason.trim()}`,
    after: { month: input.month, memberId: input.memberId, amount: round2(input.amount) },
  });

  return mmOk({ id: idOf(row._id) });
}

export async function listAdjustments(ctx: MessContext, month: string) {
  const rows = await MmAdjustment.find({ messId: ctx.messId, month }).sort({ at: -1 }).lean();

  const visible = allowed(ctx, 'view_all_reports')
    ? rows
    : rows.filter((row) => row.memberId === ctx.memberId);

  return mmOk({
    adjustments: visible.map((row) => ({
      id: idOf(row._id),
      memberId: row.memberId,
      amount: row.amount,
      reason: row.reason,
      at: row.at,
    })),
  });
}

/** The live statement, for anything that needs the numbers rather than the view. */
export const statementFor = computeStatement;
