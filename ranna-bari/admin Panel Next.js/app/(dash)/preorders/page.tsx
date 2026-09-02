import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
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
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Pre-orders · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Preorder = {
  id: string;
  code: string;
  title: string;
  cookName: string;
  kitchenId: string | null;
  storeId: string | null;
  customerKey: string;
  customerName: string;
  amount: number;
  createdAt: string | null;
  waitingHours: number;
};

/** How long somebody's money has been sitting there, said plainly. */
function waited(hours: number) {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * Pre-orders waiting on a cook.
 *
 * A pre-order takes the customer's money the moment they ask — the cook's own
 * screen says so: "৳{n} is held. Declining returns it in full." A cook who
 * never answers leaves that money held with no clock on it, and the console
 * showed only a count on the stores board.
 *
 * Oldest first, because the age is the problem. Anything past a couple of days
 * is money the platform is holding for a question nobody is answering.
 */
export default async function PreordersPage() {
  await requirePage('order.read');

  let rows: Preorder[] = [];
  let held = 0;

  try {
    const data = await get<{ preorders: Preorder[]; total: number; held: number }>('/preorders');
    rows = data.preorders;
    held = data.held;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Pre-orders"
          subtitle="Requests waiting on a cook, with the customer's money already held"
        />
      );
    }
    throw error;
  }

  const stale = rows.filter((r) => r.waitingHours >= 48);
  const oldest = rows[0]?.waitingHours ?? 0;

  return (
    <>
      <PageHeader
        title="Pre-orders"
        subtitle="Waiting on a cook, with the customer's money already held"
      />

      <Grid cols={4}>
        <Stat label="Waiting" value={rows.length.toLocaleString('en-US')} />
        <MoneyStat label="Held against them" amount={held} tone={held ? 'warn' : 'neutral'} />
        <Stat
          label="Older than two days"
          value={stale.length.toLocaleString('en-US')}
          sub="nobody has answered"
          tone={stale.length ? 'bad' : 'good'}
        />
        <Stat label="Longest wait" value={waited(oldest)} tone={oldest >= 48 ? 'bad' : 'neutral'} />
      </Grid>

      <Card
        pad={false}
        title="Unanswered"
        subtitle="Accepting takes the stock; declining returns the money in full"
      >
        <Table head={['Waiting', 'Item', 'Shop', 'Customer', 'Held', 'Asked']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Badge tone={row.waitingHours >= 48 ? 'bad' : row.waitingHours >= 24 ? 'warn' : 'neutral'}>
                  {waited(row.waitingHours)}
                </Badge>
              </td>
              <td className="max-w-[240px] truncate font-medium">{row.title}</td>
              <td className="text-ink2">
                {row.kitchenId ? (
                  <Link href={`/kitchens/${row.kitchenId}`} className="hover:text-primary">
                    {row.cookName}
                  </Link>
                ) : (
                  row.cookName
                )}
              </td>
              <td className="tnum text-ink2">{row.customerName || row.customerKey}</td>
              <td className="tnum"><Money amount={row.amount} tone="warn" /></td>
              <td className="text-ink3">{row.createdAt ? fmtDateTime(row.createdAt) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <EmptyRow span={6}>
              Nothing waiting. Every pre-order has had an answer.
            </EmptyRow>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
