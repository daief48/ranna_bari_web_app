/**
 * Dates, months and slots — the vocabulary both sides of the meal system share.
 *
 * Every calendar string here is a label, never an instant. `'2026-09-01'` is
 * the first of September in Dhaka whatever the phone's timezone is, so all of
 * this parses and formats in UTC: `new Date('2026-09-01')` in a browser west
 * of Greenwich is the thirty-first of August, and a meal calendar that slips a
 * day is worse than no calendar.
 */

export const SLOTS = ['breakfast', 'lunch', 'dinner'];

export const SLOT_LABEL = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

/** 'YYYY-MM' for the Dhaka month containing now. */
export function currentMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' for today in Dhaka. */
export function todayKey() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** The month `delta` months away, as 'YYYY-MM'. */
export function shiftMonth(month, delta) {
  const [year, index] = String(month).split('-').map(Number);
  if (!year || !index) return month;
  const at = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Every day of a month, as 'YYYY-MM-DD'. Empty when the month is malformed. */
export function monthDays(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return [];
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const out = [];
  for (let day = 1; day <= last; day += 1) {
    out.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

export const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** '1 Mon' — the weekday matters, because a menu repeats by it. */
export function dayParts(date) {
  const at = new Date(`${date}T00:00:00Z`);
  return {
    day: String(at.getUTCDate()),
    weekday: at.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    /* Friday and Saturday: the Bangladeshi weekend, when a kitchen cooks
       differently and the break is worth seeing in a list of thirty. */
    weekend: at.getUTCDay() === 5 || at.getUTCDay() === 6,
  };
}

export const dateLabel = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Days is `[{date, breakfast, lunch, dinner}]` — index it for lookup. */
export function daysByDate(days) {
  const out = new Map();
  for (const day of days ?? []) out.set(day.date, day);
  return out;
}

/**
 * Fill a whole month from whatever a plan happens to carry.
 *
 * The editor works on every day of the month whether or not the stored plan
 * has a row for it, because "no dinner written on the 9th" and "the 9th is not
 * in the document" are the same thing to a cook looking at a calendar.
 */
export function spreadMonth(month, days) {
  const written = daysByDate(days);
  return monthDays(month).map((date) => {
    const row = written.get(date);
    return {
      date,
      breakfast: row?.breakfast ?? '',
      lunch: row?.lunch ?? '',
      dinner: row?.dinner ?? '',
    };
  });
}

/** How many slots across a month actually name a dish. */
export const countMeals = (days) =>
  (days ?? []).reduce(
    (sum, day) => sum + SLOTS.filter((slot) => String(day[slot] ?? '').trim()).length,
    0,
  );
