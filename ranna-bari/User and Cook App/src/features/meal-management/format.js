/**
 * Meal management — dates and money, module-local.
 *
 * Small enough to own rather than import. The app's shared helpers are built
 * around order timestamps and delivery days; what this module needs is
 * calendar-month arithmetic, and keeping it here means the feature can move
 * without dragging a dependency behind it.
 *
 * Days are local 'YYYY-MM-DD' strings and months are 'YYYY-MM', the same
 * shapes the backend stores and compares as strings. Nothing here ever calls
 * `toISOString()` for a calendar day — that reads in UTC and would move
 * "today" backwards for the first six hours of every Bangladeshi morning.
 */

/** Today, as the device's own calendar day. */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The month we are in. */
export function thisMonth(d = new Date()) {
  return todayKey(d).slice(0, 7);
}

/** The month a day belongs to. */
export const monthOf = (date) => String(date).slice(0, 7);

/** Every day in a month. `new Date(y, m, 0)` lands on its last day. */
export function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out = [];
  for (let i = 1; i <= last; i += 1) out.push(`${month}-${String(i).padStart(2, '0')}`);
  return out;
}

/** Which weekday a month starts on, 0 = Sunday — the calendar grid's offset. */
export function firstWeekday(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "September 2026" / "সেপ্টেম্বর ২০২৬". */
export function monthLabel(month, lang = 'en') {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

/** "September 1" — a day heading. */
export function dayLabel(date, lang = 'en') {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    month: 'long',
    day: 'numeric',
  });
}

/** "Mon 1" — a compact list row. */
export function shortDayLabel(date, lang = 'en') {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
  });
}

export const dayNumber = (date) => Number(date.slice(8, 10));

/** The three sittings, in the order they happen. */
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

/**
 * A rate, to the paisa only when it has one.
 *
 * ৳60 rather than ৳60.00, but ৳62.40 stays ৳62.40 — the trailing zeros make a
 * whole number look like a measurement, and dropping the fraction would make a
 * different number look like the same one.
 */
export function rateText(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Whole taka, for anything payable. */
export const takaText = (value) => String(Math.round(Number(value) || 0));

/** The tone a budget status carries into the UI. */
export const STATUS_TONE = { ok: 'good', risk: 'warn', over: 'bad' };

export const STATUS_TEXT = {
  ok: 'Within target',
  risk: 'Close to target',
  over: 'Over target',
};
