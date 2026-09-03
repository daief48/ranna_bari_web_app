import Link from 'next/link';
import { isValidElement, type ReactNode } from 'react';

import { taka } from '@/lib/format';

/*
 * A note on the cascade, because it explains several choices below.
 *
 * globals.css writes `.card`, `.tbl` and `* { border-color }` outside any
 * @layer, and an unlayered declaration outranks everything Tailwind emits into
 * @layer utilities — specificity never gets a look in. So `hover:bg-*` on a
 * `.card`, `text-right` on a `.tbl` header, and `border-<tone>` anywhere at all
 * are dropped on the floor with no error.
 *
 * Where a tone or a state has to win, it is therefore carried by a property
 * nothing unlayered claims — a ring, a filled span, or an inline style —
 * rather than by a utility that would silently lose.
 */

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

/**
 * How far off the page a surface sits.
 *
 * 1 is the panel's resting card and the default everywhere; 2 is for a surface
 * that overlaps another; 3 is for something that floats over the whole screen.
 * 0 is a card that is really a container — a filter strip, a well.
 */
export type Elevation = 0 | 1 | 2 | 3;

/* `.card` already carries `--shadow-xs`, and being unlayered it outranks any
   `shadow-*` utility, so anything other than the resting level has to be set
   from the style attribute. The values are tokens, not shadows. */
const ELEVATION: Record<Elevation, string | undefined> = {
  0: 'none',
  1: undefined,
  2: 'var(--shadow-sm)',
  3: 'var(--shadow-md)',
};

export function Card({
  children,
  className = '',
  title,
  subtitle,
  actions,
  pad = true,
  elevation = 1,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  pad?: boolean;
  elevation?: Elevation;
}) {
  const shadow = ELEVATION[elevation];
  return (
    <section
      className={`card overflow-hidden ${className}`}
      style={shadow ? { boxShadow: shadow } : undefined}
    >
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

/**
 * The filter row above a table.
 *
 * Every module was hand-rolling a flex wrapper with its own gap and its own
 * margin, so no two pages lined their controls up on the same baseline.
 */
export function Toolbar({
  children,
  right,
  className = '',
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-line bg-raised px-2.5 py-2 ${className}`}
    >
      {children}
      {right ? <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * tone — the legend, in one place
 *
 *   vermilion  destructive, and money leaving
 *   sage       healthy, settled, paid
 *   saffron    needs a human — ageing escrow, pending KYC, stock at zero
 *   ink3       inert, closed, nothing to do
 * ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-sage',
  warn: 'text-saffron',
  bad: 'text-primary',
  info: 'text-geo',
};

/** Solid tone — dots, meter fills, the edge of a stat tile. */
const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-ink3',
  good: 'bg-sage',
  warn: 'bg-saffron',
  bad: 'bg-primary',
  info: 'bg-geo',
};

/** The same tone at wash strength, for a fill something has to be read over. */
const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-ink3/25',
  good: 'bg-sage-100',
  warn: 'bg-saffron-100',
  bad: 'bg-primary-100',
  info: 'bg-geo/25',
};

const TONE_WASH: Record<Tone, string> = {
  neutral: 'from-transparent',
  good: 'from-sage-50',
  warn: 'from-saffron-50',
  bad: 'from-primary-50',
  info: 'from-geo/10',
};

/* A line drawn in `text-ink` is heavier than the number beside it, so the
   neutral sparkline and the flat delta step back to ink3 instead. */
const TONE_LINE: Record<Tone, string> = {
  neutral: 'text-ink3',
  good: 'text-sage',
  warn: 'text-saffron',
  bad: 'text-primary',
  info: 'text-geo',
};

/* ------------------------------------------------------------------ *
 * stat tiles
 * ------------------------------------------------------------------ */

/**
 * A trend line small enough to sit inside a stat tile.
 *
 * Forty pixels of SVG. Reaching for recharts at this size would ship a chart
 * library to draw eleven line segments with no axis, no tooltip and no legend.
 */
export function Sparkline({
  data,
  tone = 'neutral',
  width = 40,
  height = 14,
  className = '',
}: {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  // A flat series would divide by zero; drawn down the middle it reads as flat,
  // which is the truth.
  const span = max - min || 1;
  const pad = 1.5; // room for the stroke, so a peak is not clipped
  const step = (width - pad * 2) / (data.length - 1);
  const x = (i: number) => pad + i * step;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const points = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${TONE_LINE[tone]} ${className}`}
    >
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The last point is the one being asked about. */}
      <circle
        cx={x(data.length - 1)}
        cy={y(data[data.length - 1])}
        r={1.6}
        fill="currentColor"
      />
    </svg>
  );
}

function DeltaTag({
  delta,
  label,
  good,
}: {
  delta: number;
  label?: ReactNode;
  good: 'up' | 'down';
}) {
  const flat = !Number.isFinite(delta) || delta === 0;
  const up = delta > 0;
  // Which way is healthy is not always up: a rising dispute count in sage
  // would be the legend saying the opposite of what it means.
  const tone: Tone = (up ? good === 'up' : good === 'down') ? 'good' : 'bad';
  const magnitude = Math.abs(delta);
  const text = label ?? `${Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(1)}%`;

  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 font-semibold ${
        flat ? 'text-ink3' : TONE_TEXT[tone]
      }`}
    >
      <span aria-hidden>{flat ? '·' : up ? '↑' : '↓'}</span>
      <span className="sr-only">{flat ? 'flat' : up ? 'up' : 'down'} </span>
      {text}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  href,
  delta,
  deltaLabel,
  deltaGood = 'up',
  spark,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  href?: string;
  /** Signed percentage change. Sign picks the arrow; `deltaGood` picks the tone. */
  delta?: number;
  /** Replaces the rendered "12%" when the movement is not a percentage. */
  deltaLabel?: ReactNode;
  deltaGood?: 'up' | 'down';
  spark?: number[];
}) {
  const tinted = tone !== 'neutral';

  const body = (
    <div
      className={`group relative h-full overflow-hidden rounded-sm border border-line bg-raised p-3.5 shadow-xs ${
        href
          ? 'transition-[background-color,box-shadow] hover:bg-sunken hover:shadow-sm'
          : ''
      }`}
    >
      {tinted ? (
        <>
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r to-transparent ${TONE_WASH[tone]}`}
          />
          <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_FILL[tone]}`} />
        </>
      ) : null}

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="label truncate">{label}</div>
          {href ? (
            <span
              aria-hidden
              className="shrink-0 text-[13px] leading-none text-ink3 opacity-0 transition-opacity group-hover:opacity-100"
            >
              →
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div
            className={`tnum font-display text-[24px] leading-none font-bold ${TONE_TEXT[tone]}`}
          >
            {value}
          </div>
          {spark ? <Sparkline data={spark} tone={tone} className="mb-0.5" /> : null}
        </div>

        {sub != null || delta !== undefined ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink2">
            {delta !== undefined ? (
              <DeltaTag delta={delta} label={deltaLabel} good={deltaGood} />
            ) : null}
            {sub ? <span className="min-w-0">{sub}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * The work queue, as a board rather than a list.
 *
 * This was eight identical rows with eight identical saffron pills, which
 * gave an operator opening the console no idea where to start: thirty-three
 * escrow holds past their release window — money sitting in limbo that the
 * app will never resolve on its own — looked exactly like one open dispute.
 * A queue that does not rank itself is a queue somebody has to read twice.
 *
 * So each row carries a tone, and the board sorts on it. The legend is the
 * one `globals.css` already fixed for the whole console, so nothing new has
 * to be learned to read this: vermilion is money at risk, saffron needs a
 * human, ink3 is inert. Size follows the same order — the worst thing on the
 * platform is also the biggest thing on the page.
 *
 * Every tile is a link, because every one of these is a place to go.
 */
export function AttentionBoard({
  items,
  empty = 'Nothing is waiting. Every queue is clear.',
}: {
  items: { label: string; value: number; href: string; tone?: Tone; note?: string }[];
  empty?: string;
}) {
  if (!items.length) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-sage">{empty}</p>
    );
  }

  /* Worst first, then largest. A tile's tone is assigned by the caller —
     only it knows whether a number is money or housekeeping. */
  const order: Record<string, number> = { bad: 0, warn: 1, info: 2, neutral: 3, good: 4 };
  const sorted = [...items].sort(
    (a, b) =>
      (order[a.tone ?? 'neutral'] ?? 3) - (order[b.tone ?? 'neutral'] ?? 3) ||
      b.value - a.value,
  );

  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
      {sorted.map((item) => {
        const tone = item.tone ?? 'neutral';
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group relative overflow-hidden rounded-sm border border-line bg-raised p-3 shadow-xs transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-sunken hover:shadow-sm"
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_FILL[tone]}`} />
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 left-0 w-2/3 bg-linear-to-r to-transparent opacity-60 ${TONE_WASH[tone]}`}
            />

            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`tnum font-display text-[26px] leading-none font-bold ${TONE_TEXT[tone]}`}
                >
                  {item.value.toLocaleString('en-US')}
                </div>
                <span
                  aria-hidden
                  className="shrink-0 text-[13px] leading-none text-ink3 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  →
                </span>
              </div>
              <div className="mt-1.5 text-[12.5px] leading-snug text-ink">{item.label}</div>
              {item.note ? (
                <div className="mt-0.5 text-[11.5px] leading-snug text-ink3">{item.note}</div>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
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

/* Ring rather than border: `* { border-color: var(--line) }` is unlayered and
   would repaint every one of these the same hairline grey, which is exactly
   the failure the legend exists to prevent. */
const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink2 ring-line',
  good: 'bg-sage-50 text-sage ring-sage-100',
  warn: 'bg-saffron-50 text-saffron ring-saffron-100',
  bad: 'bg-primary-50 text-primary ring-primary-100',
  info: 'bg-geo/10 text-geo ring-geo/20',
};

export function Badge({
  children,
  tone = 'neutral',
  title,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  /** A tone-coloured dot before the label, for badges read by shape not hue. */
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset ${
        dot ? 'gap-1.5' : 'gap-1'
      } ${TONE_CHIP[tone]}`}
    >
      {dot ? (
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[tone]}`} />
      ) : null}
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

/**
 * A status is read a few hundred times an hour, and about one operator in
 * twelve cannot separate the sage from the vermilion. The dot gives the badge
 * a second channel — position and shape — so the row is still scannable when
 * the hue is not doing any work.
 */
export function StatusBadge({ status }: { status: string }) {
  const label =
    STATUS_LABEL[status] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace(/[-_]/g, ' ');
  return (
    <Badge tone={toneForStatus(status)} dot>
      {label}
    </Badge>
  );
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

/**
 * A header cell with an alignment.
 *
 * `head` still takes plain nodes, so nothing that already calls `Table` has to
 * change; a column that needs its heading over the right-hand edge of its
 * figures passes an object for that one cell instead.
 */
export type HeadCell = {
  label: ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Any CSS width. Pins a column that would otherwise shift row to row. */
  width?: number | string;
};

function isHeadCell(cell: ReactNode | HeadCell): cell is HeadCell {
  return typeof cell === 'object' && cell !== null && !isValidElement(cell) && 'label' in cell;
}

export function Table({
  head,
  children,
}: {
  head: (ReactNode | HeadCell)[];
  children: ReactNode;
}) {
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            {head.map((cell, i) => {
              const col: HeadCell = isHeadCell(cell) ? cell : { label: cell };
              return (
                <th
                  key={i}
                  // `.tbl thead th { text-align: left }` is unlayered, so a
                  // `text-right` utility here would never land.
                  style={{ textAlign: col.align, width: col.width }}
                >
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * empty states
 * ------------------------------------------------------------------ */

/**
 * Nothing to show, and which kind of nothing it is.
 *
 * An empty table is ambiguous by default: a clear queue and a filter that
 * matches nothing look identical. `tone` says which — sage for good news,
 * saffron for something a human still has to unstick — and `hint` says what
 * to do about it.
 */
export function Empty({
  children,
  icon,
  title,
  hint,
  tone = 'neutral',
}: {
  children?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const heading = title ?? children;
  const note = title ? (hint ?? children) : hint;

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon ? (
        <span
          aria-hidden
          className={`mb-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-[15px] ${TONE_SOFT[tone]} ${TONE_LINE[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      {heading ? (
        <p
          className={`max-w-[46ch] text-[13px] font-semibold ${
            tone === 'neutral' ? 'text-ink2' : TONE_TEXT[tone]
          }`}
        >
          {heading}
        </p>
      ) : null}
      {note ? <p className="max-w-[52ch] text-[12px] leading-relaxed text-ink3">{note}</p> : null}
    </div>
  );
}

export function EmptyRow({
  span,
  children,
  icon,
  title,
  hint,
  tone = 'neutral',
}: {
  span: number;
  children?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <tr>
      <td colSpan={span}>
        <Empty icon={icon} title={title} hint={hint} tone={tone}>
          {children}
        </Empty>
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

/**
 * Can this browser load that URL at all?
 *
 * `blob:` and `file:` are not addresses, they are handles. A blob URL names
 * an object living in the tab that created it — the cook's phone browser on
 * :8081 — and is meaningless in this tab, on this origin, forever. A `file:`
 * URI from a native picker names a path on the cook's handset.
 *
 * The app writes both when a picture is chosen but never uploaded, and an
 * <img> pointed at either fails silently and leaves a broken-image glyph.
 * Treating them as absent is honest: there is no picture here that this
 * browser will ever see, so the initials are the true answer.
 */
export const loadable = (src?: string | null): string | null => {
  const s = (src ?? '').trim();
  if (!s) return null;
  return /^(?:https?:\/\/|data:image\/|\/)/i.test(s) ? s : null;
};

/**
 * The pictures a cook submitted, at a size an operator can judge.
 *
 * Registration makes these mandatory, and the reason is this screen: the
 * decision being made is whether food may be cooked for strangers in that
 * room. Thumbnails at avatar size cannot answer that, so they are shown
 * large enough to read and each one links out to itself full-size.
 *
 * The cover leads because it is the picture customers will actually see on
 * the card, and it is the one an operator is implicitly approving for the
 * shopfront.
 */
export function KitchenPhotos({
  cover,
  photos,
  empty = 'No photographs submitted.',
}: {
  cover?: string | null;
  photos?: string[] | null;
  empty?: string;
}) {
  /* Deduplicated: the cover is very often photos[0] as well, and showing the
     same room twice reads as two rooms. */
  const seen = new Set<string>();
  const all: { url: string; isCover: boolean }[] = [];

  for (const [raw, isCover] of [
    [cover, true] as const,
    ...(photos ?? []).map((p) => [p, false] as const),
  ]) {
    const url = loadable(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    all.push({ url, isCover });
  }

  /* Said out loud rather than left blank. A cook who submitted pictures that
     never arrived and a cook who submitted none look identical on an empty
     row, and only one of those is the operator's problem. */
  if (!all.length) return <p className="text-[12px] text-ink3">{empty}</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="group relative block overflow-hidden rounded-[10px] border border-line hover:border-primary-200"
          title={p.isCover ? 'Cover photograph' : 'Kitchen photograph'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt=""
            className="size-[88px] object-cover transition-transform group-hover:scale-105"
          />
          {p.isCover ? (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white">
              Cover
            </span>
          ) : null}
        </a>
      ))}
    </div>
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

  const url = loadable(src);

  if (!url) {
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
      src={url}
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

/**
 * A definition row for a stack of facts.
 *
 * `Field` spreads its label and value to opposite edges, which is right for a
 * wide panel and wrong for a column of six: the values land on six different
 * left edges and stop being a list. This one holds the label column fixed so
 * the values line up and can be read down.
 */
export function KeyValue({
  label,
  children,
  tone = 'neutral',
}: {
  label: ReactNode;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <dl className="grid grid-cols-[minmax(88px,max-content)_1fr] items-baseline gap-x-3 py-[3px]">
      <dt className="label truncate">{label}</dt>
      <dd className={`min-w-0 text-[13px] ${TONE_TEXT[tone]}`}>{children}</dd>
    </dl>
  );
}

/** A meter for capacity, stock, fill rate. */
export function Meter({
  value,
  max,
  tone = 'info',
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  /** Overlaid inside the track. The bar grows taller to carry it. */
  label?: ReactNode;
}) {
  const raw = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  // One unit of five hundred rounds to zero and then looks like none at all,
  // which on a stock column is the difference between "sell it" and "restock".
  const pct = value > 0 ? Math.max(raw, 2) : raw;
  const title = `${value} of ${max}`;

  if (!label) {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" title={title}>
        <div className={`h-full rounded-full ${TONE_FILL[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    );
  }

  // With text over it the fill drops to wash strength and the label goes to
  // sumi: tone text on a solid tone fill is under 3:1 either way round, and at
  // 10.5px the label is the whole point of this variant. The tone is still
  // carried by the fill, so nothing is only said in colour.
  return (
    <div className="relative h-[18px] w-full overflow-hidden rounded-full bg-sunken" title={title}>
      <div className={`h-full rounded-full ${TONE_SOFT[tone]}`} style={{ width: `${pct}%` }} />
      <span className="tnum absolute inset-0 flex items-center px-2 text-[10.5px] font-semibold text-ink">
        {label}
      </span>
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
