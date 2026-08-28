'use client';

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
 * something ageing. Series are never coloured just to tell them apart — if
 * two series need distinguishing and neither is "healthy" or "warning", they
 * get one hue at two weights instead.
 */

const AXIS = { fontSize: 10.5, fill: 'var(--ink3)' };

function TooltipBox({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-raised px-2.5 py-2 text-[12px] shadow-md">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-ink2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: row.color }}
            aria-hidden
          />
          <span>{row.name}</span>
          <span className="tnum ml-auto font-semibold text-ink">
            {money ? taka(row.value ?? 0) : (row.value ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Short day label — "24 Aug". A 30-point axis cannot carry the year. */
const shortDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
};

export function GmvChart({ data }: { data: { day: string; gmv: number; orders: number }[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line2)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            content={<TooltipBox money />}
            labelFormatter={(label) => shortDay(String(label))}
            cursor={{ stroke: 'var(--line)' }}
          />
          <Area
            type="monotone"
            dataKey="gmv"
            name="GMV"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#gmvFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KindBars({ data }: { data: { kind: string; amount: number; count: number }[] }) {
  const LABEL: Record<string, string> = {
    cod: 'Cash on delivery',
    meal: 'Pre-booked meals',
    store: 'Cook stores',
    request: 'Food requests',
  };
  const rows = data.map((d) => ({ ...d, label: LABEL[d.kind] ?? d.kind }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--line2)" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={104}
          />
          <Tooltip content={<TooltipBox money />} cursor={{ fill: 'var(--line2)' }} />
          <Bar dataKey="amount" name="GMV" radius={[0, 5, 5, 0]} barSize={16}>
            {rows.map((row) => (
              /* The legacy COD rail is the one being migrated away from, so it
                 reads as inert rather than as a healthy line. */
              <Cell
                key={row.kind}
                fill={row.kind === 'cod' ? 'var(--ink3)' : 'var(--primary)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Escrow by age bucket. Anything past the release window is saffron. */
export function EscrowAgeChart({
  data,
}: {
  data: { bucket: string; amount: number; overdue: boolean }[];
}) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--line2)" vertical={false} />
          <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip content={<TooltipBox money />} cursor={{ fill: 'var(--line2)' }} />
          <Bar dataKey="amount" name="Held" radius={[5, 5, 0, 0]} barSize={38}>
            {data.map((row) => (
              <Cell
                key={row.bucket}
                fill={row.overdue ? 'var(--saffron)' : 'var(--sage)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
