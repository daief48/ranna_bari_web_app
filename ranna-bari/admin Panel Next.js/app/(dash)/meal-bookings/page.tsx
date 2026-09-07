import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { taka, fmtDate } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyRow,
  Grid,
  Money,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Meal bookings · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Booking = {
  id: string;
  code: string;
  customerKey: string;
  customerName: string;
  kitchenId: string;
  cookName: string;
  categoryKey: string;
  categoryLabel: string;
  month: string;
  rate: number;
  meals: number;
  total: number;
  status: string;
  createdAt: string;
  orders: number;
  held: number;
  released: number;
};

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * A month somebody bought, and how far through paying for it we are.
 *
 * A booking is a receipt, not a job: each meal on it is its own order on the
 * ordinary escrow rail, with its own delivery, confirmation and release. This
 * board exists because those orders are otherwise scattered across the orders
 * list with nothing saying they were bought together — and "how much of this
 * customer's month is still held" is a question about the group, not a row.
 */
export default async function MealBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string }>;
}) {
  await requirePage('order.read');
  const params = await searchParams;

  const query = new URLSearchParams({ take: '100' });
  if (params.month) query.set('month', params.month);
  if (params.status) query.set('status', params.status);

  let bookings: Booking[];
  let total: number;
  try {
    const data = await get<{ bookings: Booking[]; total: number }>(
      `/meal-bookings?${query.toString()}`,
    );
    bookings = data.bookings;
    total = data.total;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown title="Meal bookings" subtitle="A month bought, meal by meal" />
      );
    }
    throw error;
  }

  const held = bookings.reduce((sum, b) => sum + b.held, 0);
  const meals = bookings.reduce((sum, b) => sum + b.meals, 0);
  const money = bookings.reduce((sum, b) => sum + b.total, 0);

  return (
    <>
      <PageHeader
        title="Meal bookings"
        subtitle="A month of meals bought in one go, and the orders it became"
      />

      <Grid cols={4}>
        <Stat label="Bookings" value={total} />
        <Stat label="Meals sold" value={meals} sub="across the bookings shown" />
        <Stat
          label="Meals still held"
          value={held}
          tone={held ? 'warn' : 'good'}
          sub={held ? 'waiting on delivery, confirmation or release' : 'nothing outstanding'}
        />
        <Stat label="Booked value" value={taka(money)} />
      </Grid>

      <Card
        className="mt-3"
        pad={false}
        title="Bookings"
        subtitle="Newest first"
      >
        <Table
          head={['Booking', 'Customer', 'Cook', 'Month', 'Meals', 'Value', 'Escrow', 'Status']}
        >
          {bookings.map((booking) => (
            <RowLink key={booking.id} href={`/meal-bookings/${booking.id}`}>
              <td className="font-medium">
                <Link
                  href={`/meal-bookings/${booking.id}`}
                  className="tnum hover:text-primary"
                >
                  {booking.code}
                </Link>
                <span className="block text-[11px] text-ink3">{booking.categoryLabel}</span>
              </td>
              <td className="max-w-[160px] truncate text-ink2">
                {booking.customerName || booking.customerKey}
              </td>
              <td className="max-w-[160px] truncate text-ink2">
                <Link href={`/kitchens/${booking.kitchenId}`} className="hover:text-primary">
                  {booking.cookName || '—'}
                </Link>
              </td>
              <td className="whitespace-nowrap text-ink2">{monthLabel(booking.month)}</td>
              <td className="tnum">
                {booking.meals}
                <span className="ml-1 text-[11px] text-ink3">× {taka(booking.rate)}</span>
              </td>
              <td>
                <Money amount={booking.total} />
              </td>
              <td className="whitespace-nowrap">
                {booking.held > 0 ? (
                  <Badge tone="warn">{booking.held} held</Badge>
                ) : booking.released > 0 ? (
                  <Badge tone="good">all released</Badge>
                ) : (
                  <span className="text-ink3">—</span>
                )}
              </td>
              <td>
                <StatusBadge status={booking.status} />
              </td>
            </RowLink>
          ))}
          {bookings.length === 0 ? (
            <EmptyRow span={8}>
              No meal bookings yet. One appears here the moment a customer pays a
              month&rsquo;s advance against a cook&rsquo;s calendar.
            </EmptyRow>
          ) : null}
        </Table>
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-ink3">
        Money is released per meal, not per booking — a cook who has served fourteen
        days is owed for fourteen days. Open a booking to release the meals a customer
        has confirmed. Showing {bookings.length} of {total}
        {params.month ? ` · ${fmtDate(`${params.month}-01`)}` : ''}.
      </p>
    </>
  );
}
