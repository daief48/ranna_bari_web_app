'use client';

import { useId, useSyncExternalStore, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { taka } from '@/lib/format';

/**
 * Charts.
 *
 * Colour carries the same meaning it does everywhere else in the panel:
 * vermilion is the platform's own line, sage is settled money, saffron is
 * something ageing, ink3 is the legacy COD rail being migrated away from.
 * Series are never coloured just to tell them apart — if two series need
 * distinguishing and neither is "healthy" or "warning", they get one hue at
 * two weights instead.
 *
 * Everything visual is read from CSS variables, so a theme flip repaints the
 * charts without re-rendering them.
 */

/* ------------------------------------------------------------------ *
 * shared axis language
 * ------------------------------------------------------------------ */

const AXIS = { fontSize: 10.5, fill: 'var(--ink3)' };

/** Grid is reference, not content: hairline, solid, one step off the surface. */
const GRID = { stroke: 'var(--line2)', strokeWidth: 1 } as const;

/** A hovered bar is the only thing that lifts, so the cursor band is off. */
const BAR_REST = 0.88;
const ACTIVE_BAR = { fillOpacity: 1 } as const;

const shortNum = (n: number) =>
  n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);

/**
 * Axis money, in one place.
 *
 * Every value axis in this file is taka, and three copies of the same
 * abbreviation is three chances for one card to say ৳12k while the card
 * beside it says 12000. The tick abbreviates; the tooltip still carries the
 * exact figure, so nothing is only reachable in rounded form.
 */
function moneyTick(value: number): string {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}৳${shortNum(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}৳${shortNum(abs / 1_000)}k`;
  return `${sign}৳${abs}`;
}

/** Short day label — "24 Aug". A 30-point axis cannot carry the year. */
const shortDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
};

/**
 * Labels for a long date axis.
 *
 * Chosen walking back from the newest point rather than forward from the
 * oldest: an operator opens this chart to find out what today did, so today
 * is the one tick that must never be the one dropped. The oldest day is
 * added back only when it will not crowd its neighbour.
 */
function spacedTicks(values: string[], max: number): string[] {
  if (values.length <= max) return values;
  const step = Math.ceil((values.length - 1) / (max - 1));
  const out: string[] = [];
  for (let i = values.length - 1; i >= 0; i -= step) out.unshift(values[i]);
  const gap = (values.length - 1) % step;
  if (gap >= step / 2) out.unshift(values[0]);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ *
 * motion
 * ------------------------------------------------------------------ */

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeToMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * Recharts animates in JavaScript, so the blanket `prefers-reduced-motion`
 * rule in globals.css — which reaches CSS transitions and nothing else —
 * cannot switch these charts off. They have to ask for themselves.
 */
function usePlainMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ *
 * tooltip
 * ------------------------------------------------------------------ */

type TooltipRow = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

/**
 * The readout, built to the same spec as a card: raised surface, the panel's
 * hairline, and one step more elevation because it floats above one.
 *
 * `labelFormatter` is deliberately not used at the call site — recharts only
 * applies it to its own default content and hands a custom element the raw
 * label, so an ISO day would otherwise reach the header unformatted.
 */
function TooltipBox({
  active,
  payload,
  label,
  money,
  formatLabel,
  swatch,
  foot,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
  money?: boolean;
  formatLabel?: (label: string) => string;
  swatch?: (datum: Record<string, unknown>) => string;
  foot?: (datum: Record<string, unknown>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;

  const datum = payload[0]?.payload ?? {};
  const note = foot?.(datum);

  return (
    <div className="min-w-[150px] rounded-[10px] border border-line bg-raised px-2.5 py-2 text-[12px] shadow-md">
      <div className="mb-1.5 font-semibold text-ink">
        {formatLabel && label != null ? formatLabel(String(label)) : label}
      </div>

      {payload.map((row, i) => (
        <div key={i} className="flex items-center gap-2 leading-5">
          {/* Centred on the row, not sat on its baseline — a low dot reads as
              a bullet point rather than as the series key. */}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: swatch ? swatch(row.payload ?? datum) : row.color }}
            aria-hidden
          />
          <span className="truncate text-ink2">{row.name}</span>
          <span className="tnum ml-auto pl-3 font-semibold text-ink">
            {money
              ? taka(Number(row.value ?? 0))
              : Number(row.value ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      ))}

      {note ? (
        <div className="mt-1.5 border-t border-line2 pt-1.5 text-[11.5px] text-ink3">{note}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * empty state
 * ------------------------------------------------------------------ */

/**
 * A chart with nothing in it.
 *
 * Bare axes and no marks read as a failed fetch, and an operator who thinks
 * the dashboard is broken stops trusting the numbers that *are* right. This
 * says which of the two it is, and holds the same height so the row of cards
 * does not jump.
 */
function EmptyPlot({
  height,
  title,
  children,
}: {
  height: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line px-6 text-center"
      style={{ height }}
    >
      <p className="text-[13px] font-semibold text-ink2">{title}</p>
      <p className="max-w-[38ch] text-[12px] leading-relaxed text-ink3">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * GMV over time
 * ------------------------------------------------------------------ */

export function GmvChart({ data }: { data: { day: string; gmv: number; orders: number }[] }) {
  const plain = usePlainMotion();
  // Scoped so a second GMV chart on one page cannot claim the first one's
  // gradient. useId carries colons, which browsers have historically fumbled
  // inside url(#…), so they are stripped.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fillId = `gmv-${uid}`;

  // The window is named by the card's own subtitle, so the copy here does not
  // repeat it — that would be a second place to get it wrong.
  if (!data.some((d) => d.gmv > 0)) {
    return (
      <EmptyPlot height={220} title="No orders in this window">
        Nothing has been sold yet. The line starts the moment the first order is
        placed.
      </EmptyPlot>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <defs>
            {/* Four stops, not two: a linear fade leaves a heavy wedge sitting
                on the baseline. Most of the tint belongs just under the line. */}
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.26} />
              <stop offset="38%" stopColor="var(--primary)" stopOpacity={0.11} />
              <stop offset="78%" stopColor="var(--primary)" stopOpacity={0.03} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid {...GRID} vertical={false} />

          <XAxis
            dataKey="day"
            ticks={spacedTicks(data.map((d) => d.day), 6)}
            tickFormatter={shortDay}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            minTickGap={12}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={54}
            tickCount={4}
            allowDecimals={false}
            domain={[0, 'auto']}
            tickFormatter={moneyTick}
          />

          <Tooltip
            content={
              <TooltipBox
                money
                formatLabel={shortDay}
                swatch={() => 'var(--primary)'}
                foot={(d) => plural(Number(d.orders ?? 0), 'order')}
              />
            }
            cursor={{ stroke: 'var(--ink3)', strokeWidth: 1, strokeOpacity: 0.45 }}
            isAnimationActive={false}
            wrapperStyle={{ outline: 'none' }}
          />

          <Area
            type="monotone"
            dataKey="gmv"
            name="GMV"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${fillId})`}
            fillOpacity={1}
            dot={false}
            /* The ring is the raised surface, so the dot stays legible where
               it lands on top of its own fill. */
            activeDot={{
              r: 3.5,
              fill: 'var(--primary)',
              stroke: 'var(--raised)',
              strokeWidth: 2,
            }}
            isAnimationActive={!plain}
            animationDuration={420}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * GMV by system
 * ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  cod: 'Cash on delivery',
  meal: 'Pre-booked meals',
  store: 'Cook stores',
  request: 'Food requests',
};

/** The legacy COD rail is the one being migrated away from, so it reads as
    inert rather than as a healthy line. */
const kindColour = (kind: unknown) => (kind === 'cod' ? 'var(--ink3)' : 'var(--primary)');

export function KindBars({ data }: { data: { kind: string; amount: number; count: number }[] }) {
  const plain = usePlainMotion();

  if (!data.some((d) => d.amount > 0)) {
    return (
      <EmptyPlot height={220} title="No revenue to split">
        None of the four systems has taken an order in this window.
      </EmptyPlot>
    );
  }

  const rows = data.map((d) => ({ ...d, label: KIND_LABEL[d.kind] ?? d.kind }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid {...GRID} horizontal={false} />

          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            allowDecimals={false}
            tickFormatter={moneyTick}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={104}
          />

          <Tooltip
            content={
              <TooltipBox
                money
                swatch={(d) => kindColour(d.kind)}
                foot={(d) => plural(Number(d.count ?? 0), 'order')}
              />
            }
            cursor={false}
            isAnimationActive={false}
            wrapperStyle={{ outline: 'none' }}
          />

          {/* maxBarSize rather than barSize: with two systems live instead of
              four, a computed bar fills half the card and stops being a bar. */}
          <Bar
            dataKey="amount"
            name="GMV"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            fillOpacity={BAR_REST}
            activeBar={ACTIVE_BAR}
            isAnimationActive={!plain}
            animationDuration={420}
          >
            {rows.map((row) => (
              <Cell key={row.kind} fill={kindColour(row.kind)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * escrow by age
 * ------------------------------------------------------------------ */

/** Escrow by age bucket. Anything past the release window is saffron. */
export function EscrowAgeChart({
  data,
}: {
  data: { bucket: string; amount: number; overdue: boolean }[];
}) {
  const plain = usePlainMotion();

  if (!data.some((d) => d.amount > 0)) {
    return (
      <EmptyPlot height={180} title="Nothing is being held">
        Every delivered order has settled. This fills again the moment the next one
        is handed over.
      </EmptyPlot>
    );
  }

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid {...GRID} vertical={false} />

          <XAxis
            dataKey="bucket"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={0}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={54}
            tickCount={4}
            allowDecimals={false}
            domain={[0, 'auto']}
            tickFormatter={moneyTick}
          />

          <Tooltip
            content={
              <TooltipBox
                money
                swatch={(d) => (d.overdue ? 'var(--saffron)' : 'var(--sage)')}
                foot={(d) =>
                  d.overdue ? 'Past the release window — needs a person.' : 'Within the window.'
                }
              />
            }
            cursor={false}
            isAnimationActive={false}
            wrapperStyle={{ outline: 'none' }}
          />

          <Bar
            dataKey="amount"
            name="Held"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            fillOpacity={BAR_REST}
            activeBar={ACTIVE_BAR}
            isAnimationActive={!plain}
            animationDuration={420}
          >
            {data.map((row) => (
              <Cell key={row.bucket} fill={row.overdue ? 'var(--saffron)' : 'var(--sage)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
