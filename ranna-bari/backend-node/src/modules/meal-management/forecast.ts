import { MmDailyMeal, MmMember } from './models.js';
import { monthOf, type ScheduleLike } from './calc.js';

/**
 * Kitchen forecast and waste signals.
 *
 * The specification's intelligence layer, built the same way as the planner:
 * from counted history rather than a model. What it forecasts is attendance —
 * how often this mess actually turns up to each sitting — and the only input
 * is `mm_daily_meals`, so a forecast is always a statement about what people
 * really did.
 *
 * A forecast is never an accounting figure. It says how much to cook, which is
 * a different question from what the month cost.
 */

const WINDOW_DAYS = 28;

export type SlotForecast = {
  slot: string;
  /** Portions to prepare — attendance rate × members, rounded up to a plate. */
  expected: number;
  /** 0..1, how often the sitting was taken across the window. */
  rate: number;
  /** 'high' | 'medium' | 'low' — how much history stands behind it. */
  confidence: string;
  /** Days of history the rate was computed from. */
  days: number;
};

export type Forecast = {
  from: string;
  to: string;
  members: number;
  slots: SlotForecast[];
  insights: string[];
};

/** The `n` days ending the day before `today`, as 'YYYY-MM-DD'. */
function windowDays(today: string, n: number): { from: string; days: string[] } {
  const [y, m, d] = today.split('-').map(Number);
  const end = Date.UTC(y, m - 1, d);
  const days: string[] = [];
  for (let i = n; i >= 1; i -= 1) {
    const t = new Date(end - i * 86400000);
    days.push(t.toISOString().slice(0, 10));
  }
  return { from: days[0], days };
}

const confidenceFor = (days: number): string => {
  if (days >= 21) return 'high';
  if (days >= 7) return 'medium';
  return 'low';
};

/**
 * What to cook, and what the last four weeks suggest about it.
 *
 * Attendance is measured per sitting rather than per day, because the shape
 * that matters is "lunch is always full, dinner is half empty" — a single
 * daily average would hide exactly the sitting worth acting on.
 */
export async function forecastFor(
  messId: string,
  today: string,
  schedule: ScheduleLike,
): Promise<Forecast> {
  const { from, days } = windowDays(today, WINDOW_DAYS);

  const [rows, memberCount] = await Promise.all([
    MmDailyMeal.find({ messId, date: { $gte: from, $lt: today } })
      .select('date breakfast lunch dinner guest customerKey')
      .lean(),
    MmMember.countDocuments({ messId, active: true }),
  ]);

  const members = Math.max(1, memberCount);
  const seen = new Set(rows.map((r) => r.date as string));
  const observed = seen.size;

  const slots: SlotForecast[] = (['breakfast', 'lunch', 'dinner'] as const).map((slot) => {
    const taken = rows.reduce((sum, r) => sum + (r[slot] ? 1 : 0), 0);
    /* Divide by the days that actually have entries, not by the whole window —
       a mess that started logging a week ago is not one that skipped three. */
    const denominator = observed * members || 1;
    const rate = Math.min(1, taken / denominator);
    return {
      slot,
      expected: Math.ceil(rate * members),
      rate: Math.round(rate * 100) / 100,
      confidence: confidenceFor(observed),
      days: observed,
    };
  });

  return {
    from,
    to: days[days.length - 1],
    members,
    slots,
    insights: insightsFrom(slots, schedule, observed),
  };
}

/**
 * The things worth saying out loud about a forecast.
 *
 * Each one names a sitting and what to do about it. A screen of percentages
 * tells a person nothing they can act on; "dinner runs about a third empty —
 * cook for two, not three" does.
 */
function insightsFrom(slots: SlotForecast[], schedule: ScheduleLike, observed: number): string[] {
  const out: string[] = [];

  if (observed < 7) {
    out.push('Not much history yet — log a week of meals and this forecast gets a lot sharper.');
    return out;
  }

  for (const s of slots) {
    const scheduled = schedule[s.slot as keyof ScheduleLike];

    /* Booked into the schedule and skipped more often than not: this is the
       waste signal the specification is after. */
    if (scheduled && s.rate < 0.5) {
      out.push(
        `${label(s.slot)} is scheduled but taken only ${Math.round(s.rate * 100)}% of the time — cooking for it in full is where food is going to waste.`,
      );
    }

    /* Not scheduled but taken anyway — the schedule is out of date, and the
       planner is budgeting for the wrong number of meals. */
    if (!scheduled && s.rate > 0.4) {
      out.push(
        `${label(s.slot)} is off your schedule but you take it ${Math.round(s.rate * 100)}% of the time. Turning it on will make your planned budget match what you actually eat.`,
      );
    }
  }

  if (!out.length) out.push('Attendance is steady — what you cook and what you eat are lining up.');
  return out;
}

const label = (slot: string): string => slot.charAt(0).toUpperCase() + slot.slice(1);

/**
 * Estimated against actual, for one month.
 *
 * The comparison the specification wants kept: what a plan predicted a month
 * would cost, beside what its entries actually add up to. Neither figure is
 * derived from the other, and this function does not write — it reports the
 * gap so the recommendation layer has something to learn from later.
 */
export function estimateVsActual(args: {
  estimatedCost: number;
  estimatedMeals: number;
  actualMeals: number;
  actualCost: number;
}): {
  estimatedRate: number;
  actualRate: number;
  mealGap: number;
  costGap: number;
  rateGap: number;
} {
  const estimatedRate = args.estimatedMeals
    ? Math.round((args.estimatedCost / args.estimatedMeals) * 100) / 100
    : 0;
  const actualRate = args.actualMeals
    ? Math.round((args.actualCost / args.actualMeals) * 100) / 100
    : 0;

  return {
    estimatedRate,
    actualRate,
    mealGap: args.actualMeals - args.estimatedMeals,
    costGap: args.actualCost - args.estimatedCost,
    rateGap: Math.round((actualRate - estimatedRate) * 100) / 100,
  };
}

/** The month a forecast day belongs to — re-exported so routes need one import. */
export { monthOf };
