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

/**
 * 'YYYY-MM-DD' for an instant, as a Dhaka calendar day.
 *
 * The phone's own midnight is the wrong boundary for a kitchen in Dhaka: an
 * order delivered at 00:30 Dhaka time is tonight's dinner, not tomorrow's,
 * and a cook travelling — or a reviewer in another timezone — should see the
 * same day the ledger uses. This is the one place that boundary is drawn.
 */
export function dayKeyOf(at = new Date()) {
  const parsed = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, '0'),
    String(local.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 'YYYY-MM-DD' for today in Dhaka. */
export function todayKey() {
  return dayKeyOf(new Date());
}

/** The day `delta` days away from a 'YYYY-MM-DD' key, as a key. */
export function shiftDay(date, delta) {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

/**
 * The last `count` Dhaka days ending today, oldest first — the buckets a
 * week chart reads into. Keys rather than millisecond ranges, so an order
 * is filed by `dayKeyOf(when)` and the comparison is a string match with no
 * timezone arithmetic at the call site.
 */
export function recentDayKeys(count = 7) {
  const today = todayKey();
  return Array.from({ length: count }, (_, i) => shiftDay(today, i - (count - 1)));
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

/* ------------------------------------------------------------------ *
 * labels, in the reader's language
 *
 * Every label below used to format with 'en-GB' whatever the app's language
 * was, so a Bengali reader got "Sep 2026" and "Mon" inside Bengali sentences.
 * The functions take an optional `lang` and otherwise read the one the app
 * last announced through `setPlanLanguage` — the same pattern the chart kit
 * uses for numerals, because these are called from plain helpers and memos
 * that have no hook to ask. The screens that own these labels call
 * `setPlanLanguage(lang)` during render, the way they set chart numerals.
 *
 * Bengali comes from Intl when the runtime has the data, as the order date
 * formatter already relies on; when a build's Hermes lacks it (the output
 * comes back in Latin letters), a small table stands in so the month and
 * weekday are still Bengali rather than quietly English.
 * ------------------------------------------------------------------ */

let currentLang = 'en';

/** Announce the app's language, so labels without a `lang` argument follow it. */
export function setPlanLanguage(lang) {
  currentLang = lang === 'bn' ? 'bn' : 'en';
}

const localeOf = (lang) => ((lang ?? currentLang) === 'bn' ? 'bn-BD' : 'en-GB');

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];
const BN_MONTHS_SHORT = [
  'জানু', 'ফেব', 'মার্চ', 'এপ্রি', 'মে', 'জুন',
  'জুলা', 'আগ', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে',
];
const BN_WEEKDAYS_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnDigits = (value) => String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

/** Whether Intl actually produced Bengali, or fell back to Latin letters. */
const isBengali = (text) => /[ঀ-৿]/.test(String(text ?? ''));

export const monthLabel = (month, lang) => {
  const at = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return String(month ?? '');
  const locale = localeOf(lang);
  const text = at.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (locale !== 'bn-BD' || isBengali(text)) return text;
  return `${BN_MONTHS[at.getUTCMonth()]} ${bnDigits(at.getUTCFullYear())}`;
};

/** '1 Mon' — the weekday matters, because a menu repeats by it. */
export function dayParts(date, lang) {
  const at = new Date(`${date}T00:00:00Z`);
  const locale = localeOf(lang);
  const weekday = at.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  return {
    day: String(at.getUTCDate()),
    weekday:
      locale === 'bn-BD' && !isBengali(weekday) ? BN_WEEKDAYS_SHORT[at.getUTCDay()] : weekday,
    /* Friday and Saturday: the Bangladeshi weekend, when a kitchen cooks
       differently and the break is worth seeing in a list of thirty. */
    weekend: at.getUTCDay() === 5 || at.getUTCDay() === 6,
  };
}

export const dateLabel = (date, lang) => {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return String(date ?? '');
  const locale = localeOf(lang);
  const text = at.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (locale !== 'bn-BD' || isBengali(text)) return text;
  return `${bnDigits(at.getUTCDate())} ${BN_MONTHS_SHORT[at.getUTCMonth()]}`;
};

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

/**
 * "Today", "Tomorrow", or the date — for a meal somebody is waiting on.
 *
 * A booking screen answering "when is my next meal" with a bare calendar date
 * makes the reader do the subtraction. Only the two days that have their own
 * word get one; past that a date is clearer than "in 9 days".
 */
export function relativeDay(date, t, lang) {
  const say = t ?? ((s) => s);
  const today = todayKey();
  if (date === today) return say('Today');
  if (date === shiftDay(today, 1)) return say('Tomorrow');

  return dateLabel(date, lang);
}
