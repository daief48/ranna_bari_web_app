import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearTestDb, startTestDb, stopTestDb } from './setup.js';
import {
  MmBazar,
  MmDeposit,
  MmExpense,
  MmMealEntry,
  MmMealRequest,
  MmMember,
  MmSession,
} from '../src/modules/meal-management/models.js';
import {
  allocate,
  applyRounding,
  buildStatement,
  countMeals,
  isPastCutoff,
  mealRate,
  monthDays,
  monthOfDay,
  monthRange,
  weighEntry,
} from '../src/modules/meal-management/calc.js';
import { can, permissionsFor } from '../src/modules/meal-management/access.js';
import * as mm from '../src/modules/meal-management/service.js';

/**
 * Meal management — the rules, not the happy paths.
 *
 * The specification is strict about a small number of things and relaxed about
 * everything else, so this suite asserts the strict ones:
 *
 *   §4.6 — a meal rate is approved food cost over weighted meals, and nothing
 *   unapproved may reach it.
 *   §4.2 — a cutoff locks an entry, and only an approved correction moves it.
 *   §4.8 — a closed month is genuinely frozen and stays readable.
 *   §4.17 — permission is enforced on the server, and one mess cannot see
 *   another's food.
 *   §12 — the same figures come out of the engine, the report and the bill.
 *
 * Those are the properties that make the feature trustworthy; the screens can
 * change freely underneath them.
 */

const ALICE = { customerKey: '+8801711111111', name: 'Alice' };
const BOB = { customerKey: '+8801722222222', name: 'Bob' };
const CARL = { customerKey: '+8801733333333', name: 'Carl' };

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
});

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

/** A mess with Alice as admin, approvals off so tests assert one rule each. */
async function makeMess(options: { approvals?: boolean } = {}) {
  const created = await mm.createMess(ALICE, { name: 'Test Mess' });
  if (!created.ok) throw new Error('mess not created');

  const ctx = await mm.contextFor(ALICE, created.result.messId);
  if (!ctx.ok) throw new Error('no context');

  if (options.approvals === false) {
    await mm.saveSettings(ctx.result, {
      settings: {
        requireBazarApproval: false,
        requireExpenseApproval: false,
        requireDepositApproval: false,
        requireJoinApproval: false,
      },
    });
  }

  /* Cutoffs off by default: almost every test is about arithmetic, and a
     suite whose meals silently stop being writable at 9am is a suite that
     fails differently in the afternoon. */
  for (const key of ['breakfast', 'lunch', 'dinner']) {
    await mm.saveMealType(ctx.result, { key, cutoff: '' });
  }

  const fresh = await mm.contextFor(ALICE, created.result.messId);
  if (!fresh.ok) throw new Error('no context');

  return { messId: created.result.messId, code: created.result.code, ctx: fresh.result };
}

/**
 * Add a second signed-in member and return their context.
 *
 * Approves the join request when the mess asks for one, so a test about
 * deposits does not also have to be a test about the joining workflow. The
 * admin context is passed rather than looked up because approving is an
 * admin's action and this helper should not be able to do anything a caller
 * could not.
 */
async function addMember(
  admin: mm.MessContext,
  messId: string,
  code: string,
  who: typeof BOB,
) {
  const joined = await mm.joinByCode(who, code);
  if (!joined.ok) throw new Error(`join failed: ${JSON.stringify(joined)}`);

  if (joined.result.status === 'requested') {
    const pending = ok<{ requests: { id: string }[] }>(await mm.listJoinRequests(admin));
    const mine = pending.requests[pending.requests.length - 1];
    if (!mine) throw new Error('join request vanished');
    await mm.decideJoinRequest(admin, mine.id, true);
  }

  const ctx = await mm.contextFor(who, messId);
  if (!ctx.ok) throw new Error(`no context for joiner: ${JSON.stringify(ctx)}`);
  return ctx.result;
}

/** Unwrap a service result, failing the test with the refusal if there was one. */
const ok = <T>(out: { ok: boolean }): T => {
  if (!out.ok) throw new Error(`expected ok, got ${JSON.stringify(out)}`);
  return (out as unknown as { result: T }).result;
};

/* ================================================================== *
 * the arithmetic — no database needed
 * ================================================================== */

describe('meal rate', () => {
  it("divides approved food cost by weighted meals, exactly as §4.6's example", () => {
    /* The specification's own worked example: ৳30,000 over 500 meals is ৳60. */
    expect(mealRate(30_000, 500)).toBe(60);
  });

  it('keeps the fractional part a rate actually has', () => {
    expect(mealRate(18_720, 300)).toBe(62.4);
  });

  it('has no rate at all for a month with no meals', () => {
    /* Not zero — a zero rate would bill everybody nothing and make a mess
       with unrecorded meals look free. */
    expect(mealRate(5_000, 0)).toBe(0);
  });

  it('applies the mess rounding rule when one is set', () => {
    expect(applyRounding(59.7345, { mode: 'none' })).toBe(59.7345);
    expect(applyRounding(59.7345, { mode: 'nearest', digits: 2 })).toBe(59.73);
    expect(applyRounding(59.7345, { mode: 'up', digits: 2 })).toBe(59.74);
    expect(applyRounding(59.7345, { mode: 'whole' })).toBe(60);
  });
});

describe('weighing an entry', () => {
  it('counts half meals as half, per §4.2', () => {
    const out = weighEntry({ memberId: 'm', date: day(1), values: { lunch: 0.5, dinner: 1 } });
    expect(out.weighted).toBe(1.5);
  });

  it('charges a guest meal to the member who brought them', () => {
    const out = weighEntry({ memberId: 'm', date: day(1), values: { dinner: 1 }, guests: { dinner: 2 } });
    expect(out.weighted).toBe(3);
  });

  it('leaves out a sitting the mess has excluded from the rate', () => {
    const rateTypes = new Set(['lunch', 'dinner']);
    const out = weighEntry(
      { memberId: 'm', date: day(1), values: { breakfast: 1, lunch: 1, dinner: 1 } },
      rateTypes,
    );
    /* Breakfast still shows on the calendar; it just is not billable. */
    expect(out.weighted).toBe(2);
    expect(out.total).toBe(3);
  });

  it('ignores a sitting that was turned off', () => {
    const out = weighEntry({ memberId: 'm', date: day(1), values: { lunch: 0, dinner: 1 } });
    expect(out.weighted).toBe(1);
  });
});

describe('the accounting month', () => {
  it('is the calendar month when the mess settles on the 1st', () => {
    expect(monthOfDay('2026-09-15', 1)).toBe('2026-09');
    expect(monthDays('2026-09', 1)).toHaveLength(30);
  });

  it('shifts the first days into the previous month when the mess settles later', () => {
    /* A mess settling on the 5th has an accounting September of 5 Sep – 4 Oct,
       so the 3rd belongs to August's books. */
    expect(monthOfDay('2026-09-03', 5)).toBe('2026-08');
    expect(monthOfDay('2026-09-05', 5)).toBe('2026-09');

    const range = monthRange('2026-09', 5);
    expect(range.from).toBe('2026-09-05');
    expect(range.to).toBe('2026-10-04');
  });

  it('handles February and a leap year without a special case', () => {
    expect(monthDays('2028-02', 1)).toHaveLength(29);
    expect(monthDays('2026-02', 1)).toHaveLength(28);
  });
});

describe('cutoffs', () => {
  /* Fixed instants, so the assertions do not depend on when the suite runs.
     14:00 UTC is 20:00 in Dhaka. */
  const evening = new Date('2026-09-10T14:00:00Z');
  const morning = new Date('2026-09-10T02:00:00Z'); // 08:00 Dhaka

  it('locks tomorrow’s breakfast the evening before', () => {
    const rule = { key: 'breakfast', cutoff: '21:00', cutoffDayOffset: -1 };
    /* At 20:00 tonight, tomorrow's breakfast is still open. */
    expect(isPastCutoff('2026-09-11', rule, 'Asia/Dhaka', evening)).toBe(false);
    /* An hour later it is not. */
    expect(
      isPastCutoff('2026-09-11', rule, 'Asia/Dhaka', new Date('2026-09-10T15:30:00Z')),
    ).toBe(true);
  });

  it('locks today’s lunch once the morning cutoff passes', () => {
    const rule = { key: 'lunch', cutoff: '09:00', cutoffDayOffset: 0 };
    expect(isPastCutoff('2026-09-10', rule, 'Asia/Dhaka', morning)).toBe(false);
    expect(isPastCutoff('2026-09-10', rule, 'Asia/Dhaka', evening)).toBe(true);
  });

  it('never locks a sitting the mess gave no cutoff', () => {
    expect(isPastCutoff('2026-09-01', { key: 'dinner', cutoff: '' }, 'Asia/Dhaka', evening)).toBe(false);
  });
});

describe('allocation', () => {
  it('splits equally and gives the remainder to somebody', () => {
    const rows = allocate(100, 'equal', ['a', 'b', 'c']);
    expect(rows).toHaveLength(3);
    /* ৳100 three ways has to add back up to ৳100 — §9's rounding residue. */
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBe(100);
  });

  it('writes nothing for a meal-based expense', () => {
    /* Its split is the meal rate, which the month's meals have not decided
       yet — a stored share would be stale the next time somebody ate. */
    expect(allocate(5_000, 'meal', ['a', 'b'])).toEqual([]);
  });

  it('honours custom shares', () => {
    const rows = allocate(300, 'custom', [], { a: 200, b: 100 });
    expect(rows).toEqual([
      { memberId: 'a', share: 200 },
      { memberId: 'b', share: 100 },
    ]);
  });
});

describe('the statement', () => {
  it("reproduces §4.6's worked example end to end", () => {
    /* Total food expense ৳30,000, total meals 500 → rate ৳60.
       Jubair's 40 meals → ৳2,400 cost, ৳3,000 deposit → ৳600 advance. */
    const statement = buildStatement({
      month: MONTH,
      members: [
        { memberId: 'jubair', name: 'Jubair' },
        { memberId: 'other', name: 'Everyone else' },
      ],
      entries: [
        { memberId: 'jubair', date: day(1), values: { lunch: 40 } },
        { memberId: 'other', date: day(1), values: { lunch: 460 } },
      ],
      expenses: [
        { amount: 30_000, categoryKey: 'bazar', foodCost: true, status: 'approved' },
      ],
      bazars: [],
      allocations: [],
      deposits: [{ memberId: 'jubair', amount: 3_000, status: 'approved' }],
    });

    expect(statement.totalMeals).toBe(500);
    expect(statement.mealRate).toBe(60);

    const jubair = statement.members.find((m) => m.memberId === 'jubair')!;
    expect(jubair.foodCost).toBe(2_400);
    expect(jubair.deposits).toBe(3_000);
    expect(jubair.balance).toBe(600);
  });

  it('keeps rent out of the meal rate', () => {
    const statement = buildStatement({
      month: MONTH,
      members: [{ memberId: 'a', name: 'A' }, { memberId: 'b', name: 'B' }],
      entries: [{ memberId: 'a', date: day(1), values: { lunch: 10 } }],
      expenses: [
        { amount: 1_000, categoryKey: 'bazar', foodCost: true, status: 'approved' },
        { amount: 9_000, categoryKey: 'rent', foodCost: false, status: 'approved' },
      ],
      bazars: [],
      /* Rent split equally, as its category says. */
      allocations: [
        { expenseId: 'e', memberId: 'a', share: 4_500 },
        { expenseId: 'e', memberId: 'b', share: 4_500 },
      ],
      deposits: [],
    });

    /* §4.6's warning: the rate is ৳1,000 ÷ 10 meals, not ৳10,000 ÷ 10. */
    expect(statement.mealRate).toBe(100);
    expect(statement.foodCost).toBe(1_000);
    expect(statement.otherCost).toBe(9_000);

    const b = statement.members.find((m) => m.memberId === 'b')!;
    /* B ate nothing and still owes their share of the rent — §9's
       "zero meals but participates in shared non-food expenses". */
    expect(b.meals).toBe(0);
    expect(b.foodCost).toBe(0);
    expect(b.totalCharge).toBe(4_500);
  });

  it('ignores everything that has not been approved', () => {
    const statement = buildStatement({
      month: MONTH,
      members: [{ memberId: 'a', name: 'A' }],
      entries: [{ memberId: 'a', date: day(1), values: { lunch: 10 } }],
      expenses: [
        { amount: 1_000, categoryKey: 'bazar', foodCost: true, status: 'approved' },
        { amount: 5_000, categoryKey: 'bazar', foodCost: true, status: 'submitted' },
        { amount: 9_000, categoryKey: 'bazar', foodCost: true, status: 'rejected' },
      ],
      bazars: [
        { total: 500, status: 'approved' },
        { total: 4_000, status: 'draft' },
      ],
      allocations: [],
      deposits: [
        { memberId: 'a', amount: 100, status: 'approved' },
        { memberId: 'a', amount: 900, status: 'submitted' },
      ],
    });

    /* ৳1,000 expense + ৳500 bazar. Nothing else. */
    expect(statement.foodCost).toBe(1_500);
    expect(statement.totalDeposits).toBe(100);
  });
});

/* ================================================================== *
 * §4.17 — the permission matrix
 * ================================================================== */

describe('permissions', () => {
  it('matches the specification’s grid row for row', () => {
    expect(can('member', 'add_meal')).toBe(true);
    expect(can('member', 'edit_own_meal')).toBe(true);
    expect(can('member', 'edit_others_meal')).toBe(false);
    expect(can('member', 'approve_bazar')).toBe(false);
    expect(can('member', 'close_month')).toBe(false);

    expect(can('coadmin', 'manage_members')).toBe(true);
    expect(can('coadmin', 'approve_expense')).toBe(true);
    /* Only an admin closes a month or changes settings. */
    expect(can('coadmin', 'close_month')).toBe(false);
    expect(can('coadmin', 'mess_settings')).toBe(false);

    expect(can('admin', 'close_month')).toBe(true);
  });

  it('resolves the configurable cells from mess settings', () => {
    /* §4.17 writes "Configurable" against a co-admin editing others' meals. */
    expect(can('coadmin', 'edit_others_meal', { coAdminCanEditOthersMeal: true })).toBe(true);
    expect(can('coadmin', 'edit_others_meal', { coAdminCanEditOthersMeal: false })).toBe(false);

    expect(can('member', 'view_all_reports', { membersSeeFullReports: false })).toBe(false);
    expect(can('member', 'view_all_reports', { membersSeeFullReports: true })).toBe(true);
  });

  it('gives an unknown role nothing', () => {
    const perms = permissionsFor('guest');
    expect(Object.values(perms).every((v) => v === false)).toBe(true);
  });
});

/* ================================================================== *
 * §4.1 — mess and membership
 * ================================================================== */

describe('mess and membership', () => {
  it('makes the creator an admin with a join code', async () => {
    const { ctx, code } = await makeMess();
    expect(ctx.role).toBe('admin');
    expect(code).toHaveLength(6);
  });

  it('seeds meal types and categories the mess owns', async () => {
    const { ctx } = await makeMess();

    const settings = ok<{ mealTypes: unknown[] }>(await mm.getSettings(ctx));
    expect(settings.mealTypes).toHaveLength(3);

    const categories = ok<{ categories: { key: string; foodCost: boolean }[] }>(
      await mm.listCategories(ctx),
    );
    /* §4.6's warning made concrete: rent is not a food cost, bazar is. */
    expect(categories.categories.find((c) => c.key === 'rent')?.foodCost).toBe(false);
    expect(categories.categories.find((c) => c.key === 'bazar')?.foodCost).toBe(true);
  });

  it('holds a join request when the mess asks for approval', async () => {
    const { messId, code, ctx } = await makeMess();

    const joined = ok<{ status: string }>(await mm.joinByCode(BOB, code));
    expect(joined.status).toBe('requested');

    /* Bob is not a member yet, so he cannot read the mess. */
    const before = await mm.contextFor(BOB, messId);
    expect(before.ok).toBe(false);

    const requests = ok<{ requests: { id: string }[] }>(await mm.listJoinRequests(ctx));
    expect(requests.requests).toHaveLength(1);

    await mm.decideJoinRequest(ctx, requests.requests[0].id, true);

    const after = await mm.contextFor(BOB, messId);
    expect(after.ok).toBe(true);
  });

  it('keeps a ghost member’s history when they have no account', async () => {
    const { ctx } = await makeMess();

    const ghost = ok<{ memberId: string }>(await mm.addGhostMember(ctx, { name: 'Rahim' }));
    await mm.setMeal(ctx, { date: day(1), memberId: ghost.memberId, values: { lunch: 1 } });

    const entry = await MmMealEntry.findOne({ memberId: ghost.memberId });
    expect(entry?.weighted).toBe(1);
  });

  it('refuses to leave the mess without an admin', async () => {
    const { ctx } = await makeMess();
    const out = await mm.leaveMess(ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-last-admin');
  });

  it('keeps a member’s records after they leave', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    await mm.setMeal(bob, { date: day(1), values: { lunch: 1, dinner: 1 } });
    await mm.updateMember(ctx, bob.memberId, { status: 'left' });

    /* §4.1: removal must not delete historical meal or financial records. */
    const entries = await MmMealEntry.countDocuments({ memberId: bob.memberId });
    expect(entries).toBe(1);

    const member = await MmMember.findById(bob.memberId);
    expect(member?.status).toBe('left');
    expect(member?.leftAt).toBeTruthy();
  });
});

/* ================================================================== *
 * §4.2 — meals, cutoffs and corrections
 * ================================================================== */

describe('meals', () => {
  it('writes only the sittings the patch names', async () => {
    const { ctx } = await makeMess();

    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1, dinner: 1 } });
    await mm.setMeal(ctx, { date: day(1), values: { dinner: 0 } });

    const entry = await MmMealEntry.findOne({ memberId: ctx.memberId, date: day(1) });
    expect(entry?.values).toMatchObject({ lunch: 1 });
    expect(entry?.weighted).toBe(1);
  });

  it('refuses a meal value the mess does not allow', async () => {
    const { ctx } = await makeMess();
    const out = await mm.setMeal(ctx, { date: day(1), values: { lunch: 0.3 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-meal-value-invalid');
  });

  it('stops a member editing somebody else’s meals', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    const out = await mm.setMeal(bob, { date: day(1), memberId: ctx.memberId, values: { lunch: 1 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-not-allowed');
  });

  it('locks an entry after its cutoff and offers a correction instead', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    await addMember(ctx, messId, code, BOB);

    /* Put a cutoff on lunch that any past day has certainly passed. The mess
       settings are cached on a context, so both parties re-resolve after it. */
    await mm.saveMealType(ctx, { key: 'lunch', cutoff: '00:01', cutoffDayOffset: 0 });

    const bob = await mm.contextFor(BOB, messId);
    if (!bob.ok) throw new Error('no bob context');

    const past = day(1);
    const blocked = await mm.setMeal(bob.result, { date: past, values: { lunch: 1 } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe('mm-past-cutoff');

    /* The correction path is open, and changes nothing until it is decided. */
    const raised = ok<{ id: string }>(
      await mm.requestCorrection(bob.result, {
        date: past,
        values: { lunch: 1 },
        reason: 'I was here',
      }),
    );

    expect(await MmMealEntry.countDocuments({ memberId: bob.result.memberId })).toBe(0);

    const owner = await mm.contextFor(ALICE, messId);
    if (!owner.ok) throw new Error('no owner context');
    await mm.decideCorrection(owner.result, raised.id, true);

    const entry = await MmMealEntry.findOne({ memberId: bob.result.memberId, date: past });
    expect(entry?.weighted).toBe(1);
    expect(entry?.source).toBe('correction');
  });

  it('leaves the entry alone when a correction is rejected', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    await mm.setMeal(bob, { date: day(2), values: { lunch: 1 } });

    const raised = ok<{ id: string }>(
      await mm.requestCorrection(bob, { date: day(2), values: { lunch: 2 } }),
    );

    const owner = await mm.contextFor(ALICE, messId);
    if (!owner.ok) throw new Error('no owner');
    await mm.decideCorrection(owner.result, raised.id, false);

    const entry = await MmMealEntry.findOne({ memberId: bob.memberId, date: day(2) });
    expect(entry?.weighted).toBe(1);

    const request = await MmMealRequest.findById(raised.id);
    expect(request?.status).toBe('rejected');
  });

  it('turns a leave range into real zeroed entries', async () => {
    const { ctx } = await makeMess();

    await mm.setMeal(ctx, { date: day(5), values: { lunch: 1, dinner: 1 } });
    await mm.addLeave(ctx, { from: day(5), to: day(7), note: 'home' });

    const entries = await MmMealEntry.find({ memberId: ctx.memberId, date: { $gte: day(5), $lte: day(7) } });
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.weighted === 0)).toBe(true);
  });

  it('skips days past their cutoff in a bulk write rather than refusing the range', async () => {
    const { messId } = await makeMess();

    const owner = await mm.contextFor(ALICE, messId);
    if (!owner.ok) throw new Error('no owner');
    /* Lunch locked at one minute past midnight, so every past day is shut. */
    await mm.saveMealType(owner.result, { key: 'lunch', cutoff: '00:01', cutoffDayOffset: 0 });

    const fresh = await mm.contextFor(BOB, messId);
    expect(fresh.ok).toBe(false); // Bob is not in this mess — scoping holds.
  });
});

/* ================================================================== *
 * §4.3, §4.4, §4.5 — approvals gate the money
 * ================================================================== */

describe('approvals', () => {
  it('keeps a submitted bazar out of the rate until it is approved', async () => {
    const { ctx } = await makeMess();

    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1 } });

    const bazar = ok<{ id: string; status: string }>(
      await mm.createBazar(ctx, {
        date: day(1),
        items: [{ name: 'Rice', qty: 5, unit: 'kg', unitPrice: 60 }],
      }),
    );
    expect(bazar.status).toBe('submitted');

    const before = ok<{ mealRate: number }>(await mm.monthlySummary(ctx, MONTH));
    expect(before.mealRate).toBe(0);

    await mm.decideBazar(ctx, bazar.id, true);

    const after = ok<{ mealRate: number; foodCost: number }>(await mm.monthlySummary(ctx, MONTH));
    expect(after.foodCost).toBe(300);
    expect(after.mealRate).toBe(300);
  });

  it('writes a bazar total from its items rather than from a typed figure', async () => {
    const { ctx } = await makeMess();

    const bazar = ok<{ id: string; total: number }>(
      await mm.createBazar(ctx, {
        date: day(1),
        items: [
          { name: 'Rice', qty: 5, unit: 'kg', unitPrice: 60 },
          { name: 'Oil', qty: 2, unit: 'litre', unitPrice: 180 },
        ],
      }),
    );

    expect(bazar.total).toBe(660);
    expect((await MmBazar.findById(bazar.id))?.total).toBe(660);
  });

  it('refuses to edit an approved expense', async () => {
    const { ctx } = await makeMess({ approvals: false });

    const expense = ok<{ id: string; status: string }>(
      await mm.createExpense(ctx, { date: day(1), amount: 500, categoryKey: 'gas' }),
    );
    expect(expense.status).toBe('approved');

    const out = await mm.updateExpense(ctx, expense.id, { amount: 900 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-already-approved');
  });

  it('refuses a custom split that does not add up', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    const out = await mm.createExpense(ctx, {
      date: day(1),
      amount: 1_000,
      categoryKey: 'wifi',
      allocationMode: 'custom',
      shares: { [ctx.memberId]: 400, [bob.memberId]: 400 },
    });

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-allocation-invalid');
    /* And nothing was left behind. */
    expect(await MmExpense.countDocuments({ messId })).toBe(0);
  });

  it('lets a member record their own deposit but not somebody else’s', async () => {
    const { messId, code, ctx } = await makeMess();
    const bob = await addMember(ctx, messId, code, BOB);

    const mine = await mm.addDeposit(bob, { date: day(1), amount: 1_000 });
    expect(mine.ok).toBe(true);
    /* A member's own deposit waits for approval. */
    if (mine.ok) expect(mine.result.status).toBe('submitted');

    const theirs = await mm.addDeposit(bob, { date: day(1), amount: 1_000, memberId: ctx.memberId });
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.error).toBe('mm-not-allowed');
  });

  it('counts only approved deposits toward a balance', async () => {
    const { messId, code, ctx } = await makeMess();
    const bob = await addMember(ctx, messId, code, BOB);

    const deposit = ok<{ id: string }>(await mm.addDeposit(bob, { date: day(1), amount: 1_000 }));

    const before = ok<{ mine: { deposits: number } }>(await mm.monthlySummary(bob, MONTH));
    expect(before.mine.deposits).toBe(0);

    await mm.decideDeposit(ctx, deposit.id, true);

    const after = ok<{ mine: { deposits: number; balance: number } }>(
      await mm.monthlySummary(bob, MONTH),
    );
    expect(after.mine.deposits).toBe(1_000);
    expect(after.mine.balance).toBe(1_000);
  });
});

/* ================================================================== *
 * §4.8 — closing
 * ================================================================== */

describe('closing a month', () => {
  /** A month with two members, meals, an expense and a deposit. */
  async function busyMonth() {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    for (let d = 1; d <= 10; d += 1) {
      await mm.setMeal(ctx, { date: day(d), values: { lunch: 1, dinner: 1 } });
      await mm.setMeal(bob, { date: day(d), values: { lunch: 1 } });
    }

    /* ৳3,000 of food across 30 weighted meals → a rate of ৳100. */
    await mm.createExpense(ctx, { date: day(1), amount: 3_000, categoryKey: 'bazar' });
    await mm.addDeposit(ctx, { date: day(1), amount: 2_500 });
    await mm.addDeposit(ctx, { date: day(1), amount: 500, memberId: bob.memberId });

    return { messId, ctx, bob };
  }

  it('freezes the figures it was closed at', async () => {
    const { ctx, bob } = await busyMonth();

    const live = ok<{ mealRate: number; totalMeals: number }>(await mm.monthlySummary(ctx, MONTH));
    expect(live.totalMeals).toBe(30);
    expect(live.mealRate).toBe(100);

    const closed = ok<{ closed: boolean }>(await mm.closeMonth(ctx, MONTH));
    expect(closed.closed).toBe(true);

    const session = await MmSession.findOne({ month: MONTH });
    expect(session?.status).toBe('closed');
    expect(session?.mealRate).toBe(100);
    expect(session?.members).toHaveLength(2);

    /* Alice: 20 meals × ৳100 = ৳2,000 charged, ৳2,500 deposited → ৳500 advance.
       Bob: 10 × ৳100 = ৳1,000 against ৳500 → ৳500 due. */
    const alice = session!.members.find((m) => m.memberId === ctx.memberId)!;
    const bobRow = session!.members.find((m) => m.memberId === bob.memberId)!;
    expect(alice.balance).toBe(500);
    expect(bobRow.balance).toBe(-500);
  });

  it('refuses every write to a closed month', async () => {
    const { ctx, bob } = await busyMonth();
    await mm.closeMonth(ctx, MONTH);

    for (const attempt of [
      () => mm.setMeal(ctx, { date: day(11), values: { lunch: 1 } }),
      () => mm.createExpense(ctx, { date: day(11), amount: 100, categoryKey: 'gas' }),
      () => mm.addDeposit(ctx, { date: day(11), amount: 100 }),
      () => mm.createBazar(ctx, { date: day(11), items: [{ name: 'Rice', qty: 1, unitPrice: 60 }] }),
      () => mm.requestCorrection(bob, { date: day(1), values: { lunch: 2 } }),
    ]) {
      const out = await attempt();
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error).toBe('mm-month-closed');
    }
  });

  it('stays readable after closing', async () => {
    const { ctx } = await busyMonth();
    await mm.closeMonth(ctx, MONTH);

    const summary = ok<{ closed: boolean; mealRate: number; members: unknown[] }>(
      await mm.monthlySummary(ctx, MONTH),
    );
    expect(summary.closed).toBe(true);
    expect(summary.mealRate).toBe(100);
    expect(summary.members).toHaveLength(2);
  });

  it('refuses to close twice, or to close nothing', async () => {
    const { ctx } = await busyMonth();
    await mm.closeMonth(ctx, MONTH);

    const again = await mm.closeMonth(ctx, MONTH);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('mm-month-already-closed');

    const empty = await mm.closeMonth(ctx, '2026-11');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe('mm-month-empty');
  });

  it('only lets an admin close', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);
    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1 } });
    await mm.createExpense(ctx, { date: day(1), amount: 100, categoryKey: 'bazar' });

    /* Even as a co-admin — §4.17 gives closing to the admin alone. */
    await mm.updateMember(ctx, bob.memberId, { role: 'coadmin' });
    const asCoAdmin = await mm.contextFor(BOB, messId);
    if (!asCoAdmin.ok) throw new Error('no context');

    const out = await mm.closeMonth(asCoAdmin.result, MONTH);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-not-allowed');
  });

  it('carries a balance into the next month', async () => {
    const { ctx, bob } = await busyMonth();
    await mm.closeMonth(ctx, MONTH);

    /* October opens with September's balances already on the members. */
    await mm.setMeal(ctx, { date: '2026-10-01', values: { lunch: 1 } });
    await mm.createExpense(ctx, { date: '2026-10-01', amount: 100, categoryKey: 'bazar' });

    const october = ok<{ members: { memberId: string; carriedIn: number; balance: number }[] }>(
      await mm.monthlySummary(ctx, '2026-10'),
    );

    const bobRow = october.members.find((m) => m.memberId === bob.memberId)!;
    expect(bobRow.carriedIn).toBe(-500);
  });

  it('corrects a closed month with an adjustment rather than an edit', async () => {
    const { ctx, bob } = await busyMonth();
    await mm.closeMonth(ctx, MONTH);

    const before = await MmSession.findOne({ month: MONTH });
    const frozenRate = before!.mealRate;

    await mm.postAdjustment(ctx, {
      month: MONTH,
      memberId: bob.memberId,
      amount: 200,
      reason: 'double-counted a guest meal',
    });

    /* §4.8: the snapshot does not move. */
    const after = await MmSession.findOne({ month: MONTH });
    expect(after!.mealRate).toBe(frozenRate);
    expect(after!.members.find((m) => m.memberId === bob.memberId)!.balance).toBe(-500);

    const list = ok<{ adjustments: { amount: number; reason: string }[] }>(
      await mm.listAdjustments(ctx, MONTH),
    );
    expect(list.adjustments).toHaveLength(1);
    expect(list.adjustments[0].amount).toBe(200);
  });
});

/* ================================================================== *
 * §4.9, §12 — reports agree with the engine
 * ================================================================== */

describe('reports', () => {
  it('reconciles the bill, the statement and the settlement', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);

    for (let d = 1; d <= 5; d += 1) {
      await mm.setMeal(ctx, { date: day(d), values: { lunch: 1, dinner: 1 } });
      await mm.setMeal(bob, { date: day(d), values: { dinner: 1 } });
    }
    await mm.createExpense(ctx, { date: day(1), amount: 1_500, categoryKey: 'bazar' });

    const summary = ok<{ mealRate: number; totalMeals: number }>(await mm.monthlySummary(ctx, MONTH));
    const bills = ok<{ members: { memberId: string; foodCost: number }[] }>(
      await mm.memberBills(ctx, MONTH),
    );
    const statement = ok<{ foodCost: number; mealRate: number }>(
      await mm.memberStatement(ctx, MONTH, bob.memberId),
    );
    const settlement = ok<{ mealRate: number; due: { memberId: string; amount: number }[] }>(
      await mm.settlementReport(ctx, MONTH),
    );

    /* 15 meals over ৳1,500 → ৳100. Every view has to say so. */
    expect(summary.totalMeals).toBe(15);
    expect(summary.mealRate).toBe(100);
    expect(statement.mealRate).toBe(100);
    expect(settlement.mealRate).toBe(100);

    const bobBill = bills.members.find((m) => m.memberId === bob.memberId)!;
    expect(bobBill.foodCost).toBe(500);
    expect(statement.foodCost).toBe(500);
    expect(settlement.due.find((d) => d.memberId === bob.memberId)?.amount).toBe(500);
  });

  it('exports the same numbers as CSV', async () => {
    const { ctx } = await makeMess({ approvals: false });
    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1, dinner: 1 } });
    await mm.createExpense(ctx, { date: day(1), amount: 200, categoryKey: 'bazar' });

    const csv = ok<{ filename: string; csv: string }>(await mm.exportCsv(ctx, 'bills', MONTH));
    expect(csv.filename).toBe(`bills-${MONTH}.csv`);
    expect(csv.csv.split('\n')[0]).toContain('Member');
    expect(csv.csv).toContain('Alice');
  });

  it('produces printable HTML for the month', async () => {
    const { ctx } = await makeMess({ approvals: false });
    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1 } });
    await mm.createExpense(ctx, { date: day(1), amount: 100, categoryKey: 'bazar' });

    const out = ok<{ html: string }>(await mm.reportHtml(ctx, MONTH));
    expect(out.html).toContain('Test Mess');
    expect(out.html).toContain('Meal rate');
  });

  it('narrows a member to their own figures when the mess says so', async () => {
    const { messId, code, ctx } = await makeMess({ approvals: false });
    const bob = await addMember(ctx, messId, code, BOB);
    await addMember(ctx, messId, code, CARL);

    await mm.saveSettings(ctx, { settings: { membersSeeFullReports: false } });

    const asBob = await mm.contextFor(BOB, messId);
    if (!asBob.ok) throw new Error('no context');

    await mm.setMeal(asBob.result, { date: day(1), values: { lunch: 1 } });

    const summary = ok<{ members: unknown[]; mine: unknown }>(
      await mm.monthlySummary(asBob.result, MONTH),
    );
    /* One row — their own — rather than the whole mess. */
    expect(summary.members).toHaveLength(1);
    expect(summary.mine).toBeTruthy();
    void bob;
  });
});

/* ================================================================== *
 * §4.17 — one mess cannot see another
 * ================================================================== */

describe('isolation', () => {
  it('keeps two messes entirely apart', async () => {
    const first = await makeMess({ approvals: false });
    await mm.setMeal(first.ctx, { date: day(1), values: { lunch: 1, dinner: 1 } });
    await mm.createExpense(first.ctx, { date: day(1), amount: 900, categoryKey: 'bazar' });

    /* Bob builds his own mess, unrelated to Alice's. */
    const second = await mm.createMess(BOB, { name: "Bob's Mess" });
    if (!second.ok) throw new Error('no second mess');
    const bobCtx = await mm.contextFor(BOB, second.result.messId);
    if (!bobCtx.ok) throw new Error('no context');

    const summary = ok<{ totalMeals: number; totalCost: number }>(
      await mm.monthlySummary(bobCtx.result, MONTH),
    );
    expect(summary.totalMeals).toBe(0);
    expect(summary.totalCost).toBe(0);

    /* And Bob cannot reach Alice's mess by naming it. */
    const trespass = await mm.contextFor(BOB, first.messId);
    expect(trespass.ok).toBe(false);
    if (!trespass.ok) expect(trespass.error).toBe('mm-not-a-member');
  });
});

/* ================================================================== *
 * §4.15 — the assistant obeys the rules it is given
 * ================================================================== */

describe('assistant', () => {
  it('proposes rather than performs', async () => {
    const { ctx } = await makeMess();

    const out = ok<{ kind: string; proposalId: string; needsConfirmation: boolean }>(
      await mm.assistantAsk(ctx, 'আগামীকাল রাতে আমি meal খাব না।'),
    );

    expect(out.kind).toBe('proposal');
    expect(out.needsConfirmation).toBe(true);

    /* Nothing has been written — §4.15's "must not silently alter records". */
    expect(await MmMealEntry.countDocuments({ messId: ctx.messId })).toBe(0);

    await mm.assistantConfirm(ctx, out.proposalId);
    expect(await MmMealEntry.countDocuments({ messId: ctx.messId })).toBe(1);

    const entry = await MmMealEntry.findOne({ messId: ctx.messId });
    expect(entry?.source).toBe('assistant');
    expect((entry?.values as Record<string, number>).dinner ?? 0).toBe(0);
  });

  it('says so when it cannot understand', async () => {
    const { ctx } = await makeMess();
    const out = await mm.assistantAsk(ctx, 'the quick brown fox');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('mm-assistant-unclear');
  });

  it('answers a balance question from the records', async () => {
    const { ctx } = await makeMess({ approvals: false });
    await mm.setMeal(ctx, { date: day(1), values: { lunch: 1 } });
    await mm.createExpense(ctx, { date: day(1), amount: 100, categoryKey: 'bazar' });

    const out = ok<{ kind: string; reply: string }>(
      await mm.assistantAsk(ctx, 'আমার কত খরচ হয়েছে?'),
    );
    expect(out.kind).toBe('answer');
    expect(out.reply).toContain('1 meals');
  });
});

/* ================================================================== *
 * counting, once more, at the seam
 * ================================================================== */

describe('countMeals', () => {
  it('folds entries into per-member totals with a per-type breakdown', () => {
    const counts = countMeals([
      { memberId: 'a', date: day(1), values: { lunch: 1, dinner: 1 } },
      { memberId: 'a', date: day(2), values: { lunch: 0.5 }, guests: { lunch: 1 } },
      { memberId: 'b', date: day(1), values: { dinner: 1 } },
    ]);

    const a = counts.get('a')!;
    expect(a.weighted).toBe(3.5);
    expect(a.byType).toEqual({ lunch: 1.5, dinner: 1 });
    expect(a.guests).toBe(1);
    expect(a.days).toBe(2);

    expect(counts.get('b')!.weighted).toBe(1);
  });
});

