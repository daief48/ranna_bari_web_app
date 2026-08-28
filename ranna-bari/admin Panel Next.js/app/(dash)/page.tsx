import Link from 'next/link';

import { db } from '@/lib/db';
import { balances, reconcile } from '@/lib/logic/ledger';
import { getSettings } from '@/lib/settings';
import { taka, fmtDate, timeAgo, daysSince } from '@/lib/format';
import {
  attentionCounts,
  dailySeries,
  deadBroadcasts,
  liveCounts,
  moneyOverview,
} from '@/lib/queries';
import { Card, Grid, PageHeader, Stat, Badge, Money, Table, EmptyRow } from '@/components/ui';
import { GmvChart, KindBars, EscrowAgeChart } from '@/components/Charts';

export const metadata = { title: 'Dashboard · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  /* `?denied=` arrives when requirePage() bounced someone off a screen their
     role cannot see. Saying which capability was missing is more useful than
     a silent redirect that reads as a broken link. */
  const { denied } = await searchParams;

  const [money, series, attention, live, bal, books, settings, dead] = await Promise.all([
    moneyOverview(30),
    dailySeries(30),
    attentionCounts(),
    liveCounts(),
    balances(),
    reconcile(),
    getSettings(),
    deadBroadcasts(),
  ]);

  /* Escrow, bucketed by how long it has been sitting. Held money is the worst
     state in the system — the customer has paid, the cook has cooked, and
     neither has what they are owed — so it gets its own panel rather than a
     line in a table. */
  const heldOrders = await db.order.findMany({
    where: { payment: 'held' },
    select: { amount: true, deliveredAt: true, createdAt: true, status: true },
  });

  const window = settings.escrowAutoReleaseDays;
  const buckets = [
    { bucket: '< 1 day', min: 0, max: 1 },
    { bucket: '1–3 days', min: 1, max: 3 },
    { bucket: '3–7 days', min: 3, max: 7 },
    { bucket: '7 days +', min: 7, max: Infinity },
  ].map((b) => {
    const amount = heldOrders
      .filter((o) => {
        const age = daysSince(o.deliveredAt ?? o.createdAt);
        return age >= b.min && age < b.max;
      })
      .reduce((sum, o) => sum + o.amount, 0);
    return { bucket: b.bucket, amount, overdue: b.min >= window };
  });

  const driftTotal = Object.values(books.drift).reduce((s, v) => s + Math.abs(v), 0);

  const attentionRows = [
    { label: 'Cooks awaiting KYC', value: attention.kycPending, href: '/kyc' },
    { label: 'Escrow past release window', value: attention.escrowAged, href: '/ledger?view=aged' },
    { label: 'Open disputes', value: attention.disputesOpen, href: '/disputes' },
    { label: 'Pre-orders waiting on a cook', value: attention.preordersWaiting, href: '/orders?status=pending' },
    { label: 'Meals open past their serve date', value: attention.staleMeals, href: '/meals?view=stale' },
    { label: 'Products stuck at zero stock', value: attention.stockZero, href: '/stores?view=stock' },
    { label: 'Top-ups with no payment behind them', value: attention.orphanTopups, href: '/topups' },
    { label: 'Broadcasts that reached nobody', value: dead.length, href: '/requests?view=dead' },
  ].filter((row) => row.value > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Last 30 days · ${money.orders.toLocaleString('en-US')} orders`}
      />

      {denied ? (
        <div className="mb-5 rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px] text-ink2">
          <strong className="text-primary">That page is not open to your role.</strong>{' '}
          It needs the <code>{denied}</code> capability. Roles and what each one may
          do are listed on the{' '}
          <Link href="/admins" className="font-semibold text-primary hover:underline">
            admin users page
          </Link>
          .
        </div>
      ) : null}

      {/* What needs a person, first. Everything below is context for it. */}
      <Card
        title="Waiting on you"
        subtitle={
          attentionRows.length
            ? 'Each of these is work the app cannot do for itself.'
            : undefined
        }
        className="mb-5"
        pad={false}
      >
        {attentionRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-sage">
            Nothing is waiting. Every queue is clear.
          </p>
        ) : (
          <ul className="divide-y divide-line2">
            {attentionRows.map((row) => (
              <li key={row.label}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-sunken"
                >
                  <span className="text-[13px] text-ink">{row.label}</span>
                  <span className="tnum shrink-0 rounded-full bg-saffron-50 px-2 py-0.5 text-[12px] font-bold text-saffron">
                    {row.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Grid cols={4}>
        <Stat label="GMV · 30 days" value={taka(money.gmv)} sub={`${money.orders} orders`} />
        <Stat
          label="Platform revenue"
          value={taka(money.revenue)}
          tone="good"
          sub={`${taka(money.commission)} posted · ${taka(money.codCommission)} implied on COD`}
        />
        <Stat
          label="Held in escrow"
          value={taka(bal.held)}
          tone={attention.escrowAged > 0 ? 'warn' : 'neutral'}
          sub={`${heldOrders.length} orders · ${attention.escrowAged} past ${window} days`}
          href="/ledger"
        />
        <Stat
          label="Owed to cooks"
          value={taka(bal.cook)}
          sub="Released, not yet paid out"
          href="/payouts"
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="GMV" subtitle="Daily, last 30 days" className="lg:col-span-2">
          <GmvChart data={series} />
        </Card>

        <Card title="By system" subtitle="Where the money comes from">
          <KindBars data={money.byKind} />
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card
          title="Escrow by age"
          subtitle={`Auto-release is set to ${window} days after delivery`}
          className="lg:col-span-2"
        >
          <EscrowAgeChart data={buckets} />
          <p className="mt-3 text-[12px] leading-relaxed text-ink2">
            Money in the saffron buckets has been held longer than the release
            window. In the app nothing resolves this — a daily reminder nudges the
            customer and then waits forever.{' '}
            <Link href="/ledger?view=aged" className="font-semibold text-primary hover:underline">
              Review and release →
            </Link>
          </p>
        </Card>

        <Card title="Live now">
          <div className="space-y-3">
            <Row label="Orders in flight" value={live.inFlight} />
            <Row label="Kitchens open" value={live.kitchensOpen} />
            <Row label="Shops open" value={live.storesOpen} />
            <Row label="Open food requests" value={live.openRequests} />
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <div className="label mb-2">Books</div>
            {driftTotal === 0 ? (
              <p className="text-[12.5px] text-sage">
                Balanced. Every account folds to exactly what its entries imply.
              </p>
            ) : (
              <p className="text-[12.5px] font-semibold text-primary">
                Drift of {taka(driftTotal)} across the four accounts. Something
                posted an entry this fold does not understand.
              </p>
            )}
            <Link
              href="/ledger?view=reconcile"
              className="mt-1.5 inline-block text-[12px] font-semibold text-primary hover:underline"
            >
              Reconciliation →
            </Link>
          </div>
        </Card>
      </div>

      {dead.length > 0 ? (
        <Card
          title="Broadcasts that reached nobody"
          subtitle="Every eligible kitchen was shut or out of range — a coverage problem, not a quiet day"
          className="mt-3"
          pad={false}
        >
          <Table head={['Request', 'Area', 'Budget', 'Posted', '']}>
            {dead.slice(0, 6).map((request) => (
              <tr key={request.id}>
                <td className="max-w-[320px] truncate font-medium text-ink">{request.title}</td>
                <td className="text-ink2">{request.area ?? '—'}</td>
                <td>{request.budget ? <Money amount={request.budget} /> : <span className="text-ink3">—</span>}</td>
                <td className="text-ink2">{timeAgo(request.createdAt)}</td>
                <td className="text-right">
                  <Link
                    href={`/requests/${request.id}`}
                    className="text-[12px] font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {dead.length === 0 ? <EmptyRow span={5}>Nothing here.</EmptyRow> : null}
          </Table>
        </Card>
      ) : null}

      <p className="mt-6 text-[11.5px] text-ink3">
        Balances are folded from {books.totals.topups > 0 ? 'the' : 'an empty'} append-only
        ledger, never stored. Figures as of {fmtDate(new Date())}.
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-ink2">{label}</span>
      <span className="tnum font-display text-[17px] font-bold text-ink">{value}</span>
    </div>
  );
}
