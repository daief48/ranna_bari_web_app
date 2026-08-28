import Link from 'next/link';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { cookBalances } from '@/lib/logic/ledger';
import { getSettings } from '@/lib/settings';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import {
  Card,
  Grid,
  GapNote,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RunActions } from './actions';
import { createPayoutRun } from '@/actions/money';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Payouts · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  await requirePage('ledger.read');
  const user = await currentUser();
  const canPay = can(user?.role ?? '', 'payout.write');
  const settings = await getSettings();

  const owed = await cookBalances();
  const kitchens = await db.kitchen.findMany({
    where: { id: { in: owed.map((o) => o.kitchenId) } },
    select: { id: true, name: true, ownerName: true, area: true },
  });
  const kitchenOf = new Map(kitchens.map((k) => [k.id, k]));

  const runs = await db.payoutRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { items: { orderBy: { amount: 'desc' } } },
  });

  const dueNow = owed.filter((o) => o.amount >= settings.payoutMinimum);
  const carried = owed.filter((o) => o.amount < settings.payoutMinimum);
  const totalDue = dueNow.reduce((s, o) => s + o.amount, 0);
  const paidEver = await db.ledgerEntry.aggregate({
    where: { kind: 'payout' },
    _sum: { amount: true },
  });

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Batching what cooks are owed, and paying it"
        actions={
          canPay ? (
            <form
              action={async () => {
                'use server';
                await createPayoutRun('bKash', '');
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center rounded-[10px] border border-transparent bg-primary px-3 py-1.5 text-[13px] font-semibold text-on-primary hover:bg-primary-600 disabled:opacity-45"
                disabled={dueNow.length === 0}
              >
                Draft a run
              </button>
            </form>
          ) : null
        }
      />

      <GapNote>
        <strong>Why this screen exists.</strong> The app has{' '}
        <code>pendingEarnings()</code> — a number a cook can look at — and no way for
        anybody to actually pay it. There is no withdrawal flow, no payout record and
        no reconciliation. A cook&rsquo;s balance was a promise with nothing behind it.
      </GapNote>

      <Grid cols={4}>
        <Stat
          label="Due this run"
          value={taka(totalDue)}
          tone={totalDue > 0 ? 'warn' : 'neutral'}
          sub={`${dueNow.length} cooks over the ${taka(settings.payoutMinimum)} minimum`}
        />
        <Stat
          label="Carried forward"
          value={taka(carried.reduce((s, o) => s + o.amount, 0))}
          sub={`${carried.length} cooks under the minimum`}
        />
        <Stat label="Paid all time" value={taka(paidEver._sum.amount ?? 0)} tone="good" />
        <Stat label="Runs" value={runs.length} sub={`${runs.filter((r) => r.status === 'draft').length} in draft`} />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Owed to cooks right now"
          subtitle="Folded live from the ledger, not stored anywhere"
          pad={false}
        >
          <Table head={['Kitchen', 'Area', 'Owed', '']}>
            {owed.slice(0, 20).map((row) => {
              const kitchen = kitchenOf.get(row.kitchenId);
              const under = row.amount < settings.payoutMinimum;
              return (
                <tr key={row.kitchenId}>
                  <td className="max-w-[200px] truncate">
                    <Link
                      href={`/kitchens/${row.kitchenId}`}
                      className="font-medium hover:text-primary"
                    >
                      {kitchen?.name ?? row.kitchenId}
                    </Link>
                  </td>
                  <td className="text-ink2">{kitchen?.area ?? '—'}</td>
                  <td>
                    <Money amount={row.amount} tone={under ? 'neutral' : 'good'} />
                  </td>
                  <td className="text-right text-[11.5px] text-ink3">
                    {under ? 'under minimum' : ''}
                  </td>
                </tr>
              );
            })}
            {owed.length === 0 ? (
              <EmptyRow span={4}>
                Nothing is owed. Every released payment has been paid out.
              </EmptyRow>
            ) : null}
          </Table>
        </Card>

        <Card title="Runs" subtitle="A draft moves no money until it is marked paid" pad={false}>
          <div className="divide-y divide-line2">
            {runs.map((run) => (
              <div key={run.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="tnum font-semibold">{run.code}</span>
                    <span className="ml-2">
                      <StatusBadge status={run.status} />
                    </span>
                  </div>
                  <div className="tnum font-display text-[16px] font-bold">
                    {taka(run.total)}
                  </div>
                </div>

                <div className="mb-2 text-[12px] text-ink2">
                  {run.cookCount} cooks · {run.method} · drafted by {run.createdBy}{' '}
                  {timeAgo(run.createdAt)}
                  {run.paidAt ? ` · paid ${fmtDateTime(run.paidAt)} by ${run.paidBy}` : ''}
                </div>

                <details className="mb-2">
                  <summary className="cursor-pointer text-[12px] text-ink3 hover:text-ink">
                    {run.items.length} lines
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {run.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between gap-3 text-[12px] text-ink2"
                      >
                        <span className="truncate">{item.kitchenName}</span>
                        <span className="tnum shrink-0">{taka(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                {canPay && run.status === 'draft' ? (
                  <RunActions runId={run.id} code={run.code} total={run.total} />
                ) : null}
              </div>
            ))}
            {runs.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-ink3">
                No runs yet. Drafting one snapshots what every cook is owed above the{' '}
                {taka(settings.payoutMinimum)} minimum.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        Marking a run paid posts one <code>payout</code> entry per cook, from{' '}
        <code>cook</code> to <code>external</code>, each carrying an idempotency key
        built from the run and the kitchen — so a double-clicked button pays once.
      </p>
    </>
  );
}
