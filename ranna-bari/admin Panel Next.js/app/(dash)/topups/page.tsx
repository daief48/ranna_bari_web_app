import Link from 'next/link';

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
import { RowLink } from '@/components/ui/row-link';
import { FilterSelect, Pager } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { ReconcileRow } from './row';
import { TopUpConfigForm, TopUpRequestActions } from './requests';
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

type RequestsView = {
  requests: {
    id: string;
    customerKey: string;
    amount: number;
    method: string;
    txnId: string;
    senderNumber: string;
    status: string;
    at: string;
  }[];
  counts: Record<string, { count: number; amount: number } | undefined>;
};

type ConfigView = { bkash: string; nagad: string; note: string; configured: boolean };

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
  /* The manual-request queue and the receiving numbers. A failure here must
     not take the reconciliation desk down with it. */
  const [queue, config] = await Promise.all([
    get<RequestsView>('/topup-requests?status=pending').catch(() => null),
    get<ConfigView>('/topup-config').catch(() => null),
  ]);
  const canPay = can(user?.role ?? '', 'payout.write');

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
        <strong>How money gets into a wallet.</strong> There is no payment gateway. A customer
        pays the platform&apos;s bKash or Nagad number, files the transaction id above, and a
        person here approves it against the provider&apos;s statement — only then is the wallet
        credited. The credits below are the result, and this is where a human later matches each
        one to a statement line.
      </GapNote>

      {/* ---- customers asking to be credited ----
          The production way money enters a wallet: the customer pays the
          platform's number, files the transaction id, and a person here checks
          it and approves. Nothing is credited until then. */}
      <Card
        className="mb-3"
        pad={false}
        title={`Top-up requests${queue?.counts.pending ? ` (${queue.counts.pending.count} waiting)` : ''}`}
        subtitle="Check the provider statement for the transaction id, then approve. The wallet is credited only on approval."
      >
        <Table head={['Customer', 'Amount', 'Method', 'Transaction id', 'Sent from', 'When', canReconcile ? 'Act' : '']}>
          {(queue?.requests ?? []).map((row) => (
            <tr key={row.id}>
              <td className="max-w-[180px] truncate font-medium">{row.customerKey}</td>
              <td>
                <Money amount={row.amount} bold />
              </td>
              <td className="text-ink2">{row.method === 'nagad' ? 'Nagad' : 'bKash'}</td>
              <td className="tnum font-medium">{row.txnId}</td>
              <td className="tnum text-ink2">{row.senderNumber}</td>
              <td className="whitespace-nowrap text-ink2" title={fmtDateTime(row.at)}>
                {timeAgo(row.at)}
              </td>
              <td>
                {canReconcile ? (
                  <TopUpRequestActions
                    id={row.id}
                    amount={row.amount}
                    method={row.method === 'nagad' ? 'Nagad' : 'bKash'}
                    txnId={row.txnId}
                    sender={row.senderNumber}
                  />
                ) : null}
              </td>
            </tr>
          ))}
          {!queue ? (
            <EmptyRow span={7}>Could not load the requests.</EmptyRow>
          ) : queue.requests.length === 0 ? (
            <EmptyRow span={7}>No customer is waiting to be credited.</EmptyRow>
          ) : null}
        </Table>
      </Card>

      <Card
        className="mb-3"
        pad={false}
        title="Where customers send the money"
        subtitle={
          config?.configured
            ? 'Shown in the app on the Add money screen.'
          : 'Not configured: the app tells customers top-up is not set up yet.'
        }
      >
        {config ? (
          canPay ? (
            <TopUpConfigForm bkash={config.bkash} nagad={config.nagad} note={config.note} />
          ) : (
            <p className="tnum p-4 text-[13px] text-ink2">
              bKash {config.bkash || 'not set'} · Nagad {config.nagad || 'not set'}
            </p>
          )
        ) : (
          <p className="p-4 text-[13px] text-ink3">Could not load the setting.</p>
        )}
      </Card>

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
            <RowLink key={row.id} href={`/topups/${row.id}`}>
              <td className="max-w-[200px] truncate">
                <Link
                  href={`/topups/${row.id}`}
                  className="font-medium text-ink hover:text-primary"
                >
                  {row.customerKey}
                </Link>
              </td>
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
            </RowLink>
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
