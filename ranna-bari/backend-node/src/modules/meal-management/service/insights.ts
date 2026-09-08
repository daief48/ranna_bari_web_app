import {
  daysBetween,
  isDay,
  monthRange,
  nextCutoff,
  previousMonth,
  round2,
  round4,
  shiftDay,
  wallClock,
  type MealMap,
} from '../calc.js';
import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import {
  MmAssistantMessage,
  MmBazar,
  MmCookDay,
  MmDeposit,
  MmDuty,
  MmExpense,
  MmMealEntry,
  MmMealRequest,
  MmNotice,
  MmSession,
} from '../models.js';

import {
  allowed,
  audit,
  idOf,
  membersOf,
  monthFor,
  permissions,
  rateTypesOf,
  todayIn,
  type MessContext,
} from './context.js';
import { statementFor } from './closing.js';
import { pendingCounts } from './money.js';
import { setMeal } from './meals.js';
import { todayMenu } from './board.js';
import { unreadMessages } from './chat.js';

/**
 * The dashboard, the analytics and the assistant. §4.7, §4.16, §4.15.
 *
 * Everything in this file is derived — it reads what other modules recorded
 * and says something about it. Nothing here writes an accounting record, with
 * exactly one exception: the assistant, which performs a confirmed action by
 * calling the ordinary service function under the ordinary permission check.
 *
 * §4.15's five rules are the design of the second half of this file, and the
 * one that shapes it most is *AI must not silently alter financial records*.
 * So the assistant is two calls, not one: the first parses and proposes, the
 * second performs what the person confirmed. There is no path from a sentence
 * to a changed number without a human step in between.
 */

/* ------------------------------------------------------------------ *
 * 4.7 — dashboards
 * ------------------------------------------------------------------ */

/**
 * One payload for both dashboards. §4.7.
 *
 * The specification splits the admin and member views into two lists, and
 * about half of each is the same figure. So this returns both halves and lets
 * the app draw what the role allows — the `permissions` block travels with it
 * for exactly that. An admin's extra tiles are simply absent for a member
 * rather than being a second endpoint that has to stay in step with this one.
 */
export async function dashboard(
  ctx: MessContext,
  month?: string,
): Promise<MmResult<Record<string, unknown>>> {
  const today = todayIn(ctx);
  const target = month ?? monthFor(ctx, today);
  const zone = ctx.settings?.timezone ?? 'Asia/Dhaka';

  const [statement, session, todayEntries, pending, corrections, duty, notices, menu, members, unreadChat] =
    await Promise.all([
      statementFor(ctx, target),
      MmSession.findOne({ messId: ctx.messId, month: target }).lean(),
      MmMealEntry.find({ messId: ctx.messId, date: today }).lean(),
      pendingCounts(ctx, target),
      allowed(ctx, 'approve_meal_correction')
        ? MmMealRequest.countDocuments({ messId: ctx.messId, status: 'pending' })
        : MmMealRequest.countDocuments({ messId: ctx.messId, memberId: ctx.memberId, status: 'pending' }),
      MmDuty.findOne({ messId: ctx.messId, date: today }).lean(),
      MmNotice.countDocuments({
        messId: ctx.messId,
        active: true,
        readBy: { $ne: ctx.memberId },
        $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
      }),
      todayMenu(ctx),
      membersOf(ctx.messId),
      unreadMessages(ctx),
    ]);

  const rateTypes = rateTypesOf(ctx);
  const nameOf = new Map(members.map((m) => [m.memberId, m.name]));

  /* Today's plates, per sitting — what the cook and the dashboard both want. */
  const todayTotals: MealMap = {};
  let todayCount = 0;
  for (const entry of todayEntries) {
    for (const [key, value] of Object.entries((entry.values ?? {}) as MealMap)) {
      if (!rateTypes.has(key)) continue;
      todayTotals[key] = round4((todayTotals[key] ?? 0) + Number(value));
      todayCount = round4(todayCount + Number(value));
    }
    for (const [key, value] of Object.entries((entry.guests ?? {}) as MealMap)) {
      todayTotals[key] = round4((todayTotals[key] ?? 0) + Number(value));
      todayCount = round4(todayCount + Number(value));
    }
  }

  const mine = statement.members.find((m) => m.memberId === ctx.memberId) ?? null;
  const myToday = todayEntries.find((e) => e.memberId === ctx.memberId);

  const wide = allowed(ctx, 'view_all_reports');

  return mmOk({
    month: target,
    today,
    closed: session?.status === 'closed' || session?.status === 'archived',

    mess: {
      messId: ctx.messId,
      name: ctx.messName,
      memberId: ctx.memberId,
      memberName: ctx.memberName,
      role: ctx.role,
      currency: ctx.settings?.currency ?? 'BDT',
    },

    permissions: permissions(ctx),
    mealTypes: ctx.mealTypes,

    /* §4.7's member dashboard. */
    me: {
      meals: mine?.meals ?? 0,
      byType: mine?.byType ?? {},
      guestMeals: mine?.guestMeals ?? 0,
      foodCost: mine?.foodCost ?? 0,
      otherCost: mine?.otherCost ?? 0,
      totalCharge: mine?.totalCharge ?? 0,
      deposits: mine?.deposits ?? 0,
      balance: mine?.balance ?? 0,
      /* Named rather than signed, because "৳600 advance" and "৳600 due" are
         the two things a member actually wants to read. */
      standing: (mine?.balance ?? 0) >= 0 ? 'advance' : 'due',
      todayValues: (myToday?.values ?? {}) as MealMap,
      todayGuests: (myToday?.guests ?? {}) as MealMap,
    },

    /* Shared figures — a member sees these too, because §13 says every amount
       shown has to be traceable and a bill without the rate is not. */
    mealRate: statement.mealRate,
    totalMeals: statement.totalMeals,
    totalCost: statement.totalCost,
    foodCost: statement.foodCost,
    otherCost: statement.otherCost,

    /* §4.7's admin dashboard. */
    mess_totals: wide
      ? {
          members: members.filter((m) => m.status === 'active').length,
          totalDeposits: statement.totalDeposits,
          balance: round2(statement.totalDeposits - statement.totalCharged),
          categories: statement.categories,
          memberBalances: statement.members.map((m) => ({
            memberId: m.memberId,
            name: m.name,
            meals: m.meals,
            balance: m.balance,
          })),
        }
      : null,

    todayMeals: { total: todayCount, byType: todayTotals },

    pendingApprovals: { ...pending, corrections, total: pending.total + corrections },

    todayDuty: duty
      ? { memberId: duty.memberId, name: nameOf.get(duty.memberId) ?? 'Member', status: duty.status, mine: duty.memberId === ctx.memberId }
      : null,

    nextCutoff: nextCutoff(ctx.mealTypes, zone),
    unreadNotices: notices,
    unreadMessages: unreadChat,
    menu,
  });
}

/* ------------------------------------------------------------------ *
 * 4.16 — analytics
 * ------------------------------------------------------------------ */

/**
 * §4.16's twelve figures, in one call.
 *
 * Six months of history behind whatever month is asked for, because every one
 * of the specification's "trend" items is meaningless at a single point. The
 * closed months come off their snapshots and the open ones are computed, so a
 * trend line never disagrees with the settlement it passes through.
 */
export async function analytics(
  ctx: MessContext,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  const months: string[] = [];
  let cursor = month;
  for (let i = 0; i < 6; i += 1) {
    months.push(cursor);
    cursor = previousMonth(cursor);
  }

  const sessions = await MmSession.find({ messId: ctx.messId, month: { $in: months } }).lean();
  const closed = new Map(sessions.map((s) => [s.month, s]));

  const monthly: {
    month: string;
    mealRate: number;
    totalMeals: number;
    totalCost: number;
    foodCost: number;
    otherCost: number;
    deposits: number;
    members: number;
  }[] = [];

  for (const m of months) {
    const session = closed.get(m);
    if (session && (session.status === 'closed' || session.status === 'archived')) {
      monthly.push({
        month: m,
        mealRate: session.mealRate,
        totalMeals: session.totalMeals,
        totalCost: session.totalCost,
        foodCost: session.foodCost,
        otherCost: session.otherCost,
        deposits: session.totalDeposits,
        members: (session.members ?? []).length,
      });
      continue;
    }

    const live = await statementFor(ctx, m);
    if (live.totalMeals === 0 && live.totalCost === 0) continue;
    monthly.push({
      month: m,
      mealRate: live.mealRate,
      totalMeals: live.totalMeals,
      totalCost: live.totalCost,
      foodCost: live.foodCost,
      otherCost: live.otherCost,
      deposits: live.totalDeposits,
      members: live.members.length,
    });
  }

  monthly.reverse();

  /* Daily meals across the requested month — §4.16's daily meal trend. */
  const { from, to } = monthRange(month, ctx.settings?.monthStartDay ?? 1);
  const entries = await MmMealEntry.find({ messId: ctx.messId, month }).lean();
  const rateTypes = rateTypesOf(ctx);

  const perDay = new Map<string, number>();
  for (const entry of entries) {
    let day = 0;
    for (const [key, value] of Object.entries((entry.values ?? {}) as MealMap)) {
      if (rateTypes.has(key)) day += Number(value) || 0;
    }
    for (const [, value] of Object.entries((entry.guests ?? {}) as MealMap)) day += Number(value) || 0;
    perDay.set(entry.date, round4((perDay.get(entry.date) ?? 0) + day));
  }

  const daily: { date: string; meals: number }[] = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) {
    daily.push({ date, meals: perDay.get(date) ?? 0 });
  }

  const statement = await statementFor(ctx, month);
  const current = monthly.find((m) => m.month === month);
  const prior = monthly.find((m) => m.month === previousMonth(month));

  /* §4.16's bazar trend, alongside the expense one. */
  const bazars = await MmBazar.find({ messId: ctx.messId, month, status: 'approved' }).lean();

  const waste = await wasteEstimate(ctx, month);

  return mmOk({
    month,
    monthly,
    daily,

    /* Member consumption, and §4.16's average per member. */
    consumption: statement.members
      .map((m) => ({ memberId: m.memberId, name: m.name, meals: m.meals, cost: m.foodCost }))
      .sort((a, b) => b.meals - a.meals),
    averagePerMember: statement.members.length
      ? round2(statement.totalMeals / statement.members.length)
      : 0,

    categories: statement.categories,
    highestCategory: statement.categories[0] ?? null,

    bazar: { trips: bazars.length, total: round2(bazars.reduce((s, b) => s + b.total, 0)) },

    depositVsExpense: {
      deposits: statement.totalDeposits,
      charged: statement.totalCharged,
      difference: round2(statement.totalDeposits - statement.totalCharged),
    },

    comparison:
      current && prior
        ? {
            mealRate: prior.mealRate ? round2(((current.mealRate - prior.mealRate) / prior.mealRate) * 100) : null,
            totalCost: prior.totalCost ? round2(((current.totalCost - prior.totalCost) / prior.totalCost) * 100) : null,
            totalMeals: prior.totalMeals ? round2(((current.totalMeals - prior.totalMeals) / prior.totalMeals) * 100) : null,
          }
        : null,

    waste: waste.ok ? waste.result : null,
  });
}

/* ------------------------------------------------------------------ *
 * 4.15 — the AI layer
 * ------------------------------------------------------------------ */

/**
 * §4.15's expense analysis, as arithmetic.
 *
 * The specification's own example is *"grocery expense is 18% higher than
 * last month"*, which is a subtraction and a division. What makes it useful is
 * not the model that produced it but that it names the category, the figure
 * and the comparison — so that is what this returns, and the app renders the
 * sentence.
 */
export async function expenseInsights(ctx: MessContext, month: string) {
  const prior = previousMonth(month);

  const [now, before] = await Promise.all([
    MmExpense.find({ messId: ctx.messId, month, status: 'approved' }).lean(),
    MmExpense.find({ messId: ctx.messId, month: prior, status: 'approved' }).lean(),
  ]);

  const sum = (rows: typeof now) => {
    const out = new Map<string, { label: string; amount: number }>();
    for (const row of rows) {
      const entry = out.get(row.categoryKey) ?? { label: row.categoryLabel || row.categoryKey, amount: 0 };
      entry.amount = round2(entry.amount + row.amount);
      out.set(row.categoryKey, entry);
    }
    return out;
  };

  const a = sum(now);
  const b = sum(before);

  const changes = [...a.entries()]
    .map(([key, entry]) => {
      const was = b.get(key)?.amount ?? 0;
      return {
        key,
        label: entry.label,
        amount: entry.amount,
        previous: was,
        changePercent: was ? round2(((entry.amount - was) / was) * 100) : null,
      };
    })
    /* A category that moved by less than a tenth is noise, not an insight. */
    .filter((row) => row.changePercent === null || Math.abs(row.changePercent) >= 10)
    .sort((x, y) => Math.abs(y.changePercent ?? 0) - Math.abs(x.changePercent ?? 0));

  return mmOk({
    month,
    previousMonth: prior,
    changes,
    insights: changes.slice(0, 5).map((row) =>
      row.changePercent === null
        ? `${row.label} is new this month at ৳${row.amount}.`
        : `${row.label} is ${Math.abs(row.changePercent)}% ${row.changePercent > 0 ? 'higher' : 'lower'} than last month (৳${row.amount} against ৳${row.previous}).`,
    ),
  });
}

/**
 * §4.15's meal prediction — "tomorrow expected meals: 28".
 *
 * Two sources, in order of trust. Meals already recorded for tomorrow are a
 * fact and are used as they stand for the sittings that have them; sittings
 * with nothing recorded fall back to the last four weeks' attendance rate for
 * that sitting. The response says which is which, because §4.15's last rule
 * asks that an explanation identify its data basis.
 */
export async function mealPrediction(ctx: MessContext, date?: string) {
  const today = todayIn(ctx);
  const target = date && isDay(date) ? date : shiftDay(today, 1);

  const since = shiftDay(today, -28);
  const members = (await membersOf(ctx.messId)).filter((m) => m.status === 'active');

  const [history, booked] = await Promise.all([
    MmMealEntry.find({ messId: ctx.messId, date: { $gte: since, $lt: today } }).lean(),
    MmMealEntry.find({ messId: ctx.messId, date: target }).lean(),
  ]);

  const historyDays = new Set(history.map((h) => h.date)).size;

  const slots = ctx.mealTypes.map((type) => {
    const taken = history.reduce((sum, entry) => {
      const value = Number((entry.values as MealMap)?.[type.key]) || 0;
      return sum + (value > 0 ? 1 : 0);
    }, 0);

    const opportunities = historyDays * Math.max(1, members.length);
    const rate = opportunities ? taken / opportunities : 0;

    const bookedCount = booked.reduce((sum, entry) => {
      const own = Number((entry.values as MealMap)?.[type.key]) || 0;
      const guest = Number((entry.guests as MealMap)?.[type.key]) || 0;
      return sum + own + guest;
    }, 0);

    /* Anybody who has already said counts as said; the rest are predicted. */
    const decided = booked.filter((e) => (e.values as MealMap)?.[type.key] !== undefined).length;
    const undecided = Math.max(0, members.length - decided);

    return {
      mealType: type.key,
      label: type.label,
      booked: round4(bookedCount),
      predicted: round4(bookedCount + undecided * rate),
      /* Round up: half a plate short is a person with no dinner. */
      cook: Math.ceil(bookedCount + undecided * rate),
      attendanceRate: round2(rate * 100),
      confidence: historyDays >= 21 ? 'high' : historyDays >= 7 ? 'medium' : 'low',
    };
  });

  return mmOk({
    date: target,
    members: members.length,
    basis: `${historyDays} days of history and ${booked.length} entries already recorded for ${target}`,
    slots,
  });
}

/**
 * §4.15's waste detection.
 *
 * Compares what was cooked against what was eaten — the cook's own recorded
 * plate count against the meals members were billed for. A mess that does not
 * record plates gets no estimate rather than a fabricated one, which is the
 * honest answer and the one §4.15's explanation rule implies.
 */
export async function wasteEstimate(
  ctx: MessContext,
  month: string,
): Promise<MmResult<Record<string, unknown>>> {
  const [cooked, entries] = await Promise.all([
    MmCookDay.find({ messId: ctx.messId, month, mealsCooked: { $gt: 0 } }).lean(),
    MmMealEntry.find({ messId: ctx.messId, month }).lean(),
  ]);

  if (!cooked.length) {
    return mmOk({
      month,
      available: false,
      reason: 'No cook plate counts have been recorded for this month.',
    });
  }

  const rateTypes = rateTypesOf(ctx);
  const eatenByDate = new Map<string, number>();

  for (const entry of entries) {
    let day = 0;
    for (const [key, value] of Object.entries((entry.values ?? {}) as MealMap)) {
      if (rateTypes.has(key)) day += Number(value) || 0;
    }
    for (const [, value] of Object.entries((entry.guests ?? {}) as MealMap)) day += Number(value) || 0;
    eatenByDate.set(entry.date, round4((eatenByDate.get(entry.date) ?? 0) + day));
  }

  const days = cooked.map((row) => {
    const eaten = eatenByDate.get(row.date) ?? 0;
    return {
      date: row.date,
      cooked: row.mealsCooked,
      eaten,
      surplus: round4(row.mealsCooked - eaten),
    };
  });

  const totalCooked = round4(days.reduce((s, d) => s + d.cooked, 0));
  const totalEaten = round4(days.reduce((s, d) => s + d.eaten, 0));
  const surplus = round4(totalCooked - totalEaten);

  const statement = await statementFor(ctx, month);

  return mmOk({
    month,
    available: true,
    cooked: totalCooked,
    eaten: totalEaten,
    surplus,
    surplusPercent: totalCooked ? round2((surplus / totalCooked) * 100) : 0,
    /* Priced at the meal rate, because that is what a surplus plate cost. */
    estimatedCost: round2(Math.max(0, surplus) * statement.mealRate),
    worstDays: days
      .filter((d) => d.surplus > 0)
      .sort((a, b) => b.surplus - a.surplus)
      .slice(0, 5),
  });
}

/* ------------------------------------------------------------------ *
 * the assistant
 * ------------------------------------------------------------------ */

/** Words that name a sitting, in both languages the app speaks. */
const TYPE_WORDS: Record<string, string[]> = {
  breakfast: ['breakfast', 'সকাল', 'নাস্তা', 'নাশতা', 'সকালের'],
  lunch: ['lunch', 'দুপুর', 'দুপুরে', 'দুপুরের'],
  dinner: ['dinner', 'রাত', 'রাতে', 'রাতের', 'রাত্রে'],
};

const NEGATIVES = ['off', 'no', "won't", 'wont', 'not', 'skip', 'cancel', 'না', 'নাই', 'বন্ধ'];
const POSITIVES = ['on', 'yes', 'will', 'add', 'want', 'হ্যাঁ', 'চালু', 'খাব', 'খাবো'];

/**
 * Turn a sentence into an intent. §4.15's meal assistant.
 *
 * Rule-based on purpose. §4.15 asks that the assistant validate against
 * cutoffs and permissions, that its financial actions be checked server-side
 * and that its explanations identify their data basis — all three are easier
 * to guarantee about a parser whose reasoning can be printed than about a
 * model whose cannot. It handles the shapes the specification's own examples
 * use, in Bangla and English, and says plainly when it does not understand.
 */
function parseIntent(
  ctx: MessContext,
  text: string,
): { kind: string; date?: string; values?: MealMap; explain: string } | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const today = todayIn(ctx);

  /* When. Bangla "কাল" is both yesterday and tomorrow; in a meal instruction
     it is all but always tomorrow, and the confirmation step catches the rest. */
  let date = today;
  let whenSaid = 'today';
  if (/tomorrow|আগামীকাল|আগামিকাল|কালকে|কাল/.test(lower)) {
    date = shiftDay(today, 1);
    whenSaid = 'tomorrow';
  } else if (/day after|পরশু/.test(lower)) {
    date = shiftDay(today, 2);
    whenSaid = 'the day after tomorrow';
  }

  const explicit = /(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (explicit) {
    date = explicit[1];
    whenSaid = explicit[1];
  }

  /* Which sittings. Naming none means all of them, which is how "I'm away
     tomorrow" has to read. */
  const named = Object.entries(TYPE_WORDS)
    .filter(([key, words]) => ctx.mealTypes.some((t) => t.key === key) && words.some((w) => lower.includes(w)))
    .map(([key]) => key);

  const targets = named.length ? named : ctx.mealTypes.map((t) => t.key);

  const negative = NEGATIVES.some((w) => lower.includes(w));
  const positive = POSITIVES.some((w) => lower.includes(w));

  /* Bangla puts the negation after the verb — "খাব না" is off, "খাব" is on —
     so a sentence carrying both words is read as the negative. */
  if (!negative && !positive) {
    if (/rate|খরচ|হিসাব|balance|due|কত/.test(lower)) {
      return { kind: 'ask-balance', explain: 'You asked about your balance or the meal rate.' };
    }
    return null;
  }

  const value = negative ? 0 : 1;
  const values: MealMap = {};
  for (const key of targets) values[key] = value;

  const labels = targets
    .map((key) => ctx.mealTypes.find((t) => t.key === key)?.label ?? key)
    .join(', ');

  return {
    kind: 'set-meal',
    date,
    values,
    explain: `Turn ${labels} ${value ? 'on' : 'off'} for ${whenSaid} (${date}).`,
  };
}

/**
 * Read a sentence and propose what to do about it. §4.15.
 *
 * Proposes only. The action comes back with a token the app echoes to
 * `assistantConfirm`, which is what §4.15's *high-impact changes should
 * require user confirmation* means when written down — the assistant cannot
 * change a meal by being talked to.
 */
export async function assistantAsk(
  ctx: MessContext,
  text: string,
): Promise<MmResult<Record<string, unknown>>> {
  await MmAssistantMessage.create({
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
    role: 'user',
    text,
  });

  const intent = parseIntent(ctx, text);

  if (!intent) {
    await MmAssistantMessage.create({
      messId: ctx.messId,
      customerKey: ctx.caller.customerKey,
      role: 'assistant',
      text: 'I could not turn that into an action.',
      outcome: 'refused',
    });
    return mmFail(MM_ERR.AI_UNCLEAR);
  }

  if (intent.kind === 'ask-balance') {
    const month = monthFor(ctx, todayIn(ctx));
    const statement = await statementFor(ctx, month);
    const mine = statement.members.find((m) => m.memberId === ctx.memberId);

    const reply = mine
      ? `You have taken ${mine.meals} meals this month at ৳${statement.mealRate} each — ৳${mine.totalCharge} charged against ৳${mine.deposits} deposited, so you are ${mine.balance >= 0 ? `৳${mine.balance} in advance` : `৳${round2(-mine.balance)} due`}.`
      : 'You have no meals recorded this month yet.';

    await MmAssistantMessage.create({
      messId: ctx.messId,
      customerKey: ctx.caller.customerKey,
      role: 'assistant',
      text: reply,
      outcome: 'none',
    });

    return mmOk({ kind: 'answer', reply, basis: `${month} records` });
  }

  /* §4.15: the assistant must not bypass permissions. Asked before the
     proposal is even shown, so a member is never offered an action that
     would then be refused. */
  const perms = permissions(ctx);
  if (!perms.edit_own_meal) {
    await MmAssistantMessage.create({
      messId: ctx.messId,
      customerKey: ctx.caller.customerKey,
      role: 'assistant',
      text: intent.explain,
      action: intent,
      outcome: 'refused',
    });
    return mmFail(MM_ERR.AI_FORBIDDEN);
  }

  const proposal = await MmAssistantMessage.create({
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
    role: 'assistant',
    text: intent.explain,
    action: intent,
    outcome: 'proposed',
  });

  return mmOk({
    kind: 'proposal',
    proposalId: idOf(proposal._id),
    action: intent,
    /* The sentence the app shows above Confirm and Cancel. */
    reply: intent.explain,
    needsConfirmation: true,
  });
}

/**
 * Do what was proposed. §4.15.
 *
 * Performs through `setMeal`, so the cutoff, the closed month and the
 * permission matrix all apply exactly as they would to a tap. The assistant
 * has no privileges of its own — that is the whole of §4.15's rule list in
 * one function call.
 */
export async function assistantConfirm(
  ctx: MessContext,
  proposalId: string,
): Promise<MmResult<Record<string, unknown>>> {
  const proposal = await MmAssistantMessage.findOne({
    _id: proposalId,
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
  }).lean();

  if (!proposal || !proposal.action) return mmFail(MM_ERR.AI_UNCLEAR);
  if (proposal.outcome !== 'proposed') return mmFail(MM_ERR.BAD_STATUS);

  const action = proposal.action as { kind: string; date?: string; values?: MealMap };
  if (action.kind !== 'set-meal' || !action.date) return mmFail(MM_ERR.AI_UNCLEAR);

  const out = await setMeal(ctx, {
    date: action.date,
    values: action.values,
    source: 'assistant',
  });

  await MmAssistantMessage.updateOne(
    { _id: proposalId },
    { $set: { outcome: out.ok ? 'performed' : 'refused' } },
  );

  if (!out.ok) return out;

  audit(ctx, 'assistant.perform', {
    entity: 'meal',
    entityId: action.date,
    summary: `Assistant applied: ${proposal.text}`,
    after: action.values ?? {},
  });

  return mmOk({ kind: 'done', applied: out.result, reply: proposal.text });
}

/** The assistant's transcript, so a proposal can be read back. */
export async function assistantHistory(ctx: MessContext, limit = 30) {
  const rows = await MmAssistantMessage.find({
    messId: ctx.messId,
    customerKey: ctx.caller.customerKey,
  })
    .sort({ at: -1 })
    .limit(Math.min(100, limit))
    .lean();

  return mmOk({
    messages: rows.reverse().map((row) => ({
      id: idOf(row._id),
      role: row.role,
      text: row.text,
      action: row.action,
      outcome: row.outcome,
      at: row.at,
    })),
  });
}

/* ------------------------------------------------------------------ *
 * a small shared read
 * ------------------------------------------------------------------ */

/** How long the mess has been keeping records — used to temper confidence. */
export async function historyDepth(ctx: MessContext): Promise<number> {
  const first = await MmMealEntry.findOne({ messId: ctx.messId }).sort({ date: 1 }).select({ date: 1 }).lean();
  if (!first) return 0;
  return Math.max(0, daysBetween(first.date, wallClock(ctx.settings?.timezone ?? 'Asia/Dhaka').day));
}

/** Deposits against charges, for the money screen's header. */
export async function balanceOverview(ctx: MessContext, month: string) {
  const statement = await statementFor(ctx, month);
  const mine = statement.members.find((m) => m.memberId === ctx.memberId) ?? null;

  const deposits = await MmDeposit.find({
    messId: ctx.messId,
    month,
    memberId: ctx.memberId,
    status: 'approved',
  })
    .sort({ date: -1 })
    .limit(10)
    .lean();

  return mmOk({
    month,
    mealRate: statement.mealRate,
    me: mine,
    recentDeposits: deposits.map((row) => ({
      id: idOf(row._id),
      date: row.date,
      amount: row.amount,
      method: row.method,
    })),
    mess: allowed(ctx, 'view_all_reports')
      ? {
          totalDeposits: statement.totalDeposits,
          totalCharged: statement.totalCharged,
          balance: round2(statement.totalDeposits - statement.totalCharged),
        }
      : null,
  });
}
