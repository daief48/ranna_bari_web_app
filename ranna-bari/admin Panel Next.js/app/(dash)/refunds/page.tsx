import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { paging, pageCount } from '@/lib/queries';
import { fmtDateTime } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyRow,
  Grid,
  Money,
  MoneyStat,
  PageHeader,
  Stat,
  Table,
} from '@/components/ui';
import { FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Refunds · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Refund = {
  id: string;
  kind: 'refund' | 'adjustment';
  amount: number;
  from: string;
  to: string;
  toRef: string | null;
  orderId: string | null;
  note: string;
  at: string | null;
};

type Totals = Record<string, { amount: number; count: number }>;

/**
 * Money that went back out.
 *
 * Both ways of sending money back — refunding an order's escrow and posting a
 * manual adjustment — already existed as actions, and neither had a board:
 * the only way to see a refund was to scroll the whole ledger or open the
 * dispute that caused it.
 *
 * The two kinds are kept apart because they answer different questions. A
 * refund is the system working as designed; an adjustment is an operator
 * reaching in by hand, and a rising count of those is worth noticing.
 */
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('ledger.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.kind) query.set('kind', params.kind);

  let rows: Refund[] = [];
  let total = 0;
  let totals: Totals = {};

  try {
    const data = await get<{ refunds: Refund[]; total: number; totals: Totals }>(
      `/refunds?${query}`,
    );
    rows = data.refunds;
    total = data.total;
    totals = data.totals ?? {};
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown title="Refunds" subtitle="Every taka sent back, and who sent it" />
      );
    }
    throw error;
  }

  const refunded = totals.refund ?? { amount: 0, count: 0 };
  const adjusted = totals.adjustment ?? { amount: 0, count: 0 };

  return (
    <>
      <PageHeader title="Refunds" subtitle="Every taka sent back, and who sent it" />

      <Grid cols={4}>
        <MoneyStat label="Refunded, all time" amount={refunded.amount} />
        <Stat label="Refunds" value={refunded.count.toLocaleString('en-US')} />
        <MoneyStat
          label="Adjusted by hand"
          amount={adjusted.amount}
          tone={adjusted.count ? 'warn' : 'neutral'}
        />
        <Stat
          label="Adjustments"
          value={adjusted.count.toLocaleString('en-US')}
          sub="an operator reached in"
          tone={adjusted.count ? 'warn' : 'neutral'}
        />
      </Grid>

      <Card
        pad={false}
        title="Money out"
        actions={
          <FilterSelect
            name="kind"
            allLabel="Both kinds"
            options={[
              { value: 'refund', label: 'Refunds' },
              { value: 'adjustment', label: 'Adjustments' },
            ]}
          />
        }
      >
        <Table head={['Kind', 'Amount', 'To', 'Order', 'Why', 'When']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Badge tone={row.kind === 'adjustment' ? 'warn' : 'neutral'}>
                  {row.kind === 'adjustment' ? 'Adjustment' : 'Refund'}
                </Badge>
              </td>
              <td className="tnum"><Money amount={row.amount} bold /></td>
              <td className="tnum text-ink2">{row.toRef ?? row.to}</td>
              <td>
                {row.orderId ? (
                  <Link href={`/orders/${row.orderId}`} className="tnum hover:text-primary">
                    Open
                  </Link>
                ) : (
                  <span className="text-ink3">—</span>
                )}
              </td>
              <td className="max-w-[320px] truncate text-ink2">{row.note || '—'}</td>
              <td className="text-ink3">{row.at ? fmtDateTime(row.at) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <EmptyRow span={6}>No money has been sent back.</EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
