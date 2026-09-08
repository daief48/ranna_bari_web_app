import { isMonth, monthRange, previousMonth, round2 } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmAudit, MmBazar, MmBazarItem, MmDeposit, MmExpense, MmSession } from '../models.js';

import {
  allowed,
  idOf,
  membersOf,
  type MessContext,
} from './context.js';
import { listAdjustments, monthlySummary, statementFor } from './closing.js';

/**
 * Reports. §4.9.
 *
 * Every report here is a *view* of the calculation engine, never a second
 * implementation of it. §4.9's closing line asks that reports give a
 * breakdown clear enough for a member to understand exactly how their final
 * amount was calculated, and §12 requires that reports reconcile with the
 * engine — the only way to guarantee that is for the report to be the engine's
 * own output rearranged, which is what `statementFor` returning through here
 * means.
 *
 * Two export shapes are produced. CSV is generated here because it is a
 * transposition of a table this file already has. PDF is *not*: the app owns
 * it, because a PDF has to be previewed and shared through the device's own
 * apps (§4.9's sharing flow), and a byte stream from a server cannot be
 * previewed. What this file hands over instead is print-ready HTML, so the
 * layout still lives in one place rather than being reinvented per screen.
 */

/* ------------------------------------------------------------------ *
 * scope
 * ------------------------------------------------------------------ */

/**
 * Which member a report may cover.
 *
 * §4.17's report row is "Full / Full-or-configurable / Own-or-configurable",
 * so a member without `view_all_reports` is silently narrowed to themselves
 * rather than refused — a bill they can read is the point of the feature.
 */
const scopeFor = (ctx: MessContext, memberId?: string): string | null => {
  if (allowed(ctx, 'view_all_reports')) return memberId ?? null;
  return ctx.memberId;
};

const guardMonth = (month: string) => (isMonth(month) ? null : mmFail(MM_ERR.BAD_DATE));

/* ------------------------------------------------------------------ *
 * the reports
 * ------------------------------------------------------------------ */

/** §4.9's monthly meal report — who ate how much of what. */
export async function mealReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const statement = await statementFor(ctx, month);
  const only = scopeFor(ctx);

  const rows = statement.members
    .filter((m) => !only || m.memberId === only)
    .map((m) => ({
      memberId: m.memberId,
      name: m.name,
      meals: m.meals,
      byType: m.byType,
      guestMeals: m.guestMeals,
      /* What this member's meals represent as a fraction of the mess's. */
      share: statement.totalMeals ? round2((m.meals / statement.totalMeals) * 100) : 0,
    }));

  return mmOk({
    month,
    mealTypes: ctx.mealTypes.map((t) => ({ key: t.key, label: t.label })),
    totalMeals: statement.totalMeals,
    members: rows,
    averagePerMember: rows.length ? round2(statement.totalMeals / rows.length) : 0,
  });
}

/** §4.9's expense report — where the money went, by category and by row. */
export async function expenseReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const rows = await MmExpense.find({ messId: ctx.messId, month, status: 'approved' })
    .sort({ date: 1 })
    .lean();

  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const byCategory = new Map<string, { key: string; label: string; amount: number; foodCost: boolean; count: number }>();
  for (const row of rows) {
    const entry = byCategory.get(row.categoryKey) ?? {
      key: row.categoryKey,
      label: row.categoryLabel || row.categoryKey,
      amount: 0,
      foodCost: row.foodCost,
      count: 0,
    };
    entry.amount = round2(entry.amount + row.amount);
    entry.count += 1;
    byCategory.set(row.categoryKey, entry);
  }

  const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));

  return mmOk({
    month,
    total,
    food: round2(rows.filter((r) => r.foodCost).reduce((s, r) => s + r.amount, 0)),
    other: round2(rows.filter((r) => !r.foodCost).reduce((s, r) => s + r.amount, 0)),
    categories: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    rows: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      amount: row.amount,
      category: row.categoryLabel || row.categoryKey,
      foodCost: row.foodCost,
      payer: nameOf.get(row.payerId) ?? '',
      note: row.note,
    })),
  });
}

/** §4.9's bazar report — trips, spend, and what was bought. */
export async function bazarReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const bazars = await MmBazar.find({ messId: ctx.messId, month, status: 'approved' })
    .sort({ date: 1 })
    .lean();

  const items = bazars.length
    ? await MmBazarItem.find({ messId: ctx.messId, bazarId: { $in: bazars.map((b) => idOf(b._id)) } }).lean()
    : [];

  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const byItem = new Map<string, { name: string; qty: number; unit: string; spend: number }>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const row = byItem.get(key) ?? { name: item.name.trim(), qty: 0, unit: item.unit, spend: 0 };
    row.qty = round2(row.qty + item.qty);
    row.spend = round2(row.spend + item.total);
    byItem.set(key, row);
  }

  return mmOk({
    month,
    total: round2(bazars.reduce((sum, b) => sum + b.total, 0)),
    trips: bazars.length,
    rows: bazars.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      buyer: nameOf.get(row.buyerId) ?? '',
      payer: nameOf.get(row.payerId) ?? '',
      total: row.total,
      note: row.note,
    })),
    items: [...byItem.values()].sort((a, b) => b.spend - a.spend),
  });
}

/** §4.9's deposit report. */
export async function depositReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const only = scopeFor(ctx);
  const query: Record<string, unknown> = { messId: ctx.messId, month, status: 'approved' };
  if (only) query.memberId = only;

  const rows = await MmDeposit.find(query).sort({ date: 1 }).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const byMethod = new Map<string, number>();
  const byMember = new Map<string, { memberId: string; name: string; amount: number; count: number }>();

  for (const row of rows) {
    byMethod.set(row.method, round2((byMethod.get(row.method) ?? 0) + row.amount));
    const entry = byMember.get(row.memberId) ?? {
      memberId: row.memberId,
      name: nameOf.get(row.memberId) ?? 'Member',
      amount: 0,
      count: 0,
    };
    entry.amount = round2(entry.amount + row.amount);
    entry.count += 1;
    byMember.set(row.memberId, entry);
  }

  return mmOk({
    month,
    total: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
    methods: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
    members: [...byMember.values()].sort((a, b) => b.amount - a.amount),
    rows: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      member: nameOf.get(row.memberId) ?? '',
      amount: row.amount,
      method: row.method,
      reference: row.reference,
    })),
  });
}

/** §4.9's member-wise bill — the whole mess, one line each. */
export async function memberBills(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const summary = await monthlySummary(ctx, month);
  if (!summary.ok) return summary;

  const s = summary.result as Record<string, unknown>;

  return mmOk({
    month,
    closed: s.closed,
    mealRate: s.mealRate,
    totalCost: s.totalCost,
    totalMeals: s.totalMeals,
    members: s.members,
  });
}

/**
 * §4.9's member statement — one person, everything.
 *
 * This is the report §13 is really about: every figure a member is shown,
 * traced back to the meals they ate, the expenses that were approved, the
 * deposits they made and the rate that connects them. The `workings` block is
 * the arithmetic written out in words, so the reader can check it rather than
 * trust it.
 */
export async function memberStatement(
  ctx: MessContext,
  month: string,
  memberId?: string,
): Promise<MmResult<Record<string, unknown>>> {
  const bad = guardMonth(month);
  if (bad) return bad;

  const target = scopeFor(ctx, memberId) ?? memberId ?? ctx.memberId;

  const summary = await monthlySummary(ctx, month);
  if (!summary.ok) return summary;

  const s = summary.result as Record<string, unknown>;
  const rows = (s.members ?? []) as Record<string, unknown>[];
  const mine = rows.find((row) => row.memberId === target);
  if (!mine) return mmFail(MM_ERR.NO_MEMBER);

  const [deposits, adjustments] = await Promise.all([
    MmDeposit.find({ messId: ctx.messId, month, memberId: target, status: 'approved' })
      .sort({ date: 1 })
      .lean(),
    listAdjustments(ctx, month),
  ]);

  const meals = Number(mine.meals) || 0;
  const rate = Number(s.mealRate) || 0;
  const balance = Number(mine.balance) || 0;

  return mmOk({
    month,
    closed: s.closed,
    memberId: target,
    name: mine.name,
    mealRate: rate,
    ...mine,
    deposits: deposits.map((row) => ({
      date: row.date,
      amount: row.amount,
      method: row.method,
      reference: row.reference,
    })),
    adjustments: adjustments.ok
      ? (adjustments.result as { adjustments: Record<string, unknown>[] }).adjustments.filter(
          (row) => row.memberId === target,
        )
      : [],
    /* §4.9: "a clear breakdown so members can understand exactly how their
       final amount was calculated". */
    workings: [
      `Meal rate = ৳${s.foodCost} food cost ÷ ${s.totalMeals} meals = ৳${rate}`,
      `Your food cost = ${meals} meals × ৳${rate} = ৳${mine.foodCost}`,
      `Your other share = ৳${mine.otherCost}`,
      `Total charge = ৳${mine.foodCost} + ৳${mine.otherCost} = ৳${mine.totalCharge}`,
      `Balance = ৳${mine.deposits} deposits${Number(mine.carriedIn) ? ` + ৳${mine.carriedIn} carried in` : ''}${Number(mine.adjustments) ? ` + ৳${mine.adjustments} adjustments` : ''} − ৳${mine.totalCharge} = ৳${balance}`,
      balance >= 0 ? `৳${round2(balance)} advance` : `৳${round2(-balance)} due`,
    ],
  });
}

/**
 * §4.9's meal rate report — the rate, and where it has been.
 *
 * Six months of history alongside this one, because a rate on its own says
 * nothing. A mess only learns anything from ৳62 by seeing that last month was
 * ৳55.
 */
export async function rateReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const months: string[] = [];
  let cursor = month;
  for (let i = 0; i < 6; i += 1) {
    months.push(cursor);
    cursor = previousMonth(cursor);
  }

  const sessions = await MmSession.find({ messId: ctx.messId, month: { $in: months } }).lean();
  const closed = new Map(sessions.map((s) => [s.month, s]));

  const trend: { month: string; mealRate: number; totalMeals: number; totalCost: number; closed: boolean }[] = [];

  for (const m of months) {
    const session = closed.get(m);
    if (session && (session.status === 'closed' || session.status === 'archived')) {
      trend.push({
        month: m,
        mealRate: session.mealRate,
        totalMeals: session.totalMeals,
        totalCost: session.totalCost,
        closed: true,
      });
    } else {
      const live = await statementFor(ctx, m);
      /* A month with nothing in it is a gap in the chart, not a zero — a zero
         would read as "the rate collapsed" rather than "we were not here". */
      if (live.totalMeals === 0 && live.totalCost === 0) continue;
      trend.push({
        month: m,
        mealRate: live.mealRate,
        totalMeals: live.totalMeals,
        totalCost: live.totalCost,
        closed: false,
      });
    }
  }

  const current = trend.find((t) => t.month === month);
  const prior = trend.find((t) => t.month === previousMonth(month));

  return mmOk({
    month,
    current: current ?? null,
    change:
      current && prior && prior.mealRate
        ? round2(((current.mealRate - prior.mealRate) / prior.mealRate) * 100)
        : null,
    trend: trend.reverse(),
    formula: 'Meal rate = total approved food expense ÷ total weighted meals',
  });
}

/** §4.9's settlement report — who pays whom, and how much. */
export async function settlementReport(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const summary = await monthlySummary(ctx, month);
  if (!summary.ok) return summary;

  const s = summary.result as Record<string, unknown>;
  const members = (s.members ?? []) as Record<string, unknown>[];

  const due = members
    .filter((m) => Number(m.balance) < 0)
    .map((m) => ({ memberId: m.memberId, name: m.name, amount: round2(-Number(m.balance)) }))
    .sort((a, b) => b.amount - a.amount);

  const refund = members
    .filter((m) => Number(m.balance) > 0)
    .map((m) => ({ memberId: m.memberId, name: m.name, amount: round2(Number(m.balance)) }))
    .sort((a, b) => b.amount - a.amount);

  return mmOk({
    month,
    closed: s.closed,
    mealRate: s.mealRate,
    totalCost: s.totalCost,
    totalDeposits: s.totalDeposits,
    residual: s.residual,
    due,
    refund,
    totalDue: round2(due.reduce((sum, row) => sum + row.amount, 0)),
    totalRefund: round2(refund.reduce((sum, row) => sum + row.amount, 0)),
  });
}

/** §4.9's complete mess statement — everything about a month in one payload. */
export async function messStatement(ctx: MessContext, month: string) {
  const bad = guardMonth(month);
  if (bad) return bad;

  const [meals, expenses, bazar, deposits, settlement] = await Promise.all([
    mealReport(ctx, month),
    expenseReport(ctx, month),
    bazarReport(ctx, month),
    depositReport(ctx, month),
    settlementReport(ctx, month),
  ]);

  return mmOk({
    month,
    mess: { name: ctx.messName, messId: ctx.messId },
    meals: meals.ok ? meals.result : null,
    expenses: expenses.ok ? expenses.result : null,
    bazar: bazar.ok ? bazar.result : null,
    deposits: deposits.ok ? deposits.result : null,
    settlement: settlement.ok ? settlement.result : null,
  });
}

/** §4.9's activity/audit report — §12's traceability, as a feed. */
export async function activityReport(
  ctx: MessContext,
  input: { from?: string; to?: string; action?: string; limit?: number },
): Promise<MmResult<Record<string, unknown>>> {
  const query: Record<string, unknown> = { messId: ctx.messId };

  if (input.from || input.to) {
    const at: Record<string, Date> = {};
    if (input.from) at.$gte = new Date(`${input.from}T00:00:00.000Z`);
    if (input.to) at.$lte = new Date(`${input.to}T23:59:59.999Z`);
    query.at = at;
  }
  if (input.action) query.action = new RegExp(`^${input.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

  const rows = await MmAudit.find(query)
    .sort({ at: -1 })
    .limit(Math.min(500, input.limit ?? 100))
    .lean();

  /* A member sees the trail of their own actions; the mess's full history is
     an approver's view, the same as its reports. */
  const visible = allowed(ctx, 'view_all_reports')
    ? rows
    : rows.filter((row) => row.actorKey === ctx.caller.customerKey);

  return mmOk({
    entries: visible.map((row) => ({
      id: idOf(row._id),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actor: row.actorName,
      summary: row.summary,
      before: row.before,
      after: row.after,
      at: row.at,
    })),
  });
}

/* ------------------------------------------------------------------ *
 * export
 * ------------------------------------------------------------------ */

/** One CSV cell, quoted only when it has to be. */
const cell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (header: string[], rows: unknown[][]): string =>
  [header.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\n');

export const REPORT_KINDS = [
  'meals',
  'expenses',
  'bazar',
  'deposits',
  'bills',
  'settlement',
  'activity',
] as const;

/**
 * §4.9's CSV/Excel export.
 *
 * Excel opens CSV, and a real .xlsx would mean a dependency and a binary
 * response for a table that is already flat. The header row names the columns
 * in the same words the screens use, so a spreadsheet somebody builds on top
 * of this does not have to be re-learned when they look at the app.
 */
export async function exportCsv(
  ctx: MessContext,
  kind: string,
  month: string,
): Promise<MmResult<{ filename: string; csv: string }>> {
  const bad = guardMonth(month);
  if (bad) return bad;

  const name = (base: string) => `${base}-${month}.csv`;

  switch (kind) {
    case 'meals': {
      const out = await mealReport(ctx, month);
      if (!out.ok) return out;
      const report = out.result as Record<string, unknown>;
      const types = (report.mealTypes ?? []) as { key: string; label: string }[];
      const members = (report.members ?? []) as Record<string, never>[];

      return mmOk({
        filename: name('meals'),
        csv: toCsv(
          ['Member', ...types.map((t) => t.label), 'Guest', 'Total'],
          members.map((m) => [
            m.name,
            ...types.map((t) => (m.byType as Record<string, number>)?.[t.key] ?? 0),
            m.guestMeals,
            m.meals,
          ]),
        ),
      });
    }

    case 'expenses': {
      const out = await expenseReport(ctx, month);
      if (!out.ok) return out;
      const rows = ((out.result as Record<string, unknown>).rows ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('expenses'),
        csv: toCsv(
          ['Date', 'Category', 'Amount', 'Counts in rate', 'Payer', 'Note'],
          rows.map((r) => [r.date, r.category, r.amount, r.foodCost ? 'yes' : 'no', r.payer, r.note]),
        ),
      });
    }

    case 'bazar': {
      const out = await bazarReport(ctx, month);
      if (!out.ok) return out;
      const rows = ((out.result as Record<string, unknown>).rows ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('bazar'),
        csv: toCsv(
          ['Date', 'Buyer', 'Payer', 'Total', 'Note'],
          rows.map((r) => [r.date, r.buyer, r.payer, r.total, r.note]),
        ),
      });
    }

    case 'deposits': {
      const out = await depositReport(ctx, month);
      if (!out.ok) return out;
      const rows = ((out.result as Record<string, unknown>).rows ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('deposits'),
        csv: toCsv(
          ['Date', 'Member', 'Amount', 'Method', 'Reference'],
          rows.map((r) => [r.date, r.member, r.amount, r.method, r.reference]),
        ),
      });
    }

    case 'bills': {
      const out = await memberBills(ctx, month);
      if (!out.ok) return out;
      const members = ((out.result as Record<string, unknown>).members ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('bills'),
        csv: toCsv(
          ['Member', 'Meals', 'Food cost', 'Other cost', 'Total charge', 'Deposits', 'Balance'],
          members.map((m) => [m.name, m.meals, m.foodCost, m.otherCost, m.totalCharge, m.deposits, m.balance]),
        ),
      });
    }

    case 'settlement': {
      const out = await settlementReport(ctx, month);
      if (!out.ok) return out;
      const report = out.result as Record<string, unknown>;
      const due = (report.due ?? []) as Record<string, never>[];
      const refund = (report.refund ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('settlement'),
        csv: toCsv(
          ['Member', 'Direction', 'Amount'],
          [
            ...due.map((r) => [r.name, 'due', r.amount]),
            ...refund.map((r) => [r.name, 'refund', r.amount]),
          ],
        ),
      });
    }

    case 'activity': {
      const { from, to } = monthRange(month, ctx.settings?.monthStartDay ?? 1);
      const out = await activityReport(ctx, { from, to, limit: 500 });
      if (!out.ok) return out;
      const entries = ((out.result as Record<string, unknown>).entries ?? []) as Record<string, never>[];
      return mmOk({
        filename: name('activity'),
        csv: toCsv(
          ['When', 'Who', 'Action', 'Summary'],
          entries.map((e) => [new Date(e.at).toISOString(), e.actor, e.action, e.summary]),
        ),
      });
    }

    default:
      return mmFail(MM_ERR.BAD_REQUEST, { field: 'kind', allowed: REPORT_KINDS });
  }
}

/* ------------------------------------------------------------------ *
 * print
 * ------------------------------------------------------------------ */

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const taka = (value: unknown) => `৳${round2(Number(value) || 0)}`;

/**
 * The month, as a page that can be printed. §4.9's PDF export.
 *
 * Returned as HTML rather than as a PDF because the app prints it with the
 * device's own renderer, which is what makes §4.9's *generate → preview →
 * share* flow work: a preview needs something the OS can display and a share
 * sheet needs a file the OS produced.
 *
 * Styling is inline and deliberately plain — this is printed on A4 and read
 * on paper, so it uses the one design language that survives that.
 */
export async function reportHtml(ctx: MessContext, month: string): Promise<MmResult<{ html: string }>> {
  const bad = guardMonth(month);
  if (bad) return bad;

  const out = await messStatement(ctx, month);
  if (!out.ok) return out;

  const data = out.result as unknown as Record<string, Record<string, never>>;
  const settlement = (data.settlement ?? {}) as Record<string, never>;
  const meals = (data.meals ?? {}) as Record<string, never>;
  const expenses = (data.expenses ?? {}) as Record<string, never>;

  const bills = await memberBills(ctx, month);
  const billRows = bills.ok
    ? (((bills.result as Record<string, unknown>).members ?? []) as Record<string, never>[])
    : [];

  const types = ((meals.mealTypes ?? []) as { key: string; label: string }[]) ?? [];

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(ctx.messName)} — ${escapeHtml(month)}</title>
<style>
  @page { margin: 18mm 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; font-size: 11pt; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  h2 { font-size: 12pt; margin: 20pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
  .sub { color: #666; margin: 0 0 16pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  th, td { text-align: left; padding: 5pt 6pt; border-bottom: 1px solid #eee; }
  th { background: #f6f6f6; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .tiles { display: flex; gap: 8pt; margin-bottom: 12pt; }
  .tile { flex: 1; border: 1px solid #e4e4e4; border-radius: 6pt; padding: 8pt 10pt; }
  .tile b { display: block; font-size: 15pt; }
  .tile span { color: #666; font-size: 9pt; }
  .due { color: #b3261e; } .adv { color: #1b6b3a; }
  footer { margin-top: 24pt; color: #888; font-size: 8.5pt; border-top: 1px solid #eee; padding-top: 6pt; }
</style></head><body>

<h1>${escapeHtml(ctx.messName)}</h1>
<p class="sub">Monthly statement — ${escapeHtml(month)}${settlement.closed ? ' (settled)' : ' (provisional)'}</p>

<div class="tiles">
  <div class="tile"><b>${taka(settlement.mealRate)}</b><span>Meal rate</span></div>
  <div class="tile"><b>${escapeHtml(meals.totalMeals ?? 0)}</b><span>Total meals</span></div>
  <div class="tile"><b>${taka(settlement.totalCost)}</b><span>Total cost</span></div>
  <div class="tile"><b>${taka(settlement.totalDeposits)}</b><span>Total deposits</span></div>
</div>

<h2>Member bills</h2>
<table>
  <tr>
    <th>Member</th><th class="n">Meals</th><th class="n">Food cost</th>
    <th class="n">Other</th><th class="n">Charged</th><th class="n">Deposits</th><th class="n">Balance</th>
  </tr>
  ${billRows
    .map(
      (m) => `<tr>
    <td>${escapeHtml(m.name)}</td>
    <td class="n">${escapeHtml(m.meals)}</td>
    <td class="n">${taka(m.foodCost)}</td>
    <td class="n">${taka(m.otherCost)}</td>
    <td class="n">${taka(m.totalCharge)}</td>
    <td class="n">${taka(m.deposits)}</td>
    <td class="n ${Number(m.balance) < 0 ? 'due' : 'adv'}">${taka(m.balance)}</td>
  </tr>`,
    )
    .join('')}
</table>

<h2>Meals</h2>
<table>
  <tr><th>Member</th>${types.map((t) => `<th class="n">${escapeHtml(t.label)}</th>`).join('')}<th class="n">Guest</th><th class="n">Total</th></tr>
  ${(((meals.members ?? []) as Record<string, never>[]) ?? [])
    .map(
      (m) => `<tr><td>${escapeHtml(m.name)}</td>${types
        .map((t) => `<td class="n">${escapeHtml((m.byType as Record<string, number>)?.[t.key] ?? 0)}</td>`)
        .join('')}<td class="n">${escapeHtml(m.guestMeals)}</td><td class="n">${escapeHtml(m.meals)}</td></tr>`,
    )
    .join('')}
</table>

<h2>Where the money went</h2>
<table>
  <tr><th>Category</th><th class="n">Amount</th><th>Counts in meal rate</th></tr>
  ${(((expenses.categories ?? []) as Record<string, never>[]) ?? [])
    .map(
      (c) => `<tr><td>${escapeHtml(c.label)}</td><td class="n">${taka(c.amount)}</td><td>${c.foodCost ? 'Yes' : 'No'}</td></tr>`,
    )
    .join('')}
</table>

<h2>Settlement</h2>
<table>
  <tr><th>Member</th><th>Direction</th><th class="n">Amount</th></tr>
  ${(((settlement.due ?? []) as Record<string, never>[]) ?? [])
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>Due</td><td class="n due">${taka(r.amount)}</td></tr>`)
    .join('')}
  ${(((settlement.refund ?? []) as Record<string, never>[]) ?? [])
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>Refund</td><td class="n adv">${taka(r.amount)}</td></tr>`)
    .join('')}
</table>

<footer>
  Meal rate = total approved food expense ÷ total weighted meals.
  Only approved bazar, expenses and deposits are included.
  Generated ${new Date().toISOString().slice(0, 10)}.
</footer>
</body></html>`;

  return mmOk({ html });
}
