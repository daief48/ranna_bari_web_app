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
  /** Held *and* confirmed by the customer — the queue this board is worked from. */
  releasable: number;
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
  /* The operator's actual daily job, which the board previously did not
     surface at all: meals the customer has confirmed and the cook is owed
     for. "Held" is most of a live month and says nothing about what to do. */
  const releasable = bookings.reduce((sum, b) => sum + b.releasable, 0);
  const waiting = bookings.filter((b) => b.releasable > 0);

  return (
    <>
      <PageHeader
        title="Meal bookings"
        subtitle="A month of meals bought in one go, and the orders it became"
      />

      <Grid cols={4}>
        <Stat
          label="Ready to release"
          value={releasable}
          tone={releasable ? 'bad' : 'good'}
          sub={
            releasable
              ? `confirmed by the customer, across ${waiting.length} ${waiting.length === 1 ? 'booking' : 'bookings'}`
              : 'nothing waiting on you'
          }
        />
        <Stat
          label="Meals still held"
          value={held}
          tone={held ? 'warn' : 'good'}
          sub={held ? 'including the ones not yet delivered' : 'nothing outstanding'}
        />
        <Stat label="Meals sold" value={meals} sub={`across ${total} bookings`} />
        <Stat label="Booked value" value={taka(money)} />
      </Grid>

      {waiting.length > 0 ? (
        <div className="mt-3 rounded-[10px] border border-sage-100 bg-sage-50 px-3.5 py-2.5 text-[13px] text-ink2">
          <strong className="text-sage">
            {releasable} {releasable === 1 ? 'meal is' : 'meals are'} ready to release.
          </strong>{' '}
          {waiting.map((b, i) => (
            <span key={b.id}>
              {i > 0 ? ', ' : ''}
              <Link
                href={`/meal-bookings/${b.id}`}
                className="font-semibold text-sage hover:underline"
              >
                {b.code}
              </Link>
              <span className="tnum"> ({b.releasable})</span>
            </span>
          ))}
        </div>
      ) : null}

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
              {/* Both halves. A booking with one meal released and two held
                  read "2 held" — identical to one where nothing had moved. */}
              <td className="whitespace-nowrap">
                <span className="flex flex-wrap items-center gap-1">
                  {booking.releasable > 0 ? (
                    <Badge tone="bad">{booking.releasable} to release</Badge>
                  ) : null}
                  {booking.held - booking.releasable > 0 ? (
                    <Badge tone="warn">{booking.held - booking.releasable} held</Badge>
                  ) : null}
                  {booking.released > 0 ? (
                    <Badge tone="good">{booking.released} paid</Badge>
                  ) : null}
                  {booking.held === 0 && booking.released === 0 ? (
                    <span className="text-ink3">—</span>
                  ) : null}
                </span>
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
