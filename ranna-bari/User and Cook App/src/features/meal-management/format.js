/**
 * Meal management — dates, money and meals, module-local.
 *
 * Small enough to own rather than import. The app's shared helpers are built
 * around order timestamps and delivery days; what this module needs is
 * calendar-month arithmetic under a configurable month-start, and keeping it
 * here means the feature can move without dragging a dependency behind it.
 *
 * Days are local 'YYYY-MM-DD' strings and months are 'YYYY-MM', the same
 * shapes the backend stores and compares as strings. Nothing here ever calls
 * `toISOString()` for a calendar day — that reads in UTC and would move
 * "today" backwards for the first six hours of every Bangladeshi morning.
 */

/* ------------------------------------------------------------------ *
 * days and months
 * ------------------------------------------------------------------ */

/** Today, as the device's own calendar day. */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The calendar month we are in. */
export function thisMonth(d = new Date()) {
  return todayKey(d).slice(0, 7);
}

/** Move a day by whole days, staying on the calendar. */
export function shiftDay(date, by) {
  const [y, m, d] = String(date).split('-').map(Number);
  const next = new Date(y, m - 1, d + by);
  return todayKey(next);
}

export function shiftMonth(month, by) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Days in a calendar month. `new Date(y, m, 0)` lands on the last one. */
export function daysInMonth(month) {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Which accounting month a day belongs to.
 *
 * Mirrors the server's `monthOfDay`. A mess that settles on the 5th has an
 * accounting September running 5 Sep – 4 Oct, so the first four days of the
 * calendar month fall into the previous one. Getting this wrong on the client
 * puts a handful of meals under the wrong heading every month.
 */
export function monthOfDay(date, monthStartDay = 1) {
  const plain = String(date).slice(0, 7);
  if (!monthStartDay || monthStartDay <= 1) return plain;
  return Number(String(date).slice(8, 10)) >= monthStartDay ? plain : shiftMonth(plain, -1);
}

/** The first and last day of an accounting month, inclusive. */
export function monthRange(month, monthStartDay = 1) {
  if (!monthStartDay || monthStartDay <= 1) {
    return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
  }
  const from = `${month}-${String(monthStartDay).padStart(2, '0')}`;
  const next = shiftMonth(month, 1);
  const start = Math.min(monthStartDay, daysInMonth(next));
  return { from, to: shiftDay(`${next}-${String(start).padStart(2, '0')}`, -1) };
}

/** Every day in an accounting month. */
export function monthDays(month, monthStartDay = 1) {
  const { from, to } = monthRange(month, monthStartDay);
  const out = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** Which weekday a range starts on, 0 = Sunday — the calendar grid's offset. */
export function weekdayOf(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export const dayNumber = (date) => Number(String(date).slice(8, 10));

/* ------------------------------------------------------------------ *
 * labels
 * ------------------------------------------------------------------ */

const locale = (lang) => (lang === 'bn' ? 'bn-BD' : 'en-GB');

/** "September 2026" / "সেপ্টেম্বর ২০২৬". */
export function monthLabel(month, lang = 'en') {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
}

/** "1 September" — a day heading. */
export function dayLabel(date, lang = 'en') {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(lang), { month: 'long', day: 'numeric' });
}

/** "Mon 1" — a compact list row. */
export function shortDayLabel(date, lang = 'en') {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(lang), { weekday: 'short', day: 'numeric' });
}

/** "Mon" — a calendar column head. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A short relative label for a timestamp, for feeds and notifications. */
export function agoLabel(at, t) {
  const then = new Date(at).getTime();
  if (!Number.isFinite(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return t('just now');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('{n}m ago', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('{n}h ago', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('{n}d ago', { n: days });
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "09:00" as something readable — "9:00 AM". */
export function clockLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return '';
  const hour = Number(m[1]);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${m[2]} ${suffix}`;
}

/** "in 3h 20m" — how long until a cutoff. */
export function untilLabel(minutes, t) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes <= 0) return t('now');
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h >= 24) return t('{n}d', { n: Math.round(h / 24) });
  if (!h) return t('{n}m', { n: m });
  return m ? t('{h}h {m}m', { h, m }) : t('{n}h', { n: h });
}

/* ------------------------------------------------------------------ *
 * money and meals
 * ------------------------------------------------------------------ */

/**
 * A rate, to the paisa only when it has one.
 *
 * ৳60 rather than ৳60.00, but ৳62.40 stays ৳62.40 — the trailing zeros make a
 * whole number look like a measurement, and dropping the fraction would make
 * a different number look like the same one.
 */
export function rateText(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Whole taka, for anything payable. */
export const takaText = (value) => String(Math.round(Number(value) || 0));

/** A meal count: 1, 1.5, 0.5 — never 1.0. */
export const mealText = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

/** A signed balance, said in words rather than in a minus sign. */
export function balanceText(value, t) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 0.005) return t('Settled');
  return n > 0 ? t('৳{n} advance', { n: takaText(n) }) : t('৳{n} due', { n: takaText(-n) });
}

/** Which way a balance leans, for colour. */
export const balanceTone = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) < 0.005) return undefined;
  return n > 0 ? 'good' : 'bad';
};

/* ------------------------------------------------------------------ *
 * vocabulary shared by the screens
 * ------------------------------------------------------------------ */

/** The approval lifecycle, and how each state should read and colour. */
export const STATUS_TEXT = {
  draft: 'Draft',
  submitted: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Waiting',
};

export const STATUS_TONE = {
  draft: undefined,
  submitted: 'warn',
  approved: 'good',
  rejected: 'bad',
  pending: 'warn',
};

export const ROLE_TEXT = { admin: 'Admin', coadmin: 'Co-admin', member: 'Member' };

export const MEMBER_STATE_TEXT = {
  pending: 'Waiting to join',
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  left: 'Left',
};

export const METHOD_TEXT = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  bank: 'Bank',
  other: 'Other',
};

export const ALLOCATION_TEXT = {
  meal: 'By meals',
  equal: 'Split equally',
  custom: 'Custom shares',
  selected: 'Selected members',
  individual: 'One member only',
};

/** What each allocation mode means, for the line under its chip. */
export const ALLOCATION_HINT = {
  meal: 'Charged through the meal rate, so it falls on whoever ate.',
  equal: 'Divided evenly between every active member.',
  custom: 'You set each share; they must add up to the amount.',
  selected: 'Divided evenly between the members you pick.',
  individual: 'Charged entirely to one member.',
};

export const DUTY_TEXT = {
  assigned: 'Assigned',
  done: 'Done',
  skipped: 'Skipped',
  swapped: 'Swapped',
};

export const COOK_DAY_TEXT = {
  present: 'Present',
  absent: 'Absent',
  leave: 'On leave',
  replaced: 'Replaced',
};

/** Sum the values of a `{ lunch: 1, dinner: 0.5 }` map. */
export const sumMeals = (map) =>
  Object.values(map ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);

/** Is any sitting turned on in this map? */
export const anyTaken = (map) => sumMeals(map) > 0;
