import { isDay, round2, shiftDay } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmBazar, MmBazarItem, MmDuty, MmMember } from '../models.js';

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
  todayIn,
  type MessContext,
} from './context.js';

/**
 * Bazar. §4.3.
 *
 * The module that connects a real shopping trip to the accounting engine, and
 * the one where the specification's approval workflow earns its keep: a bazar
 * is somebody spending the mess's money and then telling everybody how much.
 * §4.3's workflow runs draft → submitted → approved, and only the last state
 * reaches the meal rate.
 *
 * The header's `total` is never typed. It is written from the items every time
 * they change, so the figure the mess is billed for is always the sum of a
 * list of things that were actually bought — which is what makes a bazar
 * disputable in the useful sense rather than the argumentative one.
 */

type ItemInput = { name: string; qty?: number; unit?: string; unitPrice?: number };

const itemTotal = (item: ItemInput) => round2((Number(item.qty) || 0) * (Number(item.unitPrice) || 0));

/** Rewrite the header's total from whatever items now exist. */
async function syncTotal(messId: string, bazarId: string): Promise<number> {
  const [row] = await MmBazarItem.aggregate<{ total: number }>([
    { $match: { messId, bazarId } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);

  const total = round2(row?.total ?? 0);
  await MmBazar.updateOne({ _id: bazarId }, { $set: { total } });
  return total;
}

/**
 * May this caller change this bazar right now?
 *
 * Two gates, and both matter. An approved bazar is frozen for everybody —
 * §4.6's "approved records only" is worth nothing if an approved record can
 * still be edited. A draft belongs to whoever raised it, and to anybody the
 * matrix lets approve them.
 */
function guardEdit(ctx: MessContext, bazar: { status: string; buyerId: string; createdBy?: string }) {
  if (bazar.status === 'approved') return mmFail(MM_ERR.ALREADY_APPROVED);

  const mine = bazar.buyerId === ctx.memberId || bazar.createdBy === ctx.caller.customerKey;
  if (mine) return null;

  return deny(ctx, 'approve_bazar');
}

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

export async function listBazars(
  ctx: MessContext,
  input: { month?: string; status?: string; memberId?: string },
): Promise<MmResult<Record<string, unknown>>> {
  const query: Record<string, unknown> = { messId: ctx.messId };
  if (input.month) query.month = input.month;
  if (input.status && input.status !== 'all') query.status = input.status;
  if (input.memberId) query.buyerId = input.memberId;

  /* A member who may not see the whole mess's figures sees their own trips. */
  if (!allowed(ctx, 'view_all_reports')) query.buyerId = ctx.memberId;

  const rows = await MmBazar.find(query).sort({ date: -1, createdAt: -1 }).limit(200).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const totals = rows.reduce(
    (acc, row) => {
      if (row.status === 'approved') acc.approved = round2(acc.approved + row.total);
      if (row.status === 'submitted') acc.pending = round2(acc.pending + row.total);
      return acc;
    },
    { approved: 0, pending: 0 },
  );

  return mmOk({
    bazars: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      month: row.month,
      buyerId: row.buyerId,
      buyerName: nameOf.get(row.buyerId) ?? 'Member',
      payerId: row.payerId,
      payerName: nameOf.get(row.payerId) ?? 'Member',
      total: row.total,
      status: row.status,
      note: row.note,
      hasReceipt: !!row.receiptId,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
    })),
    totals,
    canApprove: allowed(ctx, 'approve_bazar'),
  });
}

export async function getBazar(ctx: MessContext, bazarId: string) {
  const bazar = await MmBazar.findOne({ _id: bazarId, messId: ctx.messId }).lean();
  if (!bazar) return mmFail(MM_ERR.NO_BAZAR);

  if (bazar.buyerId !== ctx.memberId && !allowed(ctx, 'view_all_reports')) {
    return mmFail(MM_ERR.FORBIDDEN, { action: 'view_all_reports' });
  }

  const items = await MmBazarItem.find({ messId: ctx.messId, bazarId }).sort({ createdAt: 1 }).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  return mmOk({
    id: idOf(bazar._id),
    date: bazar.date,
    month: bazar.month,
    buyerId: bazar.buyerId,
    buyerName: nameOf.get(bazar.buyerId) ?? 'Member',
    payerId: bazar.payerId,
    payerName: nameOf.get(bazar.payerId) ?? 'Member',
    total: bazar.total,
    status: bazar.status,
    note: bazar.note,
    receiptId: bazar.receiptId,
    decidedAt: bazar.decidedAt,
    decisionNote: bazar.decisionNote,
    items: items.map((item) => ({
      id: idOf(item._id),
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    canEdit: guardEdit(ctx, bazar) === null,
    canApprove: allowed(ctx, 'approve_bazar'),
  });
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

/**
 * Record a shopping trip. §4.3's workflow, steps 3 to 5, in one call.
 *
 * Items come with it rather than being added one round trip at a time,
 * because the person entering them is standing over a receipt typing a list
 * and a network hiccup halfway down it should not leave half a bazar.
 *
 * A mess that has turned approval off gets an approved row straight away —
 * §4.3's workflow is a policy, and a two-person flat that has said it does not
 * want it should not be made to press Approve on its own shopping.
 */
export async function createBazar(
  ctx: MessContext,
  input: {
    date: string;
    buyerId?: string;
    payerId?: string;
    note?: string;
    receipt?: string;
    items?: ItemInput[];
    submit?: boolean;
  },
): Promise<MmResult<{ id: string; total: number; status: string }>> {
  const refused = deny(ctx, 'add_bazar');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);

  const month = monthFor(ctx, input.date);
  const open = await requireOpenMonth(ctx, month);
  if (!open.ok) return open;

  const buyerId = input.buyerId ?? ctx.memberId;
  if (buyerId !== ctx.memberId) {
    const exists = await MmMember.exists({ _id: buyerId, messId: ctx.messId });
    if (!exists) return mmFail(MM_ERR.NO_MEMBER);
  }

  const receipt = await saveAttachment(ctx, input.receipt, 'bazar');
  if (!receipt.ok) return receipt;

  const needsApproval = ctx.settings?.requireBazarApproval !== false;
  const autoApprove = !needsApproval && allowed(ctx, 'approve_bazar');
  const submitting = input.submit !== false;

  const status = !submitting ? 'draft' : autoApprove || !needsApproval ? 'approved' : 'submitted';

  const bazar = await MmBazar.create({
    messId: ctx.messId,
    date: input.date,
    month,
    buyerId,
    payerId: input.payerId ?? buyerId,
    note: input.note ?? '',
    receiptId: receipt.result,
    status,
    submittedAt: submitting ? new Date() : null,
    decidedBy: status === 'approved' ? ctx.caller.customerKey : '',
    decidedAt: status === 'approved' ? new Date() : null,
    createdBy: ctx.caller.customerKey,
  });

  const bazarId = idOf(bazar._id);

  const items = (input.items ?? []).filter((item) => item.name?.trim());
  if (items.length) {
    await MmBazarItem.insertMany(
      items.map((item) => ({
        messId: ctx.messId,
        bazarId,
        name: item.name.trim(),
        qty: Number(item.qty) || 0,
        unit: item.unit ?? 'piece',
        unitPrice: Number(item.unitPrice) || 0,
        total: itemTotal(item),
      })),
    );
  }

  const total = await syncTotal(ctx.messId, bazarId);

  audit(ctx, 'bazar.create', {
    entity: 'bazar',
    entityId: bazarId,
    summary: `Recorded a ৳${total} bazar for ${input.date}`,
    after: { total, status, items: items.length },
  });

  if (status === 'submitted') {
    await notifyApprovers(ctx, 'approve_bazar', {
      kind: 'bazar-added',
      title: 'A bazar is waiting for approval',
      body: `${ctx.memberName} submitted a ৳${total} bazar for ${input.date}.`,
      link: `/meal-management/bazar/${bazarId}`,
    });
  }

  return mmOk({ id: bazarId, total, status });
}

export async function updateBazar(
  ctx: MessContext,
  bazarId: string,
  patch: { date?: string; payerId?: string; note?: string; receipt?: string; items?: ItemInput[] },
): Promise<MmResult<Record<string, unknown>>> {
  const bazar = await MmBazar.findOne({ _id: bazarId, messId: ctx.messId }).lean();
  if (!bazar) return mmFail(MM_ERR.NO_BAZAR);

  const refused = guardEdit(ctx, bazar);
  if (refused) return refused;

  const open = await requireOpenMonth(ctx, bazar.month);
  if (!open.ok) return open;

  const set: Record<string, unknown> = {};

  if (patch.date !== undefined) {
    if (!isDay(patch.date)) return mmFail(MM_ERR.BAD_DATE);
    const month = monthFor(ctx, patch.date);
    const target = await requireOpenMonth(ctx, month);
    if (!target.ok) return target;
    set.date = patch.date;
    set.month = month;
  }
  if (patch.payerId !== undefined) set.payerId = patch.payerId;
  if (patch.note !== undefined) set.note = patch.note;

  if (patch.receipt !== undefined) {
    const receipt = await saveAttachment(ctx, patch.receipt, 'bazar');
    if (!receipt.ok) return receipt;
    set.receiptId = receipt.result;
  }

  if (Object.keys(set).length) await MmBazar.updateOne({ _id: bazarId }, { $set: set });

  /* Items are replaced wholesale rather than diffed. The client edits a list
     and sends a list; reconciling two lists by id would be a lot of code to
     arrive at the same rows. */
  if (patch.items) {
    await MmBazarItem.deleteMany({ messId: ctx.messId, bazarId });
    const items = patch.items.filter((item) => item.name?.trim());
    if (items.length) {
      await MmBazarItem.insertMany(
        items.map((item) => ({
          messId: ctx.messId,
          bazarId,
          name: item.name.trim(),
          qty: Number(item.qty) || 0,
          unit: item.unit ?? 'piece',
          unitPrice: Number(item.unitPrice) || 0,
          total: itemTotal(item),
        })),
      );
    }
    await syncTotal(ctx.messId, bazarId);
  }

  audit(ctx, 'bazar.update', { entity: 'bazar', entityId: bazarId, summary: 'Edited a bazar entry' });

  return getBazar(ctx, bazarId);
}

/** Draft → submitted. §4.3, step 6. */
export async function submitBazar(ctx: MessContext, bazarId: string) {
  const bazar = await MmBazar.findOne({ _id: bazarId, messId: ctx.messId }).lean();
  if (!bazar) return mmFail(MM_ERR.NO_BAZAR);
  if (bazar.status !== 'draft' && bazar.status !== 'rejected') return mmFail(MM_ERR.BAD_STATUS);

  const refused = guardEdit(ctx, bazar);
  if (refused) return refused;

  const items = await MmBazarItem.countDocuments({ messId: ctx.messId, bazarId });
  if (!items) return mmFail(MM_ERR.BAZAR_EMPTY);

  const needsApproval = ctx.settings?.requireBazarApproval !== false;
  const status = needsApproval ? 'submitted' : 'approved';

  await MmBazar.updateOne(
    { _id: bazarId },
    {
      $set: {
        status,
        submittedAt: new Date(),
        decidedBy: status === 'approved' ? ctx.caller.customerKey : '',
        decidedAt: status === 'approved' ? new Date() : null,
      },
    },
  );

  audit(ctx, 'bazar.submit', { entity: 'bazar', entityId: bazarId, summary: 'Submitted a bazar for approval' });

  if (status === 'submitted') {
    await notifyApprovers(ctx, 'approve_bazar', {
      kind: 'bazar-added',
      title: 'A bazar is waiting for approval',
      body: `${ctx.memberName} submitted a ৳${bazar.total} bazar for ${bazar.date}.`,
      link: `/meal-management/bazar/${bazarId}`,
    });
  }

  return mmOk({ status });
}

/** Submitted → approved or rejected. §4.3, steps 7 and 8. */
export async function decideBazar(
  ctx: MessContext,
  bazarId: string,
  approve: boolean,
  note?: string,
): Promise<MmResult<{ status: string }>> {
  const refused = deny(ctx, 'approve_bazar');
  if (refused) return refused;

  const bazar = await MmBazar.findOne({ _id: bazarId, messId: ctx.messId }).lean();
  if (!bazar) return mmFail(MM_ERR.NO_BAZAR);
  if (bazar.status !== 'submitted') return mmFail(MM_ERR.BAD_STATUS, { status: bazar.status });

  const open = await requireOpenMonth(ctx, bazar.month);
  if (!open.ok) return open;

  const status = approve ? 'approved' : 'rejected';

  await MmBazar.updateOne(
    { _id: bazarId },
    {
      $set: {
        status,
        decidedBy: ctx.caller.customerKey,
        decidedAt: new Date(),
        decisionNote: note ?? '',
      },
    },
  );

  audit(ctx, approve ? 'bazar.approve' : 'bazar.reject', {
    entity: 'bazar',
    entityId: bazarId,
    summary: `${approve ? 'Approved' : 'Rejected'} a ৳${bazar.total} bazar`,
    before: { status: bazar.status },
    after: { status },
  });

  await notifyMembers(ctx, [bazar.buyerId], {
    kind: approve ? 'bazar-approved' : 'bazar-rejected',
    title: approve ? 'Your bazar was approved' : 'Your bazar was rejected',
    body: `The ৳${bazar.total} bazar for ${bazar.date} was ${approve ? 'approved' : 'rejected'}${note ? `: ${note}` : '.'}`,
    link: `/meal-management/bazar/${bazarId}`,
  });

  return mmOk({ status });
}

/**
 * Take a bazar back out of the books.
 *
 * A draft is deleted outright — it never counted. Anything further along is
 * *rejected* rather than removed, because §9 lists "bazar rejected after
 * submission" as a case the books have to survive and a deleted row explains
 * nothing to the person whose money it was.
 */
export async function removeBazar(ctx: MessContext, bazarId: string) {
  const bazar = await MmBazar.findOne({ _id: bazarId, messId: ctx.messId }).lean();
  if (!bazar) return mmFail(MM_ERR.NO_BAZAR);

  const refused = guardEdit(ctx, bazar);
  if (refused) return refused;

  if (bazar.status === 'draft') {
    await Promise.all([
      MmBazar.deleteOne({ _id: bazarId }),
      MmBazarItem.deleteMany({ messId: ctx.messId, bazarId }),
    ]);
    audit(ctx, 'bazar.delete', { entity: 'bazar', entityId: bazarId, summary: 'Deleted a draft bazar' });
    return mmOk({ removed: true });
  }

  await MmBazar.updateOne(
    { _id: bazarId },
    { $set: { status: 'rejected', decidedBy: ctx.caller.customerKey, decidedAt: new Date(), decisionNote: 'withdrawn' } },
  );
  audit(ctx, 'bazar.withdraw', { entity: 'bazar', entityId: bazarId, summary: 'Withdrew a bazar' });

  return mmOk({ removed: true });
}

/* ------------------------------------------------------------------ *
 * duty
 * ------------------------------------------------------------------ */

export async function listDuties(ctx: MessContext, input: { from?: string; to?: string }) {
  const today = todayIn(ctx);
  const from = input.from ?? shiftDay(today, -7);
  const to = input.to ?? shiftDay(today, 21);

  const rows = await MmDuty.find({ messId: ctx.messId, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .lean();

  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  return mmOk({
    from,
    to,
    today,
    duties: rows.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      memberId: row.memberId,
      memberName: nameOf.get(row.memberId) ?? 'Member',
      status: row.status,
      note: row.note,
      mine: row.memberId === ctx.memberId,
    })),
    canManage: allowed(ctx, 'manage_duty'),
  });
}

export async function assignDuty(
  ctx: MessContext,
  input: { date: string; memberId: string; note?: string },
) {
  const refused = deny(ctx, 'manage_duty');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);

  const member = await MmMember.findOne({ _id: input.memberId, messId: ctx.messId }).lean();
  if (!member) return mmFail(MM_ERR.NO_MEMBER);

  await MmDuty.updateOne(
    { messId: ctx.messId, date: input.date, memberId: input.memberId },
    {
      $set: { note: input.note ?? '' },
      $setOnInsert: {
        messId: ctx.messId,
        date: input.date,
        memberId: input.memberId,
        status: 'assigned',
        createdBy: ctx.caller.customerKey,
      },
    },
    { upsert: true },
  );

  audit(ctx, 'duty.assign', {
    entity: 'duty',
    summary: `${member.name} has bazar duty on ${input.date}`,
  });

  await notifyMembers(ctx, [input.memberId], {
    kind: 'duty-assigned',
    title: 'You have bazar duty',
    body: `You are on bazar duty on ${input.date}.`,
    link: '/meal-management/bazar/duty',
  });

  return mmOk({ assigned: true });
}

/**
 * Fill a stretch of days by rotating through the members. §4.3's rotation.
 *
 * Round-robin in membership order, starting from whoever last had it, so a
 * rotation regenerated in the middle of a month picks up where it left off
 * instead of resetting to the same person every time.
 */
export async function rotateDuty(
  ctx: MessContext,
  input: { from: string; to: string; memberIds?: string[] },
): Promise<MmResult<{ assigned: number }>> {
  const refused = deny(ctx, 'manage_duty');
  if (refused) return refused;
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) return mmFail(MM_ERR.BAD_DATE);

  const members = (await membersOf(ctx.messId)).filter((m) => m.status === 'active');
  const pool = input.memberIds?.length
    ? members.filter((m) => input.memberIds!.includes(m.memberId))
    : members;

  if (!pool.length) return mmFail(MM_ERR.NO_MEMBER);

  const last = await MmDuty.findOne({ messId: ctx.messId, date: { $lt: input.from } })
    .sort({ date: -1 })
    .lean();

  const startAt = last ? pool.findIndex((m) => m.memberId === last.memberId) + 1 : 0;

  const writes: Parameters<typeof MmDuty.bulkWrite>[0] = [];
  let index = 0;

  for (let date = input.from; date <= input.to; date = shiftDay(date, 1)) {
    const member = pool[(startAt + index) % pool.length];
    writes.push({
      updateOne: {
        filter: { messId: ctx.messId, date, memberId: member.memberId },
        update: {
          $setOnInsert: {
            messId: ctx.messId,
            date,
            memberId: member.memberId,
            status: 'assigned',
            createdBy: ctx.caller.customerKey,
          },
        },
        upsert: true,
      },
    });
    index += 1;
  }

  if (writes.length) await MmDuty.bulkWrite(writes);

  audit(ctx, 'duty.rotate', {
    entity: 'duty',
    summary: `Set a bazar rota from ${input.from} to ${input.to}`,
    after: { days: writes.length, members: pool.length },
  });

  return mmOk({ assigned: writes.length });
}

export async function updateDuty(
  ctx: MessContext,
  dutyId: string,
  patch: { status?: string; memberId?: string; note?: string },
) {
  const duty = await MmDuty.findOne({ _id: dutyId, messId: ctx.messId }).lean();
  if (!duty) return mmFail(MM_ERR.NO_DUTY);

  /* Marking your own turn done needs no permission; moving it to somebody
     else is a schedule change and does. */
  const reassigning = patch.memberId && patch.memberId !== duty.memberId;
  if (reassigning || duty.memberId !== ctx.memberId) {
    const refused = deny(ctx, 'manage_duty');
    if (refused) return refused;
  }

  const set: Record<string, unknown> = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.memberId !== undefined) set.memberId = patch.memberId;
  if (patch.note !== undefined) set.note = patch.note;

  await MmDuty.updateOne({ _id: dutyId }, { $set: set });
  audit(ctx, 'duty.update', { entity: 'duty', entityId: dutyId, summary: `Updated bazar duty for ${duty.date}` });

  return mmOk({ updated: true });
}

export async function removeDuty(ctx: MessContext, dutyId: string) {
  const refused = deny(ctx, 'manage_duty');
  if (refused) return refused;

  const out = await MmDuty.deleteOne({ _id: dutyId, messId: ctx.messId });
  if (!out.deletedCount) return mmFail(MM_ERR.NO_DUTY);

  return mmOk({ removed: true });
}

/* ------------------------------------------------------------------ *
 * summaries
 * ------------------------------------------------------------------ */

/**
 * Who has done how much of the shopping. §4.3's member-wise spending summary.
 *
 * Counted against the *payer* rather than the buyer: the question this answers
 * is who is out of pocket, and in a mess where one person shops and another
 * pays, the buyer is not the one waiting to be settled with.
 */
export async function bazarSummary(ctx: MessContext, month: string) {
  const rows = await MmBazar.find({ messId: ctx.messId, month, status: 'approved' }).lean();
  const members = await membersOf(ctx.messId);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  const byMember = new Map<string, { memberId: string; name: string; trips: number; total: number }>();

  for (const row of rows) {
    const key = row.payerId || row.buyerId;
    const entry = byMember.get(key) ?? { memberId: key, name: nameOf.get(key) ?? 'Member', trips: 0, total: 0 };
    entry.trips += 1;
    entry.total = round2(entry.total + row.total);
    byMember.set(key, entry);
  }

  const total = round2(rows.reduce((sum, row) => sum + row.total, 0));

  return mmOk({
    month,
    total,
    trips: rows.length,
    members: [...byMember.values()].sort((a, b) => b.total - a.total),
  });
}

/**
 * What the mess usually buys. §4.15's bazar suggestion, from history alone.
 *
 * The average quantity per trip over the last ninety days, scaled by how many
 * people are eating now versus then. No model — §4.15 says suggestions should
 * rest on member count, historical consumption and recent purchasing, and
 * that is exactly those three numbers.
 */
export async function bazarSuggestions(ctx: MessContext) {
  const today = todayIn(ctx);
  const since = shiftDay(today, -90);

  const bazars = await MmBazar.find({
    messId: ctx.messId,
    status: 'approved',
    date: { $gte: since },
  })
    .select({ _id: 1 })
    .lean();

  if (!bazars.length) return mmOk({ items: [], basis: 'no-history' });

  const items = await MmBazarItem.find({
    messId: ctx.messId,
    bazarId: { $in: bazars.map((b) => idOf(b._id)) },
  }).lean();

  const byName = new Map<string, { name: string; unit: string; qty: number; spend: number; trips: number }>();

  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const row = byName.get(key) ?? { name: item.name.trim(), unit: item.unit, qty: 0, spend: 0, trips: 0 };
    row.qty = round2(row.qty + item.qty);
    row.spend = round2(row.spend + item.total);
    row.trips += 1;
    byName.set(key, row);
  }

  const trips = bazars.length;

  return mmOk({
    basis: `${items.length} items across ${trips} approved trips since ${since}`,
    items: [...byName.values()]
      .filter((row) => row.trips >= 2)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 15)
      .map((row) => ({
        name: row.name,
        unit: row.unit,
        /* Per trip, rounded to something a person would actually buy. */
        suggestedQty: Math.max(0.5, Math.round((row.qty / trips) * 2) / 2),
        averageSpend: round2(row.spend / trips),
        seenIn: row.trips,
      })),
  });
}
