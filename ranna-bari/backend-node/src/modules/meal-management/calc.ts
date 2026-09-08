/**
 * The calculation engine. §4.6.
 *
 * Everything financial the module says comes from this file, and this file
 * contains no cleverness at all — it counts rows and divides. That division of
 * labour is the specification's central rule: the assistant may suggest and
 * the analytics may project, but what a month *cost* is arithmetic over
 * records that people actually made and somebody actually approved.
 *
 * Three distinctions are load-bearing and are kept apart everywhere they
 * appear:
 *
 *   **recorded vs approved** — a meal entry is recorded and counts as soon as
 *   it exists; a bazar, expense or deposit counts only once its status is
 *   `approved`. §4.6: "It must use approved records only."
 *
 *   **food vs other** — only categories flagged `foodCost` reach the meal-rate
 *   numerator. §4.6 warns specifically that rent and wifi must not, unless the
 *   mess has explicitly chosen that policy.
 *
 *   **template vs entry** — a member's usual meals prefill a form. They are
 *   never counted. §12 requires that calculations be reproducible from
 *   records, and a default nobody confirmed is not a record.
 *
 * Nothing here reaches the database. Every function takes rows and returns
 * numbers, which is what makes the engine testable against the
 * specification's worked example without a mess existing.
 */

/* ------------------------------------------------------------------ *
 * calendar
 * ------------------------------------------------------------------ */

/** 'YYYY-MM' → true when it is a month and not something that merely looks like one. */
export const isMonth = (m: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** 'YYYY-MM-DD' → the same question for a day. */
export const isDay = (d: string): boolean =>
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d);

/** Days in a calendar month. `new Date(y, m, 0)` lands on the last one. */
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** The month before this one. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

/** The month after this one. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Move a day by whole days, staying on the calendar. */
export function shiftDay(date: string, by: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return t.toISOString().slice(0, 10);
}

/** How many days lie between two days, `to` minus `from`. */
export function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Which accounting month a calendar day belongs to.
 *
 * With the default `monthStartDay` of 1 this is a string slice. A mess that
 * settles on the 5th has an accounting September that runs 5 Sep – 4 Oct, so
 * the first four days of a calendar month fall into the previous accounting
 * one. §4.1 lists month dates as a mess setting, and getting this wrong moves
 * a handful of meals into the wrong bill every single month.
 */
export function monthOfDay(date: string, monthStartDay = 1): string {
  const plain = date.slice(0, 7);
  if (monthStartDay <= 1) return plain;
  return Number(date.slice(8, 10)) >= monthStartDay ? plain : previousMonth(plain);
}

/** The first and last calendar day of an accounting month, inclusive. */
export function monthRange(month: string, monthStartDay = 1): { from: string; to: string } {
  if (monthStartDay <= 1) {
    return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
  }
  const start = `${month}-${String(monthStartDay).padStart(2, '0')}`;
  const next = nextMonth(month);
  /* The day before the next month's start. Clamped, because a mess that
     settles on the 31st has no 31st in November. */
  const nextStart = Math.min(monthStartDay, daysInMonth(next));
  return { from: start, to: shiftDay(`${next}-${String(nextStart).padStart(2, '0')}`, -1) };
}

/** Every day in an accounting month, as 'YYYY-MM-DD'. */
export function monthDays(month: string, monthStartDay = 1): string[] {
  const { from, to } = monthRange(month, monthStartDay);
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/* ------------------------------------------------------------------ *
 * wall clocks and cutoffs
 * ------------------------------------------------------------------ */

/**
 * The current day and minute-of-day in a named timezone.
 *
 * A cutoff is a wall clock — "lunch closes at 9am" means nine in the morning
 * where the mess is, not nine UTC. The server may be anywhere, so the
 * comparison has to be done in the mess's own zone or a cutoff drifts by six
 * hours and locks tomorrow's breakfast this afternoon.
 *
 * `Intl` is used rather than a date library because the host codebase has
 * none, and this is the whole of what would be imported one for.
 */
export function wallClock(zone = 'Asia/Dhaka', now = new Date()): { day: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    /* An unknown zone should not take the module down — a mess with a typo in
       its settings gets UTC and a cutoff that is merely wrong, not a 500. */
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  }

  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  /* `hour12: false` renders midnight as 24 in some engines. */
  const hour = Number(at('hour')) % 24;

  return {
    day: `${at('year')}-${at('month')}-${at('day')}`,
    minutes: hour * 60 + Number(at('minute')),
  };
}

/** 'HH:MM' → minutes past midnight, or null when it is not a time. */
export function parseClock(text: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type CutoffRule = {
  key: string;
  cutoff?: string;
  cutoffDayOffset?: number;
};

/**
 * Has the cutoff for one sitting on one day passed?
 *
 * The offset is what makes breakfast work: its cutoff is the *evening before*,
 * so `cutoffDayOffset: -1` with `cutoff: '21:00'` locks tomorrow's breakfast
 * at nine tonight. Without the offset, a breakfast cutoff of 06:00 would be
 * meaningless — nobody is deciding at six.
 *
 * A type with no cutoff never locks. §4.2 makes the cutoff optional, and a
 * mess that has not set one should not have its meals silently frozen.
 */
export function isPastCutoff(
  date: string,
  rule: CutoffRule,
  zone = 'Asia/Dhaka',
  now = new Date(),
): boolean {
  const at = parseClock(rule.cutoff ?? '');
  if (at === null) return false;

  const deadlineDay = shiftDay(date, rule.cutoffDayOffset ?? 0);
  const clock = wallClock(zone, now);

  if (clock.day > deadlineDay) return true;
  if (clock.day < deadlineDay) return false;
  return clock.minutes >= at;
}

/** Every sitting on a day that is already locked. */
export function lockedTypes(
  date: string,
  rules: CutoffRule[],
  zone = 'Asia/Dhaka',
  now = new Date(),
): string[] {
  return rules.filter((r) => isPastCutoff(date, r, zone, now)).map((r) => r.key);
}

/**
 * The next cutoff a member is about to run into. §4.7's "upcoming cutoff".
 *
 * Looks at today and tomorrow only: a cutoff three days out is not a thing
 * anybody needs a reminder about, and the dashboard has one line for this.
 */
export function nextCutoff(
  rules: CutoffRule[],
  zone = 'Asia/Dhaka',
  now = new Date(),
): { date: string; key: string; cutoff: string; minutesAway: number } | null {
  const clock = wallClock(zone, now);
  let best: { date: string; key: string; cutoff: string; minutesAway: number } | null = null;

  for (const day of [clock.day, shiftDay(clock.day, 1)]) {
    for (const rule of rules) {
      const at = parseClock(rule.cutoff ?? '');
      if (at === null) continue;

      const deadlineDay = shiftDay(day, rule.cutoffDayOffset ?? 0);
      const away = daysBetween(clock.day, deadlineDay) * 1440 + (at - clock.minutes);
      if (away < 0) continue;
      if (!best || away < best.minutesAway) {
        best = { date: day, key: rule.key, cutoff: rule.cutoff ?? '', minutesAway: away };
      }
    }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * meals
 * ------------------------------------------------------------------ */

/** The mixed-type maps a meal entry carries, narrowed once. */
export type MealMap = Record<string, number>;

export type MealEntryLike = {
  memberId: string;
  date: string;
  values?: MealMap | null;
  guests?: MealMap | null;
};

/** Meal-type keys that count toward the rate, as a set for the hot path. */
export type RateTypes = Set<string>;

const numbers = (map: MealMap | null | undefined): [string, number][] =>
  Object.entries(map ?? {}).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0) as [
    string,
    number,
  ][];

/**
 * One entry's weight, and its plain total.
 *
 * `weighted` is what the divisor of the meal rate is built from, so it skips
 * types the mess has excluded. `total` counts everything, because the calendar
 * shows what somebody ate whether or not it was billable.
 *
 * A guest meal weighs the same as the host's own — §4.2 makes it a meal
 * against the member who brought them, which is the only reading under which
 * the guest's food gets paid for.
 */
export function weighEntry(entry: MealEntryLike, rateTypes?: RateTypes) {
  let weighted = 0;
  let total = 0;

  for (const [key, value] of numbers(entry.values)) {
    total += value;
    if (!rateTypes || rateTypes.has(key)) weighted += value;
  }
  for (const [key, value] of numbers(entry.guests)) {
    total += value;
    if (!rateTypes || rateTypes.has(key)) weighted += value;
  }

  return { weighted: round4(weighted), total: round4(total) };
}

export type MemberMeals = {
  memberId: string;
  /** Billable meals — the member's contribution to the divisor. */
  weighted: number;
  /** Every meal, billable or not. */
  total: number;
  /** Per meal-type totals, own meals only. */
  byType: MealMap;
  /** Guest plates, summed across types. */
  guests: number;
  /** Days with any entry at all — §4.2's meal history needs the denominator. */
  days: number;
};

const emptyMeals = (memberId: string): MemberMeals => ({
  memberId,
  weighted: 0,
  total: 0,
  byType: {},
  guests: 0,
  days: 0,
});

/**
 * Fold a month's entries into per-member counts.
 *
 * Done in application code from rows the caller already has, rather than as a
 * second aggregation: a monthly close needs the entries themselves for the
 * audit snapshot anyway, and counting them twice in two places is how the
 * report and the bill come to disagree.
 */
export function countMeals(entries: MealEntryLike[], rateTypes?: RateTypes): Map<string, MemberMeals> {
  const out = new Map<string, MemberMeals>();

  for (const entry of entries) {
    const row = out.get(entry.memberId) ?? emptyMeals(entry.memberId);
    const { weighted, total } = weighEntry(entry, rateTypes);

    row.weighted = round4(row.weighted + weighted);
    row.total = round4(row.total + total);
    if (total > 0) row.days += 1;

    for (const [key, value] of numbers(entry.values)) {
      row.byType[key] = round4((row.byType[key] ?? 0) + value);
    }
    for (const [, value] of numbers(entry.guests)) {
      row.guests = round4(row.guests + value);
    }

    out.set(entry.memberId, row);
  }

  return out;
}

/** The mess's whole billable meal count — the rate's divisor. */
export const totalWeighted = (counts: Map<string, MemberMeals>): number =>
  round4([...counts.values()].reduce((sum, m) => sum + m.weighted, 0));

/* ------------------------------------------------------------------ *
 * money in
 * ------------------------------------------------------------------ */

export type ExpenseLike = {
  _id?: unknown;
  amount: number;
  categoryKey: string;
  categoryLabel?: string;
  foodCost?: boolean;
  status: string;
  allocationMode?: string;
  payerId?: string;
};

export type BazarLike = {
  _id?: unknown;
  total: number;
  status: string;
  payerId?: string;
};

export const isApproved = (row: { status?: string }): boolean => row.status === 'approved';

/**
 * What the month cost, split the way the rate needs it.
 *
 * Bazar is unconditionally food: §4.3 defines it as the mess's grocery
 * shopping, and a mess that wanted it otherwise would record it as an expense
 * in a non-food category instead.
 *
 * `allExpensesInMealRate` is §4.6's escape hatch. Off by default and off in
 * the specification's recommendation, because folding rent into a meal rate
 * charges the member who eats out all month for a room they were paying for
 * anyway.
 */
export function costTotals(
  expenses: ExpenseLike[],
  bazars: BazarLike[],
  { allExpensesInMealRate = false } = {},
) {
  let food = 0;
  let other = 0;

  const byCategory = new Map<string, { key: string; label: string; amount: number; foodCost: boolean }>();

  for (const bazar of bazars) {
    if (!isApproved(bazar)) continue;
    food += Number(bazar.total) || 0;
  }
  if (food > 0) {
    byCategory.set('bazar', { key: 'bazar', label: 'Bazar', amount: round2(food), foodCost: true });
  }

  for (const expense of expenses) {
    if (!isApproved(expense)) continue;
    const amount = Number(expense.amount) || 0;
    const counts = allExpensesInMealRate || expense.foodCost === true;

    if (counts) food += amount;
    else other += amount;

    const key = expense.categoryKey;
    const row = byCategory.get(key) ?? {
      key,
      label: expense.categoryLabel || key,
      amount: 0,
      foodCost: counts,
    };
    row.amount = round2(row.amount + amount);
    row.foodCost = counts;
    byCategory.set(key, row);
  }

  return {
    food: round2(food),
    other: round2(other),
    total: round2(food + other),
    categories: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
  };
}

/* ------------------------------------------------------------------ *
 * the rate
 * ------------------------------------------------------------------ */

export type Rounding = { mode?: string; digits?: number };

/**
 * Apply the mess's rounding rule to a rate.
 *
 * 'none' is the default and is what the arithmetic actually is. The others
 * exist because §9 lists rounding residue as an edge case, and a mess that
 * would rather bill ৳60 than ৳59.7345 can say so — at the price of a residual
 * the settlement then has to account for openly rather than absorb.
 */
export function applyRounding(value: number, { mode = 'none', digits = 2 }: Rounding = {}): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, Math.min(6, digits));

  switch (mode) {
    case 'up':
      return Math.ceil(value * factor) / factor;
    case 'down':
      return Math.floor(value * factor) / factor;
    case 'nearest':
      return Math.round(value * factor) / factor;
    case 'whole':
      return Math.round(value);
    default:
      return round4(value);
  }
}

/**
 * §4.6's formula, and the only place it is written.
 *
 * `Meal Rate = Total Approved Food Expense ÷ Total Weighted Meals`
 *
 * A month with no meals has no rate — not zero, which would quietly bill
 * everybody nothing and make a mess with unrecorded meals look free.
 */
export function mealRate(foodCost: number, meals: number, rounding?: Rounding): number {
  if (!meals || meals <= 0) return 0;
  return applyRounding(foodCost / meals, rounding);
}

/* ------------------------------------------------------------------ *
 * allocations
 * ------------------------------------------------------------------ */

export type AllocationRow = { expenseId: string; memberId: string; share: number };

/**
 * Split one expense across members according to its mode. §4.4.
 *
 * `meal` returns nothing on purpose: a meal-based expense has no fixed shares,
 * because its split *is* the meal rate and is not known until the month's
 * meals are. Writing shares for it would freeze a figure that every
 * subsequent meal invalidates.
 *
 * The remainder from an uneven equal split lands on the first member rather
 * than vanishing. §9 asks for rounding residue to be accounted for, and a
 * split of ৳100 three ways has to add back up to ৳100.
 */
export function allocate(
  amount: number,
  mode: string,
  members: string[],
  custom?: Record<string, number>,
): { memberId: string; share: number }[] {
  const total = Number(amount) || 0;

  switch (mode) {
    case 'meal':
      return [];

    case 'individual':
    case 'selected':
    case 'equal': {
      if (!members.length) return [];
      const each = round2(total / members.length);
      const rows = members.map((memberId) => ({ memberId, share: each }));
      const drift = round2(total - each * members.length);
      if (drift !== 0 && rows[0]) rows[0].share = round2(rows[0].share + drift);
      return rows;
    }

    case 'custom': {
      const rows = Object.entries(custom ?? {})
        .map(([memberId, share]) => ({ memberId, share: round2(Number(share) || 0) }))
        .filter((r) => r.share !== 0);
      return rows;
    }

    default:
      return [];
  }
}

/** Do a custom split's shares add up to what is being split? §4.4's own rule. */
export const allocationBalances = (amount: number, shares: number[]): boolean =>
  Math.abs(round2(shares.reduce((a, b) => a + b, 0)) - round2(amount)) < 0.01;

/* ------------------------------------------------------------------ *
 * the statement
 * ------------------------------------------------------------------ */

export type MemberBill = {
  memberId: string;
  name: string;
  meals: number;
  byType: MealMap;
  guestMeals: number;
  /** meals × rate. */
  foodCost: number;
  /** Σ allocated shares of non-food expenses. */
  otherCost: number;
  totalCharge: number;
  deposits: number;
  adjustments: number;
  carriedIn: number;
  /** deposits + carriedIn + adjustments − totalCharge. Positive is advance. */
  balance: number;
};

export type Statement = {
  month: string;
  foodCost: number;
  otherCost: number;
  totalCost: number;
  totalMeals: number;
  mealRate: number;
  totalDeposits: number;
  totalCharged: number;
  residual: number;
  members: MemberBill[];
  categories: { key: string; label: string; amount: number; foodCost: boolean }[];
};

export type StatementInput = {
  month: string;
  members: { memberId: string; name: string }[];
  entries: MealEntryLike[];
  expenses: ExpenseLike[];
  bazars: BazarLike[];
  allocations: AllocationRow[];
  deposits: { memberId: string; amount: number; status: string }[];
  adjustments?: { memberId: string; amount: number }[];
  carriedIn?: Record<string, number>;
  rateTypes?: RateTypes;
  settings?: { allExpensesInMealRate?: boolean; rounding?: string; roundingDigits?: number };
};

/**
 * A whole month, from records to every member's balance.
 *
 * This is the function §12 is describing when it asks that "meal rate and
 * member balance calculations are consistent and reproducible": the monthly
 * summary, the settlement snapshot, the member statement and the PDF are all
 * this one call, so a report cannot disagree with the bill it is reporting on.
 *
 * `residual` is the difference between what the mess spent and what it
 * charged. It is shown rather than absorbed — under a rounded rate it is real
 * money, and §9 asks for it to be visible rather than to quietly become
 * somebody's problem.
 */
export function buildStatement(input: StatementInput): Statement {
  const settings = input.settings ?? {};
  const rounding: Rounding = { mode: settings.rounding, digits: settings.roundingDigits };

  const counts = countMeals(input.entries, input.rateTypes);
  const totals = costTotals(input.expenses, input.bazars, {
    allExpensesInMealRate: settings.allExpensesInMealRate,
  });

  const meals = totalWeighted(counts);
  const rate = mealRate(totals.food, meals, rounding);

  /* Approved deposits only, per §4.6. */
  const deposited = new Map<string, number>();
  for (const row of input.deposits) {
    if (row.status !== 'approved') continue;
    deposited.set(row.memberId, round2((deposited.get(row.memberId) ?? 0) + (Number(row.amount) || 0)));
  }

  /* Allocated shares of everything that did not go through the meal rate. */
  const allocated = new Map<string, number>();
  for (const row of input.allocations) {
    allocated.set(row.memberId, round2((allocated.get(row.memberId) ?? 0) + (Number(row.share) || 0)));
  }

  const adjusted = new Map<string, number>();
  for (const row of input.adjustments ?? []) {
    adjusted.set(row.memberId, round2((adjusted.get(row.memberId) ?? 0) + (Number(row.amount) || 0)));
  }

  let totalCharged = 0;

  const members: MemberBill[] = input.members.map((member) => {
    const count = counts.get(member.memberId) ?? emptyMeals(member.memberId);
    const foodCost = round2(count.weighted * rate);
    const otherCost = allocated.get(member.memberId) ?? 0;
    const totalCharge = round2(foodCost + otherCost);
    const deposits = deposited.get(member.memberId) ?? 0;
    const adjustments = adjusted.get(member.memberId) ?? 0;
    const carriedIn = round2(input.carriedIn?.[member.memberId] ?? 0);

    totalCharged = round2(totalCharged + totalCharge);

    return {
      memberId: member.memberId,
      name: member.name,
      meals: count.weighted,
      byType: count.byType,
      guestMeals: count.guests,
      foodCost,
      otherCost,
      totalCharge,
      deposits,
      adjustments,
      carriedIn,
      balance: round2(deposits + carriedIn + adjustments - totalCharge),
    };
  });

  const totalDeposits = round2([...deposited.values()].reduce((a, b) => a + b, 0));

  return {
    month: input.month,
    foodCost: totals.food,
    otherCost: totals.other,
    totalCost: totals.total,
    totalMeals: meals,
    mealRate: rate,
    totalDeposits,
    totalCharged,
    residual: round2(totals.total - totalCharged),
    members,
    categories: totals.categories,
  };
}

/* ------------------------------------------------------------------ *
 * money, rounded the way money is
 * ------------------------------------------------------------------ */

/**
 * Two places, for anything payable.
 *
 * `Math.round(x * 100) / 100` rather than `toFixed`, because `toFixed`
 * returns a string and every arithmetic site would then have to remember to
 * parse it back.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Four places, for meal counts.
 *
 * Half meals are exact in binary, but a mess with a custom 0.3 value would
 * otherwise accumulate a visible drift across a hundred entries.
 */
export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
