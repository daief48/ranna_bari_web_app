import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { fmtDateTime, timeAgo } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyRow,
  GapNote,
  Grid,
  Money,
  MoneyStat,
  PageHeader,
  Stat,
  Table,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Abandoned baskets · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Cart = {
  id: string;
  customerKey: string;
  name: string | null;
  phone: string;
  sample: string | null;
  items: number;
  value: number;
  updatedAt: string | null;
  createdAt: string | null;
};

/** Days since a basket was last touched, for the staleness bands. */
const daysSince = (at: string | null) =>
  at ? Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000) : 0;

/**
 * Baskets with something in them and no order behind them.
 *
 * A cart row is kept per customer and emptied at checkout, so a basket that
 * still has lines is one nobody finished. The collection has existed all
 * along and nothing in the console read it.
 *
 * It carries more here than the usual commerce view. `store-checkout` tells a
 * customer to top the wallet up before they can order — so a full basket left
 * behind is not always hesitation. Some of these are people who could not
 * afford the top-up, and that is a price signal with nowhere else to show.
 *
 * Sorted by the most recently touched, because a basket abandoned an hour ago
 * is a conversation worth having and one abandoned in March is archaeology.
 */
export default async function CartsPage() {
  await requirePage('order.read');

  let rows: Cart[] = [];
  let total = 0;

  try {
    const data = await get<{ carts: Cart[]; total: number }>('/carts?take=100');
    rows = data.carts;
    total = data.total;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Abandoned baskets"
          subtitle="Baskets with items in them that never became an order"
        />
      );
    }
    throw error;
  }

  const value = rows.reduce((sum, row) => sum + row.value, 0);
  const stale = rows.filter((row) => daysSince(row.updatedAt) >= 7);
  const biggest = rows.reduce((best, row) => (row.value > best ? row.value : best), 0);

  return (
    <>
      <PageHeader
        title="Abandoned baskets"
        subtitle="Items chosen, never ordered — and what that is worth"
      />

      <GapNote>
        <strong>Some of these are a price signal, not hesitation.</strong> A shop
        order is paid from the wallet, and checkout tells anyone short of the total
        to top up first. So a basket left full can mean a customer who chose their
        food and could not afford to load the money — which looks identical to
        forgetting, and is a different problem entirely. A cluster of small
        abandoned baskets in one area is worth reading that way.
      </GapNote>

      <Grid cols={4}>
        <Stat label="Baskets left full" value={total.toLocaleString('en-US')} />
        <MoneyStat label="Sitting in them" amount={value} tone={value ? 'warn' : 'neutral'} />
        <Stat
          label="Untouched a week or more"
          value={stale.length.toLocaleString('en-US')}
          sub="past reviving"
          tone={stale.length ? 'warn' : 'good'}
        />
        <MoneyStat label="Largest basket" amount={biggest} />
      </Grid>

      <Card
        pad={false}
        title="Left behind"
        subtitle="Most recently touched first — the freshest are the ones worth a call"
      >
        <Table head={['Last touched', 'Customer', 'In the basket', 'Items', 'Worth', 'Started']}>
          {rows.map((row) => {
            const age = daysSince(row.updatedAt);
            return (
              <tr key={row.id}>
                <td>
                  <Badge tone={age >= 7 ? 'neutral' : age >= 2 ? 'warn' : 'bad'}>
                    {row.updatedAt ? timeAgo(row.updatedAt) : '—'}
                  </Badge>
                </td>
                <td className="tnum text-ink2">{row.name || row.phone}</td>
                <td className="max-w-[260px] truncate">
                  {row.sample ?? <span className="text-ink3">—</span>}
                </td>
                <td className="tnum text-ink2">{row.items}</td>
                <td className="tnum">
                  <Money amount={row.value} tone={row.value ? 'warn' : 'neutral'} />
                </td>
                <td className="text-ink3">{row.createdAt ? fmtDateTime(row.createdAt) : '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <EmptyRow span={6}>
              No basket is sitting unfinished. Everything chosen was ordered.
            </EmptyRow>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
