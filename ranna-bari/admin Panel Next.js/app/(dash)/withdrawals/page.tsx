import Link from 'next/link';

import { get } from '@/lib/backend';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { taka, fmtDateTime, timeAgo } from '@/lib/format';
import { Card, Grid, Money, PageHeader, Stat, StatusBadge, Table, EmptyRow } from '@/components/ui';
import { FilterSelect } from '@/components/ui/client';
import { BackendDown, down } from '@/components/backend-down';
import { requirePage } from '@/lib/guard';
import { WithdrawalActions } from './actions';

export const metadata = { title: 'Withdrawals · RannaBari Admin' };
export const dynamic = 'force-dynamic';

const STATUSES = ['requested', 'paid', 'rejected', 'cancelled', 'all'] as const;

type View = {
  withdrawals: {
    id: string;
    code: string;
    kitchenId: string;
    kitchenName: string;
    area: string;
    amount: number;
    method: string;
    account: string;
    status: string;
    requestedAt: string;
    decidedAt: string | null;
    decidedBy: string | null;
    note: string;
  }[];
  counts: Record<string, { count: number; amount: number } | undefined>;
};

/**
 * Cooks asking to be paid now.
 *
 * A request reserves the cook's money without moving it, and the batch payout
 * run leaves that reserved amount out, so an operator working this queue and
 * one running Sunday's batch can never pay the same taka. "Mark paid" is the
 * only thing here that touches the ledger.
 */
export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('ledger.read');
  const params = await searchParams;
  const user = await currentUser();
  const canPay = can(user?.role ?? '', 'payout.write');

  const status = (STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as string)
    : 'requested';

  const data = await get<View>(`/withdrawals?status=${status}`).catch(down);
  if (!data) {
    return <BackendDown title="Withdrawals" subtitle="Cooks asking to be paid now" />;
  }

  const open = data.counts.requested;
  const paid = data.counts.paid;

  return (
    <>
      <PageHeader
        title="Withdrawals"
        subtitle="Cooks asking to be paid now, instead of waiting for a payout run"
        actions={
          <Link href="/payouts" className="text-[13px] font-medium text-primary hover:underline">
            Payout runs
          </Link>
        }
      />

      <Grid cols={3}>
        <Stat
          label="Waiting to be paid"
          value={taka(open?.amount ?? 0)}
          tone={(open?.count ?? 0) > 0 ? 'warn' : 'neutral'}
          sub={`${open?.count ?? 0} requests`}
        />
        <Stat
          label="Paid all time"
          value={taka(paid?.amount ?? 0)}
          tone="good"
          sub={`${paid?.count ?? 0} withdrawals`}
        />
        <Stat
          label="Declined"
          value={String(data.counts.rejected?.count ?? 0)}
          sub={`${data.counts.cancelled?.count ?? 0} cancelled by the cook`}
        />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Requests"
        subtitle="Money stays with the cook until you mark it paid"
        actions={
          <FilterSelect
            name="status"
            allLabel="Waiting"
            options={[
              { value: 'paid', label: 'Paid' },
              { value: 'rejected', label: 'Declined' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'Everything' },
            ]}
          />
        }
      >
        <Table head={['Code', 'Kitchen', 'Amount', 'Send to', 'State', 'When', canPay ? 'Act' : '']}>
          {data.withdrawals.map((row) => (
            <tr key={row.id}>
              <td className="tnum font-medium">{row.code}</td>
              <td className="max-w-[200px] truncate">
                <Link href={`/kitchens/${row.kitchenId}`} className="font-medium hover:text-primary">
                  {row.kitchenName}
                </Link>
                <div className="text-[11.5px] text-ink3">{row.area}</div>
              </td>
              <td>
                <Money amount={row.amount} bold />
              </td>
              <td className="tnum text-ink2">
                {row.method === 'bkash' ? 'bKash' : 'Bank'} · {row.account}
              </td>
              <td>
                <StatusBadge status={row.status} />
                {row.note ? (
                  <div className="mt-1 max-w-[24ch] text-[11.5px] text-ink3">{row.note}</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap text-ink2" title={fmtDateTime(row.requestedAt)}>
                {timeAgo(row.requestedAt)}
                {row.decidedBy ? (
                  <div className="text-[11.5px] text-ink3">by {row.decidedBy}</div>
                ) : null}
              </td>
              <td>
                {canPay && row.status === 'requested' ? (
                  <WithdrawalActions
                    id={row.id}
                    code={row.code}
                    amount={row.amount}
                    account={row.account}
                    method={row.method === 'bkash' ? 'bKash' : 'bank account'}
                  />
                ) : null}
              </td>
            </tr>
          ))}
          {data.withdrawals.length === 0 ? <EmptyRow span={7}>Nothing here.</EmptyRow> : null}
        </Table>
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        Marking a request paid posts one <code>payout</code> entry, from <code>cook</code> to{' '}
        <code>external</code>, with the key <code>withdrawal:&lt;id&gt;</code>, so a double click pays
        once. The destination was copied from the cook&rsquo;s profile when they asked, so editing it
        afterwards does not redirect a request already in.
      </p>
    </>
  );
}
