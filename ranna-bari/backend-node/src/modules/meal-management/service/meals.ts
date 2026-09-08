import {
  daysBetween,
  isDay,
  isPastCutoff,
  lockedTypes,
  monthDays,
  monthRange,
  nextCutoff,
  round4,
  weighEntry,
  type MealMap,
} from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmLeave, MmMealEntry, MmMealRequest, MmMember } from '../models.js';

import {
  allowed,
  audit,
  deny,
  idOf,
  membersOf,
  monthFor,
  monthIsClosed,
  notifyApprovers,
  notifyMembers,
  rateTypesOf,
  requireOpenMonth,
  todayIn,
  type MessContext,
} from './context.js';

/**
 * Meal management. §4.2 — the core operational module.
 *
 * Everything in this file exists to protect one sentence from §4.2's workflow:
 * *only the final approved meal value is included in accounting*. So there is
 * exactly one way a meal count changes — a row in `mm_meal_entries` moves —
 * and there are exactly two ways that row moves: somebody with permission
 * writes it before the cutoff, or an approver accepts a correction after it.
 *
 * A pending correction changes nothing. That is not an implementation detail
 * to be optimised away later; it is the difference between a mess where the
 * bill is disputable and one where it is not.
 */

/* ------------------------------------------------------------------ *
 * shapes
 * ------------------------------------------------------------------ */

export type MealPatch = {
  /** `{ lunch: 1, dinner: 0.5 }`. A key set to 0 turns that sitting off. */
  values?: MealMap;
  /** `{ lunch: 2 }` — plates this member is answerable for. */
  guests?: MealMap;
};

const clean = (map: MealMap | null | undefined): MealMap => {
  const out: MealMap = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = round4(n);
  }
  return out;
};

/**
 * Is every value in this patch one the mess permits? §4.2.
 *
 * Guests are counted in whole plates and are not checked against the value
 * list: a mess that allows half meals for its members has not thereby agreed
 * to serve half a plate to a visitor.
 */
function checkValues(ctx: MessContext, patch: MealPatch): MmResult<true> {
  const types = new Set(ctx.mealTypes.map((t) => t.key));
  const permitted = new Set((ctx.settings?.allowedMealValues ?? [0.5, 1, 1.5, 2]).map(Number));
  const maxGuest = ctx.settings?.maxGuestPerMeal ?? 10;

  for (const [key, value] of Object.entries(patch.values ?? {})) {
    if (!types.has(key)) return mmFail(MM_ERR.NO_MEAL_TYPE, { key });
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return mmFail(MM_ERR.BAD_MEAL_VALUE, { key });
    if (n > 0 && !permitted.has(n)) return mmFail(MM_ERR.BAD_MEAL_VALUE, { key, value: n });
  }

  for (const [key, value] of Object.entries(patch.guests ?? {})) {
    if (!types.has(key)) return mmFail(MM_ERR.NO_MEAL_TYPE, { key });
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return mmFail(MM_ERR.BAD_AMOUNT, { key, field: 'guest' });
    }
    if (n > maxGuest) return mmFail(MM_ERR.BAD_AMOUNT, { key, field: 'guest', max: maxGuest });
  }

  return mmOk(true);
}

/** Merge a patch into what the entry already held. */
const merged = (current: MealMap, patch: MealMap | undefined): MealMap =>
  patch === undefined ? clean(current) : clean({ ...current, ...patch });

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/**
 * A month of one member's meals, day by day.
 *
 * Every day in the month comes back, not only the days with entries: the
 * calendar is a form as much as a record, and a screen that has to invent the
 * empty days is a screen that will invent them slightly differently from the
 * one next to it.
 */
export async function listMeals(
  ctx: MessContext,
  month: string,
  memberId?: string,
): Promise<MmResult<Record<string, unknown>>> {
  const target = memberId ?? ctx.memberId;

  if (target !== ctx.memberId && !allowed(ctx, 'edit_others_meal') && !allowed(ctx, 'view_all_reports')) {
    return mmFail(MM_ERR.FORBIDDEN, { action: 'view_others_meals' });
  }

  const startDay = ctx.settings?.monthStartDay ?? 1;
  const days = monthDays(month, startDay);
  const { from, to } = monthRange(month, startDay);

  const [entries, closed, leaves] = await Promise.all([
    MmMealEntry.find({ messId: ctx.messId, memberId: target, month }).lean(),
    monthIsClosed(ctx, month),
    MmLeave.find({ messId: ctx.messId, memberId: target, to: { $gte: from }, from: { $lte: to } }).lean(),
  ]);

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const zone = ctx.settings?.timezone ?? 'Asia/Dhaka';
  const rateTypes = rateTypesOf(ctx);

  const rows = days.map((date) => {
    const entry = byDate.get(date);
    const values = clean(entry?.values as MealMap);
    const guests = clean(entry?.guests as MealMap);
    const weights = weighEntry({ memberId: target, date, values, guests }, rateTypes);

    return {
      date,
      values,
      guests,
      weighted: weights.weighted,
      total: weights.total,
      /* Which sittings can still be changed today. The app greys the rest
         rather than letting somebody tap into a refusal. */
      locked: closed ? ctx.mealTypes.map((t) => t.key) : lockedTypes(date, ctx.mealTypes, zone),
      onLeave: leaves.some((l) => date >= l.from && date <= l.to),
    };
  });

  const counts = rows.reduce(
    (acc, row) => {
      acc.weighted = round4(acc.weighted + row.weighted);
      acc.total = round4(acc.total + row.total);
      for (const [key, value] of Object.entries(row.values)) {
        acc.byType[key] = round4((acc.byType[key] ?? 0) + value);
      }
      for (const [, value] of Object.entries(row.guests)) {
        acc.guests = round4(acc.guests + value);
      }
      return acc;
    },
    { weighted: 0, total: 0, guests: 0, byType: {} as MealMap },
  );

  return mmOk({
    month,
    memberId: target,
    closed,
    days: rows,
    counts,
    mealTypes: ctx.mealTypes,
    allowedValues: ctx.settings?.allowedMealValues ?? [0.5, 1, 1.5, 2],
  });
}

/**
 * One day, for the whole mess. §4.7's "today's meals", and the admin's grid.
 *
 * A member sees only their own row unless they may edit or report on others,
 * which is the §4.17 matrix applied to a read rather than a write.
 */
export async function dayMeals(ctx: MessContext, date: string): Promise<MmResult<Record<string, unknown>>> {
  if (!isDay(date)) return mmFail(MM_ERR.BAD_DATE);

  const wide = allowed(ctx, 'edit_others_meal') || allowed(ctx, 'view_all_reports');
  const members = wide
    ? (await membersOf(ctx.messId)).filter((m) => m.status === 'active')
    : [{ memberId: ctx.memberId, name: ctx.memberName, role: ctx.role, status: 'active', ghost: false }];

  const month = monthFor(ctx, date);
  const [entries, closed] = await Promise.all([
    MmMealEntry.find({ messId: ctx.messId, date, memberId: { $in: members.map((m) => m.memberId) } }).lean(),
    monthIsClosed(ctx, month),
  ]);

  const byMember = new Map(entries.map((e) => [e.memberId, e]));
  const zone = ctx.settings?.timezone ?? 'Asia/Dhaka';
  const locked = closed ? ctx.mealTypes.map((t) => t.key) : lockedTypes(date, ctx.mealTypes, zone);

  const rows = members.map((member) => {
    const entry = byMember.get(member.memberId);
    return {
      memberId: member.memberId,
      name: member.name,
      values: clean(entry?.values as MealMap),
      guests: clean(entry?.guests as MealMap),
      total: entry?.total ?? 0,
    };
  });

  /* What the cook needs: how many plates per sitting, right now. */
  const totals: MealMap = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.values)) totals[key] = round4((totals[key] ?? 0) + value);
    for (const [key, value] of Object.entries(row.guests)) totals[key] = round4((totals[key] ?? 0) + value);
  }

  return mmOk({
    date,
    month,
    closed,
    locked,
    rows,
    totals,
    mealTypes: ctx.mealTypes,
    nextCutoff: nextCutoff(ctx.mealTypes, zone),
  });
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

/**
 * Write one day's meals. §4.2's recommended workflow, steps 3 to 5.
 *
 * The permission and the cutoff are two separate questions and are asked in
 * that order. Permission decides whether this caller may touch this member's
 * day at all; the cutoff decides whether *anybody* still may. An approver can
 * pass the second — they are the person a correction would go to, so making
 * them file one with themselves would be ceremony — but the override is
 * audited as an override rather than as an ordinary edit.
 */
export async function setMeal(
  ctx: MessContext,
  input: { date: string; memberId?: string; values?: MealMap; guests?: MealMap; source?: string },
): Promise<MmResult<Record<string, unknown>>> {
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);

  const target = input.memberId ?? ctx.memberId;
  const own = target === ctx.memberId;

  if (own) {
    const refused = deny(ctx, 'edit_own_meal');
    if (refused) return refused;
  } else {
    const refused = deny(ctx, 'edit_others_meal');
    if (refused) return refused;
    const exists = await MmMember.exists({ _id: target, messId: ctx.messId });
    if (!exists) return mmFail(MM_ERR.NO_MEMBER);
  }

  const bad = checkValues(ctx, input);
  if (!bad.ok) return bad;

  const month = monthFor(ctx, input.date);
  const open = await requireOpenMonth(ctx, month);
  if (!open.ok) return open;

  const zone = ctx.settings?.timezone ?? 'Asia/Dhaka';
  const override = allowed(ctx, 'approve_meal_correction');

  /* Which sittings this write actually touches — a patch that only changes
     dinner must not be refused because breakfast locked this morning. */
  const touched = new Set([
    ...Object.keys(input.values ?? {}),
    ...Object.keys(input.guests ?? {}),
  ]);

  if (!override) {
    for (const type of ctx.mealTypes) {
      if (!touched.has(type.key)) continue;
      if (isPastCutoff(input.date, type, zone)) {
        return mmFail(MM_ERR.PAST_CUTOFF, { mealType: type.key, cutoff: type.cutoff });
      }
    }
  }

  const existing = await MmMealEntry.findOne({ messId: ctx.messId, memberId: target, date: input.date }).lean();

  const values = merged((existing?.values ?? {}) as MealMap, input.values);
  const guests = merged((existing?.guests ?? {}) as MealMap, input.guests);
  const weights = weighEntry({ memberId: target, date: input.date, values, guests }, rateTypesOf(ctx));

  const saved = await MmMealEntry.findOneAndUpdate(
    { messId: ctx.messId, memberId: target, date: input.date },
    {
      $set: {
        month,
        values,
        guests,
        weighted: weights.weighted,
        total: weights.total,
        locked: lockedTypes(input.date, ctx.mealTypes, zone).length === ctx.mealTypes.length,
        source: input.source ?? (own ? 'member' : 'admin'),
        updatedBy: ctx.caller.customerKey,
      },
      $setOnInsert: { messId: ctx.messId, memberId: target, date: input.date, createdBy: ctx.caller.customerKey },
    },
    { upsert: true, new: true },
  ).lean();

  audit(ctx, override && !own ? 'meal.override' : 'meal.set', {
    entity: 'meal',
    entityId: idOf(saved?._id),
    summary: `${own ? 'Set your' : `Set ${target}'s`} meals for ${input.date}`,
    before: { values: existing?.values ?? {}, guests: existing?.guests ?? {} },
    after: { values, guests },
  });

  if (!own) {
    await notifyMembers(ctx, [target], {
      kind: 'meal-changed',
      title: 'Your meal was changed',
      body: `${ctx.memberName} updated your meals for ${input.date}.`,
      link: `/meal-management/meals?date=${input.date}`,
    });
  }

  return mmOk({
    date: input.date,
    memberId: target,
    values,
    guests,
    weighted: weights.weighted,
    total: weights.total,
  });
}

/**
 * Set the same meals across a range. §4.2's date-range entry.
 *
 * Days already past their cutoff are skipped rather than refused, and the
 * count of skips comes back — turning lunch on for the rest of the month
 * should not fail because this morning is gone, but the person doing it needs
 * to know today was not included.
 */
export async function bulkMeals(
  ctx: MessContext,
  input: { from: string; to: string; memberId?: string; values?: MealMap; guests?: MealMap },
): Promise<MmResult<{ written: number; skipped: number; days: string[] }>> {
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) return mmFail(MM_ERR.BAD_DATE);

  const span = daysBetween(input.from, input.to);
  /* A year at a time is a mistake, not a use case. */
  if (span > 366) return mmFail(MM_ERR.BAD_DATE, { max: 366 });

  const target = input.memberId ?? ctx.memberId;
  const own = target === ctx.memberId;

  const refused = deny(ctx, own ? 'edit_own_meal' : 'edit_others_meal');
  if (refused) return refused;

  const bad = checkValues(ctx, input);
  if (!bad.ok) return bad;

  const zone = ctx.settings?.timezone ?? 'Asia/Dhaka';
  const override = allowed(ctx, 'approve_meal_correction');
  const rateTypes = rateTypesOf(ctx);
  const touched = new Set([...Object.keys(input.values ?? {}), ...Object.keys(input.guests ?? {})]);

  const days: string[] = [];
  for (let i = 0; i <= span; i += 1) {
    const [y, m, d] = input.from.split('-').map(Number);
    days.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  }

  /* Closed months are dropped from the range, not a reason to refuse it:
     a range that crosses a settlement is an ordinary thing to type. */
  const months = [...new Set(days.map((date) => monthFor(ctx, date)))];
  const openMonths = new Set<string>();
  for (const month of months) {
    if (!(await monthIsClosed(ctx, month))) openMonths.add(month);
  }

  const existing = await MmMealEntry.find({
    messId: ctx.messId,
    memberId: target,
    date: { $gte: days[0], $lte: days[days.length - 1] },
  }).lean();
  const byDate = new Map(existing.map((e) => [e.date, e]));

  const writes: Parameters<typeof MmMealEntry.bulkWrite>[0] = [];
  const written: string[] = [];
  let skipped = 0;

  for (const date of days) {
    const month = monthFor(ctx, date);
    if (!openMonths.has(month)) {
      skipped += 1;
      continue;
    }

    if (!override && [...touched].some((key) => {
      const type = ctx.mealTypes.find((t) => t.key === key);
      return type ? isPastCutoff(date, type, zone) : false;
    })) {
      skipped += 1;
      continue;
    }

    const prior = byDate.get(date);
    const values = merged((prior?.values ?? {}) as MealMap, input.values);
    const guests = merged((prior?.guests ?? {}) as MealMap, input.guests);
    const weights = weighEntry({ memberId: target, date, values, guests }, rateTypes);

    writes.push({
      updateOne: {
        filter: { messId: ctx.messId, memberId: target, date },
        update: {
          $set: {
            month,
            values,
            guests,
            weighted: weights.weighted,
            total: weights.total,
            source: own ? 'member' : 'admin',
            updatedBy: ctx.caller.customerKey,
          },
          $setOnInsert: {
            messId: ctx.messId,
            memberId: target,
            date,
            createdBy: ctx.caller.customerKey,
          },
        },
        upsert: true,
      },
    });
    written.push(date);
  }

  if (writes.length) await MmMealEntry.bulkWrite(writes);

  audit(ctx, 'meal.bulk', {
    entity: 'meal',
    summary: `Set meals for ${written.length} day${written.length === 1 ? '' : 's'} from ${input.from} to ${input.to}`,
    after: { values: input.values ?? {}, guests: input.guests ?? {}, days: written.length },
  });

  return mmOk({ written: written.length, skipped, days: written });
}

/* ------------------------------------------------------------------ *
 * leave
 * ------------------------------------------------------------------ */

/**
 * Away for a stretch. §4.2's leave/away mode.
 *
 * The range is stored *and* applied: the row exists so the leave can be shown
 * and cancelled as one thing, and the entries are written because the engine
 * counts entries and nothing else. Cancelling deletes the range and leaves the
 * zeroed days alone — turning meals back on is a decision, not a side effect.
 */
export async function addLeave(
  ctx: MessContext,
  input: { from: string; to: string; memberId?: string; note?: string },
): Promise<MmResult<{ id: string; days: number }>> {
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) return mmFail(MM_ERR.BAD_DATE);

  const target = input.memberId ?? ctx.memberId;
  const refused = deny(ctx, target === ctx.memberId ? 'edit_own_meal' : 'edit_others_meal');
  if (refused) return refused;

  const leave = await MmLeave.create({
    messId: ctx.messId,
    memberId: target,
    from: input.from,
    to: input.to,
    note: input.note ?? '',
    createdBy: ctx.caller.customerKey,
  });

  /* Every sitting to zero across the range, through the ordinary bulk path so
     the cutoff and closed-month rules apply exactly as they would by hand. */
  const off: MealMap = {};
  for (const type of ctx.mealTypes) off[type.key] = 0;

  const applied = await bulkMeals(ctx, {
    from: input.from,
    to: input.to,
    memberId: target,
    values: off,
    guests: off,
  });

  audit(ctx, 'leave.add', {
    entity: 'leave',
    entityId: idOf(leave._id),
    summary: `Away from ${input.from} to ${input.to}`,
  });

  return mmOk({
    id: idOf(leave._id),
    days: applied.ok ? applied.result.written : 0,
  });
}

export async function listLeaves(ctx: MessContext, memberId?: string) {
  const target = memberId ?? ctx.memberId;
  const rows = await MmLeave.find({ messId: ctx.messId, memberId: target }).sort({ from: -1 }).limit(50).lean();

  return mmOk({
    leaves: rows.map((row) => ({
      id: idOf(row._id),
      from: row.from,
      to: row.to,
      note: row.note,
    })),
  });
}

export async function cancelLeave(ctx: MessContext, leaveId: string) {
  const leave = await MmLeave.findOne({ _id: leaveId, messId: ctx.messId }).lean();
  if (!leave) return mmFail(MM_ERR.NO_LEAVE);

  if (leave.memberId !== ctx.memberId) {
    const refused = deny(ctx, 'edit_others_meal');
    if (refused) return refused;
  }

  await MmLeave.deleteOne({ _id: leaveId });
  audit(ctx, 'leave.cancel', { entity: 'leave', entityId: leaveId, summary: 'Cancelled a leave' });

  return mmOk({ cancelled: true });
}

/* ------------------------------------------------------------------ *
 * corrections
 * ------------------------------------------------------------------ */

/**
 * Ask for a locked day to be changed. §4.2, steps 6 and 7.
 *
 * The requested values are held on the request and *not* written anywhere near
 * the entry, so the month's figures do not move while somebody thinks about
 * it. That is the property the whole approval workflow exists for.
 */
export async function requestCorrection(
  ctx: MessContext,
  input: { date: string; values?: MealMap; guests?: MealMap; reason?: string; memberId?: string },
): Promise<MmResult<{ id: string }>> {
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);

  const target = input.memberId ?? ctx.memberId;
  if (target !== ctx.memberId) {
    const refused = deny(ctx, 'edit_others_meal');
    if (refused) return refused;
  }

  const bad = checkValues(ctx, input);
  if (!bad.ok) return bad;

  const month = monthFor(ctx, input.date);
  const open = await requireOpenMonth(ctx, month);
  if (!open.ok) return open;

  const pending = await MmMealRequest.findOne({
    messId: ctx.messId,
    memberId: target,
    date: input.date,
    status: 'pending',
  }).lean();
  if (pending) return mmFail(MM_ERR.CORRECTION_PENDING);

  const entry = await MmMealEntry.findOne({ messId: ctx.messId, memberId: target, date: input.date }).lean();

  const request = await MmMealRequest.create({
    messId: ctx.messId,
    memberId: target,
    date: input.date,
    month,
    current: { values: clean(entry?.values as MealMap), guests: clean(entry?.guests as MealMap) },
    requested: { values: clean(input.values), guests: clean(input.guests) },
    reason: input.reason ?? '',
    raisedBy: ctx.caller.customerKey,
  });

  audit(ctx, 'correction.raise', {
    entity: 'correction',
    entityId: idOf(request._id),
    summary: `Asked to change meals for ${input.date}`,
    after: request.requested,
  });

  await notifyApprovers(ctx, 'approve_meal_correction', {
    kind: 'correction-raised',
    title: 'A meal correction is waiting',
    body: `${ctx.memberName} has asked to change their meals for ${input.date}.`,
    link: '/meal-management/meals/requests',
  });

  return mmOk({ id: idOf(request._id) });
}

export async function listCorrections(ctx: MessContext, status = 'pending') {
  const canApprove = allowed(ctx, 'approve_meal_correction');

  const query: Record<string, unknown> = { messId: ctx.messId };
  if (status !== 'all') query.status = status;
  /* A member sees their own requests and nobody else's. */
  if (!canApprove) query.memberId = ctx.memberId;

  const rows = await MmMealRequest.find(query).sort({ createdAt: -1 }).limit(100).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  return mmOk({
    canApprove,
    requests: rows.map((row) => ({
      id: idOf(row._id),
      memberId: row.memberId,
      memberName: nameOf.get(row.memberId) ?? 'Member',
      date: row.date,
      month: row.month,
      current: row.current,
      requested: row.requested,
      reason: row.reason,
      status: row.status,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
      at: row.createdAt,
    })),
  });
}

/**
 * Approve or reject a correction. §4.2, step 8.
 *
 * Approval is the *only* path by which a post-cutoff meal reaches the books,
 * and it writes the entry here rather than handing that job back to `setMeal`
 * — going through the ordinary write would re-check the cutoff it exists to
 * pass, and loosening `setMeal` to permit it would loosen it for everything.
 */
export async function decideCorrection(
  ctx: MessContext,
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<MmResult<{ decided: 'approved' | 'rejected' }>> {
  const refused = deny(ctx, 'approve_meal_correction');
  if (refused) return refused;

  const request = await MmMealRequest.findOne({ _id: requestId, messId: ctx.messId }).lean();
  if (!request) return mmFail(MM_ERR.NO_CORRECTION);
  if (request.status !== 'pending') return mmFail(MM_ERR.CORRECTION_DECIDED);

  const open = await requireOpenMonth(ctx, request.month);
  if (!open.ok) return open;

  await MmMealRequest.updateOne(
    { _id: requestId },
    {
      $set: {
        status: approve ? 'approved' : 'rejected',
        decidedBy: ctx.caller.customerKey,
        decidedAt: new Date(),
        decisionNote: note ?? '',
      },
    },
  );

  if (approve) {
    const requested = (request.requested ?? {}) as { values?: MealMap; guests?: MealMap };
    const values = clean(requested.values);
    const guests = clean(requested.guests);
    const weights = weighEntry(
      { memberId: request.memberId, date: request.date, values, guests },
      rateTypesOf(ctx),
    );

    await MmMealEntry.updateOne(
      { messId: ctx.messId, memberId: request.memberId, date: request.date },
      {
        $set: {
          month: request.month,
          values,
          guests,
          weighted: weights.weighted,
          total: weights.total,
          source: 'correction',
          updatedBy: ctx.caller.customerKey,
        },
        $setOnInsert: {
          messId: ctx.messId,
          memberId: request.memberId,
          date: request.date,
          createdBy: ctx.caller.customerKey,
        },
      },
      { upsert: true },
    );
  }

  audit(ctx, approve ? 'correction.approve' : 'correction.reject', {
    entity: 'correction',
    entityId: requestId,
    summary: `${approve ? 'Approved' : 'Rejected'} the correction for ${request.date}`,
    before: request.current,
    after: approve ? request.requested : null,
  });

  await notifyMembers(ctx, [request.memberId], {
    kind: approve ? 'correction-approved' : 'correction-rejected',
    title: approve ? 'Your correction was approved' : 'Your correction was rejected',
    body: `Your meals for ${request.date} ${approve ? 'have been updated' : 'were not changed'}.`,
    link: '/meal-management/meals/requests',
  });

  return mmOk({ decided: approve ? 'approved' : 'rejected' });
}

/* ------------------------------------------------------------------ *
 * history
 * ------------------------------------------------------------------ */

/**
 * One member's meals across an arbitrary range. §4.2's date-range summary.
 *
 * Separate from `listMeals` because it answers a different question: that one
 * fills a calendar for a month, this one totals a stretch that need not be a
 * month at all — a week, a stay, the days somebody was actually here.
 */
export async function mealHistory(
  ctx: MessContext,
  input: { from: string; to: string; memberId?: string },
): Promise<MmResult<Record<string, unknown>>> {
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) return mmFail(MM_ERR.BAD_DATE);

  const target = input.memberId ?? ctx.memberId;
  if (target !== ctx.memberId && !allowed(ctx, 'view_all_reports')) {
    return mmFail(MM_ERR.FORBIDDEN, { action: 'view_all_reports' });
  }

  const entries = await MmMealEntry.find({
    messId: ctx.messId,
    memberId: target,
    date: { $gte: input.from, $lte: input.to },
  })
    .sort({ date: 1 })
    .lean();

  const rateTypes = rateTypesOf(ctx);
  let weighted = 0;
  let total = 0;
  const byType: MealMap = {};

  const days = entries.map((entry) => {
    const values = clean(entry.values as MealMap);
    const guests = clean(entry.guests as MealMap);
    const weights = weighEntry({ memberId: target, date: entry.date, values, guests }, rateTypes);
    weighted = round4(weighted + weights.weighted);
    total = round4(total + weights.total);
    for (const [key, value] of Object.entries(values)) byType[key] = round4((byType[key] ?? 0) + value);
    return { date: entry.date, values, guests, weighted: weights.weighted, total: weights.total };
  });

  return mmOk({
    from: input.from,
    to: input.to,
    memberId: target,
    days,
    counts: { weighted, total, byType, days: days.length },
  });
}

/** Today's own row, for the dashboard's meal toggles. */
export async function todayMeals(ctx: MessContext) {
  return dayMeals(ctx, todayIn(ctx));
}
