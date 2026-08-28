import Link from 'next/link';
import type { ReactNode } from 'react';

import { taka } from '@/lib/format';

/* ------------------------------------------------------------------ *
 * layout
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.012em] text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[13px] text-ink2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = '',
  title,
  subtitle,
  actions,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  pad?: boolean;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[12px] text-ink2">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Grid({ cols = 4, children }: { cols?: number; children: ReactNode }) {
  const map: Record<number, string> = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  };
  return <div className={`grid grid-cols-1 gap-3 ${map[cols] ?? map[4]}`}>{children}</div>;
}

/* ------------------------------------------------------------------ *
 * stat tiles
 * ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-sage',
  warn: 'text-saffron',
  bad: 'text-primary',
  info: 'text-geo',
};

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <div className="card h-full p-4 transition-shadow hover:shadow-sm">
      <div className="label">{label}</div>
      <div className={`tnum mt-2 font-display text-[24px] leading-none font-bold ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[12px] text-ink2">{sub}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A stat whose value is money. Kept apart so ৳ is never hand-typed. */
export function MoneyStat(props: Omit<Parameters<typeof Stat>[0], 'value'> & { amount: number }) {
  const { amount, ...rest } = props;
  return <Stat {...rest} value={taka(amount)} />;
}

/* ------------------------------------------------------------------ *
 * badges — one legend for the whole panel
 * ------------------------------------------------------------------ */

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink2 border-line',
  good: 'bg-sage-50 text-sage border-sage-100',
  warn: 'bg-saffron-50 text-saffron border-saffron-100',
  bad: 'bg-primary-50 text-primary border-primary-100',
  info: 'bg-geo/10 text-geo border-geo/20',
};

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The status legend, in one place.
 *
 * A status that is sage on one screen and saffron on another is worse than no
 * colour at all, so every surface reads its tone from here.
 */
export function toneForStatus(status: string): Tone {
  switch (status) {
    case 'completed':
    case 'delivered':
    case 'approved':
    case 'paid':
    case 'released':
    case 'matched':
    case 'resolved':
    case 'agreed':
    case 'ordered':
      return 'good';
    case 'pending':
    case 'placed':
    case 'confirmed':
    case 'open':
    case 'held':
    case 'investigating':
    case 'selected':
    case 'negotiating':
    case 'orphan':
      return 'warn';
    case 'cancelled':
    case 'rejected':
    case 'refunded':
    case 'declined':
    case 'disputed':
    case 'suspended':
      return 'bad';
    case 'accepted':
    case 'cooking':
    case 'preparing':
    case 'ready':
    case 'on_the_way':
    case 'delivering':
    case 'published':
    case 'priced':
    case 'interested':
      return 'info';
    default:
      return 'neutral';
  }
}

const STATUS_LABEL: Record<string, string> = {
  on_the_way: 'On the way',
  'not-selected': 'Not selected',
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    STATUS_LABEL[status] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace(/[-_]/g, ' ');
  return <Badge tone={toneForStatus(status)}>{label}</Badge>;
}

/* ------------------------------------------------------------------ *
 * buttons
 * ------------------------------------------------------------------ */

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';

export const BTN: Record<string, string> = {
  primary: `${BTN_BASE} border-transparent bg-primary text-on-primary hover:bg-primary-600`,
  ghost: `${BTN_BASE} border-line bg-raised text-ink hover:bg-sunken`,
  quiet: `${BTN_BASE} border-transparent bg-transparent text-ink2 hover:bg-sunken hover:text-ink`,
  danger: `${BTN_BASE} border-primary-100 bg-primary-50 text-primary hover:bg-primary-100`,
  good: `${BTN_BASE} border-sage-100 bg-sage-50 text-sage hover:bg-sage-100`,
};

export function LinkButton({
  href,
  children,
  variant = 'ghost',
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BTN;
}) {
  return (
    <Link href={href} className={BTN[variant]}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * table shells
 * ------------------------------------------------------------------ */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center text-[13px] text-ink3">{children}</div>
  );
}

export function EmptyRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-12 text-center text-[13px] text-ink3">
        {children}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ *
 * misc
 * ------------------------------------------------------------------ */

export function Money({
  amount,
  tone = 'neutral',
  bold,
}: {
  amount: number;
  tone?: Tone;
  bold?: boolean;
}) {
  return (
    <span className={`tnum ${TONE_TEXT[tone]} ${bold ? 'font-semibold' : ''}`}>
      {taka(amount)}
    </span>
  );
}

export function Avatar({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (!src) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-50 font-semibold text-primary"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {initials}
      </span>
    );
  }
  return (
    // A plain <img>: these are remote Unsplash URLs in a table of forty rows,
    // and next/image's optimiser is not worth the round-trip for a 28px avatar.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** A labelled row in a detail panel. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line2 py-2 last:border-0">
      <span className="label shrink-0">{label}</span>
      <span className="text-right text-[13px] text-ink">{children}</span>
    </div>
  );
}

/** A meter for capacity, stock, fill rate. */
export function Meter({ value, max, tone = 'info' }: { value: number; max: number; tone?: Tone }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const fill: Record<Tone, string> = {
    neutral: 'bg-ink3',
    good: 'bg-sage',
    warn: 'bg-saffron',
    bad: 'bg-primary',
    info: 'bg-geo',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" title={`${value} of ${max}`}>
      <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A note explaining what a screen exists to fix.
 *
 * Every module in this panel closes a specific hole in the app. Saying which
 * one, on the screen itself, is the difference between a table of rows and a
 * tool somebody knows how to use.
 */
export function GapNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 rounded-[10px] border border-saffron-100 bg-saffron-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink2">
      {children}
    </div>
  );
}
