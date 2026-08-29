import { get } from '@/lib/backend';
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
import { BackendDown, down } from '@/components/backend-down';
import { ReconcileRow } from './row';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Top-up reconciliation · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/** The only three the endpoint accepts; anything else is a 500, not a filter. */
const STATES = ['orphan', 'disputed', 'matched'] as const;

type TopUpsView = {
  topups: {
    id: string;
    customerKey: string;
    amount: number;
    method: string;
    reconciled: string;
    pspRef: string | null;
    pspAmount: number | null;
    at: string;
  }[];
  total: number;
  /** One bucket per state, folded over every row rather than the current page. */
  states: Record<string, { count: number; amount: number } | undefined>;
};

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

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  /* A hand-typed `?state=whatever` used to match nothing; the endpoint parses
     the value against an enum, so an unknown one is dropped here instead. */
  if (params.state && (STATES as readonly string[]).includes(params.state)) {
    query.set('state', params.state);
  }

  const data = await get<TopUpsView>(`/topups?${query}`).catch(down);

  if (!data) {
    return (
      <BackendDown
        title="Top-up reconciliation"
        subtitle="Wallet credits, against the payments that should be behind them"
      />
    );
  }

  const rows = data.topups;
  const matched = data.states.matched;
  const orphan = data.states.orphan;
  const disputed = data.states.disputed;
  /* The endpoint folds a bucket per state and no grand total, so this adds the
     buckets it was handed. Not a re-fold of the rows — one group-by, one read. */
  const creditedEver = Object.values(data.states).reduce((sum, b) => sum + (b?.amount ?? 0), 0);

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
        <Stat label="Credited all time" value={taka(creditedEver)} />
        <Stat
          label="Matched"
          value={taka(matched?.amount ?? 0)}
          tone="good"
          sub={`${matched?.count ?? 0} credits`}
        />
        <Stat
          label="No payment behind them"
          value={taka(orphan?.amount ?? 0)}
          tone="warn"
          sub={`${orphan?.count ?? 0} orphans`}
        />
        <Stat
          label="Amount disagrees"
          value={taka(disputed?.amount ?? 0)}
          tone="bad"
          sub={`${disputed?.count ?? 0} flagged`}
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

        <Pager page={page} pages={pageCount(data.total)} total={data.total} />
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
