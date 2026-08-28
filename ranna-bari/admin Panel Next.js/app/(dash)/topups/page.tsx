import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import { paging, pageCount } from '@/lib/queries';
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
import { FilterSelect, Pager } from '@/components/ui/client';
import { ReconcileRow } from './row';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Top-up reconciliation · RannaBari Admin' };
export const dynamic = 'force-dynamic';

export default async function TopUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('ledger.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);
  const user = await currentUser();
  const canReconcile = can(user?.role ?? '', 'topup.reconcile');

  const where: Prisma.TopUpWhereInput = {};
  if (params.state) where.reconciled = params.state;

  const [rows, total, counts, sums] = await Promise.all([
    db.topUp.findMany({ where, skip, take, orderBy: { at: 'desc' } }),
    db.topUp.count({ where }),
    db.topUp.groupBy({ by: ['reconciled'], _count: true, _sum: { amount: true } }),
    db.topUp.aggregate({ _sum: { amount: true } }),
  ]);

  const countOf = (state: string) => counts.find((c) => c.reconciled === state);
  const orphan = countOf('orphan');
  const disputed = countOf('disputed');
  const matched = countOf('matched');

  return (
    <>
      <PageHeader
        title="Top-up reconciliation"
        subtitle="Wallet credits, against the payments that should be behind them"
      />

      <GapNote>
        <strong>Why this screen exists.</strong> In the app,{' '}
        <code>topUp(amount, &apos;bKash&apos;)</code> credits the wallet and posts a
        ledger entry with <em>no payment behind it at all</em> — there is no gateway,
        no reference and nothing to check against. Every taka a customer spends
        entered the system this way. Until a real provider is wired in, this is where
        a human confirms the money actually arrived.
      </GapNote>

      <Grid cols={4}>
        <Stat label="Credited all time" value={taka(sums._sum.amount ?? 0)} />
        <Stat
          label="Matched"
          value={taka(matched?._sum.amount ?? 0)}
          tone="good"
          sub={`${matched?._count ?? 0} credits`}
        />
        <Stat
          label="No payment behind them"
          value={taka(orphan?._sum.amount ?? 0)}
          tone="warn"
          sub={`${orphan?._count ?? 0} orphans`}
        />
        <Stat
          label="Amount disagrees"
          value={taka(disputed?._sum.amount ?? 0)}
          tone="bad"
          sub={`${disputed?._count ?? 0} flagged`}
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Credits"
        actions={
          <FilterSelect
            name="state"
            allLabel="Any state"
            options={[
              { value: 'orphan', label: 'Orphans' },
              { value: 'disputed', label: 'Disagreements' },
              { value: 'matched', label: 'Matched' },
            ]}
          />
        }
      >
        <Table
          head={['Customer', 'Credited', 'Method', 'State', 'PSP reference', 'When', 'Reconcile']}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="max-w-[200px] truncate text-ink2">{row.customerKey}</td>
              <td>
                <Money amount={row.amount} bold />
              </td>
              <td className="text-ink2">{row.method}</td>
              <td>
                <StatusBadge status={row.reconciled} />
              </td>
              <td className="tnum text-ink2">
                {row.pspRef ? (
                  <>
                    {row.pspRef}
                    {row.pspAmount != null && row.pspAmount !== row.amount ? (
                      <span className="ml-1.5 font-semibold text-primary">
                        ({taka(row.pspAmount)})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-ink3">none</span>
                )}
              </td>
              <td className="whitespace-nowrap text-ink2" title={fmtDateTime(row.at)}>
                {timeAgo(row.at)}
              </td>
              <td>
                {canReconcile && row.reconciled !== 'matched' ? (
                  <ReconcileRow id={row.id} amount={row.amount} />
                ) : (
                  <span className="text-[11.5px] text-ink3">
                    {row.reconciled === 'matched' ? '—' : 'finance only'}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? <EmptyRow span={7}>Nothing matches that.</EmptyRow> : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        A reference whose amount disagrees with the wallet credit is flagged rather
        than matched — calling it matched would hide exactly the discrepancy this page
        is for. Correcting a balance is never an edit: use an adjustment, which posts a
        second entry in the opposite direction and leaves both on the record.
      </p>
    </>
  );
}
