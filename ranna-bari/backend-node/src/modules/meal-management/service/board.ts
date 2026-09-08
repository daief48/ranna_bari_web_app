import { isDay, round2, shiftDay } from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import {
  MmCook,
  MmCookDay,
  MmCookPay,
  MmMenu,
  MmNotice,
  MmNotification,
  MmPoll,
  MmRating,
  MmSuggestion,
  MmVote,
} from '../models.js';

import {
  allowed,
  audit,
  deny,
  idOf,
  membersOf,
  monthFor,
  notifyEveryone,
  todayIn,
  type MessContext,
} from './context.js';
import { createExpense } from './money.js';

/**
 * The mess's shared surfaces. §4.10 to §4.14.
 *
 * Notifications, the notice board, polls, the menu and the cook. None of these
 * touch money, which is why they are one file rather than four — they are the
 * parts of the specification that make the product §4.13's "complete
 * meal-management platform" rather than an accounting app with a calendar.
 *
 * The one exception is cook salary, which crosses into money on purpose: §4.14
 * asks for payment history, and a salary paid out of mess funds that did not
 * appear as an expense would be money missing from the books. So a cook
 * payment writes an ordinary expense through the ordinary permission and
 * approval path, and holds its id.
 */

/* ------------------------------------------------------------------ *
 * 4.10 — notifications
 * ------------------------------------------------------------------ */

export async function listNotifications(ctx: MessContext, limit = 50) {
  const rows = await MmNotification.find({
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
  })
    .sort({ at: -1 })
    .limit(Math.min(200, limit))
    .lean();

  return mmOk({
    notifications: rows.map((row) => ({
      id: idOf(row._id),
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      read: row.read,
      at: row.at,
    })),
    unread: rows.filter((row) => !row.read).length,
  });
}

export async function readNotifications(ctx: MessContext, ids?: string[]) {
  const query: Record<string, unknown> = {
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
    read: false,
  };
  if (ids?.length) query._id = { $in: ids };

  const out = await MmNotification.updateMany(query, { $set: { read: true } });
  return mmOk({ read: out.modifiedCount });
}

/** The badge, without pulling the list to count it. */
export async function unreadCount(ctx: MessContext): Promise<number> {
  return MmNotification.countDocuments({
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
    read: false,
  });
}

/* ------------------------------------------------------------------ *
 * 4.11 — notice board
 * ------------------------------------------------------------------ */

export async function listNotices(ctx: MessContext) {
  const now = new Date();

  const rows = await MmNotice.find({
    messId: ctx.messId,
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  })
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .lean();

  return mmOk({
    notices: rows.map((row) => ({
      id: idOf(row._id),
      title: row.title,
      body: row.body,
      pinned: row.pinned,
      important: row.important,
      expiresAt: row.expiresAt,
      author: row.createdByName,
      /* Read state is per member, which is what §4.11 asks for. */
      read: (row.readBy ?? []).includes(ctx.memberId),
      at: row.createdAt,
    })),
    unread: rows.filter((row) => !(row.readBy ?? []).includes(ctx.memberId)).length,
    canManage: allowed(ctx, 'manage_notices'),
  });
}

export async function saveNotice(
  ctx: MessContext,
  input: {
    id?: string;
    title: string;
    body?: string;
    pinned?: boolean;
    important?: boolean;
    expiresAt?: string | null;
  },
) {
  const refused = deny(ctx, 'manage_notices');
  if (refused) return refused;
  if (!input.title?.trim()) return mmFail(MM_ERR.BAD_REQUEST, { field: 'title' });

  const expiresAt =
    input.expiresAt === null || input.expiresAt === undefined
      ? null
      : isDay(input.expiresAt)
        ? new Date(`${input.expiresAt}T23:59:59.999Z`)
        : null;

  if (input.id) {
    const out = await MmNotice.updateOne(
      { _id: input.id, messId: ctx.messId },
      {
        $set: {
          title: input.title.trim(),
          body: input.body ?? '',
          pinned: !!input.pinned,
          important: !!input.important,
          expiresAt,
        },
      },
    );
    if (!out.matchedCount) return mmFail(MM_ERR.NO_NOTICE);

    audit(ctx, 'notice.update', { entity: 'notice', entityId: input.id, summary: 'Edited a notice' });
    return listNotices(ctx);
  }

  const notice = await MmNotice.create({
    messId: ctx.messId,
    title: input.title.trim(),
    body: input.body ?? '',
    pinned: !!input.pinned,
    important: !!input.important,
    expiresAt,
    createdBy: ctx.caller.customerKey,
    createdByName: ctx.memberName,
  });

  audit(ctx, 'notice.create', {
    entity: 'notice',
    entityId: idOf(notice._id),
    summary: `Posted "${input.title.trim()}"`,
  });

  /* §4.11 lists a push notification against a notice, and an important one is
     the case the field exists for. */
  await notifyEveryone(ctx, {
    kind: 'notice',
    title: input.important ? `Important: ${input.title.trim()}` : input.title.trim(),
    body: input.body ?? '',
    link: '/meal-management/board/notices',
  });

  return listNotices(ctx);
}

export async function readNotice(ctx: MessContext, noticeId: string) {
  const out = await MmNotice.updateOne(
    { _id: noticeId, messId: ctx.messId },
    { $addToSet: { readBy: ctx.memberId } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.NO_NOTICE);
  return mmOk({ read: true });
}

export async function removeNotice(ctx: MessContext, noticeId: string) {
  const refused = deny(ctx, 'manage_notices');
  if (refused) return refused;

  const out = await MmNotice.updateOne(
    { _id: noticeId, messId: ctx.messId },
    { $set: { active: false } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.NO_NOTICE);

  audit(ctx, 'notice.remove', { entity: 'notice', entityId: noticeId, summary: 'Removed a notice' });
  return listNotices(ctx);
}

/* ------------------------------------------------------------------ *
 * 4.12 — polls
 * ------------------------------------------------------------------ */

/** Is this poll accepting votes right now? */
const pollOpen = (poll: { closed: boolean; startAt?: Date | null; endAt?: Date | null }): boolean => {
  if (poll.closed) return false;
  const now = Date.now();
  if (poll.startAt && poll.startAt.getTime() > now) return false;
  if (poll.endAt && poll.endAt.getTime() < now) return false;
  return true;
};

export async function listPolls(ctx: MessContext) {
  const polls = await MmPoll.find({ messId: ctx.messId }).sort({ createdAt: -1 }).limit(50).lean();
  if (!polls.length) return mmOk({ polls: [], canManage: allowed(ctx, 'manage_polls') });

  const votes = await MmVote.find({
    messId: ctx.messId,
    pollId: { $in: polls.map((p) => idOf(p._id)) },
  }).lean();

  const byPoll = new Map<string, typeof votes>();
  for (const vote of votes) {
    const list = byPoll.get(vote.pollId) ?? [];
    list.push(vote);
    byPoll.set(vote.pollId, list);
  }

  return mmOk({
    canManage: allowed(ctx, 'manage_polls'),
    polls: polls.map((poll) => {
      const pollId = idOf(poll._id);
      const cast = byPoll.get(pollId) ?? [];
      const mine = cast.find((v) => v.memberId === ctx.memberId);
      const open = pollOpen(poll);

      /* §4.12's result visibility: a 'final' poll hides the tally until it
         closes, so early votes do not steer the later ones. Your own vote is
         always visible to you. */
      const showResults = poll.resultVisibility === 'live' || !open;

      const tally = poll.options.map((option) => ({
        id: option.id,
        text: option.text,
        votes: showResults ? cast.filter((v) => v.optionIds.includes(option.id!)).length : null,
      }));

      return {
        id: pollId,
        question: poll.question,
        options: tally,
        multi: poll.multi,
        open,
        closed: poll.closed,
        startAt: poll.startAt,
        endAt: poll.endAt,
        resultVisibility: poll.resultVisibility,
        author: poll.createdByName,
        totalVotes: showResults ? cast.length : null,
        myVote: mine?.optionIds ?? [],
        at: poll.createdAt,
      };
    }),
  });
}

export async function createPoll(
  ctx: MessContext,
  input: {
    question: string;
    options: string[];
    multi?: boolean;
    endAt?: string | null;
    resultVisibility?: string;
  },
) {
  const refused = deny(ctx, 'manage_polls');
  if (refused) return refused;

  const options = (input.options ?? []).map((text) => text.trim()).filter(Boolean);
  if (!input.question?.trim()) return mmFail(MM_ERR.BAD_REQUEST, { field: 'question' });
  if (options.length < 2) return mmFail(MM_ERR.BAD_REQUEST, { field: 'options' });

  const poll = await MmPoll.create({
    messId: ctx.messId,
    question: input.question.trim(),
    options: options.map((text, index) => ({ id: `o${index + 1}`, text })),
    multi: !!input.multi,
    endAt: input.endAt && isDay(input.endAt) ? new Date(`${input.endAt}T23:59:59.999Z`) : null,
    resultVisibility: input.resultVisibility === 'final' ? 'final' : 'live',
    createdBy: ctx.caller.customerKey,
    createdByName: ctx.memberName,
  });

  audit(ctx, 'poll.create', {
    entity: 'poll',
    entityId: idOf(poll._id),
    summary: `Started a poll: "${input.question.trim()}"`,
  });

  await notifyEveryone(ctx, {
    kind: 'poll',
    title: 'A new poll',
    body: input.question.trim(),
    link: '/meal-management/board/polls',
  });

  return listPolls(ctx);
}

/**
 * Cast or change a vote.
 *
 * The unique index on (poll, member) makes changing a vote an update rather
 * than a second row, so §4.12's "one vote per user" is a property of the
 * schema. A single-choice poll silently keeps the first option rather than
 * refusing a client that sent two — the refusal would be correct and useless.
 */
export async function vote(
  ctx: MessContext,
  pollId: string,
  optionIds: string[],
): Promise<MmResult<Record<string, unknown>>> {
  const poll = await MmPoll.findOne({ _id: pollId, messId: ctx.messId }).lean();
  if (!poll) return mmFail(MM_ERR.NO_POLL);
  if (!pollOpen(poll)) return mmFail(MM_ERR.POLL_CLOSED);

  const valid = new Set(poll.options.map((o) => o.id));
  const chosen = (optionIds ?? []).filter((id) => valid.has(id));
  if (!chosen.length) return mmFail(MM_ERR.BAD_OPTION);

  await MmVote.updateOne(
    { pollId, memberId: ctx.memberId },
    {
      $set: {
        messId: ctx.messId,
        optionIds: poll.multi ? chosen : chosen.slice(0, 1),
        at: new Date(),
      },
    },
    { upsert: true },
  );

  return listPolls(ctx);
}

export async function closePoll(ctx: MessContext, pollId: string) {
  const refused = deny(ctx, 'manage_polls');
  if (refused) return refused;

  const out = await MmPoll.updateOne(
    { _id: pollId, messId: ctx.messId },
    { $set: { closed: true, endAt: new Date() } },
  );
  if (!out.matchedCount) return mmFail(MM_ERR.NO_POLL);

  audit(ctx, 'poll.close', { entity: 'poll', entityId: pollId, summary: 'Closed a poll' });
  return listPolls(ctx);
}

export async function removePoll(ctx: MessContext, pollId: string) {
  const refused = deny(ctx, 'manage_polls');
  if (refused) return refused;

  const out = await MmPoll.deleteOne({ _id: pollId, messId: ctx.messId });
  if (!out.deletedCount) return mmFail(MM_ERR.NO_POLL);

  await MmVote.deleteMany({ messId: ctx.messId, pollId });
  audit(ctx, 'poll.remove', { entity: 'poll', entityId: pollId, summary: 'Deleted a poll' });

  return listPolls(ctx);
}

/* ------------------------------------------------------------------ *
 * 4.13 — menu
 * ------------------------------------------------------------------ */

/**
 * A week of menus. §4.13's daily and weekly views, from one query.
 *
 * Seven days from `from`, with every sitting the mess has, so the screen can
 * draw the grid without inventing the gaps.
 */
export async function listMenu(ctx: MessContext, input: { from?: string; days?: number }) {
  const from = input.from && isDay(input.from) ? input.from : todayIn(ctx);
  const span = Math.min(31, Math.max(1, input.days ?? 7));
  const to = shiftDay(from, span - 1);

  const [rows, ratings] = await Promise.all([
    MmMenu.find({ messId: ctx.messId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
    MmRating.find({ messId: ctx.messId }).lean(),
  ]);

  const scoreOf = new Map<string, { total: number; count: number; mine: number | null }>();
  for (const rating of ratings) {
    const row = scoreOf.get(rating.menuId) ?? { total: 0, count: 0, mine: null };
    row.total += rating.rating;
    row.count += 1;
    if (rating.memberId === ctx.memberId) row.mine = rating.rating;
    scoreOf.set(rating.menuId, row);
  }

  const byDate = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const menuId = idOf(row._id);
    const score = scoreOf.get(menuId);
    const list = byDate.get(row.date) ?? [];
    list.push({
      id: menuId,
      mealType: row.mealType,
      items: row.items,
      special: row.special,
      note: row.note,
      rating: score?.count ? round2(score.total / score.count) : null,
      ratingCount: score?.count ?? 0,
      myRating: score?.mine ?? null,
    });
    byDate.set(row.date, list);
  }

  const days: { date: string; menus: Record<string, unknown>[] }[] = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) {
    days.push({ date, menus: byDate.get(date) ?? [] });
  }

  return mmOk({
    from,
    to,
    days,
    mealTypes: ctx.mealTypes.map((t) => ({ key: t.key, label: t.label })),
    canManage: allowed(ctx, 'manage_menu'),
  });
}

export async function saveMenu(
  ctx: MessContext,
  input: { date: string; mealType: string; items: string[]; special?: boolean; note?: string },
) {
  const refused = deny(ctx, 'manage_menu');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);
  if (!ctx.mealTypes.some((t) => t.key === input.mealType)) return mmFail(MM_ERR.NO_MEAL_TYPE);

  await MmMenu.updateOne(
    { messId: ctx.messId, date: input.date, mealType: input.mealType },
    {
      $set: {
        items: (input.items ?? []).map((item) => item.trim()).filter(Boolean),
        special: !!input.special,
        note: input.note ?? '',
      },
      $setOnInsert: {
        messId: ctx.messId,
        date: input.date,
        mealType: input.mealType,
        createdBy: ctx.caller.customerKey,
      },
    },
    { upsert: true },
  );

  audit(ctx, 'menu.save', {
    entity: 'menu',
    summary: `Set the ${input.mealType} menu for ${input.date}`,
  });

  return listMenu(ctx, { from: input.date, days: 1 });
}

export async function removeMenu(ctx: MessContext, menuId: string) {
  const refused = deny(ctx, 'manage_menu');
  if (refused) return refused;

  const out = await MmMenu.deleteOne({ _id: menuId, messId: ctx.messId });
  if (!out.deletedCount) return mmFail(MM_ERR.NO_MENU);

  return mmOk({ removed: true });
}

/** §4.13's food rating. One per member per menu; re-rating replaces. */
export async function rateMenu(ctx: MessContext, menuId: string, rating: number, comment?: string) {
  const menu = await MmMenu.findOne({ _id: menuId, messId: ctx.messId }).lean();
  if (!menu) return mmFail(MM_ERR.NO_MENU);

  const score = Math.round(Number(rating));
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return mmFail(MM_ERR.BAD_AMOUNT, { field: 'rating', range: '1-5' });
  }

  await MmRating.updateOne(
    { menuId, memberId: ctx.memberId },
    { $set: { messId: ctx.messId, rating: score, comment: comment ?? '', at: new Date() } },
    { upsert: true },
  );

  return listMenu(ctx, { from: menu.date, days: 1 });
}

/** §4.13's menu suggestion — anybody may ask, anybody may back it. */
export async function listSuggestions(ctx: MessContext) {
  const rows = await MmSuggestion.find({ messId: ctx.messId, status: 'open' })
    .sort({ at: -1 })
    .limit(100)
    .lean();

  return mmOk({
    suggestions: rows.map((row) => ({
      id: idOf(row._id),
      text: row.text,
      mealType: row.mealType,
      author: row.memberName,
      votes: (row.votes ?? []).length,
      mine: row.memberId === ctx.memberId,
      voted: (row.votes ?? []).includes(ctx.memberId),
      at: row.at,
    })),
  });
}

export async function addSuggestion(ctx: MessContext, text: string, mealType?: string) {
  if (!text?.trim()) return mmFail(MM_ERR.BAD_REQUEST, { field: 'text' });

  await MmSuggestion.create({
    messId: ctx.messId,
    memberId: ctx.memberId,
    memberName: ctx.memberName,
    text: text.trim(),
    mealType: mealType ?? '',
  });

  return listSuggestions(ctx);
}

export async function backSuggestion(ctx: MessContext, suggestionId: string) {
  const suggestion = await MmSuggestion.findOne({ _id: suggestionId, messId: ctx.messId }).lean();
  if (!suggestion) return mmFail(MM_ERR.BAD_REQUEST, { field: 'suggestionId' });

  const voted = (suggestion.votes ?? []).includes(ctx.memberId);

  await MmSuggestion.updateOne(
    { _id: suggestionId },
    voted ? { $pull: { votes: ctx.memberId } } : { $addToSet: { votes: ctx.memberId } },
  );

  return listSuggestions(ctx);
}

/* ------------------------------------------------------------------ *
 * 4.14 — cook
 * ------------------------------------------------------------------ */

export async function listCooks(ctx: MessContext) {
  const cooks = await MmCook.find({ messId: ctx.messId }).sort({ active: -1, createdAt: 1 }).lean();

  return mmOk({
    cooks: cooks.map((row) => ({
      id: idOf(row._id),
      name: row.name,
      phone: row.phone,
      salary: row.salary,
      schedule: row.schedule,
      joinedAt: row.joinedAt,
      active: row.active,
      note: row.note,
    })),
    canManage: allowed(ctx, 'manage_cook'),
  });
}

export async function saveCook(
  ctx: MessContext,
  input: {
    id?: string;
    name: string;
    phone?: string;
    salary?: number;
    schedule?: string;
    joinedAt?: string;
    active?: boolean;
    note?: string;
  },
) {
  const refused = deny(ctx, 'manage_cook');
  if (refused) return refused;
  if (!input.name?.trim()) return mmFail(MM_ERR.BAD_REQUEST, { field: 'name' });

  const fields = {
    name: input.name.trim(),
    phone: input.phone ?? '',
    salary: Math.max(0, Number(input.salary) || 0),
    schedule: input.schedule ?? '',
    joinedAt: input.joinedAt && isDay(input.joinedAt) ? input.joinedAt : '',
    note: input.note ?? '',
    ...(input.active === undefined ? {} : { active: input.active }),
  };

  if (input.id) {
    const out = await MmCook.updateOne({ _id: input.id, messId: ctx.messId }, { $set: fields });
    if (!out.matchedCount) return mmFail(MM_ERR.NO_COOK);
  } else {
    await MmCook.create({ messId: ctx.messId, ...fields });
  }

  audit(ctx, 'cook.save', { entity: 'cook', entityId: input.id ?? '', summary: `Updated cook ${fields.name}` });

  return listCooks(ctx);
}

/**
 * The cook's month: attendance, plates and pay. §4.14.
 *
 * Attendance and the meal count sit side by side deliberately — "present on
 * 28 days, cooked 812 plates" is the pair that makes a performance
 * conversation possible, and either number alone does not.
 */
export async function cookMonth(ctx: MessContext, cookId: string, month: string) {
  const cook = await MmCook.findOne({ _id: cookId, messId: ctx.messId }).lean();
  if (!cook) return mmFail(MM_ERR.NO_COOK);

  const [days, payments] = await Promise.all([
    MmCookDay.find({ messId: ctx.messId, cookId, month }).sort({ date: 1 }).lean(),
    MmCookPay.find({ messId: ctx.messId, cookId }).sort({ date: -1 }).limit(24).lean(),
  ]);

  const present = days.filter((d) => d.status === 'present').length;
  const mealsCooked = days.reduce((sum, d) => sum + (d.mealsCooked || 0), 0);

  return mmOk({
    cook: {
      id: idOf(cook._id),
      name: cook.name,
      phone: cook.phone,
      salary: cook.salary,
      schedule: cook.schedule,
      active: cook.active,
    },
    month,
    attendance: days.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      status: row.status,
      mealsCooked: row.mealsCooked,
      replacementName: row.replacementName,
      note: row.note,
    })),
    summary: {
      recorded: days.length,
      present,
      absent: days.filter((d) => d.status === 'absent').length,
      leave: days.filter((d) => d.status === 'leave').length,
      replaced: days.filter((d) => d.status === 'replaced').length,
      mealsCooked,
      averagePerDay: present ? round2(mealsCooked / present) : 0,
    },
    payments: payments.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      month: row.month,
      amount: row.amount,
      method: row.method,
      note: row.note,
      expenseId: row.expenseId,
    })),
    canManage: allowed(ctx, 'manage_cook'),
  });
}

export async function recordCookDay(
  ctx: MessContext,
  input: {
    cookId: string;
    date: string;
    status?: string;
    mealsCooked?: number;
    replacementName?: string;
    note?: string;
  },
) {
  const refused = deny(ctx, 'manage_cook');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);

  const cook = await MmCook.exists({ _id: input.cookId, messId: ctx.messId });
  if (!cook) return mmFail(MM_ERR.NO_COOK);

  await MmCookDay.updateOne(
    { messId: ctx.messId, cookId: input.cookId, date: input.date },
    {
      $set: {
        month: monthFor(ctx, input.date),
        status: input.status ?? 'present',
        mealsCooked: Math.max(0, Number(input.mealsCooked) || 0),
        replacementName: input.replacementName ?? '',
        note: input.note ?? '',
        recordedBy: ctx.caller.customerKey,
      },
      $setOnInsert: { messId: ctx.messId, cookId: input.cookId, date: input.date },
    },
    { upsert: true },
  );

  return cookMonth(ctx, input.cookId, monthFor(ctx, input.date));
}

/**
 * Pay the cook. §4.14's payment history, and an expense.
 *
 * The expense is written through `createExpense`, so it obeys the same
 * category rules, the same approval flow and the same closed-month refusal as
 * money entered by hand. A salary that skipped that would be a hole in §4.6's
 * "approved records only".
 */
export async function payCook(
  ctx: MessContext,
  input: {
    cookId: string;
    date: string;
    amount: number;
    method?: string;
    note?: string;
    categoryKey?: string;
  },
): Promise<MmResult<Record<string, unknown>>> {
  const refused = deny(ctx, 'manage_cook');
  if (refused) return refused;
  if (!isDay(input.date)) return mmFail(MM_ERR.BAD_DATE);
  if (!Number.isFinite(input.amount) || input.amount <= 0) return mmFail(MM_ERR.BAD_AMOUNT);

  const cook = await MmCook.findOne({ _id: input.cookId, messId: ctx.messId }).lean();
  if (!cook) return mmFail(MM_ERR.NO_COOK);

  const month = monthFor(ctx, input.date);

  const expense = await createExpense(ctx, {
    date: input.date,
    amount: input.amount,
    categoryKey: input.categoryKey ?? 'cook',
    note: `Salary — ${cook.name}${input.note ? `. ${input.note}` : ''}`,
    allocationMode: 'meal',
  });
  if (!expense.ok) return expense;

  await MmCookPay.create({
    messId: ctx.messId,
    cookId: input.cookId,
    month,
    date: input.date,
    amount: round2(input.amount),
    method: input.method ?? 'cash',
    note: input.note ?? '',
    expenseId: expense.result.id,
    createdBy: ctx.caller.customerKey,
  });

  audit(ctx, 'cook.pay', {
    entity: 'cook',
    entityId: input.cookId,
    summary: `Paid ${cook.name} ৳${round2(input.amount)}`,
  });

  return cookMonth(ctx, input.cookId, month);
}

/* ------------------------------------------------------------------ *
 * a small shared read
 * ------------------------------------------------------------------ */

/** Today's menu, for the dashboard. */
export async function todayMenu(ctx: MessContext) {
  const date = todayIn(ctx);
  const rows = await MmMenu.find({ messId: ctx.messId, date }).lean();

  return rows.map((row) => ({
    mealType: row.mealType,
    items: row.items,
    special: row.special,
  }));
}

/** Who is in the mess, for pickers that need names and nothing else. */
export const memberOptions = async (ctx: MessContext) =>
  (await membersOf(ctx.messId))
    .filter((m) => m.status === 'active')
    .map((m) => ({ memberId: m.memberId, name: m.name, ghost: m.ghost }));
