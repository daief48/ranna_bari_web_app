/**
 * Money, dates and numerals.
 *
 * Two rules the app enforces and this panel must not break:
 *   - currency is BDT in whole taka. The app never shows paisa, so neither
 *     does an operator screen that has to agree with it.
 *   - `serveDate` and every "today" are LOCAL calendar days in Asia/Dhaka.
 *     Reading them in UTC moves tomorrow's lunch to today for six hours a
 *     day, which is the whole reason this file exists.
 */

export const TZ = 'Asia/Dhaka';

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/** "৳1,240" — whole taka, never a decimal. */
export function taka(value: number | null | undefined): string {
  const n = Math.round(Number(value ?? 0));
  return `৳${n.toLocaleString('en-US')}`;
}

/** "1,240" without the sign, for table cells that carry their own unit. */
export const num = (value: number | null | undefined) =>
  Math.round(Number(value ?? 0)).toLocaleString('en-US');

/** "+৳1,240" / "-৳1,240" — for ledger rows, where direction is the point. */
export function signedTaka(value: number): string {
  const n = Math.round(value);
  return `${n < 0 ? '-' : '+'}৳${Math.abs(n).toLocaleString('en-US')}`;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Bengali numerals, for the broadcast composer's Bengali preview. */
export const bnNum = (value: number | string) =>
  String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

/* ------------------------------------------------------------------ *
 * dates — always rendered in Asia/Dhaka
 * ------------------------------------------------------------------ */

/** The local calendar day in Dhaka, as 'YYYY-MM-DD'. Matches the app's dayKey(). */
export function dayKey(date: Date | string | number = new Date()): string {
  const d = new Date(date);
  // en-CA gives ISO-ordered parts, so this is a format trick, not arithmetic.
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export const todayKey = () => dayKey();

export function addDays(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
}

/** "24 Aug 2026, 9:12 pm" — the app's one order-date format. */
export function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleTimeString('en-GB', {
      timeZone: TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
  return `${date}, ${time}`;
}

/** "24 Aug 2026" */
export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "9:12 pm" */
export function fmtTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleTimeString('en-GB', {
      timeZone: TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
}

/**
 * "4 min ago" / "2 hr ago" / "3 days ago".
 *
 * A queue needs urgency, not a date. Escrow ageing is read off this, so it
 * counts days honestly rather than rounding to "a while".
 */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Whole days since a timestamp. The escrow ageing board sorts on this. */
export function daysSince(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** The parsed cutoff instant for a meal's serve date and slot, in Dhaka. */
export function deadlineFor(serveDate: string, cutoffHour: number): Date {
  const [y, m, d] = String(serveDate).split('-').map(Number);
  // Dhaka is UTC+6 year-round — no DST, so a fixed offset is correct here.
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, cutoffHour - 6, 0, 0, 0));
}

/** "Dhanmondi · 2.4 km" style joins, skipping empty parts. */
export const joinParts = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(' · ');

export const pct = (part: number, whole: number) =>
  whole <= 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;

/** A short, unambiguous code. Ambiguous glyphs (I, O, 0, 1) are left out. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function makeCode(prefix = 'RB'): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}-${out}`;
}
