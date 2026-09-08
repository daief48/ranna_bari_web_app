import { allocate, allocationBalances, isDay, round2 } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmAllocation, MmBazar, MmCategory, MmDeposit, MmExpense, MmMember } from '../models.js';

import { saveAttachment } from './attachments.js';
import {
  allowed,
  audit,
  deny,
  idOf,
  membersOf,
  monthFor,
  notifyApprovers,
  notifyMembers,
  requireOpenMonth,
  type MessContext,
} from './context.js';

/**
 * Expenses and deposits — money out and money in. §4.4 and §4.5.
 *
 * Kept in one file because they are two halves of the same question. §4.5's
 * closing sentence is the specification's own summary of it: *a member's
 * balance should always be explainable from approved charges minus approved
 * deposits and adjustments*. Charges come from this file's first half,
 * deposits from its second, and the word doing the work in both is
 * **approved**.
 *
 * The subtlety is allocation. An expense in a food category is split by the
 * meal rate, which is not known until the month's meals are — so it gets no
 * allocation rows at all, and the statement builder divides it at read time.
 * Everything else is split at write time into `mm_expense_allocations`,
 * because "equally between the five of us" is a fact about the expense that
 * later meals cannot change.
 */

/* ------------------------------------------------------------------ *
 * categories
 * ------------------------------------------------------------------ */

export async function listCategories(ctx: MessContext) {
  const rows = await MmCategory.find({ messId: ctx.messId }).sort({ order: 1 }).lean();

  return mmOk({
    categories: rows.map((row) => ({
      id: idOf(row._id),
      key: row.key,
      label: row.label,
      foodCost: row.foodCost,
      defaultAllocation: row.defaultAllocation,
      system: row.system,
      active: row.active,
    })),
    canManage: allowed(ctx, 'manage_categories'),
  });
}

/**
 * Add or change a category.
 *
 * `foodCost` is the field that moves money: flipping it decides whether this
 * category's spending inflates the meal rate or is split some other way. §4.6
 * calls that an accounting policy, so it sits behind the settings permission
 * rather than the ordinary expense one.
 */
export async function saveCategory(
  ctx: MessContext,
  input: {
    key: string;
    label?: string;
    foodCost?: boolean;
    defaultAllocation?: string;
    order?: number;
    active?: boolean;
  },
) {
  const refused = deny(ctx, 'manage_categories');
  if (refused) return refused;

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!key) return mmFail(MM_ERR.BAD_REQUEST, { field: 'key' });

  const set: Record<string, unknown> = {};
  for (const field of ['label', 'foodCost', 'defaultAllocation', 'order', 'active'] as const) {
    if (input[field] !== undefined) set[field] = input[field];
  }

  await MmCategory.updateOne(
    { messId: ctx.messId, key },
    { $set: set, $setOnInsert: { messId: ctx.messId, key, label: input.label ?? key } },
    { upsert: true },
  );

  audit(ctx, 'category.save', {
    entity: 'category',
    entityId: key,
    summary: `Updated the ${input.label ?? key} category`,
    after: set,
  });

  return listCategories(ctx);
}

/**
 * Retire a category rather than delete it.
 *
 * Past expenses carry the category key, and a seeded category is `system` and
 * cannot go at all — deleting one would leave a closed month's report unable
 * to name where its money went.
 */
export async function removeCategory(ctx: MessContext, key: string) {
  const refused = deny(ctx, 'manage_categories');
  if (refused) return refused;

  const out = await MmCategory.updateOne({ messId: ctx.messId, key }, { $set: { active: false } });
  if (!out.matchedCount) return mmFail(MM_ERR.NO_CATEGORY);

  audit(ctx, 'category.retire', { entity: 'category', entityId: key, summary: `Turned off the ${key} category` });
  return listCategories(ctx);
}

/* ------------------------------------------------------------------ *
 * expenses
 * ------------------------------------------------------------------ */

function guardExpenseEdit(ctx: MessContext, expense: { status: string; createdBy?: string; payerId?: string }) {
  if (expense.status === 'approved') return mmFail(MM_ERR.ALREADY_APPROVED);
  const mine = expense.createdBy === ctx.caller.customerKey || expense.payerId === ctx.memberId;
  if (mine) return null;
  return deny(ctx, 'approve_expense');
}

/**
 * Write the allocation rows for one expense.
 *
 * Always replaces rather than merges: an expense whose mode changed from
 * `equal` to `selected` must not keep the shares it had under the old one.
 * `meal` writes nothing, deliberately — see this file's header.
 */
async function writeAllocations(
  ctx: MessContext,
  expense: { id: string; month: string; amount: number; allocationMode: string },
  input: { memberIds?: string[]; shares?: Record<string, number> },
): Promise<MmResult<true>> {
  await MmAllocation.deleteMany({ messId: ctx.messId, expenseId: expense.id });

  if (expense.allocationMode === 'meal') return mmOk(true);

  const active = (await membersOf(ctx.messId)).filter((m) => m.status === 'active');

  const targets =
    expense.allocationMode === 'equal'
      ? active.map((m) => m.memberId)
      : (input.memberIds ?? []).filter((memberId) => active.some((m) => m.memberId === memberId));

  if (expense.allocationMode === 'custom') {
    const shares = input.shares ?? {};
    const values = Object.values(shares).map(Number);
    if (!values.length) return mmFail(MM_ERR.BAD_ALLOCATION, { reason: 'no-shares' });
    if (!allocationBalances(expense.amount, values)) {
      return mmFail(MM_ERR.BAD_ALLOCATION, {
        amount: expense.amount,
        given: round2(values.reduce((a, b) => a + b, 0)),
      });
    }
  } else if (!targets.length) {
    return mmFail(MM_ERR.BAD_ALLOCATION, { reason: 'no-members' });
  }

  const rows = allocate(expense.amount, expense.allocationMode, targets, input.shares);
  if (!rows.length) return mmOk(true);

  await MmAllocation.insertMany(
    rows.map((row) => ({
      messId: ctx.messId,
      expenseId: expense.id,
      memberId: row.memberId,
      month: expense.month,
      share: row.share,
    })),
  );

  return mmOk(true);
}

export async function listExpenses(
  ctx: MessContext,
  input: { month?: string; status?: string; categoryKey?: string },
) {
  const query: Record<string, unknown> = { messId: ctx.messId };
  if (input.month) query.month = input.month;
  if (input.status && input.status !== 'all') query.status = input.status;
  if (input.categoryKey) query.categoryKey = input.categoryKey;

  const rows = await MmExpense.find(query).sort({ date: -1, createdAt: -1 }).limit(300).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const totals = rows.reduce(
    (acc, row) => {
      if (row.status !== 'approved') {
        if (row.status === 'submitted') acc.pending = round2(acc.pending + row.amount);
        return acc;
      }
      acc.approved = round2(acc.approved + row.amount);
      if (row.foodCost) acc.food = round2(acc.food + row.amount);
      else acc.other = round2(acc.other + row.amount);
      return acc;
    },
    { approved: 0, pending: 0, food: 0, other: 0 },
  );

  return mmOk({
    expenses: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      month: row.month,
      amount: row.amount,
      categoryKey: row.categoryKey,
      categoryLabel: row.categoryLabel,
      foodCost: row.foodCost,
      payerId: row.payerId,
      payerName: nameOf.get(row.payerId) ?? '',
      note: row.note,
      allocationMode: row.allocationMode,
      status: row.status,
      hasReceipt: !!row.receiptId,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
    })),
    totals,
    canApprove: allowed(ctx, 'approve_expense'),
  });
}

export async function getExpense(ctx: MessContext, expenseId: string) {
  const expense = await MmExpense.findOne({ _id: expenseId, messId: ctx.messId }).lean();
  if (!expense) return mmFail(MM_ERR.NO_EXPENSE);

  const [allocations, members] = await Promise.all([
    MmAllocation.find({ messId: ctx.messId, expenseId }).lean(),
    membersOf(ctx.messId),
  ]);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  return mmOk({
    id: idOf(expense._id),
    date: expense.date,
    month: expense.month,
    amount: expense.amount,
    categoryKey: expense.categoryKey,
    categoryLabel: expense.categoryLabel,
    foodCost: expense.foodCost,
    payerId: expense.payerId,
    payerName: nameOf.get(expense.payerId) ?? '',
    note: expense.note,
    receiptId: expense.receiptId,
    allocationMode: expense.allocationMode,
    status: expense.status,
    decidedAt: expense.decidedAt,
    decisionNote: expense.decisionNote,
    allocations: allocations.map((row) => ({
      memberId: row.memberId,
      name: nameOf.get(row.memberId) ?? 'Member',
      share: row.share,
    })),
    canEdit: guardExpenseEdit(ctx, expense) === null,
    canApprove: allowed(ctx, 'approve_expense'),
  });
}

export async function createExpense(
  ctx: MessContext,
  input: {
    date: string;
    amount: number;
    categoryKey: string;
    payerId?: string;
    note?: string;
    receipt?: string;
    allocationMode?: string;
    memberIds?: string[];
    shares?: Record<string, number>;
    submit?: boolean;
  },
): Promise<MmResult<{ id: string; status: string }>> {
  const refused = deny(ctx, 'add_expense');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);
  if (!Number.isFinite(input.amount) || input.amount <= 0) return mmFail(MM_ERR.BAD_AMOUNT);

  const month = monthFor(ctx, input.date);
  const open = await requireOpenMonth(ctx, month);
  if (!open.ok) return open;

  const category = await MmCategory.findOne({ messId: ctx.messId, key: input.categoryKey }).lean();
  if (!category) return mmFail(MM_ERR.NO_CATEGORY);

  const receipt = await saveAttachment(ctx, input.receipt, 'expense');
  if (!receipt.ok) return receipt;

  const needsApproval = ctx.settings?.requireExpenseApproval !== false;
  const submitting = input.submit !== false;
  const status = !submitting ? 'draft' : needsApproval ? 'submitted' : 'approved';

  /* `foodCost` is copied onto the row rather than read through the category
     later: a closed month has to keep costing what it cost, and a category
     that is reclassified next year must not retroactively move last year's
     rent into last year's meal rate. */
  const amount = round2(input.amount);
  const allocationMode = input.allocationMode ?? category.defaultAllocation ?? 'equal';

  const expense = await MmExpense.create({
    messId: ctx.messId,
    date: input.date,
    month,
    amount,
    categoryKey: category.key,
    categoryLabel: category.label,
    foodCost: category.foodCost,
    payerId: input.payerId ?? ctx.memberId,
    note: input.note ?? '',
    receiptId: receipt.result,
    allocationMode,
    status,
    submittedAt: submitting ? new Date() : null,
    decidedBy: status === 'approved' ? ctx.caller.customerKey : '',
    decidedAt: status === 'approved' ? new Date() : null,
    createdBy: ctx.caller.customerKey,
  });

  const expenseId = idOf(expense._id);

  const allocated = await writeAllocations(
    ctx,
    { id: expenseId, month, amount, allocationMode },
    input,
  );
  if (!allocated.ok) {
    /* The expense would otherwise sit in the books with no split, which is a
       worse state than never having been written. */
    await MmExpense.deleteOne({ _id: expenseId });
    return allocated;
  }

  audit(ctx, 'expense.create', {
    entity: 'expense',
    entityId: expenseId,
    summary: `Added a ৳${amount} ${category.label} expense`,
    after: { amount, category: category.key, status, allocationMode },
  });

  if (status === 'submitted') {
    await notifyApprovers(ctx, 'approve_expense', {
      kind: 'expense-added',
      title: 'An expense is waiting for approval',
      body: `${ctx.memberName} added a ৳${amount} ${category.label} expense.`,
      link: '/meal-management/money/expenses',
    });
  }

  return mmOk({ id: expenseId, status });
}

export async function updateExpense(
  ctx: MessContext,
  expenseId: string,
  patch: {
    date?: string;
    amount?: number;
    categoryKey?: string;
    payerId?: string;
    note?: string;
    receipt?: string;
    allocationMode?: string;
    memberIds?: string[];
    shares?: Record<string, number>;
  },
) {
  const expense = await MmExpense.findOne({ _id: expenseId, messId: ctx.messId }).lean();
  if (!expense) return mmFail(MM_ERR.NO_EXPENSE);

  const refused = guardExpenseEdit(ctx, expense);
  if (refused) return refused;

  const open = await requireOpenMonth(ctx, expense.month);
  if (!open.ok) return open;

  const set: Record<string, unknown> = {};
  let month = expense.month;
  let amount = expense.amount;
  let allocationMode = expense.allocationMode;

  if (patch.date !== undefined) {
    if (!isDay(patch.date)) return mmFail(MM_ERR.BAD_DATE);
    month = monthFor(ctx, patch.date);
    const target = await requireOpenMonth(ctx, month);
    if (!target.ok) return target;
    set.date = patch.date;
    set.month = month;
  }

  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount <= 0) return mmFail(MM_ERR.BAD_AMOUNT);
    amount = round2(patch.amount);
    set.amount = amount;
  }

  if (patch.categoryKey !== undefined) {
    const category = await MmCategory.findOne({ messId: ctx.messId, key: patch.categoryKey }).lean();
    if (!category) return mmFail(MM_ERR.NO_CATEGORY);
    set.categoryKey = category.key;
    set.categoryLabel = category.label;
    set.foodCost = category.foodCost;
  }

  if (patch.payerId !== undefined) set.payerId = patch.payerId;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.allocationMode !== undefined) {
    allocationMode = patch.allocationMode;
    set.allocationMode = allocationMode;
  }

  if (patch.receipt !== undefined) {
    const receipt = await saveAttachment(ctx, patch.receipt, 'expense');
    if (!receipt.ok) return receipt;
    set.receiptId = receipt.result;
  }

  const allocated = await writeAllocations(
    ctx,
    { id: expenseId, month, amount, allocationMode },
    patch,
  );
  if (!allocated.ok) return allocated;

  await MmExpense.updateOne({ _id: expenseId }, { $set: set });

  audit(ctx, 'expense.update', {
    entity: 'expense',
    entityId: expenseId,
    summary: `Edited a ৳${amount} expense`,
    before: { amount: expense.amount, category: expense.categoryKey },
    after: set,
  });

  return getExpense(ctx, expenseId);
}

export async function submitExpense(ctx: MessContext, expenseId: string) {
  const expense = await MmExpense.findOne({ _id: expenseId, messId: ctx.messId }).lean();
  if (!expense) return mmFail(MM_ERR.NO_EXPENSE);
  if (expense.status !== 'draft' && expense.status !== 'rejected') return mmFail(MM_ERR.BAD_STATUS);

  const refused = guardExpenseEdit(ctx, expense);
  if (refused) return refused;

  const status = ctx.settings?.requireExpenseApproval === false ? 'approved' : 'submitted';

  await MmExpense.updateOne(
    { _id: expenseId },
    {
      $set: {
        status,
        submittedAt: new Date(),
        decidedBy: status === 'approved' ? ctx.caller.customerKey : '',
        decidedAt: status === 'approved' ? new Date() : null,
      },
    },
  );

  audit(ctx, 'expense.submit', { entity: 'expense', entityId: expenseId, summary: 'Submitted an expense' });

  if (status === 'submitted') {
    await notifyApprovers(ctx, 'approve_expense', {
      kind: 'expense-added',
      title: 'An expense is waiting for approval',
      body: `${ctx.memberName} submitted a ৳${expense.amount} ${expense.categoryLabel} expense.`,
      link: '/meal-management/money/expenses',
    });
  }

  return mmOk({ status });
}

export async function decideExpense(
  ctx: MessContext,
  expenseId: string,
  approve: boolean,
  note?: string,
) {
  const refused = deny(ctx, 'approve_expense');
  if (refused) return refused;

  const expense = await MmExpense.findOne({ _id: expenseId, messId: ctx.messId }).lean();
  if (!expense) return mmFail(MM_ERR.NO_EXPENSE);
  if (expense.status !== 'submitted') return mmFail(MM_ERR.BAD_STATUS, { status: expense.status });

  const open = await requireOpenMonth(ctx, expense.month);
  if (!open.ok) return open;

  const status = approve ? 'approved' : 'rejected';

  await MmExpense.updateOne(
    { _id: expenseId },
    { $set: { status, decidedBy: ctx.caller.customerKey, decidedAt: new Date(), decisionNote: note ?? '' } },
  );

  audit(ctx, approve ? 'expense.approve' : 'expense.reject', {
    entity: 'expense',
    entityId: expenseId,
    summary: `${approve ? 'Approved' : 'Rejected'} a ৳${expense.amount} ${expense.categoryLabel} expense`,
    before: { status: expense.status },
    after: { status },
  });

  if (expense.payerId) {
    await notifyMembers(ctx, [expense.payerId], {
      kind: approve ? 'expense-approved' : 'expense-rejected',
      title: approve ? 'An expense was approved' : 'An expense was rejected',
      body: `The ৳${expense.amount} ${expense.categoryLabel} expense was ${approve ? 'approved' : 'rejected'}${note ? `: ${note}` : '.'}`,
      link: '/meal-management/money/expenses',
    });
  }

  return mmOk({ status });
}

/**
 * Take an expense out of the books.
 *
 * A draft goes; anything submitted is rejected instead. §9 lists "expense
 * cancelled after approval" as an edge case, and the answer this module gives
 * is that an approved expense is never deleted — it is reversed by an
 * adjustment, which leaves both figures visible.
 */
export async function removeExpense(ctx: MessContext, expenseId: string) {
  const expense = await MmExpense.findOne({ _id: expenseId, messId: ctx.messId }).lean();
  if (!expense) return mmFail(MM_ERR.NO_EXPENSE);

  const refused = guardExpenseEdit(ctx, expense);
  if (refused) return refused;

  if (expense.status === 'draft') {
    await Promise.all([
      MmExpense.deleteOne({ _id: expenseId }),
      MmAllocation.deleteMany({ messId: ctx.messId, expenseId }),
    ]);
    audit(ctx, 'expense.delete', { entity: 'expense', entityId: expenseId, summary: 'Deleted a draft expense' });
    return mmOk({ removed: true });
  }

  await MmExpense.updateOne(
    { _id: expenseId },
    { $set: { status: 'rejected', decidedBy: ctx.caller.customerKey, decidedAt: new Date(), decisionNote: 'withdrawn' } },
  );
  audit(ctx, 'expense.withdraw', { entity: 'expense', entityId: expenseId, summary: 'Withdrew an expense' });

  return mmOk({ removed: true });
}

/* ------------------------------------------------------------------ *
 * deposits
 * ------------------------------------------------------------------ */

export async function listDeposits(
  ctx: MessContext,
  input: { month?: string; memberId?: string; status?: string },
) {
  const query: Record<string, unknown> = { messId: ctx.messId };
  if (input.month) query.month = input.month;
  if (input.status && input.status !== 'all') query.status = input.status;

  /* Your own payment history unless you may see the mess's books. */
  if (input.memberId) query.memberId = input.memberId;
  if (!allowed(ctx, 'view_all_reports')) query.memberId = ctx.memberId;

  const rows = await MmDeposit.find(query).sort({ date: -1, createdAt: -1 }).limit(300).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const totals = rows.reduce(
    (acc, row) => {
      if (row.status === 'approved') acc.approved = round2(acc.approved + row.amount);
      if (row.status === 'submitted') acc.pending = round2(acc.pending + row.amount);
      return acc;
    },
    { approved: 0, pending: 0 },
  );

  return mmOk({
    deposits: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      month: row.month,
      memberId: row.memberId,
      memberName: nameOf.get(row.memberId) ?? 'Member',
      amount: row.amount,
      method: row.method,
      reference: row.reference,
      note: row.note,
      status: row.status,
      hasReceipt: !!row.receiptId,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
    })),
    totals,
    canApprove: allowed(ctx, 'approve_deposit'),
  });
}

/**
 * Record money coming in. §4.5.
 *
 * A member may record their own; recording somebody else's is `add_deposit`
 * plus the ability to approve, because "X paid me ৳3000 in cash" is a claim
 * about another person's balance.
 */
export async function addDeposit(
  ctx: MessContext,
  input: {
    date: string;
    amount: number;
    memberId?: string;
    method?: string;
    reference?: string;
    note?: string;
    receipt?: string;
  },
): Promise<MmResult<{ id: string; status: string }>> {
  const refused = deny(ctx, 'add_deposit');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);
  if (!Number.isFinite(input.amount) || input.amount <= 0) return mmFail(MM_ERR.BAD_AMOUNT);

  const target = input.memberId ?? ctx.memberId;
  if (target !== ctx.memberId) {
    const stronger = deny(ctx, 'approve_deposit');
    if (stronger) return stronger;
    const exists = await MmMember.exists({ _id: target, messId: ctx.messId });
    if (!exists) return mmFail(MM_ERR.NO_MEMBER);
  }

  const month = monthFor(ctx, input.date);
  const open = await requireOpenMonth(ctx, month);
  if (!open.ok) return open;

  const receipt = await saveAttachment(ctx, input.receipt, 'deposit');
  if (!receipt.ok) return receipt;

  const needsApproval = ctx.settings?.requireDepositApproval !== false;
  /* Somebody with approval rights recording a deposit has, in effect, already
     approved it — asking them to press the button twice adds no control. */
  const status = !needsApproval || allowed(ctx, 'approve_deposit') ? 'approved' : 'submitted';

  const amount = round2(input.amount);

  const deposit = await MmDeposit.create({
    messId: ctx.messId,
    memberId: target,
    date: input.date,
    month,
    amount,
    method: input.method ?? 'cash',
    reference: input.reference ?? '',
    note: input.note ?? '',
    receiptId: receipt.result,
    status,
    submittedAt: new Date(),
    decidedBy: status === 'approved' ? ctx.caller.customerKey : '',
    decidedAt: status === 'approved' ? new Date() : null,
    createdBy: ctx.caller.customerKey,
  });

  const depositId = idOf(deposit._id);

  audit(ctx, 'deposit.create', {
    entity: 'deposit',
    entityId: depositId,
    summary: `Recorded a ৳${amount} deposit`,
    after: { amount, method: deposit.method, status },
  });

  if (status === 'submitted') {
    await notifyApprovers(ctx, 'approve_deposit', {
      kind: 'deposit-added',
      title: 'A deposit is waiting for approval',
      body: `${ctx.memberName} recorded a ৳${amount} deposit.`,
      link: '/meal-management/money/deposits',
    });
  } else if (target !== ctx.memberId) {
    await notifyMembers(ctx, [target], {
      kind: 'deposit-approved',
      title: 'A deposit was recorded for you',
      body: `৳${amount} was added to your balance.`,
      link: '/meal-management/money/deposits',
    });
  }

  return mmOk({ id: depositId, status });
}

export async function decideDeposit(
  ctx: MessContext,
  depositId: string,
  approve: boolean,
  note?: string,
) {
  const refused = deny(ctx, 'approve_deposit');
  if (refused) return refused;

  const deposit = await MmDeposit.findOne({ _id: depositId, messId: ctx.messId }).lean();
  if (!deposit) return mmFail(MM_ERR.NO_DEPOSIT);
  if (deposit.status !== 'submitted') return mmFail(MM_ERR.BAD_STATUS, { status: deposit.status });

  const open = await requireOpenMonth(ctx, deposit.month);
  if (!open.ok) return open;

  const status = approve ? 'approved' : 'rejected';

  await MmDeposit.updateOne(
    { _id: depositId },
    { $set: { status, decidedBy: ctx.caller.customerKey, decidedAt: new Date(), decisionNote: note ?? '' } },
  );

  audit(ctx, approve ? 'deposit.approve' : 'deposit.reject', {
    entity: 'deposit',
    entityId: depositId,
    summary: `${approve ? 'Approved' : 'Rejected'} a ৳${deposit.amount} deposit`,
    after: { status },
  });

  await notifyMembers(ctx, [deposit.memberId], {
    kind: approve ? 'deposit-approved' : 'deposit-rejected',
    title: approve ? 'Your deposit was approved' : 'Your deposit was rejected',
    body: `The ৳${deposit.amount} deposit was ${approve ? 'approved' : 'rejected'}${note ? `: ${note}` : '.'}`,
    link: '/meal-management/money/deposits',
  });

  return mmOk({ status });
}

export async function removeDeposit(ctx: MessContext, depositId: string) {
  const deposit = await MmDeposit.findOne({ _id: depositId, messId: ctx.messId }).lean();
  if (!deposit) return mmFail(MM_ERR.NO_DEPOSIT);

  if (deposit.status === 'approved') {
    const refused = deny(ctx, 'approve_deposit');
    if (refused) return refused;
  } else if (deposit.createdBy !== ctx.caller.customerKey && deposit.memberId !== ctx.memberId) {
    const refused = deny(ctx, 'approve_deposit');
    if (refused) return refused;
  }

  const open = await requireOpenMonth(ctx, deposit.month);
  if (!open.ok) return open;

  if (deposit.status === 'draft' || deposit.status === 'submitted') {
    await MmDeposit.deleteOne({ _id: depositId });
  } else {
    await MmDeposit.updateOne(
      { _id: depositId },
      { $set: { status: 'rejected', decidedBy: ctx.caller.customerKey, decidedAt: new Date(), decisionNote: 'reversed' } },
    );
  }

  audit(ctx, 'deposit.remove', {
    entity: 'deposit',
    entityId: depositId,
    summary: `Removed a ৳${deposit.amount} deposit`,
  });

  return mmOk({ removed: true });
}

/* ------------------------------------------------------------------ *
 * what is still waiting on somebody
 * ------------------------------------------------------------------ */

/**
 * Everything pending, for §4.7's approval tile and §4.8's pre-close check.
 *
 * Counts rather than rows: the dashboard wants a number and a badge, and the
 * screens that want the rows fetch their own with a filter.
 */
export async function pendingCounts(ctx: MessContext, month?: string) {
  const scope = month ? { month } : {};

  const [bazar, expenses, deposits] = await Promise.all([
    allowed(ctx, 'approve_bazar')
      ? MmBazar.countDocuments({ messId: ctx.messId, status: 'submitted', ...scope })
      : 0,
    allowed(ctx, 'approve_expense')
      ? MmExpense.countDocuments({ messId: ctx.messId, status: 'submitted', ...scope })
      : 0,
    allowed(ctx, 'approve_deposit')
      ? MmDeposit.countDocuments({ messId: ctx.messId, status: 'submitted', ...scope })
      : 0,
  ]);

  return { bazar, expenses, deposits, total: bazar + expenses + deposits };
}
